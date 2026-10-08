/**
 * Shared visual config for build-time OG cards.
 *
 * Edit this file to retune generated card colors, spacing, and fonts. Both
 * the per-page endpoint (`og/[...slug].ts`) and the homepage fallback
 * (`og.png.ts`) spread this object into `astro-og-canvas`.
 *
 * Leading underscore tells Astro to skip routing for this file — it sits
 * inside `src/pages/` to be next to its consumers, but it's not a route.
 */

import type { OGImageOptions } from 'astro-og-canvas';

export const ogCardConfig = {
  // RAGNA brand: navy-950 to navy-900, teal-500 accent edge.
  bgGradient: [
    [8, 21, 35],
    [12, 27, 46],
  ],
  border: { color: [25, 184, 166], width: 4, side: 'inline-start' },
  padding: 96,
  fonts: ['./public/fonts/Geist-SemiBold.ttf'],
  font: {
    title: {
      color: [244, 247, 251],
      size: 64,
      weight: 'SemiBold',
      families: ['Geist'],
      lineHeight: 1.1,
    },
    description: {
      color: [159, 184, 212],
      size: 32,
      weight: 'SemiBold',
      families: ['Geist'],
      lineHeight: 1.3,
    },
  },
  format: 'PNG',
} satisfies Partial<OGImageOptions>;
