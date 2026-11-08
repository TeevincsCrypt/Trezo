"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Crosshair, List, LocateFixed, Map as MapIcon, MapPin, Navigation, Search, ScrollText, Sparkles, TriangleAlert, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { bearingDeg, distanceM, formatDistance, type LatLng } from "@/lib/geo";
import { publicConfig } from "@/lib/config";
import { RARITY } from "@/lib/rules";
import type { NearbyTreasure } from "@/server/game";
import { GameMap } from "@/components/explore/GameMap";
import { RevealModal, type RevealData } from "@/components/explore/RevealModal";
import { useGame, type Me } from "@/components/providers/GameProvider";
import { useLocation } from "@/components/providers/LocationProvider";
import { useItems } from "@/components/hooks";
import { ItemImage, RarityBadge, Sheet, ShardIcon, Spinner, cx, timeLeft } from "@/components/ui";
import { HUNT_EVENT } from "@/components/shell/AppShell";
import { chestSvg } from "@/lib/art";

export default function ExplorePage() {
  const { me, notify, setMe, openOnboarding } = useGame();
  const loc = useLocation();
  const { byId: items } = useItems();
  const [treasures, setTreasures] = useState<NearbyTreasure[]>([]);
  const [loadingT, setLoadingT] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"map" | "list">("map");
  const [recenterKey, setRecenterKey] = useState(0);
  const [browseCenter, setBrowseCenter] = useState<LatLng | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [reveal, setReveal] = useState<RevealData | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const lastFetch = useRef<{ at: LatLng; t: number; mode: string } | null>(null);
  const detected = useRef<Set<string>>(new Set());

  const demo = loc.mode === "demo";
  const fetchCenter = browseCenter ?? loc.position;
  const mapCenter = browseCenter ?? loc.position ?? publicConfig.demoCenter;

  const load = useCallback(
    async (force = false) => {
      if (!fetchCenter) return;
      const prev = lastFetch.current;
      if (!force && prev && prev.mode === loc.mode && distanceM(prev.at, fetchCenter) < 120 && Date.now() - prev.t < 30_000) return;
      lastFetch.current = { at: fetchCenter, t: Date.now(), mode: loc.mode };
      setLoadingT(true);
      try {
        const r = await api<{ treasures: NearbyTreasure[] }>(`/api/treasures?lat=${fetchCenter.lat}&lng=${fetchCenter.lng}&mode=${demo ? "demo" : "world"}`);
        setTreasures(r.treasures);
      } catch {
        /* keep previous */
      } finally {
        setLoadingT(false);
      }
    },
    [fetchCenter, loc.mode, demo],
  );

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    lastFetch.current = null;
    setSelectedId(null);
    setBrowseCenter(null);
    setRecenterKey((k) => k + 1);
  }, [loc.mode]);
  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  // Live distances from the *player's* position
  const withDist = useMemo(
    () =>
      treasures
        .map((t) => ({ ...t, distanceM: loc.position ? distanceM(loc.position, t) : t.distanceM }))
        .sort((a, b) => a.distanceM - b.distanceM),
    [treasures, loc.position],
  );
  const available = withDist.filter((t) => !t.claimedByMe && t.remaining > 0);
  const selected = withDist.find((t) => t.id === selectedId) ?? null;
  const nearest = available[0] ?? null;

  // Floating discovery notifications
  useEffect(() => {
    for (const t of available) {
      if (t.distanceM <= 150 && !detected.current.has(t.id)) {
        detected.current.add(t.id);
        if (t.rarity !== "common" || t.distanceM <= t.claimRadiusM) {
          notify({ title: `${RARITY[t.rarity].label.toUpperCase()} TREASURE DETECTED`, body: `${t.name} is ${formatDistance(t.distanceM)} away.`, tone: t.rarity === "common" ? "default" : t.rarity });
        }
      }
    }
  }, [available, notify]);

  const claim = async (t: NearbyTreasure) => {
    if (!me) return openOnboarding();
    if (!loc.position) return;
    setClaiming(true);
    try {
      const r = await api<Omit<RevealData, "itemNames"> & { player: Me }>(`/api/treasures/${t.id}/claim`, {
        body: { pos: loc.position, accuracy: loc.accuracy, demo },
      });
      setMe({ ...r.player, rank: me.rank });
      setSelectedId(null);
      setReveal({ ...r, itemNames: Object.fromEntries(Object.entries(items).map(([k, v]) => [k, v.name])) });
      setTreasures((list) => list.map((x) => (x.id === t.id ? { ...x, claimedByMe: true, claimCount: x.claimCount + 1, remaining: x.remaining - 1 } : x)));
    } catch (e) {
      notify({ title: "Couldn't open treasure", body: e instanceof ApiError ? e.message : "Network error", tone: "error" });
    } finally {
      setClaiming(false);
    }
  };

  const onMapClick = useCallback((p: LatLng) => (demo ? loc.setDemoPosition(p) : undefined), [demo, loc]);
  const recenter = () => {
    setBrowseCenter(null);
    setRecenterKey((k) => k + 1);
  };

  // Hunt button in the dock: focus the nearest unopened treasure.
  useEffect(() => {
    const h = () => {
      if (nearest) setSelectedId(nearest.id);
      else notify({ title: "Nothing to hunt here yet", body: loc.position ? "All nearby treasures are opened. Explore further!" : "Turn on your location or try the demo zone." });
    };
    window.addEventListener(HUNT_EVENT, h);
    return () => window.removeEventListener(HUNT_EVENT, h);
  }, [nearest, notify, loc.position]);

  return (
    <div className="fixed inset-0 overflow-hidden">
      {view === "map" && (
        <GameMap
          center={mapCenter}
          player={loc.position}
          demo={demo}
          accuracy={loc.accuracy}
          treasures={withDist}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMapClick={onMapClick}
          recenterKey={recenterKey}
        />
      )}
      {view === "list" && <div className="absolute inset-0 bg-bg" />}

      {/* Mode banner */}
      <div className="absolute inset-x-0 top-[calc(var(--safe-top)+76px)] z-30 flex justify-center px-4">
        <ModeBanner browse={!!browseCenter} onExitBrowse={recenter} />
      </div>

      {/* Right controls */}
      <div className="absolute right-4 top-[calc(var(--safe-top)+128px)] z-30 flex flex-col gap-2.5">
        <CtrlButton label={view === "map" ? "List view" : "Map view"} onClick={() => setView(view === "map" ? "list" : "map")}>
          {view === "map" ? <List size={19} /> : <MapIcon size={19} />}
        </CtrlButton>
        <CtrlButton label="Recenter" onClick={recenter}>
          <LocateFixed size={19} />
        </CtrlButton>
        <CtrlButton label="Search places" onClick={() => setSearchOpen(true)}>
          <Search size={19} />
        </CtrlButton>
      </div>

      {view === "list" && (
        <div className="absolute inset-0 z-20 overflow-y-auto px-4 pb-44 pt-[calc(var(--safe-top)+128px)]">
          <div className="mx-auto max-w-lg pr-14 sm:pr-0">
            <p className="font-display mb-4 text-[1.5rem]">Nearby</p>
            <div className="card divide-y divide-line overflow-hidden px-1">
              {loadingT && withDist.length === 0 && Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton m-3 h-12" />)}
              {!loadingT && withDist.length === 0 && <p className="py-10 text-center text-muted">No treasures nearby yet.</p>}
              {withDist.map((t) => (
                <TreasureRow key={t.id} t={t} onClick={() => setSelectedId(t.id)} itemName={t.rewardItemId ? items[t.rewardItemId]?.name : undefined} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Location gate */}
      {!loc.position && <LocationGate />}

      {/* Bottom: nearby panel */}
      {loc.position && !selected && view === "map" && (
        <div className="absolute inset-x-0 bottom-[calc(var(--safe-bottom)+92px)] z-30 px-4">
          <div className="hud-glass mx-auto max-w-[460px] rounded-[30px] p-2">
            <div className="flex items-center justify-between px-3 pb-1.5 pt-2">
              <p className="text-[15px] font-semibold">
                Nearby <span className="font-normal text-muted">· {available.length} to open</span>
              </p>
              <Link href="/quests" className="flex items-center gap-1.5 text-[12.5px] font-semibold text-muted hover:text-ink">
                <span className="h-1.5 w-1.5 rounded-full bg-gold" /> Quests
              </Link>
            </div>
            {nearest ? (
              <div className="space-y-1">
                {available.slice(0, 2).map((t, i) => (
                  <button key={t.id} onClick={() => setSelectedId(t.id)} className={cx("flex w-full items-center gap-3 rounded-[22px] p-2.5 text-left transition-colors hover:bg-white", i === 0 && "bg-white shadow-[0_8px_20px_-16px_rgba(0,0,0,0.4)]")}>
                    <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white shadow-[0_6px_14px_-8px_rgba(0,0,0,0.35)]" style={{ boxShadow: `inset 0 0 0 2px ${RARITY[t.rarity].color}` }}>
                      {i === 0 ? (
                        <Navigation size={19} style={{ color: RARITY[t.rarity].color, transform: `rotate(${bearingDeg(loc.position!, t)}deg)` }} />
                      ) : (
                        <span className="h-6 w-6" dangerouslySetInnerHTML={{ __html: chestSvg(t.rarity).replace('width="48" height="48"', 'width="24" height="24"') }} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold">{t.name}</span>
                      <span className="text-[12px] font-semibold" style={{ color: RARITY[t.rarity].color }}>
                        {RARITY[t.rarity].label}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="font-display block text-[15px] tabular">{formatDistance(t.distanceM)}</span>
                      <span className={cx("text-[11.5px]", t.distanceM <= t.claimRadiusM ? "font-semibold text-teal" : "text-muted")}>{t.distanceM <= t.claimRadiusM ? "In range" : `+${t.rewardShards} Shards`}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-3 pb-3 pt-1 text-sm text-muted">{loadingT ? "Scanning for treasures…" : "All nearby treasures opened. Explore further or come back tomorrow."}</p>
            )}
          </div>
        </div>
      )}

      <TreasureSheet treasure={selected} onClose={() => setSelectedId(null)} onClaim={claim} claiming={claiming} itemName={selected?.rewardItemId ? items[selected.rewardItemId]?.name : undefined} />
      <RevealModal data={reveal} onClose={() => setReveal(null)} />
      <SearchSheet
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPick={(p) => {
          setBrowseCenter(p);
          setRecenterKey((k) => k + 1);
          setSearchOpen(false);
        }}
      />
    </div>
  );
}

function CtrlButton({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="orb h-12 w-12">
      {children}
    </button>
  );
}

function ModeBanner({ browse, onExitBrowse }: { browse: boolean; onExitBrowse: () => void }) {
  const loc = useLocation();
  if (browse)
    return (
      <button onClick={onExitBrowse} className="hud-glass flex items-center gap-2 rounded-full px-4 py-2 text-[12px]">
        <Search size={13} className="text-gold" /> Browsing another area — treasures can only be opened in person
        <X size={13} />
      </button>
    );
  if (loc.mode === "demo")
    return (
      <div className="hud-glass flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 text-[12px]">
        <span className="rounded-full bg-gold px-2.5 py-1 text-[10px] font-bold tracking-wider text-white">DEMO</span>
        <span className="whitespace-nowrap text-muted">Simulated · tap map to move</span>
        <button className="whitespace-nowrap font-semibold text-ink underline decoration-ink/20 underline-offset-2" onClick={loc.startGps}>
          Use GPS
        </button>
      </div>
    );
  if (!loc.position) return null;
  return (
    <div className="hud-glass flex items-center gap-2 rounded-full px-4 py-2 text-[12px]">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
      </span>
      <span className="text-muted">Live GPS{loc.accuracy ? ` ±${Math.round(loc.accuracy)} m` : ""}</span>
      <button className="font-semibold text-gold" onClick={() => loc.enterDemo()}>
        Demo zone
      </button>
    </div>
  );
}

function LocationGate() {
  const loc = useLocation();
  const denied = loc.gpsState === "denied";
  const failed = loc.gpsState === "unavailable" || loc.gpsState === "error";
  const waiting = loc.gpsState === "prompt";
  return (
    <div className="absolute inset-x-0 bottom-[calc(var(--safe-bottom)+92px)] z-30 px-4">
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="card-raised relative mx-auto max-w-[460px] overflow-hidden p-6">
        <div className="ember-glow pointer-events-none absolute -right-16 -top-20 h-56 w-56" />
        <div className="relative flex items-start gap-3.5">
          <div className={cx("orb h-12 w-12 shrink-0", denied || failed ? "text-danger" : "text-gold")}>
            {denied || failed ? <TriangleAlert size={21} /> : <MapPin size={21} />}
          </div>
          <div>
            <p className="font-display text-[1.15rem] leading-snug">{denied ? "Location access is off" : failed ? "Can't find your location" : "Find treasures around you"}</p>
            <p className="mt-1 text-[13.5px] text-muted">
              {denied
                ? "Enable location for this site in your browser settings to hunt near you, or explore the demo zone."
                : failed
                  ? "Your device couldn't get a GPS fix. Move outdoors and retry, or try the demo zone."
                  : "TREZO uses your location only while the app is open, to show and verify nearby treasures. It is never shared with other players."}
            </p>
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-2">
          <button className="btn btn-primary" onClick={loc.startGps} disabled={waiting}>
            {waiting ? <Spinner /> : <Crosshair size={17} />} {waiting ? "Locating…" : denied || failed ? "Retry GPS" : "Use my location"}
          </button>
          <button className="btn btn-ghost" onClick={() => loc.enterDemo()}>
            <Sparkles size={16} className="text-gold" /> Demo zone
          </button>
        </div>
        <p className="relative mt-3 text-[11px] text-faint">Demo zone: {publicConfig.demoCenter.name} with a simulated, clearly labelled position.</p>
      </motion.div>
    </div>
  );
}

function TreasureRow({ t, onClick, itemName }: { t: NearbyTreasure; onClick: () => void; itemName?: string }) {
  const c = RARITY[t.rarity].color;
  const done = t.claimedByMe || t.remaining === 0;
  return (
    <button onClick={onClick} className={cx("flex w-full items-center gap-3 px-3 py-3.5 text-left transition-colors hover:bg-white", done && "opacity-45")}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white" style={{ boxShadow: `inset 0 0 0 2px ${c}` }}>
        <span className="h-6 w-6" dangerouslySetInnerHTML={{ __html: chestSvg(t.rarity, t.claimedByMe).replace('width="48" height="48"', 'width="24" height="24"') }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold">{t.name}</span>
        <span className="text-[12px] font-semibold" style={{ color: c }}>
          {RARITY[t.rarity].label}
          {t.claimedByMe && <span className="ml-1.5 font-normal text-muted">· opened</span>}
        </span>
      </span>
      <span className="text-right">
        <span className="font-display block text-[15px] tabular">{formatDistance(t.distanceM)}</span>
        <span className="text-[11.5px] text-muted">
          +{t.rewardShards} Shards{itemName ? " · item" : ""}
        </span>
      </span>
    </button>
  );
}

function TreasureSheet({ treasure: t, onClose, onClaim, claiming, itemName }: { treasure: NearbyTreasure | null; onClose: () => void; onClaim: (t: NearbyTreasure) => void; claiming: boolean; itemName?: string }) {
  const { me } = useGame();
  const loc = useLocation();
  const t0 = useRef(t);
  if (t) t0.current = t;
  const tr = t ?? t0.current;
  if (!tr) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const c = RARITY[tr.rarity].color;
  const inRange = tr.distanceM <= tr.claimRadiusM;
  const pct = Math.max(0.04, Math.min(1, tr.claimRadiusM / Math.max(1, tr.distanceM)));
  const unavailable = tr.claimedByMe || tr.remaining === 0;
  const wrongMode = (loc.mode === "demo") !== (tr.zone === "demo");

  return (
    <Sheet open={!!t} onClose={onClose} title={<RarityBadge rarity={tr.rarity} size="lg" />}>
      <h2 className="font-display text-[1.6rem] leading-tight">{tr.name}</h2>
      <p className="mt-1.5 text-sm text-muted">{tr.description}</p>

      <div className="card-ink relative mt-5 overflow-hidden p-5">
        <div className="dot-grid-light pointer-events-none absolute inset-0 opacity-30" />
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full blur-2xl" style={{ background: `${c}55` }} />
        <p className="relative text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: c }}>
          {unavailable ? (tr.claimedByMe ? "Already opened" : "Fully claimed") : inRange ? `${RARITY[tr.rarity].label} treasure in range` : `${RARITY[tr.rarity].label} treasure detected`}
        </p>
        <p className="font-display relative mt-2 text-[2.6rem] leading-none tabular">{formatDistance(tr.distanceM)}</p>
        <p className="relative mt-2 text-[13px] text-white/60">{inRange ? "You're close enough. Open it!" : `Get within ${tr.claimRadiusM} m to unlock your reward.`}</p>
        <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-white/12">
          <motion.div className="h-full rounded-full" style={{ background: c }} animate={{ width: `${(inRange ? 1 : pct) * 100}%` }} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Shards" value={<span className="inline-flex items-center gap-1"><ShardIcon />{tr.rewardShards}</span>} />
        <Stat label="XP" value={`+${tr.rewardXp}`} />
        <Stat label="Left" value={`${tr.remaining}/${tr.maxClaims}`} />
      </div>
      {tr.rewardItemId && (
        <div className="mt-2 flex items-center gap-3 rounded-[22px] bg-white p-2.5 pr-4">
          <ItemImage id={tr.rewardItemId} size={44} className="rounded-2xl" />
          <p className="text-sm">
            Contains <span className="font-semibold">{itemName ?? "a collectible"}</span>
          </p>
        </div>
      )}
      {tr.expiresAt && <p className="mt-3 text-center text-[12px] text-muted">Disappears in {timeLeft(tr.expiresAt).replace(" left", "")}</p>}

      <div className="mt-4 pb-1">
        {wrongMode ? (
          <p className="rounded-xl bg-surface-2 p-3 text-center text-sm text-muted">{tr.zone === "demo" ? "Switch to the demo zone to open demo treasures." : "Use real GPS to open this treasure."}</p>
        ) : (
          <button className={cx("btn w-full py-4 text-[15px]", inRange && !unavailable ? "btn-accent" : "btn-primary")} disabled={!inRange || unavailable || claiming} onClick={() => onClaim(tr)}>
            {claiming ? <Spinner /> : null}
            {!me ? "Create a profile to open" : unavailable ? (tr.claimedByMe ? "Opened" : "No rewards left") : inRange ? "Open treasure" : "Get closer to open"}
          </button>
        )}
        {loc.mode === "demo" && !inRange && !unavailable && !wrongMode && (
          <button className="mt-2.5 w-full text-center text-[13px] font-semibold text-gold-deep" onClick={() => loc.setDemoPosition({ lat: tr.lat + 0.00008, lng: tr.lng })}>
            Demo: walk to this treasure
          </button>
        )}
      </div>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[22px] bg-white px-2 py-3 shadow-[0_6px_16px_-14px_rgba(0,0,0,0.5)]">
      <div className="font-display text-[15px] tabular">{value}</div>
      <div className="mt-0.5 text-[11px] text-muted">{label}</div>
    </div>
  );
}

function SearchSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (p: LatLng) => void }) {
  const loc = useLocation();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ name: string; lat: number; lng: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const search = async () => {
    if (q.trim().length < 2) return;
    setBusy(true);
    setErr(null);
    try {
      // OpenStreetMap Nominatim geocoder (usage policy: low volume, attribution).
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(q)}`, { headers: { Accept: "application/json" } });
      const j = (await r.json()) as { display_name: string; lat: string; lon: string }[];
      setResults(j.map((x) => ({ name: x.display_name, lat: Number(x.lat), lng: Number(x.lon) })));
      if (j.length === 0) setErr("No places found.");
    } catch {
      setErr("Search is unavailable right now.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={<p className="font-display text-lg">Look around</p>}>
      <div className="flex gap-2">
        <input className="input" placeholder="Search a city or place" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
        <button className="btn btn-ghost" onClick={search} disabled={busy} aria-label="Search">
          {busy ? <Spinner /> : <Search size={17} />}
        </button>
      </div>
      <div className="mt-3 space-y-1.5">
        <button className="flex w-full items-center gap-3 rounded-[20px] bg-white p-3.5 text-left text-sm" onClick={() => { loc.enterDemo(); onClose(); }}>
          <Sparkles size={17} className="text-gold" /> Jump to the demo zone ({publicConfig.demoCenter.name})
        </button>
        {results.map((r) => (
          <button key={`${r.lat},${r.lng}`} className="w-full rounded-[20px] bg-white p-3.5 text-left text-sm" onClick={() => onPick({ lat: r.lat, lng: r.lng })}>
            {r.name}
          </button>
        ))}
        {err && <p className="py-2 text-center text-sm text-muted">{err}</p>}
      </div>
      <p className="mt-3 pb-2 text-[11px] text-faint">Browsing shows treasures elsewhere. You can only open treasures where you physically are. Search by OpenStreetMap Nominatim.</p>
      <AnimatePresence />
    </Sheet>
  );
}
