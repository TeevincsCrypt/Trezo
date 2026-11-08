import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Compass, Footprints, Gem, Landmark, Plus, ScrollText, ShieldCheck, Store, Trophy } from "lucide-react";
import { db } from "@/server/db";
import { publicConfig, accountUrl } from "@/lib/config";
import catalog from "@/data/catalog.json";
import { Logo, LogoMark, ShardIcon, Spark } from "@/components/ui";

export const dynamic = "force-dynamic";

function stats() {
  const one = (sql: string, ...a: unknown[]) => (db().prepare(sql).get(...a) as { n: number }).n;
  return {
    explorers: one("SELECT COUNT(*) n FROM players WHERE is_sample = 0"),
    opened: one("SELECT COUNT(*) n FROM claims"),
    live: one("SELECT COUNT(*) n FROM treasures WHERE active = 1 AND (expires_at IS NULL OR expires_at > ?)", Date.now()),
    items: catalog.items.length,
  };
}

export default function Landing() {
  const s = stats();
  const contract = publicConfig.contractId;
  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      {/* Nav */}
      <header className="mx-auto flex max-w-[1180px] items-center justify-between px-5 pt-[calc(var(--safe-top)+18px)] sm:px-8">
        <Logo size={30} />
        <nav className="hidden items-center gap-8 text-[13.5px] font-medium text-muted md:flex">
          <a href="#how" className="hover:text-ink">How it works</a>
          <a href="#economy" className="hover:text-ink">Economy</a>
          <a href="#onchain" className="hover:text-ink">On NEAR</a>
          <Link href="/leaderboard" className="hover:text-ink">Leaderboard</Link>
        </nav>
        <Link href="/explore" className="btn btn-primary px-5">
          Play now <ArrowUpRight size={16} />
        </Link>
      </header>

      {/* Hero */}
      <section className="relative mx-auto grid max-w-[1180px] items-center gap-10 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pt-16">
        <div className="ember-glow pointer-events-none absolute right-[10%] top-24 h-[520px] w-[520px] opacity-80" />

        {/* Boarding pass */}
        <div className="relative mx-auto w-full max-w-[460px] lg:mx-0">
          <div className="card relative h-44 overflow-hidden rounded-b-none pb-6">
            <div className="dot-grid absolute inset-x-8 inset-y-6 opacity-60" />
          </div>
          <div className="card-ink relative -mt-8 overflow-hidden px-8 pb-8 pt-10 sm:px-10">
            <p className="text-[12px] font-semibold uppercase tracking-[0.26em] text-white/45">A treasure hunt on NEAR</p>
            <h1 className="font-display mt-5 text-[2.3rem] font-light leading-[1.04] sm:text-[3.2rem]">
              The world
              <br />
              is your
              <br />
              playground <Spark size={34} className="inline-block align-[-3px] text-gold" />
            </h1>
            <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-white/60">
              Walk your city. Open treasures that only exist where you stand. Take on guild missions and own every artifact you find.
            </p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              <Link href="/explore" className="btn bg-white px-6 py-3.5 text-[15px] text-ink">
                Start exploring <ArrowRight size={17} />
              </Link>
              <a href="#how" className="btn border border-white/15 px-5 py-3.5 text-white">
                How it works
              </a>
            </div>
            <div className="mt-12 flex items-end justify-between">
              <LogoMark size={44} tone="light" />
              <p className="text-right text-[11px] leading-relaxed text-white/35">
                No seed phrases.
                <br />
                Play as a guest, mint when ready.
              </p>
            </div>
          </div>
        </div>

        {/* App preview */}
        <div className="relative mx-auto w-full max-w-[400px]">
          <AppPreview />
          <p className="mt-3 text-center text-[11px] text-faint">App preview: the Explore home screen</p>
        </div>
      </section>

      {/* Live stats */}
      <section className="mx-auto max-w-[1180px] px-5 sm:px-8">
        <div className="card grid grid-cols-2 divide-line overflow-hidden sm:grid-cols-4 sm:divide-x">
          <Stat label="Treasures opened" value={s.opened} />
          <Stat label="Explorers" value={s.explorers} />
          <Stat label="Treasures live now" value={s.live} />
          <Stat label="Collectible types" value={s.items} />
        </div>
        <p className="mt-2 px-2 text-[11px] text-faint">Live counts from this server. Seeded sample leaderboard profiles are excluded.</p>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-[1180px] scroll-mt-10 px-5 pt-24 sm:px-8">
        <SectionTitle kicker="How it works" title="Three steps. One very big map." />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { n: "01", i: Footprints, t: "Walk", d: "Treasures spawn in a fresh daily field wherever you are. Common pouches to one-of-a-kind legendary hoards, each with limited claims." },
            { n: "02", i: Compass, t: "Open", d: "Get within the claim radius and open it. Our server checks distance, GPS quality, impossible movement and duplicates before anything is granted." },
            { n: "03", i: Gem, t: "Own", d: "Rewards land in your vault. Connect a NEAR wallet to mint them as tokens you own, then trade or sell them to the Merchant." },
          ].map(({ n, i: I, t, d }) => (
            <div key={n} className="card relative overflow-hidden p-7">
              <div className="flex items-center justify-between">
                <span className="orb h-12 w-12">
                  <I size={20} />
                </span>
                <span className="font-display text-[13px] text-faint">{n}</span>
              </div>
              <p className="font-display mt-8 text-[1.5rem]">{t}</p>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Economy */}
      <section id="economy" className="mx-auto max-w-[1180px] scroll-mt-10 px-5 pt-24 sm:px-8">
        <SectionTitle kicker="A real economy" title="NPCs with treasuries. Supply that runs out." />
        <div className="mt-10 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="grid grid-cols-2 gap-4">
            {catalog.npcs.map((n) => (
              <div key={n.id} className="card p-6">
                <span className="grid h-14 w-14 place-items-center rounded-full text-[28px]" style={{ background: `${n.color}1f` }}>
                  {n.avatar}
                </span>
                <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: n.color }}>
                  {n.title}
                </p>
                <p className="mt-1 text-[15px] font-semibold">{n.name}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">&ldquo;{n.greeting}&rdquo;</p>
              </div>
            ))}
          </div>
          <div className="card-ink relative overflow-hidden p-8">
            <div className="dot-grid-light pointer-events-none absolute inset-0 opacity-25" />
            <div className="relative space-y-6">
              {[
                { i: Store, t: "The Merchant prices on a curve", d: "Every sale raises the price 8%, every buyback lowers it. Prices move with players, not developers." },
                { i: Landmark, t: "Treasuries no one can withdraw", d: "NPC NEAR balances and reward pools live in the contract. They only change through the rules, and that includes the owner." },
                { i: ShieldCheck, t: "Hard supply caps", d: "250 Tidecaller Crowns. 50 Ember Eggs. Enforced on-chain, and caps can only go down." },
                { i: ShardIcon as unknown as typeof Store, t: "Shards are game points, not a token", d: "Earned by playing, capped daily, spent on unlocks, events and cosmetics." },
              ].map(({ i: I, t, d }) => (
                <div key={t} className="flex gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-gold">
                    <I size={17} />
                  </span>
                  <span>
                    <span className="block text-[15px] font-semibold text-white">{t}</span>
                    <span className="mt-1 block text-[13.5px] leading-relaxed text-white/55">{d}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* On-chain */}
      <section id="onchain" className="mx-auto max-w-[1180px] scroll-mt-10 px-5 pt-24 sm:px-8">
        <div className="card-raised relative overflow-hidden p-8 sm:p-12">
          <div className="ember-glow pointer-events-none absolute -right-24 -top-24 h-96 w-96" />
          <div className="relative grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:items-end">
            <div>
              <SectionTitle kicker="Built on NEAR" title="Your finds are yours. Provably." />
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
                Claims are attested by the game server and settled by your own wallet. The contract checks the signature, your account, expiry, replay and supply before minting. Collectibles follow NEP-245, sign-in uses NEP-413 and wallets connect through NEAR Connect.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {["NEP-245 multi-token", "NEP-413 sign-in", "NEP-297 events", "NEAR Connect", "near-sdk 5.30"].map((t) => (
                  <span key={t} className="chip px-3 py-1.5 text-[12px]">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-[26px] bg-white p-6 shadow-[0_12px_30px_-20px_rgba(0,0,0,0.4)]">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">Contract · {publicConfig.network}</p>
              {contract ? (
                <a href={accountUrl(contract)} target="_blank" rel="noreferrer" className="font-display mt-2 flex items-center gap-2 break-all text-[1.05rem] hover:text-gold-deep">
                  {contract} <ArrowUpRight size={16} className="shrink-0" />
                </a>
              ) : (
                <p className="mt-2 text-[14px] text-muted">Not configured on this server.</p>
              )}
              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                <Mini icon={<Trophy size={15} />} label="Claims" />
                <Mini icon={<Store size={15} />} label="Market" />
                <Mini icon={<Landmark size={15} />} label="Treasuries" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[1180px] px-5 pb-16 pt-24 text-center sm:px-8">
        <h2 className="font-display mx-auto max-w-2xl text-[2.2rem] font-light leading-[1.1] sm:text-[3rem]">
          Somewhere near you, a treasure is waiting <Spark size={30} className="inline-block align-[-2px] text-gold" />
        </h2>
        <div className="mt-8 flex justify-center gap-2.5">
          <Link href="/explore" className="btn btn-accent px-7 py-4 text-[15px]">
            Start exploring <ArrowRight size={17} />
          </Link>
          <Link href="/leaderboard" className="btn btn-ghost px-6 py-4">
            Leaderboard
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 border-t border-line px-5 py-8 text-[12.5px] text-muted sm:px-8">
        <Logo size={22} />
        <p>Built for the NEAR Hackathon · Track 09: Games With Real Economies</p>
        <div className="flex gap-5">
          <a href="https://github.com/TeevincsCrypt/Trezo" target="_blank" rel="noreferrer" className="hover:text-ink">GitHub</a>
          <Link href="/admin" className="hover:text-ink">Admin</Link>
        </div>
      </footer>
    </div>
  );
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.2em] text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-gold" /> {kicker}
      </p>
      <h2 className="font-display mt-4 max-w-2xl text-[1.9rem] leading-[1.1] sm:text-[2.5rem]">{title}</h2>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-6 py-6">
      <p className="font-display text-[1.9rem] tabular">{value.toLocaleString()}</p>
      <p className="mt-1 text-[12.5px] text-muted">{label}</p>
    </div>
  );
}

function Mini({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-2 py-3">
      <span className="mx-auto grid h-8 w-8 place-items-center rounded-full bg-white">{icon}</span>
      <p className="mt-1.5 text-[11px] text-muted">{label}</p>
    </div>
  );
}

/** Static, illustrative composition of the in-app home screen. */
function AppPreview() {
  const rows = [
    { name: "Gilded Strongbox", rarity: "Rare", color: "#2F7FE0", dist: "48 m", sub: "+30 Shards" },
    { name: "Hidden Pouch", rarity: "Common", color: "#6F8499", dist: "112 m", sub: "+10 Shards" },
    { name: "Obsidian Vault", rarity: "Epic", color: "#8A55F0", dist: "340 m", sub: "+75 Shards" },
  ];
  return (
    <div className="relative rounded-[44px] border border-white bg-surface p-5 shadow-[0_40px_80px_-40px_rgba(20,16,10,0.45)]" aria-hidden>
      <div className="flex items-center justify-between">
        <span className="orb h-11 w-11">
          <LogoMark size={22} />
        </span>
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" />
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#FFE3D1] text-xl ring-2 ring-white">🦊</span>
        </span>
      </div>
      <p className="mt-5 text-[11.5px] text-muted">Your Shards</p>
      <p className="font-display text-[2.3rem] leading-tight tabular">
        1,240<span className="text-faint">.50</span>
      </p>
      <p className="text-[11.5px] font-semibold text-teal">+75 today · Level 6</p>

      <div className="relative mt-5 grid grid-cols-4 gap-3">
        <div className="ember-glow pointer-events-none absolute -inset-6 opacity-70" />
        {[ArrowUpRight, ArrowDown, Plus, ScrollText].map((I, i) => (
          <span key={i} className="orb relative aspect-square">
            <I size={18} />
          </span>
        ))}
      </div>

      <div className="relative mt-4 grid grid-cols-2 gap-3">
        <div className="relative aspect-square overflow-hidden rounded-[26px] bg-gradient-to-br from-[#FF8A3D] to-[#E8560B]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/api/art/crown-tide.svg" alt="" className="absolute inset-0 h-full w-full scale-[1.08] object-cover opacity-95 mix-blend-luminosity" />
          <span className="absolute bottom-3 left-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-gold-deep">
            <Spark size={18} />
          </span>
        </div>
        <div className="rounded-[26px] border border-white bg-white/70 p-4 backdrop-blur">
          <Landmark size={22} className="text-muted" strokeWidth={1.5} />
          <p className="mt-6 text-[13px] font-medium">Merchant treasury</p>
          <p className="font-display text-[1.15rem] tabular">2.01 Ⓝ</p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <p className="text-[14px] font-semibold">
          Nearby <span className="font-normal text-muted">· 9</span>
        </p>
        <span className="h-1.5 w-1.5 rounded-full bg-gold" />
      </div>
      <div className="mt-2 space-y-1">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-3 py-1.5">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white" style={{ boxShadow: `inset 0 0 0 2px ${r.color}` }}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">{r.name}</span>
              <span className="text-[11px] font-semibold" style={{ color: r.color }}>
                {r.rarity}
              </span>
            </span>
            <span className="text-right">
              <span className="font-display block text-[13px] tabular">{r.dist}</span>
              <span className="text-[10.5px] text-muted">{r.sub}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <div className="flex h-12 flex-1 items-center gap-1 rounded-full bg-ink p-1">
          <span className="flex h-full flex-[2] items-center justify-center gap-1.5 rounded-full bg-white text-[12px] font-semibold">
            <Compass size={15} /> Explore
          </span>
          <span className="flex flex-1 justify-center text-white/60">
            <ScrollText size={16} />
          </span>
          <span className="flex flex-1 justify-center text-white/60">
            <Trophy size={16} />
          </span>
        </div>
        <span className="grid h-12 w-12 place-items-center rounded-full bg-gold text-white">
          <Spark size={19} />
        </span>
      </div>
    </div>
  );
}
