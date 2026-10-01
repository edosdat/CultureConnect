import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { publicAppOrigin } from '@/lib/sharePreviewImage';
import {
  PWA_BACKGROUND_COLOR,
  PWA_ICONS,
  PWA_ID,
  PWA_NAME,
  PWA_START_URL,
  PWA_THEME_COLOR,
  relatedWebApp,
} from '@/lib/pwaManifest';

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = (h.get('x-forwarded-host') || h.get('host') || '').split(',')[0].trim();
  if (!host) return publicAppOrigin();
  const forwarded = (h.get('x-forwarded-proto') || '').split(',')[0].trim();
  const local = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const proto = forwarded || (local ? 'http' : 'https');
  return `${proto}://${host}`;
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const origin = await requestOrigin();
  return {
    name: PWA_NAME,
    short_name: PWA_NAME,
    description: 'Le plan culture autour de Toulouse.',
    id: PWA_ID,
    start_url: PWA_START_URL,
    scope: '/',
    display: 'standalone',
    background_color: PWA_BACKGROUND_COLOR,
    theme_color: PWA_THEME_COLOR,
    lang: 'fr',
    dir: 'ltr',
    icons: PWA_ICONS,
    prefer_related_applications: false,
    related_applications: [relatedWebApp(origin)],
  };
}
