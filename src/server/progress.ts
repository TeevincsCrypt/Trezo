import "server-only";
import { db, now } from "./db";
import { fail } from "./errors";
import { getPlayer, type PlayerRow } from "./players";
import { grantReward, logEvent, spendShards } from "./game";
import { utcDay } from "./spawn";
import { levelForXp } from "@/lib/rules";

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

const RARITY_FILTER: Record<string, string> = {
  treasure: "",
  treasure_common: "AND rarity = 'common'",
  treasure_rare_plus: "AND rarity IN ('rare','epic','legendary')",
  treasure_epic_plus: "AND rarity IN ('epic','legendary')",
  treasure_legendary: "AND rarity = 'legendary'",
};

/** Value of `metric` for a player within [from, to). */
export function metricValue(p: PlayerRow, metric: string, from: number, to: number): number {
  if (metric in RARITY_FILTER) {
    const r = db()
      .prepare(`SELECT COUNT(*) AS n FROM events WHERE player_id = ? AND type = 'treasure' ${RARITY_FILTER[metric]} AND created_at >= ? AND created_at < ?`)
      .get(p.id, from, to) as { n: number };
    return r.n;
  }
  switch (metric) {
    case "distance": {
      const r = db().prepare("SELECT COALESCE(SUM(value),0) AS v FROM events WHERE player_id = ? AND type='distance' AND created_at >= ? AND created_at < ?").get(p.id, from, to) as { v: number };
      return Math.round(r.v);
    }
    case "new_cell":
    case "mission": {
      const r = db().prepare("SELECT COUNT(*) AS n FROM events WHERE player_id = ? AND type = ? AND created_at >= ? AND created_at < ?").get(p.id, metric, from, to) as { n: number };
      return r.n;
    }
    case "streak":
      return p.last_active_day && p.last_active_day >= utcDay(Date.now() - 86400_000) ? p.streak_days : 0;
    case "level":
      return levelForXp(p.xp);
    case "community_treasure": {
      const r = db()
        .prepare("SELECT COUNT(*) AS n FROM events e JOIN players pl ON pl.id = e.player_id WHERE pl.is_sample = 0 AND e.type='treasure' AND e.created_at >= ? AND e.created_at < ?")
        .get(from, to) as { n: number };
      return r.n;
    }
    default:
      return 0;
  }
}

const COMMUNITY_MIN_CONTRIBUTION = 3;

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

interface QuestRow {
  id: string;
  category: "daily" | "weekly" | "special";
  title: string;
  description: string;
  difficulty: string;
  metric: string;
  target: number;
  reward_shards: number;
  reward_xp: number;
  reward_item_id: string | null;
  reward_item_qty: number;
  entry_cost: number;
  starts_at: number | null;
  ends_at: number | null;
  active: number;
  sort: number;
}

