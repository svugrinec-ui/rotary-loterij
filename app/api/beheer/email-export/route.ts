import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase';
import { isDemo } from '@/lib/demo';
import { financieelCsv, exportBestandsnaam } from '@/lib/export';
import {
  getInstellingen,
  CLUBNAAM_STANDAARD,
  MAIL_INTRO_STANDAARD,
  MAIL_AFSLUITING_STANDAARD,
} from '@/lib/instellingen';
import { euro } from '@/lib/format';
import type { Ronde, Lot } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface MailRonde {
  naam: string;
  maand: string; // ISO datum van de avond
  bedrag: string; // opbrengst, al als € geformatteerd
}

function datumLang(iso: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

// Door de commissie ingevoerde tekst veilig in HTML zetten (escape + regelafbreuk).
function tekstNaarHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

interface MailSamenvatting {
  totaal: string;
  bank: string;
  cash: string;
  aantal: number;
}

// Nette, gebrande HTML-mail (Rotary-kleuren + tandwiel, groter lettertype). Een
// opvallend totaal-blok (bank/contant + aantal inschrijvingen) plus per avond de
// naam + datum + opbrengst; alle details in de bijlage.
function mailHtml(
  naam: string,
  regels: MailRonde[],
  sam: MailSamenvatting,
  datum: string,
  intro: string,
  afsluiting: string,
  club: string,
  logoUrl: string,
): string {
  const lijst = regels.length
    ? regels
        .map(
          (r) => `
                <tr>
                  <td style="padding:9px 0;font-size:16px;border-bottom:1px solid #eef1f6;">
                    <strong>${r.naam}</strong><br>
                    <span style="color:#8a90a2;font-size:14px;">${datumLang(r.maand)}</span>
                  </td>
                  <td style="padding:9px 0;font-size:17px;font-weight:800;color:#17458f;text-align:right;white-space:nowrap;border-bottom:1px solid #eef1f6;">${r.bedrag}</td>
                </tr>`,
        )
        .join('')
    : `<tr><td style="padding:9px 0;font-size:16px;color:#8a90a2;">Nog geen betaalde inschrijvingen.</td></tr>`;
  const perAvond = regels.length
    ? `
              <div style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#8a90a2;font-weight:700;margin:0 0 6px;">Per avond</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 26px;">
                ${lijst}
              </table>`
    : '';
  return `
  <div style="background:#f4f6fb;margin:0;padding:24px 0;font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:92%;border-collapse:collapse;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(15,47,102,0.10);">
          <tr>
            <td style="background-color:#17458f;background-image:linear-gradient(135deg,#17458f,#0f2f66);padding:26px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td style="padding-right:16px;vertical-align:middle;"><img src="${logoUrl}" width="46" height="46" alt="" style="display:block;" /></td>
                  <td style="vertical-align:middle;">
                    <div style="color:#ffffff;font-size:26px;font-weight:800;letter-spacing:.2px;">Loterij</div>
                    <div style="color:#bcd0f0;font-size:15px;font-weight:600;margin-top:2px;">${tekstNaarHtml(club)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:34px 32px 28px;">
              <p style="font-size:19px;margin:0 0 18px;">Beste ${naam},</p>
              <p style="font-size:17px;line-height:1.65;margin:0 0 22px;">${tekstNaarHtml(intro)}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 26px;">
                <tr><td style="background:#f4f6fb;border-radius:12px;padding:22px 24px;text-align:center;">
                  <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a90a2;font-weight:700;">Totaal opgehaald</div>
                  <div style="font-size:40px;line-height:1.1;font-weight:800;color:#17458f;margin:8px 0 10px;">${sam.totaal}</div>
                  <div style="font-size:15px;color:#5a6072;">${sam.bank} via bank &middot; ${sam.cash} contant &middot; ${sam.aantal} ${sam.aantal === 1 ? 'inschrijving' : 'inschrijvingen'}</div>
                </td></tr>
              </table>
              ${perAvond}
              <p style="font-size:17px;line-height:1.65;margin:0 0 26px;">${tekstNaarHtml(afsluiting)}</p>
              <div style="border-top:1px solid #e6e9f0;padding-top:16px;font-size:13px;color:#8a90a2;">
                Automatisch verstuurd vanuit de Rotary Loterij-app · ${datum}
              </div>
            </td>
          </tr>
        </table>
        <div style="font-size:12px;color:#9aa0b0;padding:16px;">${tekstNaarHtml(club)} &middot; Loterijcommissie</div>
      </td></tr>
    </table>
  </div>`;
}

// Mailt het financiële overzicht (CSV-bijlage) naar de penningmeester via
// Resend. Alleen voor beheer. Ontvanger + afzender komen uit de instellingen
// (beheerscherm), met env als terugval; de API-sleutel staat in de omgeving.
export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'geentoegang' }, { status: 403 });
  }

  if (isDemo) return NextResponse.json({ error: 'demo' }, { status: 400 });
  const inst = await getInstellingen();
  const apiKey = process.env.RESEND_API_KEY;
  const email = inst?.penningmeester_email || process.env.PENNINGMEESTER_EMAIL || '';
  const naam = inst?.penningmeester_naam || '';
  const van = inst?.afzender || process.env.MAIL_VAN || 'Rotary Loterij <onboarding@resend.dev>';
  if (!apiKey || !email) {
    return NextResponse.json({ error: 'nietingesteld' }, { status: 400 });
  }
  // Kaal adres: Resend's test-modus vergelijkt strikt op het e-mailadres, dus
  // geen "Naam <adres>"-vorm hier. De naam komt in de begroeting.
  const naar = email;

  let gekozen: string[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body.ronde)) gekozen = body.ronde.map(String).filter(Boolean);
  } catch {
    /* geen selectie */
  }
  // Niets aangevinkt = niets versturen.
  if (gekozen.length === 0) {
    return NextResponse.json({ error: 'geenselectie' }, { status: 400 });
  }

  const sb = serviceClient();
  const [{ data: rondesData }, { data: lotenData }] = await Promise.all([
    sb.from('rondes').select('*'),
    sb.from('loten').select('*').in('ronde_id', gekozen),
  ]);

  const rondes = (rondesData as Ronde[] | null) ?? [];
  const loten = (lotenData as Lot[] | null) ?? [];
  const csv = financieelCsv(rondes, loten);
  const datum = new Date().toISOString();
  const bestandsnaam = exportBestandsnaam(datum);

  // Per ronde-avond de betaalde opbrengst, voor in de mail-body.
  const rondeById = new Map(rondes.map((r) => [r.id, r]));
  const perRonde = new Map<string, number>();
  let bankSom = 0;
  let cashSom = 0;
  const batches = new Set<string>();
  for (const l of loten) {
    if (!l.betaald) continue;
    perRonde.set(l.ronde_id, (perRonde.get(l.ronde_id) ?? 0) + Number(l.bedrag ?? 0));
    if (l.betaalwijze === 'cash') cashSom += Number(l.bedrag ?? 0);
    else bankSom += Number(l.bedrag ?? 0);
    batches.add(`${l.ronde_id}|${l.naam}|${l.created_at}`);
  }
  bankSom = Math.round(bankSom * 100) / 100;
  cashSom = Math.round(cashSom * 100) / 100;
  const regels = [...perRonde.entries()]
    .map(([id, bedrag]) => {
      const r = rondeById.get(id);
      return {
        naam: r?.naam ?? 'Onbekende ronde',
        maand: (r?.maand ?? '').slice(0, 10),
        opbrengst: Math.round(bedrag * 100) / 100,
      };
    })
    .sort((a, b) => a.maand.localeCompare(b.maand));
  const totaal = Math.round(regels.reduce((s, r) => s + r.opbrengst, 0) * 100) / 100;
  const mailRegels = regels.map((r) => ({
    naam: r.naam,
    maand: r.maand,
    bedrag: euro(r.opbrengst),
  }));
  const onderwerp =
    regels.length === 1
      ? `Opbrengst loterij — ${regels[0].naam}`
      : `Financieel overzicht loterij — ${datum.slice(0, 10)}`;
  const intro = inst?.mail_intro || MAIL_INTRO_STANDAARD;
  const afsluiting = inst?.mail_afsluiting || MAIL_AFSLUITING_STANDAARD;
  const club = inst?.clubnaam?.trim() || CLUBNAAM_STANDAARD;
  // Logo van het eigen domein waarop de app draait (werkt ook met een custom domein).
  const logoUrl = `${new URL(req.url).origin}/RotaryMoE-R_CMYK-C.png`;
  const tekstRegels = regels
    .map((r) => `- ${r.naam} (${r.maand}): ${euro(r.opbrengst)}`)
    .join('\n');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: van,
        to: naar,
        subject: onderwerp,
        html: mailHtml(
          naam || 'penningmeester',
          mailRegels,
          {
            totaal: euro(totaal),
            bank: euro(bankSom),
            cash: euro(cashSom),
            aantal: batches.size,
          },
          datum.slice(0, 10),
          intro,
          afsluiting,
          club,
          logoUrl,
        ),
        text: `Beste ${naam || 'penningmeester'},\n\n${intro}\n\nTotaal opgehaald: ${euro(totaal)} (${euro(bankSom)} bank · ${euro(cashSom)} contant · ${batches.size} inschrijving(en))\n\n${tekstRegels}\n\n${afsluiting}`,
        attachments: [
          { filename: bestandsnaam, content: Buffer.from(csv, 'utf-8').toString('base64') },
        ],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[email-export] Resend weigerde:', res.status, detail);
      return NextResponse.json({ error: 'verzenden', detail }, { status: 502 });
    }
  } catch (e) {
    console.error('[email-export] Resend-aanroep mislukt:', e);
    return NextResponse.json({ error: 'verzenden' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, naar });
}
