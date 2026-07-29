/**
 * A small local, in-memory "asset library" standing in for Kargo's internal
 * Creative Hub, which this standalone repo intentionally does not integrate
 * with (it authenticates via internal session cookies against an internal
 * backend and cannot function outside that network). This gives the
 * "select an existing creative" UX a real, working implementation with zero
 * external dependencies — inline SVG data URIs, no network calls.
 */

export type MockAsset = {
  id: string;
  name: string;
  type: 'image' | 'video';
  url: string;
};

function svgDataUri(
  label: string,
  hue: number,
  width: number,
  height: number,
): string {
  const bg = `hsl(${hue}, 55%, 88%)`;
  const fg = `hsl(${hue}, 45%, 32%)`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="100%" height="100%" fill="${bg}"/>` +
    `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="${Math.max(10, width / 12)}" fill="${fg}">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const MOCK_LIBRARY_ASSETS: MockAsset[] = [
  {
    id: 'lib-1',
    name: 'Outdoor Living Hero 970x250',
    type: 'image',
    url: svgDataUri('Outdoor Living Hero', 24, 970, 250),
  },
  {
    id: 'lib-2',
    name: 'Outdoor Living Square 300x250',
    type: 'image',
    url: svgDataUri('Outdoor Living', 24, 300, 250),
  },
  {
    id: 'lib-3',
    name: 'Back to School Banner 728x90',
    type: 'image',
    url: svgDataUri('Back to School', 210, 728, 90),
  },
  {
    id: 'lib-4',
    name: 'Pantry Essentials 300x600',
    type: 'image',
    url: svgDataUri('Pantry Essentials', 45, 300, 600),
  },
  {
    id: 'lib-5',
    name: 'Holiday Promo 970x250',
    type: 'image',
    url: svgDataUri('Holiday Promo', 340, 970, 250),
  },
  {
    id: 'lib-6',
    name: 'Hero Video Placeholder :15',
    type: 'video',
    url: svgDataUri('Hero Video :15 (mock)', 200, 400, 400),
  },
];
