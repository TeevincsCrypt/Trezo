/**
 * TREZO game & economy rules. Single source of truth shared by the server
 * (authoritative) and the client (display only). Documented in ECONOMY section
 * of README.md — keep both in sync.
 */

export type Rarity = "common" | "rare" | "epic" | "legendary";
export const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];

export const RARITY: Record<
  Rarity,
  {
    label: string;
    color: string;
    glow: string;
    shards: number;
    xp: number;
    /** Default number of players who can claim one treasure of this rarity. */
    maxClaims: number;
    /** Spawn weight for procedural treasure fields. */
    spawnWeight: number;
    /** Chance that a spawned treasure also drops a collectible. */
    itemDropChance: number;
  }
> = {
  common: { label: "Common", color: "#6F8499", glow: "rgba(111,132,153,0.35)", shards: 10, xp: 20, maxClaims: 25, spawnWeight: 62, itemDropChance: 0.25 },
  rare: { label: "Rare", color: "#2F7FE0", glow: "rgba(47,127,224,0.35)", shards: 30, xp: 60, maxClaims: 10, spawnWeight: 27, itemDropChance: 0.6 },
  epic: { label: "Epic", color: "#8A55F0", glow: "rgba(138,85,240,0.35)", shards: 75, xp: 150, maxClaims: 5, spawnWeight: 9, itemDropChance: 0.9 },
  legendary: { label: "Legendary", color: "#E59A0C", glow: "rgba(229,154,12,0.4)", shards: 200, xp: 400, maxClaims: 1, spawnWeight: 2, itemDropChance: 1 },
};

export const ECONOMY = {
  /** Shards a player can earn per UTC day. Anything above converts to XP only. */
  dailyShardCap: 600,
  /** Minimum seconds between two treasure claims by the same player. */
  claimCooldownSec: 15,
  /** Default claim radius in metres. */
  defaultClaimRadiusM: 40,
  /** Reject claims whose reported GPS accuracy is worse than this. */
  maxGpsAccuracyM: 75,
  /** Implausible movement speed (m/s) between two location fixes (~200 km/h). */
  maxSpeedMps: 55,
  /** Distance considered "nearby" on the Explore screen. */
  nearbyRadiusM: 1500,
  /** Procedural treasure fields: grid cell size in degrees (~1.1 km). */
  spawnCellDeg: 0.01,
  spawnPerCell: 9,
  /** Spawned treasures expire after this many hours. */
  spawnTtlHours: 24,
  /** Exploration cell size in degrees for "visit a new location" (~220 m). */
  visitCellDeg: 0.002,
  /** On-chain claim tickets are valid for this long. */
  ticketTtlMs: 10 * 60 * 1000,
} as const;

/** XP needed to reach `level` (level 1 = 0 XP). Quadratic curve. */
export function xpForLevel(level: number): number {
  return 100 * (level - 1) * (level - 1);
}

export function levelForXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}

export function levelProgress(xp: number) {
  const level = levelForXp(xp);
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, current: xp - base, needed: next - base, pct: (xp - base) / (next - base) };
}

export const AVATARS = [
  { id: "fox", label: "Fox", emoji: "🦊", bg: "#FFE3D1" },
  { id: "owl", label: "Owl", emoji: "🦉", bg: "#E7E1F7" },
  { id: "wolf", label: "Wolf", emoji: "🐺", bg: "#DDE6EE" },
  { id: "octopus", label: "Octopus", emoji: "🐙", bg: "#F6DDE7" },
  { id: "dragon", label: "Dragon", emoji: "🐉", bg: "#D9EEDF" },
  { id: "tiger", label: "Tiger", emoji: "🐯", bg: "#FCEBC9" },
  { id: "panda", label: "Panda", emoji: "🐼", bg: "#E6E6E3" },
  { id: "eagle", label: "Eagle", emoji: "🦅", bg: "#F1E5D3" },
] as const;

export type AvatarId = (typeof AVATARS)[number]["id"];
export const avatarById = (id: string) => AVATARS.find((a) => a.id === id) ?? AVATARS[0];

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
