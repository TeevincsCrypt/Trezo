/**
 * Original TREZO collectible artwork, generated as SVG. Each design is a
 * hand-built vector illustration on a rarity-tinted plate. Served from
 * /api/art/<itemId>.svg (also used as the NEP-245 `media` URL).
 */
import { RARITY, type Rarity } from "./rules";

const GOLD = "#F4C567";
const GOLD_D = "#B8862E";
const INK = "#0B0F16";

function icon(art: string, c: string): string {
  switch (art) {
    case "gem":
      return `
      <polygon points="128,52 178,88 166,164 128,200 90,164 78,88" fill="${c}" opacity=".95"/>
      <polygon points="128,52 178,88 128,104 78,88" fill="#fff" opacity=".35"/>
      <polygon points="128,104 166,164 128,200" fill="${INK}" opacity=".25"/>
      <polygon points="78,88 128,104 90,164" fill="#fff" opacity=".12"/>
      <polyline points="78,88 128,104 178,88" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>
      <line x1="128" y1="104" x2="128" y2="200" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>`;
    case "coin":
      return `
      <circle cx="128" cy="128" r="64" fill="${GOLD}"/>
      <circle cx="128" cy="128" r="64" fill="none" stroke="${GOLD_D}" stroke-width="6"/>
      <circle cx="128" cy="128" r="50" fill="none" stroke="${GOLD_D}" stroke-width="2" stroke-dasharray="3 5"/>
      <polygon points="128,86 136,120 170,128 136,136 128,170 120,136 86,128 120,120" fill="${GOLD_D}"/>
      <polygon points="128,86 136,120 128,128 120,120" fill="#fff" opacity=".5"/>
      <path d="M86 104 A50 50 0 0 1 124 78" stroke="#fff" stroke-opacity=".6" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    case "scroll":
      return `
      <rect x="70" y="72" width="116" height="112" rx="6" fill="#E9D6A8"/>
      <rect x="62" y="64" width="20" height="128" rx="10" fill="#C9A86A"/>
      <rect x="174" y="64" width="20" height="128" rx="10" fill="#C9A86A"/>
      <path d="M92 160 C110 140 104 120 126 116 S150 96 160 92" stroke="${c}" stroke-width="4" stroke-dasharray="2 7" stroke-linecap="round" fill="none"/>
      <path d="M152 84 l14 14 M166 84 l-14 14" stroke="#C0392B" stroke-width="5" stroke-linecap="round"/>
      <circle cx="92" cy="160" r="5" fill="${c}"/>`;
    case "compass":
      return `
      <circle cx="128" cy="128" r="66" fill="${GOLD_D}"/>
      <circle cx="128" cy="128" r="58" fill="#14202E"/>
      <circle cx="128" cy="128" r="58" fill="none" stroke="${GOLD}" stroke-width="3"/>
      <g stroke="${GOLD}" stroke-width="2" opacity=".7">${[0, 45, 90, 135, 180, 225, 270, 315]
        .map((a) => `<line x1="128" y1="76" x2="128" y2="84" transform="rotate(${a} 128 128)"/>`)
        .join("")}</g>
      <polygon points="128,84 138,128 128,172 118,128" fill="#E8EEF5" transform="rotate(32 128 128)"/>
      <polygon points="128,84 138,128 118,128" fill="${c}" transform="rotate(32 128 128)"/>
      <circle cx="128" cy="128" r="7" fill="${GOLD}"/>
      <rect x="120" y="52" width="16" height="12" rx="4" fill="${GOLD}"/>`;
    case "hourglass":
      return `
      <rect x="78" y="58" width="100" height="12" rx="6" fill="${GOLD}"/>
      <rect x="78" y="186" width="100" height="12" rx="6" fill="${GOLD}"/>
      <path d="M92 70 h72 c0 40 -30 46 -30 58 s30 18 30 58 h-72 c0 -40 30 -46 30 -58 s-30 -18 -30 -58z" fill="#CFE3F7" opacity=".25" stroke="#E8F1FA" stroke-width="3"/>
      <path d="M104 92 h48 c-6 18 -20 24 -24 32 c-4 -8 -18 -14 -24 -32z" fill="${c}"/>
      <path d="M106 176 c4 -16 18 -22 22 -28 c4 6 18 12 22 28z" fill="${c}" opacity=".6"/>
      <line x1="128" y1="124" x2="128" y2="150" stroke="${c}" stroke-width="2" stroke-dasharray="2 3"/>
      <rect x="84" y="70" width="6" height="116" fill="${GOLD_D}"/><rect x="166" y="70" width="6" height="116" fill="${GOLD_D}"/>`;
    case "lantern":
      return `
      <circle cx="128" cy="136" r="54" fill="${c}" opacity=".25"/>
      <path d="M112 56 h32 l6 18 h-44z" fill="${GOLD_D}"/>
      <path d="M128 40 a12 12 0 0 1 0 24" stroke="${GOLD}" stroke-width="4" fill="none"/>
      <rect x="96" y="74" width="64" height="104" rx="14" fill="#1A2738" stroke="${GOLD}" stroke-width="5"/>
      <path d="M128 96 c18 22 14 40 0 56 c-14 -16 -18 -34 0 -56z" fill="${c}"/>
      <path d="M128 112 c8 12 6 22 0 30 c-6 -8 -8 -18 0 -30z" fill="#fff" opacity=".85"/>
      <rect x="104" y="178" width="48" height="12" rx="4" fill="${GOLD_D}"/>`;
    case "crown":
      return `
      <path d="M68 168 L76 92 L104 124 L128 76 L152 124 L180 92 L188 168 Z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="4" stroke-linejoin="round"/>
      <rect x="66" y="166" width="124" height="22" rx="6" fill="${GOLD_D}"/>
      <circle cx="128" cy="150" r="10" fill="${c}"/><circle cx="96" cy="154" r="7" fill="#4AA8FF"/><circle cx="160" cy="154" r="7" fill="#3DDCB4"/>
      <circle cx="76" cy="90" r="7" fill="${GOLD}"/><circle cx="128" cy="72" r="8" fill="${GOLD}"/><circle cx="180" cy="90" r="7" fill="${GOLD}"/>
      <path d="M84 160 L90 108" stroke="#fff" stroke-opacity=".45" stroke-width="4" stroke-linecap="round"/>`;
    case "egg":
      return `
      <circle cx="128" cy="140" r="60" fill="#FF7A3D" opacity=".22"/>
      <path d="M128 60 c36 0 56 52 56 84 c0 34 -24 56 -56 56 s-56 -22 -56 -56 c0 -32 20 -84 56 -84z" fill="#3A1D14"/>
      <path d="M128 60 c36 0 56 52 56 84 c0 34 -24 56 -56 56 s-56 -22 -56 -56 c0 -32 20 -84 56 -84z" fill="none" stroke="#FF9B4D" stroke-width="3"/>
      <path d="M96 128 l14 10 l10 -14 l12 16 l10 -12 l14 12 l12 -8" stroke="#FFB547" stroke-width="5" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="M100 160 l12 -8 l10 10 l14 -10 l10 8 l12 -6" stroke="#FF6A2D" stroke-width="4" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
      <ellipse cx="108" cy="96" rx="8" ry="14" fill="#fff" opacity=".18" transform="rotate(-20 108 96)"/>`;
    case "badge":
      return `
      <path d="M128 54 L182 74 V124 C182 160 156 186 128 198 C100 186 74 160 74 124 V74 Z" fill="#16263A" stroke="${c}" stroke-width="6" stroke-linejoin="round"/>
      <polygon points="128,92 139,116 165,118 145,135 151,161 128,147 105,161 111,135 91,118 117,116" fill="${GOLD}"/>
      <path d="M90 82 L128 68" stroke="#fff" stroke-opacity=".35" stroke-width="4" stroke-linecap="round"/>`;
    case "seal":
      return `
      <path d="M128 56 l14 10 l17 -2 l7 16 l16 7 l-2 17 l10 14 l-10 14 l2 17 l-16 7 l-7 16 l-17 -2 l-14 10 l-14 -10 l-17 2 l-7 -16 l-16 -7 l2 -17 l-10 -14 l10 -14 l-2 -17 l16 -7 l7 -16 l17 2z" fill="#8E2B3B"/>
      <circle cx="128" cy="128" r="44" fill="#A8344A" stroke="#D2596F" stroke-width="3"/>
      <g stroke="#F3C1C9" stroke-width="2" opacity=".8"><line x1="98" y1="112" x2="158" y2="112"/><line x1="98" y1="128" x2="158" y2="128"/><line x1="98" y1="144" x2="158" y2="144"/><line x1="112" y1="98" x2="112" y2="158"/><line x1="128" y1="98" x2="128" y2="158"/><line x1="144" y1="98" x2="144" y2="158"/></g>
      <path d="M104 150 L120 128 L136 136 L152 106" stroke="${c}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    case "frame":
    case "frame2": {
      const g = art === "frame2" ? `url(#aur)` : "#FF7A3D";
      return `
      <defs><linearGradient id="aur" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3DDCB4"/><stop offset=".5" stop-color="#7C8CFF"/><stop offset="1" stop-color="#E06BFF"/></linearGradient></defs>
      <rect x="64" y="64" width="128" height="128" rx="28" fill="none" stroke="${g}" stroke-width="14"/>
      <rect x="82" y="82" width="92" height="92" rx="18" fill="#101826"/>
      <circle cx="128" cy="118" r="18" fill="#2A3A52"/><path d="M98 168 c6 -22 54 -22 60 0z" fill="#2A3A52"/>
      ${[0, 90, 180, 270].map((a) => `<circle cx="128" cy="57" r="8" fill="${GOLD}" transform="rotate(${a} 128 128)"/>`).join("")}`;
    }
    case "moon":
      return `
      <circle cx="128" cy="124" r="58" fill="#FFB547"/>
      <circle cx="152" cy="108" r="52" fill="#121A26"/>
      <circle cx="104" cy="118" r="6" fill="#E09A2F"/><circle cx="96" cy="148" r="9" fill="#E09A2F"/><circle cx="118" cy="164" r="5" fill="#E09A2F"/>
      <path d="M150 176 c10 -20 26 -26 40 -24 c-4 14 -18 26 -40 24z" fill="#C46A2B"/>
      <path d="M150 176 c-4 -18 4 -34 16 -42 c6 14 0 32 -16 42z" fill="#E08A3A"/>`;
    default:
      return `<circle cx="128" cy="128" r="56" fill="${c}"/>`;
  }
}

