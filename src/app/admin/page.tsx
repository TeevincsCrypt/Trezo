"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, LogOut, Plus, RefreshCw, Shield } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { publicConfig, txUrl } from "@/lib/config";
import { Logo, Segmented, Spinner, cx } from "@/components/ui";

type Row = Record<string, unknown>;
interface Overview {
  stats: Record<string, number>;
  treasures: Row[];
  quests: Row[];
  missions: Row[];
  npcs: Row[];
  items: Row[];
  players: Row[];
  claims: Row[];
  security: Row[];
  market: Row[];
  log: Row[];
}

type Tab = "overview" | "treasures" | "quests" | "missions" | "items" | "players" | "claims" | "security" | "market";

export default function AdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [state, setState] = useState<"loading" | "login" | "ok">("loading");
  const [tab, setTab] = useState<Tab>("overview");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Overview>("/api/admin/overview"));
      setState("ok");
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setState("login");
      else setMsg((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg(`✓ ${ok}`);
      await load();
    } catch (e) {
      setMsg(`✗ ${e instanceof ApiError ? e.message : (e as Error).message}`);
    }
  };

  if (state === "loading") return <div className="grid min-h-dvh place-items-center"><Spinner /></div>;
  if (state === "login") return <AdminLogin onDone={load} />;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/explore" className="text-muted hover:text-ink" aria-label="Back to game">
            <ArrowLeft size={18} />
          </Link>
          <Logo size={26} />
          <span className="chip border-gold/40 text-gold">
            <Shield size={12} /> Admin
          </span>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost py-2 text-[13px]" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn btn-ghost py-2 text-[13px]" onClick={() => act(() => api("/api/admin/logout", { method: "POST" }), "Signed out").then(() => setState("login"))}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </div>
      <div className="no-scrollbar mt-5 overflow-x-auto">
        <Segmented
          className="min-w-[720px]"
          value={tab}
          onChange={setTab}
          options={(["overview", "treasures", "quests", "missions", "items", "players", "claims", "security", "market"] as Tab[]).map((t) => ({ value: t, label: <span className="capitalize">{t}</span> }))}
        />
      </div>
      {msg && <p className={cx("mt-3 rounded-xl px-3 py-2 text-sm", msg.startsWith("✓") ? "bg-teal/10 text-teal" : "bg-danger/10 text-danger")}>{msg}</p>}
      {data && (
        <div className="mt-5">
          {tab === "overview" && <OverviewTab d={data} />}
          {tab === "treasures" && <TreasuresTab d={data} act={act} />}
          {tab === "quests" && <QuestsTab d={data} act={act} />}
          {tab === "missions" && <MissionsTab d={data} act={act} />}
          {tab === "items" && <ItemsTab d={data} act={act} />}
          {tab === "players" && <Table rows={data.players} cols={["username", "account_id", "is_guest", "is_sample", "xp", "shards", "treasures_found", "flags", "created_at"]} />}
          {tab === "claims" && <Table rows={data.claims} cols={["created_at", "username", "treasure", "rarity", "distance_m", "accuracy_m", "demo", "onchain_status", "tx_hash"]} />}
          {tab === "security" && <Table rows={data.security} cols={["created_at", "username", "kind", "detail"]} />}
          {tab === "market" && (
            <>
              <p className="mb-3 text-[13px] text-muted">Marketplace transactions reported by clients (tx hashes link to the explorer; balances themselves are read from the contract).</p>
              <Table rows={data.market} cols={["created_at", "username", "kind", "tx_hash", "detail"]} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AdminLogin({ onDone }: { onDone: () => void }) {
  const [token, setToken] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/admin/login", { body: { token } });
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="card-raised w-full max-w-sm p-6">
        <Logo />
        <h1 className="font-display mt-5 text-xl font-bold">Admin access</h1>
        <p className="mt-1 text-[13px] text-muted">Enter the server&apos;s admin token, or sign in to the game with a NEAR account listed in TREZO_ADMIN_ACCOUNTS.</p>
        <input className="input mt-4" type="password" placeholder="Admin token" value={token} onChange={(e) => setToken(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        {err && <p className="mt-2 text-sm text-danger">{err}</p>}
        <button className="btn btn-primary mt-4 w-full" onClick={submit} disabled={busy || !token}>
          {busy ? <Spinner /> : "Sign in"}
        </button>
      </div>
    </div>
  );
}

function OverviewTab({ d }: { d: Overview }) {
  const s = d.stats;
  const cards: [string, number][] = [
    ["Real players", s.players],
    ["Wallet-linked", s.wallets],
    ["Claims (all)", s.claims],
    ["Claims (24h)", s.claims24h],
    ["Active treasures", s.activeTreasures],
    ["Shards circulating", s.shardsCirculating],
    ["Shards minted", s.shardsMinted],
    ["Shards burned (sinks)", s.shardsBurned],
    ["Rewards settled on-chain", s.rewardsSettled],
    ["Security events", s.securityEvents],
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cards.map(([l, v]) => (
          <div key={l} className="card p-4">
            <p className="font-display text-2xl font-bold tabular">{(v ?? 0).toLocaleString()}</p>
            <p className="text-[12px] text-muted">{l}</p>
          </div>
        ))}
      </div>
      <div className="card mt-4 p-4 text-[13px] text-muted">
        Network <b className="text-ink">{publicConfig.network}</b> · Contract <b className="text-ink">{publicConfig.contractId || "not configured"}</b>. Item supply, NPC allocations and treasure claim caps
        are enforced on-chain too: editing them here changes game-side issuance, while on-chain caps can only be changed by the contract owner (and supply caps can only be lowered).
      </div>
      <h3 className="mt-6 font-display text-lg font-semibold">Admin log</h3>
      <Table rows={d.log} cols={["created_at", "actor", "action", "detail"]} />
    </>
  );
}

// ------------------------------- Treasures -------------------------------

const emptyTreasure = {
  id: "",
  name: "",
  description: "",
  lat: publicConfig.demoCenter.lat,
  lng: publicConfig.demoCenter.lng,
  rarity: "rare",
  reward_shards: "",
  reward_xp: "",
  reward_item_id: "",
  reward_item_qty: 1,
  max_claims: "",
  claim_radius_m: 40,
  zone: "world",
  active: true,
};

function TreasuresTab({ d, act }: { d: Overview; act: (fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const [form, setForm] = useState<Record<string, unknown>>(emptyTreasure);
  const [editing, setEditing] = useState<string | null>(null);
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const num = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : Number(v));
  const submit = () =>
    act(async () => {
      const body = {
        name: form.name,
        description: form.description,
        lat: Number(form.lat),
        lng: Number(form.lng),
        rarity: form.rarity,
        reward_shards: num(form.reward_shards),
        reward_xp: num(form.reward_xp),
        reward_item_id: form.reward_item_id || null,
        reward_item_qty: Number(form.reward_item_qty) || 1,
        max_claims: num(form.max_claims),
        claim_radius_m: Number(form.claim_radius_m) || 40,
        zone: form.zone,
        active: !!form.active,
      };
      if (editing) await api(`/api/admin/treasures/${editing}`, { method: "PUT", body });
      else await api("/api/admin/treasures", { body: { ...body, id: (form.id as string) || undefined } });
      setForm(emptyTreasure);
      setEditing(null);
    }, editing ? "Treasure updated" : "Treasure created");
  const useMyLocation = () => navigator.geolocation?.getCurrentPosition((p) => setForm((f) => ({ ...f, lat: p.coords.latitude, lng: p.coords.longitude })));

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <div className="card h-fit space-y-2.5 p-4">
        <h3 className="flex items-center gap-2 font-display font-semibold">
          <Plus size={16} /> {editing ? `Edit ${editing}` : "Create treasure"}
        </h3>
        <F label="Name"><input className="input" value={String(form.name)} onChange={(e) => set("name", e.target.value)} /></F>
        <F label="Description"><input className="input" value={String(form.description)} onChange={(e) => set("description", e.target.value)} /></F>
        <div className="grid grid-cols-2 gap-2">
          <F label="Latitude"><input className="input" value={String(form.lat)} onChange={(e) => set("lat", e.target.value)} /></F>
          <F label="Longitude"><input className="input" value={String(form.lng)} onChange={(e) => set("lng", e.target.value)} /></F>
        </div>
        <button className="text-[12px] text-teal" onClick={useMyLocation}>Use my current location</button>
        <div className="grid grid-cols-2 gap-2">
          <F label="Rarity">
            <select className="input" value={String(form.rarity)} onChange={(e) => set("rarity", e.target.value)}>
              {["common", "rare", "epic", "legendary"].map((r) => <option key={r}>{r}</option>)}
            </select>
          </F>
          <F label="Zone">
            <select className="input" value={String(form.zone)} onChange={(e) => set("zone", e.target.value)}>
              <option value="world">world (real GPS)</option>
              <option value="demo">demo</option>
            </select>
          </F>
          <F label="Shards (blank = default)"><input className="input" value={String(form.reward_shards)} onChange={(e) => set("reward_shards", e.target.value)} /></F>
          <F label="XP (blank = default)"><input className="input" value={String(form.reward_xp)} onChange={(e) => set("reward_xp", e.target.value)} /></F>
          <F label="Max claims (supply)"><input className="input" value={String(form.max_claims)} onChange={(e) => set("max_claims", e.target.value)} /></F>
          <F label="Claim radius (m)"><input className="input" value={String(form.claim_radius_m)} onChange={(e) => set("claim_radius_m", e.target.value)} /></F>
        </div>
        <F label="Reward item">
          <select className="input" value={String(form.reward_item_id)} onChange={(e) => set("reward_item_id", e.target.value)}>
            <option value="">none</option>
            {d.items.map((i) => <option key={String(i.id)} value={String(i.id)}>{String(i.name)}</option>)}
          </select>
        </F>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.active} onChange={(e) => set("active", e.target.checked)} /> Active</label>
        <div className="flex gap-2">
          <button className="btn btn-primary flex-1" onClick={submit} disabled={!form.name}>{editing ? "Save" : "Create"}</button>
          {editing && <button className="btn btn-ghost" onClick={() => { setEditing(null); setForm(emptyTreasure); }}>Cancel</button>}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[12px] text-muted">Seeded, demo and admin treasures plus any spawned treasure that has been claimed. Disable suspicious treasures instantly.</p>
        <Table
          rows={d.treasures}
          cols={["id", "name", "rarity", "zone", "claim_count", "max_claims", "claim_radius_m", "lat", "lng", "active"]}
          actions={(r) => (
            <div className="flex gap-1.5">
              <button className="chip" onClick={() => { setEditing(String(r.id)); setForm({ ...emptyTreasure, ...r, reward_item_id: r.reward_item_id ?? "", active: !!r.active }); }}>Edit</button>
              <button className={cx("chip", r.active ? "text-danger" : "text-teal")} onClick={() => act(() => api(`/api/admin/treasures/${r.id}`, { method: "PATCH", body: { active: !r.active } }), r.active ? "Disabled" : "Enabled")}>
                {r.active ? "Disable" : "Enable"}
              </button>
            </div>
          )}
        />
      </div>
    </div>
  );
}

// --------------------------------- Quests ---------------------------------

const QUEST_FIELDS = ["id", "category", "title", "description", "difficulty", "metric", "target", "reward_shards", "reward_xp", "reward_item_id", "reward_item_qty", "entry_cost", "starts_at", "ends_at", "active"];
const MISSION_FIELDS = ["id", "npc_id", "title", "description", "intro", "outro", "kind", "metric", "target", "require_item_id", "require_item_qty", "unlock_cost", "reward_shards", "reward_xp", "reward_item_id", "reward_item_qty", "repeatable", "min_level", "active"];
const NUMERIC = new Set(["target", "reward_shards", "reward_xp", "reward_item_qty", "entry_cost", "starts_at", "ends_at", "require_item_qty", "unlock_cost", "min_level"]);
const BOOL = new Set(["active", "repeatable"]);

function toBody(form: Record<string, string>, fields: string[]) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = form[f] ?? "";
    if (BOOL.has(f)) out[f] = v === "true" || v === "1";
    else if (NUMERIC.has(f)) out[f] = v === "" ? null : Number(v);
    else out[f] = v === "" ? null : v;
  }
  return out;
}

function JsonishForm({ title, fields, initial, onSubmit, hint }: { title: string; fields: string[]; initial: Record<string, string>; onSubmit: (f: Record<string, string>) => void; hint: string }) {
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [initial]);
  return (
    <div className="card h-fit space-y-2 p-4">
      <h3 className="font-display font-semibold">{title}</h3>
      <p className="text-[11px] text-muted">{hint}</p>
      <div className="grid grid-cols-2 gap-2">
        {fields.map((f) => (
          <F key={f} label={f}>
            <input className="input py-1.5 text-[13px]" value={form[f] ?? ""} onChange={(e) => setForm((x) => ({ ...x, [f]: e.target.value }))} />
          </F>
        ))}
      </div>
      <button className="btn btn-primary w-full" onClick={() => onSubmit(form)}>Save</button>
    </div>
  );
}

