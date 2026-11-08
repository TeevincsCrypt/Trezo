"use client";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, Check, Coins, Lock, ScrollText, Sparkles, Users } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { metricLabel } from "@/lib/format";
import type { QuestView, NpcView, MissionView } from "@/server/progress";
import { useApi, useItems } from "@/components/hooks";
import { useGame } from "@/components/providers/GameProvider";
import { Empty, ItemImage, PageHeader, Progress, Segmented, Sheet, ShardIcon, Spinner, cx, timeLeft } from "@/components/ui";
import { NpcTreasury } from "@/components/onchain/NpcTreasury";

type Tab = "daily" | "weekly" | "special" | "guild";

const DIFF: Record<string, string> = { easy: "text-teal", medium: "text-rare", hard: "text-epic", epic: "text-legendary" };


export default function QuestsPage() {
  const [tab, setTab] = useState<Tab>("daily");
  const { me } = useGame();
  const quests = useApi<{ quests: QuestView[] }>("/api/quests", [me?.id]);
  const npcs = useApi<{ npcs: NpcView[] }>("/api/npcs", [me?.id]);
  const ready = (quests.data?.quests ?? []).filter((q) => q.status === "complete").length;
  const missionReady = (npcs.data?.npcs ?? []).flatMap((n) => n.missions).filter((m) => m.status === "ready").length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Quests" subtitle="Daily goals, weekly challenges, limited events and guild missions." />
      <div className="px-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "daily", label: <span>Daily{ready > 0 && tab !== "daily" ? " •" : ""}</span> },
            { value: "weekly", label: "Weekly" },
            { value: "special", label: "Special" },
            { value: "guild", label: <span>Guild{missionReady > 0 ? ` (${missionReady})` : ""}</span> },
          ]}
        />
      </div>
      <div className="mt-4 px-4">
        {tab === "guild" ? (
          <Guild data={npcs.data?.npcs ?? null} reload={npcs.reload} reloadQuests={quests.reload} />
        ) : (
          <QuestList quests={(quests.data?.quests ?? []).filter((q) => q.category === tab)} loading={quests.loading && !quests.data} reload={quests.reload} category={tab} />
        )}
      </div>
    </div>
  );
}

function QuestList({ quests, loading, reload, category }: { quests: QuestView[]; loading: boolean; reload: () => void; category: string }) {
  if (loading) return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-32" />)}</div>;
  if (quests.length === 0) return <Empty icon={<ScrollText />} title="Nothing here right now" body="New quests appear regularly. Check back soon." />;
  return (
    <div className="space-y-3">
      {category !== "special" && quests[0] && (
        <p className="flex items-center gap-1.5 text-[12px] text-muted">
          <CalendarClock size={14} /> Resets in {timeLeft(quests[0].expiresAt).replace(" left", "")}
        </p>
      )}
      {quests.map((q) => (
        <QuestCard key={q.id} q={q} reload={reload} />
      ))}
    </div>
  );
}

