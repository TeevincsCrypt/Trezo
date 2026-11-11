import "server-only";
import { Database } from "./sqlite";
import fs from "node:fs";
import path from "node:path";
import { serverEnv } from "./env";
import { seedDatabase } from "./seed";

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  avatar TEXT NOT NULL DEFAULT 'fox',
  frame TEXT,
  account_id TEXT UNIQUE,
  is_guest INTEGER NOT NULL DEFAULT 1,
  is_sample INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  shards INTEGER NOT NULL DEFAULT 0,
  treasures_found INTEGER NOT NULL DEFAULT 0,
  rare_found INTEGER NOT NULL DEFAULT 0,
  missions_completed INTEGER NOT NULL DEFAULT 0,
  quests_completed INTEGER NOT NULL DEFAULT 0,
  distance_m REAL NOT NULL DEFAULT 0,
  streak_days INTEGER NOT NULL DEFAULT 0,
  last_active_day TEXT,
  shards_day TEXT,
  shards_earned_day INTEGER NOT NULL DEFAULT 0,
  last_claim_at INTEGER,
  last_lat REAL, last_lng REAL, last_loc_at INTEGER,
  flags INTEGER NOT NULL DEFAULT 0,
  radar_until INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_nonces (
  nonce TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS item_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  rarity TEXT NOT NULL,
  category TEXT NOT NULL,
  art TEXT NOT NULL,
  transferable INTEGER NOT NULL DEFAULT 1,
  max_supply INTEGER NOT NULL,
  issued INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS treasures (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  rarity TEXT NOT NULL,
  reward_shards INTEGER NOT NULL,
  reward_xp INTEGER NOT NULL,
  reward_item_id TEXT REFERENCES item_types(id),
  reward_item_qty INTEGER NOT NULL DEFAULT 1,
  max_claims INTEGER NOT NULL,
  claim_count INTEGER NOT NULL DEFAULT 0,
  claim_radius_m INTEGER NOT NULL DEFAULT 40,
  zone TEXT NOT NULL DEFAULT 'world',
  source TEXT NOT NULL DEFAULT 'admin',
  active INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_treasures_geo ON treasures(lat, lng);

CREATE TABLE IF NOT EXISTS spawn_cells (
  cell TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (cell, day)
);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  treasure_id TEXT NOT NULL REFERENCES treasures(id),
  reward_id TEXT,
  lat REAL NOT NULL, lng REAL NOT NULL, accuracy_m REAL,
  distance_m REAL NOT NULL,
  demo INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (player_id, treasure_id)
);

-- A reward is anything the game grants (treasure, mission, quest, exchange).
-- Items inside it live in reward_items and move vault -> minting -> onchain.
CREATE TABLE IF NOT EXISTS rewards (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,            -- treasure | mission | quest
  ref_id TEXT NOT NULL,          -- treasure / mission / quest id
  npc_id TEXT,
  max_claims INTEGER,
  title TEXT NOT NULL,
  rarity TEXT,
  shards INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  demo INTEGER NOT NULL DEFAULT 0,
  onchain_status TEXT NOT NULL DEFAULT 'none', -- none | ticket_issued | settled
  tx_hash TEXT,
  settled_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reward_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reward_id TEXT NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES item_types(id),
  qty INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'vault', -- vault | minting | onchain | spent
  acquired_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reward_items_player ON reward_items(player_id, status);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  type TEXT NOT NULL,   -- treasure | distance | new_cell | mission | quest
  value REAL NOT NULL DEFAULT 1,
  rarity TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_player ON events(player_id, type, created_at);
CREATE INDEX IF NOT EXISTS idx_events_time ON events(type, created_at);

CREATE TABLE IF NOT EXISTS visited_cells (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  cell TEXT NOT NULL,
  first_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, cell)
);

CREATE TABLE IF NOT EXISTS quests (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,          -- daily | weekly | special
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  difficulty TEXT NOT NULL,        -- easy | medium | hard | epic
  metric TEXT NOT NULL,
  target REAL NOT NULL,
  reward_shards INTEGER NOT NULL DEFAULT 0,
  reward_xp INTEGER NOT NULL DEFAULT 0,
  reward_item_id TEXT REFERENCES item_types(id),
  reward_item_qty INTEGER NOT NULL DEFAULT 1,
  entry_cost INTEGER NOT NULL DEFAULT 0,
  starts_at INTEGER,
  ends_at INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quest_state (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  quest_id TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  joined_at INTEGER,
  claimed_at INTEGER,
  PRIMARY KEY (player_id, quest_id, period)
);

CREATE TABLE IF NOT EXISTS npcs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  avatar TEXT NOT NULL,
  color TEXT NOT NULL,
  personality TEXT NOT NULL,
  greeting TEXT NOT NULL,
  lines TEXT NOT NULL              -- JSON array of ambient dialogue lines
);

CREATE TABLE IF NOT EXISTS npc_missions (
  id TEXT PRIMARY KEY,
  npc_id TEXT NOT NULL REFERENCES npcs(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  intro TEXT NOT NULL,
  outro TEXT NOT NULL,
  kind TEXT NOT NULL,              -- progress | exchange
  metric TEXT,
  target REAL,
  require_item_id TEXT REFERENCES item_types(id),
  require_item_qty INTEGER,
  unlock_cost INTEGER NOT NULL DEFAULT 0,
  reward_shards INTEGER NOT NULL DEFAULT 0,
  reward_xp INTEGER NOT NULL DEFAULT 0,
  reward_item_id TEXT REFERENCES item_types(id),
  reward_item_qty INTEGER NOT NULL DEFAULT 1,
  repeatable INTEGER NOT NULL DEFAULT 0,
  min_level INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mission_state (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL REFERENCES npc_missions(id) ON DELETE CASCADE,
  run INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,            -- accepted | completed
  accepted_at INTEGER NOT NULL,
  completed_at INTEGER,
  PRIMARY KEY (player_id, mission_id, run)
);

CREATE TABLE IF NOT EXISTS shop_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  kind TEXT NOT NULL,              -- frame | boost
  value TEXT NOT NULL,
  price INTEGER NOT NULL,
  stock INTEGER,                   -- NULL = unlimited
  sold INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  shop_item_id TEXT NOT NULL REFERENCES shop_items(id),
  price INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shard_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS market_events (
  tx_hash TEXT PRIMARY KEY,
  player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS intent_swaps (
  deposit_address TEXT NOT NULL,
  deposit_memo TEXT NOT NULL DEFAULT '',
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  origin_asset TEXT NOT NULL,
  amount_in TEXT NOT NULL,
  amount_out TEXT NOT NULL,
  status TEXT NOT NULL,
  quote_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (deposit_address, deposit_memo)
);
CREATE INDEX IF NOT EXISTS intent_swaps_player ON intent_swaps(player_id, created_at);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

type DB = Database;
const g = globalThis as unknown as { __trezoDb?: DB };

export function openDatabase(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  // WAL keeps the main database file untouched between checkpoints. That also
  // matters in `next dev`: rewriting data/trezo.db (or creating a -journal file)
  // on every write makes the dev file-watcher reload the page in a loop.
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA);
  const seeded = db.prepare("SELECT COUNT(*) AS n FROM item_types").get() as { n: number };
  if (seeded.n === 0) seedDatabase(db);
  // Earlier versions seeded flagged sample players; real explorers only now.
  db.prepare("DELETE FROM players WHERE is_sample = 1").run();
  db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('created_at', ?)").run(String(Date.now()));
  warnIfEphemeral(file);
  return db;
}

/**
 * Where the database lives and whether it survives a redeploy. On Railway a
 * volume sets RAILWAY_VOLUME_MOUNT_PATH; without one, every deploy starts from
 * an empty database (all progress lost).
 */
export function storageStatus(file = serverEnv.dbPath) {
  const onRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_SERVICE_ID);
  const mount = process.env.RAILWAY_VOLUME_MOUNT_PATH || null;
  const abs = file === ":memory:" ? file : path.resolve(file);
  const onVolume = !!mount && (abs === mount || abs.startsWith(mount.replace(/\/$/, "") + "/"));
  const persistent = file === ":memory:" ? false : onRailway ? onVolume : null; // null = unknown (not Railway)
  return {
    dbPath: abs,
    host: onRailway ? "railway" : "other",
    volumeMountPath: mount,
    persistent,
    warning:
      persistent === false && onRailway
        ? mount
          ? `The database (${abs}) is not on the attached volume (${mount}). Set TREZO_DB_PATH=${mount.replace(/\/$/, "")}/trezo.db.`
          : `No Railway volume is attached: the database (${abs}) is wiped on every deploy. Attach a volume mounted at /data.`
        : null,
  };
}

function warnIfEphemeral(file: string) {
  if (file === ":memory:") return;
  const s = storageStatus(file);
  if (s.warning) console.error(`\n[trezo] STORAGE WARNING: ${s.warning}\n`);
}

export function db(): DB {
  if (!g.__trezoDb) g.__trezoDb = openDatabase(serverEnv.dbPath);
  return g.__trezoDb;
}

/** Testing hook: replace the singleton with a fresh in-memory database. */
export function resetDbForTests(): DB {
  g.__trezoDb?.close();
  g.__trezoDb = openDatabase(":memory:");
  return g.__trezoDb;
}

export const now = () => Date.now();
