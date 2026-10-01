'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient } from '@/lib/supabase';
import { isDemo } from '@/lib/demo';
import { winnaarFotos } from '@/lib/fotos';
import { rondeOpbrengst, syncRondeOpbrengst } from '@/lib/ronde-opbrengst';
import { BUNDELS, type BetaalLinks } from '@/lib/bundels';
import {
  ADMIN_COOKIE,
  cookieOptions,
  createSessionToken,
  checkPassword,
  isAdmin,
} from '@/lib/auth';

async function assertAdmin() {
  if (!(await isAdmin())) {
    throw new Error('Niet ingelogd.');
  }
}

function str(fd: FormData, key: string): string {
  return (fd.get(key)?.toString() ?? '').trim();
}

/** Normaliseert een maand-invoer ("YYYY-MM" of een datum) naar de eerste van de maand. */
function maandDatum(v: string): string | null {
  return v ? `${v.slice(0, 7)}-01` : null;
}

/** Uploadt een foto naar de 'fotos'-bucket en geeft de publieke URL terug (of null). */
async function uploadFoto(
  sb: SupabaseClient,
  foto: File,
  prefix: string,
): Promise<string | null> {
  const ext = foto.name.split('.').pop()?.toLowerCase() || 'jpg';
  // De demo bewaart zijn foto's in een eigen map (die de reset leegmaakt).
  const pad = `${isDemo ? 'loterij-demo/' : ''}${prefix}/${crypto.randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await foto.arrayBuffer());
  const { error } = await sb.storage
    .from('fotos')
    .upload(pad, bytes, { contentType: foto.type || 'image/jpeg', upsert: true });
  if (error) return null;
  return sb.storage.from('fotos').getPublicUrl(pad).data.publicUrl;
}

/**
 * Uploadt alle gekozen bestanden uit één file-veld en geeft de publieke URL's
 * terug, in dezelfde volgorde als ze gekozen zijn. Lege velden leveren [].
 */
async function uploadFotos(
  sb: SupabaseClient,
  fd: FormData,
  veld: string,
  prefix: string,
): Promise<string[]> {
  const bestanden = fd
    .getAll(veld)
    .filter((f): f is File => f instanceof File && f.size > 0);
  const urls: string[] = [];
  for (const bestand of bestanden) {
    const url = await uploadFoto(sb, bestand, prefix);
    if (url) urls.push(url);
  }
  return urls;
}

// ---------- Instellingen ----------
export async function wijzigInstellingen(fd: FormData) {
  await assertAdmin();
  // Betaallinks per bundel; alleen echte https-links bewaren.
  const betaallinks: BetaalLinks = {};
  for (const b of BUNDELS) {
    const link = str(fd, `betaallink_${b.bedrag}`);
    if (!/^https:\/\/\S+$/i.test(link)) continue;
    betaallinks[String(b.bedrag)] = fd.get(`zelfbedrag_${b.bedrag}`)
      ? { link, zelfBedrag: true }
      : { link };
  }
  await serviceClient()
    .from('instellingen')
    .upsert({
      id: 1,
      clubnaam: str(fd, 'clubnaam') || null,
      betaallinks,
      penningmeester_naam: str(fd, 'penningmeester_naam') || null,
      penningmeester_email: str(fd, 'penningmeester_email') || null,
      afzender: str(fd, 'afzender') || null,
      mail_intro: str(fd, 'mail_intro') || null,
      mail_afsluiting: str(fd, 'mail_afsluiting') || null,
      updated_at: new Date().toISOString(),
    });
  // Clubnaam staat in de layout (alle pagina's), betaallinks op /meedoen.
  revalidatePath('/', 'layout');
}

// ---------- Auth ----------
export async function login(fd: FormData) {
  const password = str(fd, 'password');
  if (!checkPassword(password)) {
    redirect('/beheer?fout=wachtwoord');
  }
  (await cookies()).set(ADMIN_COOKIE, createSessionToken(), cookieOptions);
  redirect('/beheer');
}

/** Demo: met één klik inloggen als loterijbeheerder (alleen in de testversie). */
export async function demoLogin() {
  if (!isDemo) redirect('/beheer');
  (await cookies()).set(ADMIN_COOKIE, createSessionToken(), cookieOptions);
  redirect('/beheer');
}

export async function logout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect('/beheer');
}

// ---------- Rondes ----------
export async function maakRonde(fd: FormData) {
  await assertAdmin();
  const naam = str(fd, 'naam');
  const maand = str(fd, 'maand');
  const experience = str(fd, 'experience');
  const aanbieder = str(fd, 'aanbieder');
  // Experience én aanbieder zijn verplicht: dat is de hoofdprijs van de ronde.
  if (!naam || !maand || !experience || !aanbieder) return;
  const sb = serviceClient();
  const { data } = await sb
    .from('rondes')
    .insert({ naam, maand })
    .select('id')
    .single();
  if (data?.id) {
    await sb
      .from('experiences')
      .insert({ ronde_id: data.id, titel: experience, aanbieder });
  }
  revalidatePath('/beheer');
  revalidatePath('/meedoen');
}

export async function zetRondeStatus(fd: FormData) {
  await assertAdmin();
  const id = str(fd, 'id');
  const status = str(fd, 'status');
  if (!id || !['open', 'gesloten', 'getrokken'].includes(status)) return;
  const sb = serviceClient();
  // Een ronde (bv. automatisch aangemaakt vanuit de club-app) kan pas open als
  // er een hoofdprijs is.
  if (status === 'open') {
    const { count } = await sb.from('experiences').select('id', { count: 'exact', head: true }).eq('ronde_id', id);
    if (!count) redirect(`/beheer/ronde/${id}?fout=hoofdprijs`);
  }
  await sb.from('rondes').update({ status }).eq('id', id);

  // De opbrengst hoort bij de ronde: bij elke statuswijziging de som van de
  // betaalde loten wegschrijven, zodat een afgesloten ronde meteen meetelt —
  // ook zonder gepubliceerde winnaar. Een eventuele gekoppelde winnaar krijgt
  // hetzelfde bedrag mee (voor consistentie in het overzicht).
  const opbrengst = await syncRondeOpbrengst(id);
  await sb.from('winnaars').update({ opbrengst }).eq('ronde_id', id);
  revalidatePath('/');
  revalidatePath('/goede-doelen');

  revalidatePath('/beheer');
  revalidatePath('/meedoen');
  revalidatePath(`/beheer/ronde/${id}`);
}

export async function verwijderRonde(fd: FormData) {
  await assertAdmin();
  const id = str(fd, 'id');
  if (!id) return;
  const sb = serviceClient();
  // Ook de gekoppelde winnaar(s) weg, zodat de opbrengst uit het overzicht
  // verdwijnt. Loten en experiences cascaden via de database.
  await sb.from('winnaars').delete().eq('ronde_id', id);
  await sb.from('rondes').delete().eq('id', id);
  revalidatePath('/beheer');
  revalidatePath('/meedoen');
  revalidatePath('/');
  revalidatePath('/goede-doelen');
  // De rondepagina bestaat nu niet meer — terug naar het overzicht.
  redirect('/beheer');
}

// ---------- Experiences ----------
export async function maakExperience(fd: FormData) {
  await assertAdmin();
  const ronde_id = str(fd, 'ronde_id');
  const titel = str(fd, 'titel');
  if (!ronde_id || !titel) return;
  await serviceClient().from('experiences').insert({
    ronde_id,
    titel,
    omschrijving: str(fd, 'omschrijving') || null,
    aanbieder: str(fd, 'aanbieder') || null,
  });
  revalidatePath(`/beheer/ronde/${ronde_id}`);
  revalidatePath('/meedoen');
}

export async function wijzigExperience(fd: FormData) {
  await assertAdmin();
  const id = str(fd, 'id');
  const ronde_id = str(fd, 'ronde_id');
  const titel = str(fd, 'titel');
  if (!id || !titel) return;
  await serviceClient()
    .from('experiences')
    .update({
      titel,
      aanbieder: str(fd, 'aanbieder') || null,
      omschrijving: str(fd, 'omschrijving') || null,
    })
    .eq('id', id);
  revalidatePath(`/beheer/ronde/${ronde_id}`);
  revalidatePath('/meedoen');
}

export async function verwijderExperience(fd: FormData) {
  await assertAdmin();
  const id = str(fd, 'id');
  const ronde_id = str(fd, 'ronde_id');
  if (!id) return;
  await serviceClient().from('experiences').delete().eq('id', id);
  revalidatePath(`/beheer/ronde/${ronde_id}`);
  revalidatePath('/meedoen');
}

// ---------- Loten ----------
export async function zetBetaald(fd: FormData) {
  await assertAdmin();
  const id = str(fd, 'id');
  const ronde_id = str(fd, 'ronde_id');
  const betaald = str(fd, 'betaald') === 'true';
  if (!id) return;
  await serviceClient()
    .from('loten')
    .update({ betaald, betaald_op: betaald ? new Date().toISOString() : null })
    .eq('id', id);
  // Opbrengst van de ronde meteen bijwerken zodat totalen kloppen.
  if (ronde_id) await syncRondeOpbrengst(ronde_id);
  revalidatePath(`/beheer/ronde/${ronde_id}`);
  revalidatePath('/');
  revalidatePath('/goede-doelen');
}

export async function verwijderLot(fd: FormData) {
  await assertAdmin();
  const id = str(fd, 'id');
  const ronde_id = str(fd, 'ronde_id');
  if (!id) return;
  await serviceClient().from('loten').delete().eq('id', id);
  if (ronde_id) await syncRondeOpbrengst(ronde_id);
  revalidatePath(`/beheer/ronde/${ronde_id}`);
  revalidatePath('/');
  revalidatePath('/goede-doelen');
}

/** Alle loten van één persoon in een ronde wissen (bijv. dubbele inschrijving). */
export async function verwijderPersoonLoten(fd: FormData) {
  await assertAdmin();
  const ronde_id = str(fd, 'ronde_id');
  const naam = str(fd, 'naam');
  if (!ronde_id || !naam) return;
  await serviceClient()
    .from('loten')
    .delete()
    .eq('ronde_id', ronde_id)
    .eq('naam', naam);
  await syncRondeOpbrengst(ronde_id);
  revalidatePath(`/beheer/ronde/${ronde_id}`);
  revalidatePath('/');
  revalidatePath('/goede-doelen');
}

// ---------- Winnaars ----------

/** De huidige fotoreeks van een winnaar (oude losse foto telt als de eerste). */
async function huidigeFotos(sb: SupabaseClient, id: string): Promise<string[]> {
  const { data } = await sb
    .from('winnaars')
    .select('foto_url, foto_urls')
    .eq('id', id)
    .single();
  return winnaarFotos({
    foto_url: data?.foto_url ?? null,
    foto_urls: data?.foto_urls ?? null,
  });
}

/** Bewaart een gewijzigde fotoreeks; `foto_url` blijft gelijk aan de eerste foto. */
async function bewaarFotos(sb: SupabaseClient, id: string, fotos: string[]) {
  await sb
    .from('winnaars')
    .update({ foto_urls: fotos, foto_url: fotos[0] ?? null })
    .eq('id', id);
  revalidatePath('/beheer');
  revalidatePath(`/beheer/winnaar/${id}`);
  revalidatePath('/');
  revalidatePath('/goede-doelen');
}

export async function maakWinnaar(fd: FormData) {
  await assertAdmin();
  const naam = str(fd, 'naam');
  const experience_titel = str(fd, 'experience_titel');
  const maand = str(fd, 'maand');
  const ronde_id = str(fd, 'ronde_id') || null;
  if (!naam || !experience_titel || !maand) return;

  const sb = serviceClient();

  // Eén of meer foto's: de eerste is ook de losse foto_url (voor de plekken
  // die er maar één tonen), de hele reeks gaat de carrousel in.
  const fotos = await uploadFotos(sb, fd, 'foto', `winnaars/${maand}`);

  // Hangt de winnaar aan een ronde? Dan komt de weekopbrengst automatisch uit
  // de betalingen van die ronde. Anders het (handmatige) veld.
  const opbrengst = ronde_id
    ? await rondeOpbrengst(ronde_id)
    : Number(str(fd, 'opbrengst')) || 0;

  await sb.from('winnaars').insert({
    naam,
    experience_titel,
    aanbieder: str(fd, 'aanbieder') || null,
    maand,
    ronde_id,
    toelichting: str(fd, 'toelichting') || null,
    opbrengst,
    foto_url: fotos[0] ?? null,
    foto_urls: fotos,
    gepubliceerd: true,
  });
  revalidatePath('/goede-doelen');
  revalidatePath('/beheer');
  revalidatePath('/');
  if (ronde_id) revalidatePath(`/beheer/ronde/${ronde_id}`);
}

export async function wijzigWinnaar(fd: FormData) {
  await assertAdmin();
  const id = str(fd, 'id');
  const naam = str(fd, 'naam');
  const experience_titel = str(fd, 'experience_titel');
  const maand = str(fd, 'maand');
  if (!id || !naam || !experience_titel || !maand) return;

  const sb = serviceClient();

  // Opbrengst wordt automatisch bepaald (uit de betalingen per ronde) en hier
  // dus bewust niet aangeraakt.
  const update: Record<string, unknown> = {
    naam,
    experience_titel,
    aanbieder: str(fd, 'aanbieder') || null,
    maand,
    toelichting: str(fd, 'toelichting') || null,
  };

  // Nieuwe foto's komen achter de bestaande reeks; verwijderen doe je per foto.
  const nieuwe = await uploadFotos(sb, fd, 'foto', `winnaars/${maand}`);
  if (nieuwe.length > 0) {
    const fotos = [...(await huidigeFotos(sb, id)), ...nieuwe];
    update.foto_urls = fotos;
    update.foto_url = fotos[0] ?? null;
  }

  await sb.from('winnaars').update(update).eq('id', id);
  revalidatePath('/beheer');
  revalidatePath(`/beheer/winnaar/${id}`);
  revalidatePath('/');
  revalidatePath('/goede-doelen');
}

/** Haalt één foto uit de reeks van een winnaar. */
export async function verwijderWinnaarFoto(fd: FormData) {
  await assertAdmin();
  const id = str(fd, 'id');
  const url = str(fd, 'url');
  if (!id || !url) return;
  const sb = serviceClient();
  const fotos = await huidigeFotos(sb, id);
  await bewaarFotos(
    sb,
    id,
    fotos.filter((f) => f !== url),
  );
}

/** Zet één foto vooraan: die opent de carrousel en is de losse voorbeeldfoto. */
export async function zetWinnaarFotoVoorop(fd: FormData) {
  await assertAdmin();
  const id = str(fd, 'id');
  const url = str(fd, 'url');
  if (!id || !url) return;
  const sb = serviceClient();
  const fotos = await huidigeFotos(sb, id);
  if (!fotos.includes(url)) return;
  await bewaarFotos(sb, id, [url, ...fotos.filter((f) => f !== url)]);
}

/** Werkt alleen de weekopbrengst van één winnaar bij (snel bewerken vanaf het overzicht). */
export async function zetWeekOpbrengst(fd: FormData) {
  await assertAdmin();
  const id = str(fd, 'id');
  if (!id) return;
  await serviceClient()
    .from('winnaars')
    .update({ opbrengst: Number(str(fd, 'opbrengst')) || 0 })
    .eq('id', id);
  revalidatePath('/beheer');
  revalidatePath('/goede-doelen');
  revalidatePath('/');
}

export async function zetWinnaarPublicatie(fd: FormData) {
  await assertAdmin();
  const id = str(fd, 'id');
  const gepubliceerd = str(fd, 'gepubliceerd') === 'true';
  if (!id) return;
  await serviceClient().from('winnaars').update({ gepubliceerd }).eq('id', id);
  revalidatePath('/beheer');
  revalidatePath('/');
}

export async function verwijderWinnaar(fd: FormData) {
  await assertAdmin();
  const id = str(fd, 'id');
  if (!id) return;
  await serviceClient().from('winnaars').delete().eq('id', id);
  revalidatePath('/beheer');
  revalidatePath('/');
  revalidatePath('/goede-doelen');
  redirect('/beheer');
}

// ---------- Goede doelen ----------
export async function maakDoel(fd: FormData) {
  await assertAdmin();
  const naam = str(fd, 'naam');
  if (!naam) return;
  const sb = serviceClient();

  const rij: Record<string, unknown> = {
    naam,
    omschrijving: str(fd, 'omschrijving') || null,
    jaar: Number(str(fd, 'jaar')) || null,
    maand: maandDatum(str(fd, 'maand')),
  };
  const foto = fd.get('foto');
  if (foto instanceof File && foto.size > 0) {
    const url = await uploadFoto(sb, foto, 'doelen');
    if (url) rij.foto_url = url;
  }

  await sb.from('doelen').insert(rij);
  revalidatePath('/beheer');
  revalidatePath('/goede-doelen');
  revalidatePath('/');
}

export async function wijzigDoel(fd: FormData) {
  await assertAdmin();
  const id = str(fd, 'id');
  if (!id) return;
  const sb = serviceClient();

  const update: Record<string, unknown> = {
    naam: str(fd, 'naam'),
    omschrijving: str(fd, 'omschrijving') || null,
    jaar: Number(str(fd, 'jaar')) || null,
    maand: maandDatum(str(fd, 'maand')),
  };
  const foto = fd.get('foto');
  if (foto instanceof File && foto.size > 0) {
    const url = await uploadFoto(sb, foto, 'doelen');
    if (url) update.foto_url = url;
  }

  await sb.from('doelen').update(update).eq('id', id);
  revalidatePath('/beheer');
  revalidatePath('/goede-doelen');
  revalidatePath('/');
}

export async function verwijderDoel(fd: FormData) {
  await assertAdmin();
  const id = str(fd, 'id');
  if (!id) return;
  await serviceClient().from('doelen').delete().eq('id', id);
  revalidatePath('/beheer');
  revalidatePath('/goede-doelen');
  revalidatePath('/');
}