function QuestCard({ q, reload }: { q: QuestView; reload: () => void }) {
  const { me, notify, refresh, openOnboarding } = useGame();
  const { byId } = useItems();
  const [busy, setBusy] = useState(false);
  const act = async (action: "join" | "claim") => {
    if (!me) return openOnboarding();
    setBusy(true);
    try {
      await api(`/api/quests/${q.id}/${action}`, { method: "POST" });
      notify(action === "claim" ? { title: "Quest complete!", body: `+${q.rewardShards} Shards · +${q.rewardXp} XP${q.rewardItemId ? ` · ${byId[q.rewardItemId]?.name ?? "collectible"}` : ""}`, tone: "success" } : { title: "You're in!", body: `${q.title} has started.`, tone: "success" });
      await Promise.all([reload(), refresh()]);
    } catch (e) {
      notify({ title: "Not yet", body: e instanceof ApiError ? e.message : "Network error", tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const done = q.status === "claimed";
  return (
    <motion.div layout className={cx("card p-4", q.status === "complete" && "border-gold/40", done && "opacity-60")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-[1.02rem]">{q.title}</h3>
            <span className={cx("text-[10px] font-bold uppercase tracking-wider", DIFF[q.difficulty])}>{q.difficulty}</span>
          </div>
          <p className="mt-0.5 text-[13px] text-muted">{q.description}</p>
        </div>
        {q.rewardItemId && <ItemImage id={q.rewardItemId} size={44} className="rounded-xl" />}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Progress value={q.progress} max={q.target} color={q.status === "complete" || done ? "var(--color-gold)" : undefined} />
        <span className="shrink-0 text-[12px] font-semibold tabular text-muted">
          {metricLabel(q.metric, q.progress)} / {metricLabel(q.metric, q.target)}
        </span>
      </div>
      {q.personalContribution !== null && (
        <p className="mt-1.5 text-[12px] text-muted">
          Your contribution: {q.personalContribution} / {q.personalTarget} finds
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="chip">
            <ShardIcon size={12} /> {q.rewardShards}
          </span>
          {q.rewardXp > 0 && <span className="chip text-gold">+{q.rewardXp} XP</span>}
          {q.rewardItemId && <span className="chip">{byId[q.rewardItemId]?.name ?? q.rewardItemId}</span>}
          {q.category === "special" && q.status !== "upcoming" && <span className="chip">{timeLeft(q.expiresAt)}</span>}
        </div>
        {done ? (
          <span className="flex items-center gap-1 text-[13px] font-semibold text-teal">
            <Check size={15} /> Claimed
          </span>
        ) : q.status === "locked" ? (
          <button className="btn btn-ghost py-2 text-[13px]" onClick={() => act("join")} disabled={busy}>
            {busy ? <Spinner /> : <Lock size={14} />} Join · <ShardIcon size={12} />
            {q.entryCost}
          </button>
        ) : q.status === "complete" ? (
          <button className="btn btn-primary py-2 text-[13px]" onClick={() => act("claim")} disabled={busy}>
            {busy ? <Spinner /> : <Sparkles size={14} />} Claim
          </button>
        ) : q.status === "upcoming" ? (
          <span className="text-[12px] text-muted">Starts soon</span>
        ) : q.status === "expired" ? (
          <span className="text-[12px] text-muted">Ended</span>
        ) : (
          <span className="text-[12px] text-muted">In progress</span>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Guild: NPCs & missions
// ---------------------------------------------------------------------------

function Guild({ data, reload, reloadQuests }: { data: NpcView[] | null; reload: () => void; reloadQuests: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = data?.find((n) => n.id === openId) ?? null;
  if (!data) return <div className="grid grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-40" />)}</div>;
  return (
    <>
      <p className="mb-3 text-[13px] text-muted">Four guild members hand out missions and pay rewards from their own limited, on-chain allocations.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {data.map((n) => {
          const ready = n.missions.filter((m) => m.status === "ready").length;
          const active = n.missions.filter((m) => m.status === "accepted").length;
          return (
            <button key={n.id} onClick={() => setOpenId(n.id)} className="card relative overflow-hidden p-4 text-left">
              <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-25 blur-2xl" style={{ background: n.color }} />
              <div className="grid h-14 w-14 place-items-center rounded-2xl text-3xl" style={{ background: `${n.color}1f`, border: `1px solid ${n.color}44` }}>
                {n.avatar}
              </div>
              <p className="mt-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: n.color }}>
                {n.title}
              </p>
              <p className="font-display">{n.name}</p>
              <p className="mt-1 text-[12px] text-muted">
                {ready > 0 ? <span className="font-semibold text-gold">{ready} ready to turn in</span> : active > 0 ? `${active} in progress` : `${n.missions.length} missions`}
              </p>
            </button>
          );
        })}
      </div>
      <NpcSheet npc={open} onClose={() => setOpenId(null)} reload={() => { reload(); reloadQuests(); }} />
    </>
  );
}

function Typewriter({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = setInterval(() => setN((x) => (x >= text.length ? (clearInterval(id), x) : x + 2)), 18);
    return () => clearInterval(id);
  }, [text]);
  return (
    <span>
      {text.slice(0, n)}
      {n < text.length && <span className="opacity-50">▍</span>}
    </span>
  );
}

function NpcSheet({ npc, onClose, reload }: { npc: NpcView | null; onClose: () => void; reload: () => void }) {
  const [line, setLine] = useState<string>("");
  useEffect(() => {
    if (npc) setLine(npc.greeting);
  }, [npc]);
  const lines = useMemo(() => (npc ? [npc.greeting, ...npc.lines] : []), [npc]);
  return (
    <Sheet open={!!npc} onClose={onClose} wide title={npc && <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: npc.color }}>{npc.title}</span>}>
      {npc && (
        <div>
          <div className="flex items-start gap-4">
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl text-5xl" style={{ background: `${npc.color}1f`, border: `1px solid ${npc.color}55` }}>
              {npc.avatar}
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-2xl">{npc.name}</h2>
              <p className="text-[13px] text-muted">{npc.personality}</p>
            </div>
          </div>
          <button
            className="mt-4 w-full rounded-2xl border p-4 text-left text-[15px] leading-relaxed"
            style={{ borderColor: `${npc.color}40`, background: `${npc.color}0d` }}
            onClick={() => setLine(lines[(lines.indexOf(line) + 1) % lines.length])}
          >
            <span className="mr-1 font-semibold" style={{ color: npc.color }}>
              {npc.name.split(" ")[0]}:
            </span>
            “<Typewriter text={line} />”
            <span className="mt-2 block text-[11px] text-faint">Tap to talk</span>
          </button>

          <NpcTreasury npcId={npc.id} color={npc.color} />

          <h3 className="mt-5 font-display text-lg">Missions</h3>
          <div className="mt-2 space-y-2.5 pb-2">
            {npc.missions.map((m) => (
              <MissionCard key={m.id} m={m} color={npc.color} onDone={(text) => { setLine(text); reload(); }} />
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function MissionCard({ m, color, onDone }: { m: MissionView; color: string; onDone: (outro: string) => void }) {
  const { me, notify, refresh, openOnboarding } = useGame();
  const { byId } = useItems();
  const [busy, setBusy] = useState(false);
  const run = async (action: "accept" | "complete") => {
    if (!me) return openOnboarding();
    setBusy(true);
    try {
      const r = await api<{ outro?: string }>(`/api/missions/${m.id}/${action}`, { method: "POST" });
      if (action === "complete") {
        notify({ title: "Mission complete!", body: `${m.title}: +${m.rewardShards} Shards · +${m.rewardXp} XP${m.rewardItemId ? ` · ${byId[m.rewardItemId]?.name}` : ""}. Mint it from your Inventory.`, tone: "success" });
        onDone(r.outro ?? m.outro);
      } else {
        notify({ title: "Mission accepted", body: m.intro, tone: "success" });
        onDone(m.intro);
      }
      await refresh();
    } catch (e) {
      notify({ title: "Can't do that yet", body: e instanceof ApiError ? e.message : "Network error", tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const showProgress = m.status === "accepted" || m.status === "ready" || m.kind === "exchange";
  return (
    <div className={cx("rounded-2xl border border-line bg-surface-2 p-3.5", m.status === "locked" && "opacity-55")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{m.title}</p>
            {m.kind === "exchange" && <span className="chip">Exchange</span>}
            {m.repeatable && m.timesCompleted > 0 && <span className="chip">×{m.timesCompleted}</span>}
          </div>
          <p className="mt-0.5 text-[13px] text-muted">{m.description}</p>
        </div>
        {m.rewardItemId && <ItemImage id={m.rewardItemId} size={42} className="rounded-xl" />}
      </div>
      {showProgress && m.target > 0 && (
        <div className="mt-2.5 flex items-center gap-3">
          <Progress value={m.progress} max={m.target} color={color} />
          <span className="shrink-0 text-[12px] tabular text-muted">
            {metricLabel(m.metric, m.progress)}/{metricLabel(m.metric, m.target)}
            {m.kind === "exchange" && m.requireItemId ? ` ${byId[m.requireItemId]?.name ?? ""}` : ""}
          </span>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {m.rewardShards > 0 && (
            <span className="chip">
              <ShardIcon size={12} /> {m.rewardShards}
            </span>
          )}
          <span className="chip text-gold">+{m.rewardXp} XP</span>
          {m.unlockCost > 0 && (
            <span className="chip">
              <Coins size={11} /> Cost {m.unlockCost}
            </span>
          )}
        </div>
        {m.status === "locked" ? (
          <span className="flex items-center gap-1 text-[12px] text-muted">
            <Lock size={13} /> Level {m.minLevel}
          </span>
        ) : m.status === "completed" ? (
          <span className="flex items-center gap-1 text-[13px] font-semibold text-teal">
            <Check size={15} /> Done
          </span>
        ) : m.status === "ready" ? (
          <button className="btn btn-primary py-2 text-[13px]" disabled={busy} onClick={() => run("complete")}>
            {busy ? <Spinner /> : null} {m.kind === "exchange" ? "Trade" : "Turn in"}
          </button>
        ) : m.status === "accepted" ? (
          <span className="text-[12px] text-muted">In progress</span>
        ) : m.kind === "exchange" ? (
          <span className="text-[12px] text-muted">Need items</span>
        ) : (
          <button className="btn btn-ghost py-2 text-[13px]" disabled={busy} onClick={() => run("accept")}>
            {busy ? <Spinner /> : <Users size={14} />} Accept
          </button>
        )}
      </div>
      <AnimatePresence />
    </div>
  );
}