export function itemSvg(art: string, rarity: Rarity): string {
  const c = RARITY[rarity]?.color ?? "#9DB7CC";
  const legendary = rarity === "legendary";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="70%">
      <stop offset="0" stop-color="${c}" stop-opacity=".38"/>
      <stop offset=".6" stop-color="#121A26"/>
      <stop offset="1" stop-color="#0A0E15"/>
    </radialGradient>
  </defs>
  <rect width="256" height="256" rx="40" fill="url(#bg)"/>
  ${legendary ? `<g opacity=".35" stroke="${c}" stroke-width="2">${Array.from({ length: 12 }, (_, i) => `<line x1="128" y1="20" x2="128" y2="44" transform="rotate(${i * 30} 128 128)"/>`).join("")}</g>` : ""}
  <ellipse cx="128" cy="212" rx="64" ry="10" fill="#000" opacity=".35"/>
  ${icon(art, c)}
  <rect x="3" y="3" width="250" height="250" rx="38" fill="none" stroke="${c}" stroke-opacity=".55" stroke-width="3"/>
</svg>`;
}

/** Map marker glyph for treasures (chest), drawn for a white marker disc. */
export function chestSvg(rarity: Rarity, opened = false): string {
  const c = RARITY[rarity].color;
  const body = opened ? "#D9D8D4" : c;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
  <path d="M8 22 h32 v15 a5 5 0 0 1 -5 5 h-22 a5 5 0 0 1 -5 -5z" fill="${body}"/>
  <path d="M8 22 c0 -10 6 -14 16 -14 s16 4 16 14z" fill="${body}" opacity=".72"/>
  <rect x="8" y="21" width="32" height="3.5" fill="#0E0E10" opacity=".85"/>
  <rect x="20.5" y="19" width="7" height="11" rx="3.5" fill="#0E0E10"/>
  <circle cx="24" cy="25" r="1.6" fill="${opened ? "#D9D8D4" : "#FFB27A"}"/>
</svg>`;
}
