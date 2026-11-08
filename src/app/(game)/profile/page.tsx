"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, LogOut, Pencil, Shield, Wallet } from "lucide-react";
import type { InventoryEntry } from "@/server/inventory";
import { useApi } from "@/components/hooks";
import { useGame, type Me } from "@/components/providers/GameProvider";
import { useWallet } from "@/components/providers/WalletProvider";
import { Achievements, CollectionStrip, ProfileHeader, type Achievement } from "@/components/profile/ProfileView";
import { Empty, Sheet, Spinner, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { AVATARS } from "@/lib/rules";
import { accountUrl, publicConfig } from "@/lib/config";

export default function ProfilePage() {
  const { me, loading, openOnboarding, setMe, refresh, notify, isAdmin, config } = useGame();
  const { connectAndSignIn, busy, walletAccountId, disconnect } = useWallet();
  const prof = useApi<{ collection: InventoryEntry[]; achievements: Achievement[] }>(me ? `/api/players/${encodeURIComponent(me.username)}` : null, [me?.username, me?.xp]);
  const [edit, setEdit] = useState(false);

  if (loading) return <div className="mx-auto max-w-3xl px-4"><div className="skeleton mt-4 h-56" /></div>;
  if (!me)
    return (
      <div className="mx-auto max-w-3xl">
        <Empty icon={<Wallet />} title="No explorer profile yet" body="Create a profile to start earning XP, or sign in with your NEAR wallet." action={<button className="btn btn-primary" onClick={openOnboarding}>Get started</button>} />
      </div>
    );

  const logout = async () => {
    await api("/api/session/logout", { method: "POST" });
    await disconnect();
    setMe(null);
    notify({ title: "Signed out" });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 pb-8">
      <ProfileHeader
        player={me}
        extra={
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn btn-ghost py-2 text-[13px]" onClick={() => setEdit(true)}>
              <Pencil size={14} /> Edit profile
            </button>
            <Link href={`/players/${me.username}`} className="btn btn-ghost py-2 text-[13px]">
              Public profile
            </Link>
            {isAdmin && (
              <Link href="/admin" className="btn btn-ghost py-2 text-[13px]">
                <Shield size={14} /> Admin
              </Link>
            )}
          </div>
        }
      />

      <section className="card p-4">
        <h2 className="font-display text-lg">NEAR account</h2>
        {me.accountId ? (
          <div className="mt-2 space-y-2 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-teal/10 px-2 py-1 font-mono text-[13px] text-teal">{me.accountId}</span>
              <a href={accountUrl(me.accountId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
                Explorer <ExternalLink size={12} />
              </a>
            </p>
            <p className="text-[13px] text-muted">
              Wallet session: {walletAccountId ? <span className="text-ink">{walletAccountId}</span> : "not connected in this browser"}
              {!walletAccountId && (
                <button className="ml-2 font-semibold text-gold" onClick={() => connectAndSignIn()} disabled={busy}>
                  Reconnect
                </button>
              )}
            </p>
            <p className="text-[12px] text-faint">
              Network: {publicConfig.network} · Contract: {config?.contractId ?? "not configured"}
            </p>
          </div>
        ) : (
          <div className="mt-2">
            <p className="text-[13px] text-muted">Link a NEAR wallet to mint your collectibles as NEP-245 tokens, trade on the player market and sell to the Merchant. Your current progress is kept.</p>
            {publicConfig.network === "testnet" && (
              <p className="mt-2 rounded-2xl bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
                TREZO runs on <b className="text-ink">NEAR testnet</b>, so use a testnet account. Meteor Web works well on phones (inside the Meteor app, pick <b className="text-ink">Meteor Web</b>). Mainnet-only wallets such as NEAR Mobile are hidden until launch.
              </p>
            )}
            <button className="btn btn-teal mt-3" onClick={() => connectAndSignIn()} disabled={busy}>
              {busy ? <Spinner /> : <Wallet size={16} />} Connect NEAR wallet
            </button>
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-lg">Collection</h2>
          <Link href="/inventory" className="text-[13px] text-gold">
            View all
          </Link>
        </div>
        {prof.data ? <CollectionStrip items={prof.data.collection} /> : <div className="skeleton h-40" />}
      </section>

      <section>
        <h2 className="mb-2 font-display text-lg">Achievements</h2>
        {prof.data ? <Achievements list={prof.data.achievements} /> : <div className="skeleton h-32" />}
      </section>

      <button className="btn btn-ghost w-full text-muted" onClick={logout}>
        <LogOut size={16} /> Sign out
      </button>

      <EditSheet open={edit} onClose={() => setEdit(false)} me={me} onSaved={(p) => { setMe({ ...p, rank: me.rank }); refresh(); }} />
    </div>
  );
}

function EditSheet({ open, onClose, me, onSaved }: { open: boolean; onClose: () => void; me: Me; onSaved: (p: Me) => void }) {
  const [username, setUsername] = useState(me.username);
  const [avatar, setAvatar] = useState(me.avatar);
  const [frame, setFrame] = useState<string | null>(me.frame);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const shop = useApi<{ items: { kind: string; value: string; name: string; owned: boolean }[] }>(open ? "/api/shop" : null, [open]);
  useEffect(() => {
    if (open) {
      setUsername(me.username);
      setAvatar(me.avatar);
      setFrame(me.frame);
      setErr(null);
    }
  }, [open, me]);
  const frames = (shop.data?.items ?? []).filter((i) => i.kind === "frame" && i.owned);
  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const r = await api<{ player: Me }>("/api/profile", { method: "PATCH", body: { username, avatar, frame } });
      onSaved(r.player);
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={<p className="font-display text-lg">Edit profile</p>}>
      <label className="block text-xs font-semibold uppercase tracking-wider text-muted">Username</label>
      <input className="input mt-1.5" value={username} maxLength={20} onChange={(e) => setUsername(e.target.value.replace(/\s/g, "_"))} />
      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Avatar</p>
      <div className="mt-2 grid grid-cols-8 gap-1.5">
        {AVATARS.map((a) => (
          <button key={a.id} onClick={() => setAvatar(a.id)} className={cx("grid aspect-square place-items-center rounded-xl border text-xl", avatar === a.id ? "border-gold bg-gold/10" : "border-line bg-surface-2")} aria-label={a.label}>
            {a.emoji}
          </button>
        ))}
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Frame</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className={cx("chip px-3 py-1.5", !frame && "border-gold/50 text-gold")} onClick={() => setFrame(null)}>
          None
        </button>
        {frames.map((f) => (
          <button key={f.value} className={cx("chip px-3 py-1.5", frame === f.value && "border-gold/50 text-gold")} onClick={() => setFrame(f.value)}>
            {f.name}
          </button>
        ))}
        {frames.length === 0 && <span className="text-[12px] text-muted">Buy frames with Shards in the Market → Shard Shop.</span>}
      </div>
      {err && <p className="mt-3 text-sm text-danger">{err}</p>}
      <button className="btn btn-primary mb-2 mt-5 w-full" onClick={save} disabled={saving}>
        {saving ? <Spinner /> : "Save"}
      </button>
    </Sheet>
  );
}
