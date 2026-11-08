"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Gem, Map, Swords, Wallet } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { AVATARS, USERNAME_RE } from "@/lib/rules";
import { useGame, type Me } from "../providers/GameProvider";
import { useWallet } from "../providers/WalletProvider";
import { Logo, Spark, Spinner, cx } from "../ui";

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
        <motion.div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#1a1714]/40 backdrop-blur-[4px] sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="relative max-h-[94dvh] w-full overflow-y-auto rounded-t-[36px] bg-surface sm:max-w-[420px] sm:rounded-[36px]"
          >
            {step === "intro" ? (
              <>
                {/* Dot-grid "map" top */}
                <div className="relative h-36 overflow-hidden rounded-t-[36px]">
                  <div className="dot-grid absolute inset-0 opacity-50" />
                  <div className="ember-glow absolute -right-10 -top-16 h-56 w-56" />
                  <div className="absolute left-6 top-6">
                    <Logo size={30} />
                  </div>
                </div>
                {/* Ink card */}
                <div className="card-ink relative -mt-4 px-7 pb-[calc(var(--safe-bottom)+24px)] pt-8">
                  <div className="dot-grid-light pointer-events-none absolute inset-0 rounded-[32px] opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_45%)]" />
                  <h2 className="font-display relative text-[2.15rem] font-light leading-[1.08]">
                    The world
                    <br />
                    is your
                    <br />
                    playground <Spark size={26} className="inline-block align-[-2px] text-gold" />
                  </h2>
                  <p className="relative mt-4 text-[14.5px] leading-relaxed text-white/60">Walk your city, open hidden treasures, take on guild missions and own the artifacts you find.</p>
                  <ul className="relative mt-6 space-y-3 text-[13.5px]">
                    {[
                      { i: Map, t: "Treasures spawn around you, so get close to open them" },
                      { i: Swords, t: "Four guild NPCs with their own on-chain treasuries" },
                      { i: Gem, t: "Mint finds to your NEAR account and trade them" },
                    ].map(({ i: I, t }) => (
                      <li key={t} className="flex items-center gap-3 text-white/80">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-gold">
                          <I size={15} />
                        </span>
                        {t}
                      </li>
                    ))}
                  </ul>
                  <div className="relative mt-8 space-y-2.5">
                    <button className="btn w-full bg-white py-4 text-[15px] text-ink" onClick={() => setStep("profile")}>
                      Create explorer profile
                    </button>
                    <button className="btn w-full border border-white/15 py-3.5 text-white" onClick={wallet} disabled={busy}>
                      {busy ? <Spinner /> : <Wallet size={17} />} Continue with NEAR wallet
                    </button>
                    <button className="w-full py-2 text-sm text-white/50 hover:text-white" onClick={close}>
                      Just look around
                    </button>
                  </div>
                  <p className="relative mt-1 text-center text-[11px] text-white/35">TREZO never asks for your seed phrase or private keys.</p>
                </div>
              </>
            ) : (
              <div className="relative px-6 pb-[calc(var(--safe-bottom)+24px)] pt-6">
                <button onClick={() => setStep("intro")} className="orb mb-5 h-10 w-10" aria-label="Back">
                  <ArrowLeft size={17} />
                </button>
                <h2 className="font-display text-[1.6rem] leading-tight">Choose your explorer</h2>
                <p className="mt-2 text-sm text-muted">You can connect a wallet later, and your progress comes with you.</p>
                <div className="mt-6 grid grid-cols-4 gap-2.5">
                  {AVATARS.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setAvatar(a.id)}
                      className={cx("grid aspect-square place-items-center rounded-full text-3xl transition", avatar === a.id ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : "opacity-80 hover:opacity-100")}
                      style={{ background: a.bg }}
                      aria-label={a.label}
                      aria-pressed={avatar === a.id}
                    >
                      {a.emoji}
                    </button>
                  ))}
                </div>
                <label className="mt-6 block text-xs font-semibold uppercase tracking-wider text-muted" htmlFor="uname">
                  Username
                </label>
                <input
                  id="uname"
                  className="input mt-2"
                  value={username}
                  maxLength={20}
                  autoComplete="off"
                  placeholder="e.g. NightHunter"
                  onChange={(e) => setUsername(e.target.value.replace(/\s/g, "_"))}
                  onKeyDown={(e) => e.key === "Enter" && createGuest()}
                />
                {err && <p className="mt-2 text-sm text-danger">{err}</p>}
                <button className="btn btn-primary mt-7 w-full py-4 text-[15px]" onClick={createGuest} disabled={saving}>
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
