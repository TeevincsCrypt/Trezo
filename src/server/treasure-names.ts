import type { Rarity } from "@/lib/rules";

const PREFIX: Record<Rarity, string[]> = {
  common: ["Dusty", "Hidden", "Weathered", "Forgotten", "Mossy", "Street"],
  rare: ["Gilded", "Sealed", "Moonlit", "Silver", "Wanderer's", "Copper"],
  epic: ["Arcane", "Obsidian", "Stormbound", "Sunken", "Starforged"],
  legendary: ["Mythic", "Celestial", "Sovereign", "Eternal"],
};
const NOUN: Record<Rarity, string[]> = {
  common: ["Pouch", "Satchel", "Crate", "Coin Stash", "Tin Box"],
  rare: ["Chest", "Strongbox", "Reliquary", "Cache"],
  epic: ["Vault", "Coffer", "Ark", "Sarcophagus"],
  legendary: ["Hoard", "Crown Vault", "Dragon Cache"],
};
const FLAVOR: Record<Rarity, string[]> = {
  common: ["Someone hid this in a hurry.", "Small, but every find counts.", "The lock is rusted shut — almost."],
  rare: ["Sealed with wax and a strange crest.", "Heavier than it looks.", "Hums softly when you get close."],
  epic: ["Few hunters ever see one of these.", "The air shimmers around it.", "Only five explorers can open it."],
  legendary: ["Only one explorer will ever open this.", "Stories about this one are older than the city."],
};

export function treasureName(rarity: Rarity, r: { pick: <T>(a: readonly T[]) => T }) {
  return { name: `${r.pick(PREFIX[rarity])} ${r.pick(NOUN[rarity])}`, description: r.pick(FLAVOR[rarity]) };
}
