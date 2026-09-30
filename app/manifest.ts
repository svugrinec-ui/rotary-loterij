import type { MetadataRoute } from 'next';
import { getClubnaam } from '@/lib/instellingen';

// Clubnaam kan in beheer wijzigen: manifest af en toe opnieuw opbouwen.
export const revalidate = 300;

// PWA-manifest: maakt de app installeerbaar (Android/desktop) en schermvullend.
// Op iPhone gebruikt "Zet op beginscherm" het apple-icon + de apple-meta's.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const club = await getClubnaam();
  return {
    name: `Loterij ${club}`,
    short_name: 'Loterij',
    description:
      'Meedoen met de Rotary-loterij: winnaars, goede doelen en digitale loten.',
    start_url: '/',
    display: 'standalone',
    background_color: '#17458f',
    theme_color: '#17458f',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
