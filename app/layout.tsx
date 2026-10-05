import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import RotaryLockup from '@/components/RotaryLockup';
import TrekkingLiveOverlay from '@/components/TrekkingLiveOverlay';
import Meting from '@/components/Meting';
import { MeldingenGelezen } from '@/components/LoterijMeldingen';
import ClubKoppeling from '@/components/ClubKoppeling';
import { getClubnaam } from '@/lib/instellingen';
import { isDemo } from '@/lib/demo';
import './globals.css';

// De clubnaam komt uit de instellingen (beheer), zodat elke club zijn eigen naam heeft.
export async function generateMetadata(): Promise<Metadata> {
  const club = await getClubnaam();
  return {
    title: `Rotary Experiences — Loterij ${club}`,
    description: `Winnaars, goede doelen en digitale loten van de loterij van ${club}.`,
    // "Zet op beginscherm" op de iPhone: schermvullend, eigen naam onder het icoon.
    appleWebApp: {
      capable: true,
      title: 'Loterij',
      statusBarStyle: 'black-translucent',
    },
  };
}

export const viewport: Viewport = {
  themeColor: '#17458f',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const club = await getClubnaam();
  return (
    <html lang="nl" suppressHydrationWarning>
      <body>
        {/* In de club-app ingebed? Dan geen eigen kop, voet en meldingenblok (de club-app heeft die al). */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{if(window.self!==window.top)document.documentElement.classList.add('ingebed')}catch(e){document.documentElement.classList.add('ingebed')}",
          }}
        />
        {isDemo && (
          <div className="demo-balk">
            <div className="container demo-balk-inner">
              <p>
                <strong>Testversie</strong> van de loterij. Probeer gerust alles uit: er wordt niet echt betaald en er gaan
                geen mails uit.
              </p>
              <div className="demo-balk-knoppen">
                <Link className="btn btn-sm" href="/beheer">
                  Loterijbeheer bekijken
                </Link>
                {process.env.PLATFORM_URL && (
                  <a className="btn btn-sm btn-ghost" href={process.env.PLATFORM_URL}>
                    ← Terug naar de club
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="brand" aria-label={`Loterij ${club}`}>
              {/* Zelfde Rotary-logo als de club-site, met "Loterij" na de streep. */}
              <RotaryLockup clubnaam="Loterij" />
            </Link>
            <nav className="site-nav">
              <Link href="/">Winnaars</Link>
              <Link href="/goede-doelen">Goede doelen</Link>
              <Link href="/meedoen">Meedoen</Link>
              <Link href="/beheer" className="beheer-link">
                Beheer
              </Link>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>

        {/* Trekking bezig? Dan komt die vanzelf in beeld, op welke pagina de
            bezoeker ook zit. Staat uit op /beheer en /live. */}
        <TrekkingLiveOverlay />
        <Meting platformUrl={process.env.PLATFORM_URL ?? null} />
        <MeldingenGelezen />
        <ClubKoppeling platformUrl={process.env.PLATFORM_URL ?? null} />
        <footer className="site-footer">
          <div className="container">
            <p>{club} · Loterijcommissie</p>
            <p className="footer-note">
              “De mooiste prijs zit niet in een fles wijn, maar in de tijd en
              aandacht die we met elkaar delen.”
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
