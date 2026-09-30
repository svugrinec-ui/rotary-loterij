import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { IconSettings } from '@/components/Icons';
import TrekkingLiveOverlay from '@/components/TrekkingLiveOverlay';
import { getClubnaam } from '@/lib/instellingen';
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
    <html lang="nl">
      <body>
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="brand-wheel" src="/RotaryMoE-R_CMYK-C.png" alt="" aria-hidden />

              <span className="brand-text">
                <strong>Loterij</strong>
                <small>{club}</small>
              </span>
            </Link>
            <nav className="site-nav">
              <Link href="/">Winnaars</Link>
              <Link href="/goede-doelen">Goede doelen</Link>
              <Link href="/meedoen">Meedoen</Link>
              <Link
                href="/beheer"
                className="beheer-link"
                title="Beheer"
                aria-label="Beheer"
              >
                <IconSettings size={20} />
              </Link>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>

        {/* Trekking bezig? Dan komt die vanzelf in beeld, op welke pagina de
            bezoeker ook zit. Staat uit op /beheer en /live. */}
        <TrekkingLiveOverlay />
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
