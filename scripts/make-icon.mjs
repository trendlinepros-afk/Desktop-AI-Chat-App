// Renders the WICKED / Chatbot-AI app icon (build/icon.png) from an inline SVG.
// Run: node scripts/make-icon.mjs  (uses @resvg/resvg-js, a dev dependency)
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const RED = '#d6232b';
const WHITE = '#ffffff';

// Rounded-rect speech-bubble outline path (centerline), x250..774 y250..520.
const bubble = `
  M 282 250 H 742 Q 774 250 774 282 V 488 Q 774 520 742 520 H 282
  Q 250 520 250 488 V 282 Q 250 250 282 250 Z`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <clipPath id="leftHalf"><rect x="0" y="0" width="512" height="1024"/></clipPath>
    <clipPath id="rightHalf"><rect x="512" y="0" width="512" height="1024"/></clipPath>
  </defs>

  <!-- layered dark rounded square -->
  <rect x="0" y="0" width="1024" height="1024" rx="100" fill="#161a20"/>
  <rect x="34" y="34" width="956" height="956" rx="78" fill="#0a0c10"/>
  <rect x="74" y="74" width="876" height="876" rx="54" fill="#2b323c"/>

  <!-- speech bubble: red left half, white right half -->
  <g fill="none" stroke-width="36" stroke-linejoin="round" stroke-linecap="round">
    <path d="${bubble}" stroke="${RED}" clip-path="url(#leftHalf)"/>
    <path d="${bubble}" stroke="${WHITE}" clip-path="url(#rightHalf)"/>
  </g>
  <!-- red tail / beak, lower-left -->
  <path d="M 322 502 L 350 624 L 446 502 Z" fill="${RED}"/>

  <!-- four dots -->
  <g fill="${WHITE}">
    <circle cx="410" cy="385" r="26"/>
    <circle cx="478" cy="385" r="26"/>
    <circle cx="546" cy="385" r="26"/>
    <circle cx="614" cy="385" r="26"/>
  </g>

  <!-- wordmark -->
  <text x="512" y="752" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold"
        font-size="118" letter-spacing="4" fill="${WHITE}">CHATBOT AI</text>
  <text x="512" y="828" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold"
        font-size="50" letter-spacing="10" fill="#9aa5b1">DESKTOP ASSISTANT</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1024 },
  font: {
    fontFiles: [
      '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    ],
    loadSystemFonts: true,
    defaultFontFamily: 'DejaVu Sans',
  },
});
const png = resvg.render().asPng();
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.writeFileSync(path.join(root, 'build', 'icon.png'), png);
console.log('Wrote build/icon.png', png.length, 'bytes');