function startOfUtcDay(t: number) {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function questPeriod(q: Pick<QuestRow, "category" | "starts_at" | "ends_at">, t = Date.now()) {
  if (q.category === "daily") {
    const from = startOfUtcDay(t);
    return { key: utcDay(t), from, to: from + 86400_000 };
  }
  if (q.category === "weekly") {
    const day = startOfUtcDay(t);
    const dow = (new Date(day).getUTCDay() + 6) % 7; // Monday = 0
    const from = day - dow * 86400_000;
    return { key: `W${utcDay(from)}`, from, to: from + 7 * 86400_000 };
  }
  return { key: "season", from: q.starts_at ?? 0, to: q.ends_at ?? 8.64e15 };
}

export function listQuests(playerId: string | null) {
  const p = playerId ? getPlayer(playerId) : undefined;
  const t = now();
  const quests = db().prepare("SELECT * FROM quests WHERE active = 1 ORDER BY category, sort").all() as QuestRow[];
  return quests
    .filter((q) => q.category !== "special" || ((q.starts_at ?? 0) <= t + 30 * 86400_000))
    .map((q) => {
      const period = questPeriod(q, t);
      const state = p
        ? (db().prepare("SELECT * FROM quest_state WHERE player_id = ? AND quest_id = ? AND period = ?").get(p.id, q.id, period.key) as
            | { joined_at: number | null; claimed_at: number | null }
            | undefined)
        : undefined;
      const needsJoin = q.entry_cost > 0;
      const joined = !needsJoin || !!state?.joined_at;
      const from = needsJoin && state?.joined_at ? Math.max(period.from, state.joined_at + 1) : period.from;
      const progress = p && joined ? metricValue(p, q.metric, from, Math.min(period.to, t + 1)) : 0;
      let personal: number | null = null;
      if (p && q.metric === "community_treasure") personal = metricValue(p, "treasure", period.from, Math.min(period.to, t + 1));
      const notStarted = (q.starts_at ?? 0) > t;
      const ended = period.to <= t;
      const complete = progress >= q.target && (personal === null || personal >= COMMUNITY_MIN_CONTRIBUTION);
      return {
        id: q.id,
        category: q.category,
        title: q.title,
        description: q.description,
        difficulty: q.difficulty,
        metric: q.metric,
        target: q.target,
        progress: Math.min(progress, q.target),
        personalContribution: personal,
        personalTarget: personal === null ? null : COMMUNITY_MIN_CONTRIBUTION,
        rewardShards: q.reward_shards,
        rewardXp: q.reward_xp,
        rewardItemId: q.reward_item_id,
        rewardItemQty: q.reward_item_qty,
        entryCost: q.entry_cost,
        joined,
        startsAt: q.starts_at,
        expiresAt: period.to,
        status: notStarted ? "upcoming" : state?.claimed_at ? "claimed" : ended ? "expired" : !joined ? "locked" : complete ? "complete" : "active",
      };
    });
}

export type QuestView = ReturnType<typeof listQuests>[number];

export function joinQuest(playerId: string, questId: string) {
  return db().transaction(() => {
    const q = (db().prepare("SELECT * FROM quests WHERE id = ? AND active = 1").get(questId) as QuestRow | undefined) ?? fail("not_found", "Quest not found", 404);
    if (q.entry_cost <= 0) fail("no_entry", "This quest doesn't need to be joined.");
    const t = now();
    if ((q.starts_at ?? 0) > t) fail("not_started", "This event hasn't started yet.");
    const period = questPeriod(q, t);
    if (period.to <= t) fail("expired", "This quest has ended.");
    const existing = db().prepare("SELECT joined_at FROM quest_state WHERE player_id=? AND quest_id=? AND period=?").get(playerId, q.id, period.key) as { joined_at: number | null } | undefined;
    if (existing?.joined_at) fail("already_joined", "You've already joined.");
    spendShards(playerId, q.entry_cost, "quest_entry", q.id);
    db()
      .prepare("INSERT INTO quest_state (player_id, quest_id, period, joined_at) VALUES (?,?,?,?) ON CONFLICT(player_id, quest_id, period) DO UPDATE SET joined_at = excluded.joined_at")
      .run(playerId, q.id, period.key, t);
    return { ok: true };
  })();
}

export function claimQuest(playerId: string, questId: string) {
  return db().transaction(() => {
    const view = listQuests(playerId).find((q) => q.id === questId) ?? fail("not_found", "Quest not found", 404);
    if (view.status === "claimed") fail("already_claimed", "Reward already claimed.");
    if (view.status !== "complete") fail("incomplete", "This quest isn't complete yet.");
    const q = db().prepare("SELECT * FROM quests WHERE id = ?").get(questId) as QuestRow;
    const period = questPeriod(q);
    const r = db()
      .prepare(
        `INSERT INTO quest_state (player_id, quest_id, period, claimed_at) VALUES (?,?,?,?)
         ON CONFLICT(player_id, quest_id, period) DO UPDATE SET claimed_at = excluded.claimed_at WHERE quest_state.claimed_at IS NULL`,
      )
      .run(playerId, q.id, period.key, now());
    if (r.changes === 0) fail("already_claimed", "Reward already claimed.");
    const reward = grantReward({
      playerId,
      kind: "quest",
      refId: `${q.id}.${period.key}`.replace(/[^A-Za-z0-9_.:-]/g, "-").slice(0, 64),
      title: q.title,
      shards: q.reward_shards,
      xp: q.reward_xp,
      items: q.reward_item_id ? [{ itemId: q.reward_item_id, qty: q.reward_item_qty }] : [],
    });
    db().prepare("UPDATE players SET quests_completed = quests_completed + 1 WHERE id = ?").run(playerId);
    logEvent(playerId, "quest");
    return { reward };
  })();
}

// ---------------------------------------------------------------------------
// NPC missions
// ---------------------------------------------------------------------------

interface MissionRow {
  id: string;
  npc_id: string;
  title: string;
  description: string;
  intro: string;
  outro: string;
  kind: "progress" | "exchange";
  metric: string | null;
  target: number | null;
  require_item_id: string | null;
  require_item_qty: number | null;
  unlock_cost: number;
  reward_shards: number;
  reward_xp: number;
  reward_item_id: string | null;
  reward_item_qty: number;
  repeatable: number;
  min_level: number;
  active: number;
  sort: number;
}

interface MissionStateRow {
  run: number;
  status: "accepted" | "completed";
  accepted_at: number;
  completed_at: number | null;
}

export function vaultQty(playerId: string, itemId: string): number {
  const r = db().prepare("SELECT COALESCE(SUM(qty),0) AS n FROM reward_items WHERE player_id = ? AND item_id = ? AND status = 'vault'").get(playerId, itemId) as { n: number };
  return r.n;
}

function latestState(playerId: string, missionId: string) {
  return db().prepare("SELECT * FROM mission_state WHERE player_id = ? AND mission_id = ? ORDER BY run DESC LIMIT 1").get(playerId, missionId) as MissionStateRow | undefined;
}

function missionView(p: PlayerRow | undefined, m: MissionRow) {
  const st = p ? latestState(p.id, m.id) : undefined;
  const level = p ? levelForXp(p.xp) : 1;
  let status: "locked" | "available" | "accepted" | "ready" | "completed";
  let progress = 0;
  let target = m.target ?? 0;
  if (m.kind === "exchange") {
    target = m.require_item_qty ?? 0;
    progress = p ? Math.min(target, vaultQty(p.id, m.require_item_id!)) : 0;
  }
  if (level < m.min_level) status = "locked";
  else if (!st || (st.status === "completed" && m.repeatable)) {
    status = m.kind === "exchange" && progress >= target && p && p.shards >= m.unlock_cost ? "ready" : "available";
  } else if (st.status === "completed") status = "completed";
  else {
    progress = p ? Math.min(target, metricValue(p, m.metric!, st.accepted_at + 1, now() + 1)) : 0;
    status = progress >= target ? "ready" : "accepted";
  }
  return {
    id: m.id,
    npcId: m.npc_id,
    title: m.title,
    description: m.description,
    intro: m.intro,
    outro: m.outro,
    kind: m.kind,
    metric: m.metric,
    target,
    progress,
    requireItemId: m.require_item_id,
    unlockCost: m.unlock_cost,
    rewardShards: m.reward_shards,
    rewardXp: m.reward_xp,
    rewardItemId: m.reward_item_id,
    rewardItemQty: m.reward_item_qty,
    repeatable: !!m.repeatable,
    minLevel: m.min_level,
    timesCompleted: p ? (db().prepare("SELECT COUNT(*) AS n FROM mission_state WHERE player_id=? AND mission_id=? AND status='completed'").get(p.id, m.id) as { n: number }).n : 0,
    status,
  };
}

export type MissionView = ReturnType<typeof missionView>;

export function listNpcs(playerId: string | null) {
  const p = playerId ? getPlayer(playerId) : undefined;
  const npcs = db().prepare("SELECT * FROM npcs ORDER BY rowid").all() as Record<string, string>[];
  const missions = db().prepare("SELECT * FROM npc_missions WHERE active = 1 ORDER BY sort").all() as MissionRow[];
  return npcs.map((n) => ({
    id: n.id,
    name: n.name,
    title: n.title,
    avatar: n.avatar,
    color: n.color,
    personality: n.personality,
    greeting: n.greeting,
    lines: JSON.parse(n.lines) as string[],
    missions: missions.filter((m) => m.npc_id === n.id).map((m) => missionView(p, m)),
  }));
}

export type NpcView = ReturnType<typeof listNpcs>[number];

export function acceptMission(playerId: string, missionId: string) {
  return db().transaction(() => {
    const p = getPlayer(playerId) ?? fail("not_found", "Player not found", 404);
    const m = (db().prepare("SELECT * FROM npc_missions WHERE id = ? AND active = 1").get(missionId) as MissionRow | undefined) ?? fail("not_found", "Mission not found", 404);
    if (m.kind !== "progress") fail("bad_kind", "Exchanges are completed directly.");
    if (levelForXp(p.xp) < m.min_level) fail("level", `Reach level ${m.min_level} first.`);
    const st = latestState(playerId, missionId);
    if (st && st.status === "accepted") fail("already_accepted", "Mission already in progress.");
    if (st && st.status === "completed" && !m.repeatable) fail("completed", "You've already completed this mission.");
    spendShards(playerId, m.unlock_cost, "mission_unlock", m.id);
    db().prepare("INSERT INTO mission_state (player_id, mission_id, run, status, accepted_at) VALUES (?,?,?,?,?)").run(playerId, m.id, (st?.run ?? 0) + 1, "accepted", now());
    return { ok: true };
  })();
}

export function completeMission(playerId: string, missionId: string) {
  return db().transaction(() => {
    const p = getPlayer(playerId) ?? fail("not_found", "Player not found", 404);
    const m = (db().prepare("SELECT * FROM npc_missions WHERE id = ? AND active = 1").get(missionId) as MissionRow | undefined) ?? fail("not_found", "Mission not found", 404);
    const view = missionView(p, m);
    if (view.status !== "ready") fail("not_ready", m.kind === "exchange" ? "You don't have what the Merchant asked for yet." : "Mission requirements not met yet.");
    const st = latestState(playerId, missionId);
    const t = now();
    if (m.kind === "exchange") {
      // Consume vault items (FIFO) and the Shard fee.
      spendShards(playerId, m.unlock_cost, "exchange_fee", m.id);
      let need = m.require_item_qty!;
      const rows = db()
        .prepare("SELECT id, qty FROM reward_items WHERE player_id = ? AND item_id = ? AND status = 'vault' ORDER BY acquired_at")
        .all(playerId, m.require_item_id) as { id: number; qty: number }[];
      for (const r of rows) {
        if (need <= 0) break;
        if (r.qty <= need) {
          db().prepare("UPDATE reward_items SET status = 'spent' WHERE id = ?").run(r.id);
          need -= r.qty;
        } else {
          db().prepare("UPDATE reward_items SET qty = qty - ? WHERE id = ?").run(need, r.id);
          need = 0;
        }
      }
      if (need > 0) fail("not_ready", "Not enough items.");
      db().prepare("UPDATE item_types SET issued = MAX(0, issued - ?) WHERE id = ?").run(m.require_item_qty, m.require_item_id);
      db().prepare("INSERT INTO mission_state (player_id, mission_id, run, status, accepted_at, completed_at) VALUES (?,?,?,?,?,?)").run(playerId, m.id, (st?.run ?? 0) + 1, "completed", t, t);
    } else {
      db().prepare("UPDATE mission_state SET status = 'completed', completed_at = ? WHERE player_id = ? AND mission_id = ? AND run = ?").run(t, playerId, m.id, st!.run);
    }
    const run = (st?.run ?? 0) + (m.kind === "exchange" ? 1 : 0);
    const reward = grantReward({
      playerId,
      kind: "mission",
      refId: `${m.id}.${run}`,
      npcId: m.npc_id,
      title: m.title,
      shards: m.reward_shards,
      xp: m.reward_xp,
      items: m.reward_item_id ? [{ itemId: m.reward_item_id, qty: m.reward_item_qty }] : [],
    });
    db().prepare("UPDATE players SET missions_completed = missions_completed + 1 WHERE id = ?").run(playerId);
    logEvent(playerId, "mission");
    return { reward, outro: m.outro };
  })();
}