const asForm = (r: Row, fields: string[]) => Object.fromEntries(fields.map((f) => [f, r[f] === null || r[f] === undefined ? "" : String(r[f])]));

function QuestsTab({ d, act }: { d: Overview; act: (fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const [initial, setInitial] = useState<Record<string, string>>({ category: "daily", difficulty: "easy", metric: "treasure", target: "1", reward_shards: "20", reward_xp: "30", reward_item_qty: "1", entry_cost: "0", active: "true" });
  return (
    <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
      <JsonishForm
        title="Create / edit quest"
        fields={QUEST_FIELDS}
        initial={initial}
        hint="metric: treasure, treasure_common, treasure_rare_plus, treasure_epic_plus, treasure_legendary, distance (m), new_cell, mission, streak, level, community_treasure. starts_at/ends_at in epoch ms."
        onSubmit={(f) => act(() => api("/api/admin/quests", { body: toBody(f, QUEST_FIELDS) }), "Quest saved")}
      />
      <Table rows={d.quests} cols={["id", "category", "title", "metric", "target", "reward_shards", "entry_cost", "active"]} actions={(r) => <button className="chip" onClick={() => setInitial(asForm(r, QUEST_FIELDS))}>Edit</button>} />
    </div>
  );
}

function MissionsTab({ d, act }: { d: Overview; act: (fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const [initial, setInitial] = useState<Record<string, string>>({ npc_id: "explorer", kind: "progress", metric: "treasure", target: "1", unlock_cost: "0", reward_shards: "50", reward_xp: "80", reward_item_qty: "1", repeatable: "false", min_level: "1", active: "true" });
  return (
    <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
      <JsonishForm
        title="Create / edit NPC mission"
        fields={MISSION_FIELDS}
        initial={initial}
        hint={`NPCs: ${d.npcs.map((n) => n.id).join(", ")}. kind: progress (metric+target) or exchange (require_item_id+qty). On-chain rewards draw from the NPC's allocation.`}
        onSubmit={(f) => act(() => api("/api/admin/missions", { body: toBody(f, MISSION_FIELDS) }), "Mission saved")}
      />
      <Table rows={d.missions} cols={["id", "npc_id", "title", "kind", "metric", "target", "unlock_cost", "reward_item_id", "active"]} actions={(r) => <button className="chip" onClick={() => setInitial(asForm(r, MISSION_FIELDS))}>Edit</button>} />
    </div>
  );
}

function ItemsTab({ d, act }: { d: Overview; act: (fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  return (
    <>
      <p className="mb-3 text-[13px] text-muted">Game-side issuance caps. The contract enforces its own NEP-245 supply caps independently.</p>
      <Table
        rows={d.items}
        cols={["id", "name", "rarity", "category", "transferable", "issued", "max_supply", "active"]}
        actions={(r) => (
          <div className="flex gap-1.5">
            <button
              className="chip"
              onClick={() => {
                const v = prompt(`New max supply for ${r.name} (issued: ${r.issued})`, String(r.max_supply));
                if (v) act(() => api(`/api/admin/items/${r.id}`, { method: "PATCH", body: { max_supply: Number(v) } }), "Supply updated");
              }}
            >
              Supply
            </button>
            <button className="chip" onClick={() => act(() => api(`/api/admin/items/${r.id}`, { method: "PATCH", body: { active: !r.active } }), r.active ? "Item paused" : "Item active")}>
              {r.active ? "Pause" : "Resume"}
            </button>
          </div>
        )}
      />
    </>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      {children}
    </label>
  );
}

function fmt(col: string, v: unknown) {
  if (v === null || v === undefined || v === "") return <span className="text-faint">—</span>;
  if ((col.endsWith("_at") || col === "created_at") && typeof v === "number") return new Date(v).toLocaleString();
  if (col === "tx_hash" && typeof v === "string") return <a className="text-teal underline" href={txUrl(v)} target="_blank" rel="noreferrer">{v.slice(0, 10)}…</a>;
  if (typeof v === "number" && !Number.isInteger(v)) return v.toFixed(col === "lat" || col === "lng" ? 5 : 1);
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

function Table({ rows, cols, actions }: { rows: Row[]; cols: string[]; actions?: (r: Row) => React.ReactNode }) {
  if (rows.length === 0) return <p className="card p-6 text-center text-sm text-muted">No records yet.</p>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-left text-[12.5px]">
        <thead className="border-b border-line text-[11px] uppercase tracking-wider text-muted">
          <tr>
            {cols.map((c) => <th key={c} className="whitespace-nowrap px-3 py-2.5 font-semibold">{c.replace(/_/g, " ")}</th>)}
            {actions && <th className="px-3 py-2.5" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={String(r.id ?? r.tx_hash ?? i)} className="border-b border-line/60 last:border-0">
              {cols.map((c) => <td key={c} className="whitespace-nowrap px-3 py-2">{fmt(c, r[c])}</td>)}
              {actions && <td className="px-3 py-2">{actions(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
