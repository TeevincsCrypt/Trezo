"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Gem, Map, Swords, Wallet } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { AVATARS, USERNAME_RE } from "@/lib/rules";
import { useGame, type Me } from "../providers/GameProvider";
import { useWallet } from "../providers/WalletProvider";
import { Logo, Spinner, cx } from "../ui";

const SEEN_KEY = "trezo.onboarded";

export function Onboarding() {
  const { me, loading, onboardingOpen, openOnboarding, closeOnboarding, setMe, notify } = useGame();
  const { connectAndSignIn, busy } = useWallet();
  const [step, setStep] = useState<"intro" | "profile">("intro");
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState<string>("fox");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (loading || me) return;
    let seen = false;
    try {
      seen = !!localStorage.getItem(SEEN_KEY);
    } catch {}
    if (!seen) openOnboarding();
  }, [loading, me, openOnboarding]);

  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
    closeOnboarding();
    setStep("intro");
  };

  const createGuest = async () => {
    setErr(null);
    if (!USERNAME_RE.test(username)) return setErr("3–20 letters, numbers or underscores.");
    setSaving(true);
    try {
      const r = await api<{ player: Me }>("/api/session/guest", { body: { username, avatar } });
      setMe({ ...r.player, rank: null });
      notify({ title: `Welcome, ${r.player.username}!`, body: "Your adventure starts now.", tone: "success" });
      close();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  const wallet = async () => {
    if (await connectAndSignIn()) close();
  };

  return (
    <AnimatePresence>
      {onboardingOpen && !me && (
        <motion.div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="relative w-full overflow-hidden rounded-t-[32px] border border-line bg-surface pb-[calc(var(--safe-bottom)+20px)] sm:max-w-md sm:rounded-[32px]"
          >
            <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-gold/20 blur-3xl" />
            {step === "intro" ? (
              <div className="relative px-6 pt-8">
                <Logo size={36} />
                <h2 className="font-display mt-6 text-[2rem] font-bold leading-[1.1]">
                  The world is your <span className="text-gold">playground.</span>
                </h2>
                <p className="mt-2 text-[15px] text-muted">Walk your city, open hidden treasures, take on missions and collect artifacts you truly own.</p>
                <ul className="mt-6 space-y-3 text-sm">
                  {[
                    { i: Map, t: "Real-world hunting", d: "Treasures spawn around you. Get close to open them." },
                    { i: Swords, t: "Missions & quests", d: "Four guild NPCs with their own goals and treasuries." },
                    { i: Gem, t: "Owned collectibles", d: "Mint finds to your NEAR account and trade them." },
                  ].map(({ i: I, t, d }) => (
                    <li key={t} className="flex gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-gold">
                        <I size={18} />
                      </span>
                      <span>
                        <span className="block font-semibold">{t}</span>
                        <span className="text-muted">{d}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-7 space-y-2.5">
                  <button className="btn btn-primary w-full py-3.5 text-[15px]" onClick={() => setStep("profile")}>
                    Create explorer profile
                  </button>
                  <button className="btn btn-ghost w-full py-3" onClick={wallet} disabled={busy}>
                    {busy ? <Spinner /> : <Wallet size={17} />} Continue with NEAR wallet
                  </button>
                  <button className="w-full py-2 text-sm text-muted hover:text-ink" onClick={close}>
                    Just look around
                  </button>
                </div>
                <p className="mt-2 text-center text-[11px] text-faint">TREZO never asks for your seed phrase or private keys.</p>
              </div>
            ) : (
              <div className="relative px-6 pt-6">
                <button onClick={() => setStep("intro")} className="mb-4 flex items-center gap-1 text-sm text-muted">
                  <ArrowLeft size={16} /> Back
                </button>
                <h2 className="font-display text-2xl font-bold">Choose your explorer</h2>
                <p className="mt-1 text-sm text-muted">You can connect a wallet later — your progress comes with you.</p>
                <div className="mt-5 grid grid-cols-4 gap-2.5">
                  {AVATARS.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setAvatar(a.id)}
                      className={cx("grid aspect-square place-items-center rounded-2xl border text-3xl transition", avatar === a.id ? "border-gold bg-gold/10" : "border-line bg-surface-2")}
                      aria-label={a.label}
                      aria-pressed={avatar === a.id}
                    >
                      {a.emoji}
                    </button>
                  ))}
                </div>
                <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-muted" htmlFor="uname">
                  Username
                </label>
                <input
                  id="uname"
                  className="input mt-1.5"
                  value={username}
                  maxLength={20}
                  autoComplete="off"
                  placeholder="e.g. NightHunter"
                  onChange={(e) => setUsername(e.target.value.replace(/\s/g, "_"))}
                  onKeyDown={(e) => e.key === "Enter" && createGuest()}
                />
                {err && <p className="mt-2 text-sm text-danger">{err}</p>}
                <button className="btn btn-primary mt-6 w-full py-3.5 text-[15px]" onClick={createGuest} disabled={saving}>
                  {saving ? <Spinner /> : "Start exploring"}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
