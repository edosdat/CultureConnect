/**
 * Plan C web app manifest fields.
 * Icon files are the LOCK lettermark « C » v3 violet (not a generated terracotta set).
 * theme_color is the Plan C rose; the glyph itself is violet.
 */

export const PWA_NAME = 'Plan C';
export const PWA_THEME_COLOR = '#FF2E7E';
export const PWA_BACKGROUND_COLOR = '#1A0B1E';
export const PWA_START_URL = '/';
/** Stable id across preview hosts. Resolved against the manifest URL. */
export const PWA_ID = '/';

/** Self-reference so Chromium can answer getInstalledRelatedApps() in scope. */
export function relatedWebApp(origin: string): {
  platform: 'webapp';
  url: string;
  id: string;
} {
  const base = origin.replace(/\/$/, '');
  return {
    platform: 'webapp',
    url: '/manifest.webmanifest',
    id: `${base}/`,
  };
}

export const PWA_ICONS = [
  {
    src: '/icon-192.png',
    sizes: '192x192',
    type: 'image/png',
    purpose: 'any' as const,
  },
  {
    src: '/icon-512.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'any' as const,
  },
  {
    src: '/icon-192-maskable.png',
    sizes: '192x192',
    type: 'image/png',
    purpose: 'maskable' as const,
  },
  {
    src: '/icon-512-maskable.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'maskable' as const,
  },
];
