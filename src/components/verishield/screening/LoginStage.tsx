import { enrollDevice } from "@/lib/enrollment";
import { LanguageSelector, useI18n } from "@/lib/i18n";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldCheck,
  User,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { CHECKPOINTS } from "./screeningUtils";

export function LoginStage({ onLogin }: { onLogin: (badge: string, cp: string) => void }) {
  const { t } = useI18n();
  const [badge, setBadge] = useState("VS-0001");
  const [pass, setPass] = useState("pass123");
  const [cp, setCp] = useState("cp-demo");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");

  const [showEnroll, setShowEnroll] = useState(false);
  const [enrollDevId, setEnrollDevId] = useState("DEV-OFFICER-01");
  const [enrollCode, setEnrollCode] = useState("VS-ENROLL-DEMO-01");
  const [enrollMsg, setEnrollMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);

  async function handleDeviceEnrollment() {
    setIsEnrolling(true);
    setEnrollMsg({ text: "Generating WebCrypto ECDSA key & submitting proof of possession..." });
    const res = await enrollDevice(enrollDevId, enrollCode);
    setIsEnrolling(false);
    if (res.success) {
      setEnrollMsg({
        text: `✓ Device '${res.deviceId}' successfully enrolled with HQ! Bound to Checkpoint '${res.checkpointId}' & Officer '${res.officerBadge}'.`,
      });
      if (res.officerBadge) setBadge(res.officerBadge);
      if (res.checkpointId) setCp(res.checkpointId);
    } else {
      setEnrollMsg({ text: res.error || "Enrollment failed.", isError: true });
    }
  }

  function submit() {
    if (!badge.trim() || !pass.trim() || !cp) {
      setErr("All fields are required.");
      return;
    }
    onLogin(badge.trim().toUpperCase(), cp);
  }

  function quickSignIn() {
    onLogin("VS-0001", "cp-demo");
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 p-6 relative overflow-hidden font-sans">
      {/* Top Bar on Login Page */}
      <div className="absolute top-4 right-6 z-20 flex items-center gap-3">
        <LanguageSelector />
        <Link
          to="/admin"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700/80 text-xs font-mono font-semibold text-emerald-400 hover:bg-slate-800 transition-colors shadow-sm"
        >
          <ShieldCheck className="h-4 w-4" />
          <span>{t("adminLedger")}</span>
        </Link>
      </div>

      <div className="w-full max-w-md flex flex-col gap-6 relative z-10">
        <header className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-xl shadow-emerald-900/30 border border-emerald-400/30">
            <ShieldCheck className="h-9 w-9 animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-100">{t("appName")}</h1>
            <p className="font-mono text-xs font-semibold text-emerald-400 mt-0.5">
              {t("subTitle")}
            </p>
          </div>
        </header>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-7 shadow-2xl backdrop-blur-xl flex flex-col gap-5">
          {/* Quick Demo Sign In Chip */}
          <button
            type="button"
            onClick={quickSignIn}
            className="group flex items-center justify-between bg-gradient-to-r from-emerald-950 via-teal-950 to-slate-900 border border-emerald-500/40 hover:border-emerald-400 rounded-xl px-4 py-3 text-left transition-all duration-200 shadow-md hover:scale-[1.01]"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white group-hover:scale-110 transition-transform">
                <Zap className="h-4 w-4 fill-current" />
              </div>
              <div>
                <span className="block text-xs font-bold text-emerald-300">{t("quickSignIn")}</span>
                <span className="block text-[10px] text-slate-400 font-mono">
                  Instant Officer Access (Checkpoint Alpha)
                </span>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-emerald-400 group-hover:translate-x-1 transition-transform" />
          </button>

          {/* Device Enrollment Toggle Button */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowEnroll(!showEnroll)}
              className="flex items-center justify-between bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl px-4 py-2.5 text-left transition-all"
            >
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-300">
                <KeyRound className="h-4 w-4 text-teal-400" />
                <span>Device Enrollment (ECDSA Provisioning)</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 rounded-md">
                {showEnroll ? "Close" : "Enroll Device"}
              </span>
            </button>

            {showEnroll && (
              <div className="bg-slate-950 border border-teal-500/30 rounded-xl p-4 flex flex-col gap-3">
                <div className="text-xs text-slate-300 font-sans">
                  <p className="font-semibold text-teal-300">VeriShield Device Key Provisioning</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Generates a non-exportable WebCrypto ECDSA key pair and binds the public key to
                    HQ using a one-time enrollment code with Proof-of-Possession.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase">
                      Device ID
                    </label>
                    <input
                      type="text"
                      value={enrollDevId}
                      onChange={(e) => setEnrollDevId(e.target.value)}
                      className="h-9 w-full bg-slate-900 border border-slate-800 rounded-lg px-3 font-mono text-xs text-slate-100 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase">
                      One-Time Enrollment Code
                    </label>
                    <input
                      type="text"
                      value={enrollCode}
                      onChange={(e) => setEnrollCode(e.target.value)}
                      className="h-9 w-full bg-slate-900 border border-slate-800 rounded-lg px-3 font-mono text-xs text-slate-100 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                </div>

                {enrollMsg && (
                  <div
                    className={`rounded-lg p-2.5 text-[11px] font-mono leading-relaxed ${
                      enrollMsg.isError
                        ? "bg-rose-950/60 border border-rose-500/40 text-rose-300"
                        : "bg-teal-950/60 border border-teal-500/40 text-teal-300"
                    }`}
                  >
                    {enrollMsg.text}
                  </div>
                )}

                <button
                  type="button"
                  disabled={isEnrolling}
                  onClick={handleDeviceEnrollment}
                  className="h-9 w-full bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-lg transition-all shadow disabled:opacity-50"
                >
                  {isEnrolling ? "Enrolling Device..." : "Generate Key & Enroll with HQ"}
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-[11px] font-mono font-bold tracking-wider text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            {t("offlineCapable")}
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[11px] font-bold tracking-wider uppercase text-slate-400 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-emerald-400" /> {t("badgeId")}
              </label>
              <input
                type="text"
                value={badge}
                placeholder={t("badgePlaceholder")}
                onChange={(e) => setBadge(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="h-12 w-full bg-slate-950 border border-slate-800 rounded-xl px-4 font-mono text-sm text-slate-100 placeholder-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[11px] font-bold tracking-wider uppercase text-slate-400 flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-emerald-400" /> {t("passwordPin")}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={pass}
                  placeholder="••••••••"
                  onChange={(e) => setPass(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  className="h-12 w-full bg-slate-950 border border-slate-800 rounded-xl px-4 pr-11 font-mono text-sm text-slate-100 placeholder-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[11px] font-bold tracking-wider uppercase text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> {t("checkpoint")}
              </label>
              <select
                value={cp}
                onChange={(e) => setCp(e.target.value)}
                className="h-12 w-full bg-slate-950 border border-slate-800 rounded-xl px-4 font-mono text-sm text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer appearance-none"
              >
                <option value="">{t("selectCheckpoint")}</option>
                {CHECKPOINTS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {err && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/50 p-3 text-xs text-rose-300 font-mono">
              {err}
            </div>
          )}

          <button
            onClick={submit}
            className="h-12 w-full mt-1 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm uppercase tracking-wider rounded-xl hover:from-emerald-500 hover:to-teal-500 transition-all duration-200 shadow-lg"
          >
            {t("signIn")}
          </button>
        </div>

        <p className="text-center font-mono text-[10px] text-slate-500 tracking-widest uppercase">
          {t("systemBuild")}
        </p>
      </div>
    </div>
  );
}
