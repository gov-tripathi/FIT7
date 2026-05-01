import { LogOut, Menu, RefreshCw, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { http } from "../api";
import clsx from "clsx";

const LAST_SYNC_KEY = "fitfuel-last-sync";
const COOLDOWN_KEY = "fitfuel-sync-cooldown-until";

export default function TopBar({ onOpenMenu }: { onOpenMenu?: () => void }) {
  const { user, isGuest, signOut } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(() => {
    const v = localStorage.getItem(LAST_SYNC_KEY);
    return v ? Number(v) : null;
  });
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(() => {
    const v = localStorage.getItem(COOLDOWN_KEY);
    const t = v ? Number(v) : null;
    return t && t > Date.now() ? t : null;
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const h = () => {
      const t = Date.now();
      setLastSync(t);
      localStorage.setItem(LAST_SYNC_KEY, String(t));
    };
    window.addEventListener("fitfuel:synced", h);
    return () => window.removeEventListener("fitfuel:synced", h);
  }, []);

  const sync = async () => {
    if (cooldownUntil && cooldownUntil > Date.now()) {
      toast.error(
        "Garmin sync is cooling down. Use file upload on the Activities page.",
        { duration: 5000 }
      );
      return;
    }
    setSyncing(true);
    try {
      const r = await http.post<{
        status: string;
        source: "garmin" | "mock";
        activities_new: number;
        metrics_new: number;
        foods_new?: number;
      }>("/sync/garmin");
      const bits = [
        `${r.activities_new} activities`,
        `${r.metrics_new} metric days`,
      ];
      if (r.foods_new) bits.push(`${r.foods_new} food logs`);
      const prefix = r.source === "garmin" ? "Garmin synced" : "Synced (demo)";
      toast.success(`${prefix} — ${bits.join(", ")}`);
      window.dispatchEvent(new CustomEvent("fitfuel:synced"));
    } catch (e) {
      const msg = (e as Error).message;
      const isRateLimit =
        /429|rate[- ]?limit|Too Many Requests|unexpected error/i.test(msg);

      if (isRateLimit) {
        const until = Date.now() + 15 * 60 * 1000;
        setCooldownUntil(until);
        localStorage.setItem(COOLDOWN_KEY, String(until));
        toast(
          (t) => (
            <div className="min-w-0 text-[13px] leading-snug">
              <div className="font-semibold text-rose-200 mb-1">
                Garmin login blocked
              </div>
              <div className="text-slate-300 mb-2">
                Garmin is rejecting this account (HTTP 429). Retrying won't
                help — each attempt resets their cooldown.
              </div>
              <Link
                to="/activities"
                onClick={() => toast.dismiss(t.id)}
                className="inline-flex items-center gap-1.5 text-cyan-300 hover:text-cyan-200 font-medium"
              >
                <Upload className="h-3.5 w-3.5" /> Upload a workout file
                instead →
              </Link>
            </div>
          ),
          { duration: 12000, style: { maxWidth: 380 } }
        );
      } else {
        toast.error(msg.length > 160 ? msg.slice(0, 160) + "…" : msg, {
          duration: 8000,
        });
      }
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!syncing) void sync();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [syncing]);

  const relLastSync = useMemo(() => {
    if (!lastSync) return null;
    const diff = Math.max(0, now - lastSync);
    const s = Math.floor(diff / 1000);
    if (s < 10) return "just now";
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }, [lastSync, now]);

  const cooldownLeft =
    cooldownUntil && cooldownUntil > now
      ? Math.ceil((cooldownUntil - now) / 1000)
      : 0;

  useEffect(() => {
    if (cooldownUntil && cooldownUntil <= now) {
      setCooldownUntil(null);
      localStorage.removeItem(COOLDOWN_KEY);
    }
  }, [cooldownUntil, now]);

  const status: "fresh" | "idle" | "syncing" | "blocked" = cooldownLeft
    ? "blocked"
    : syncing
    ? "syncing"
    : lastSync && now - lastSync < 5 * 60 * 1000
    ? "fresh"
    : "idle";

  const email = user?.email ?? "";

  const fmtCooldown = (s: number) => {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return m > 0 ? `${m}m ${rem.toString().padStart(2, "0")}s` : `${rem}s`;
  };

  return (
    <header
      className={clsx(
        "sticky top-0 z-30 border-b border-slate-800/60",
        "bg-slate-950/70 backdrop-blur-xl",
        "before:absolute before:inset-x-0 before:bottom-0 before:h-px",
        "before:bg-gradient-to-r before:from-transparent before:via-cyan-500/30 before:to-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Open menu"
            className="md:hidden -ml-1 p-2 rounded-lg text-slate-300 hover:text-slate-100 hover:bg-slate-800/60 transition"
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          </button>

          <StatusPill status={status} label={email} isGuest={isGuest} />
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {relLastSync && (
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-mono tabular-nums text-slate-500 border border-slate-800/80 bg-slate-900/40"
              title={new Date(lastSync!).toLocaleString()}
            >
              <span className="text-slate-600">sync</span>
              <span className="text-slate-300">{relLastSync}</span>
            </div>
          )}

          <Link
            to="/activities"
            title="Upload FIT/TCX/GPX files"
            className={clsx(
              "inline-flex items-center gap-2 rounded-md px-3 py-1.5",
              "text-[13px] font-medium transition-all",
              "border border-slate-800 bg-slate-900/40 text-slate-300",
              "hover:bg-slate-800/60 hover:border-slate-700 hover:text-slate-100"
            )}
          >
            <Upload className="h-3.5 w-3.5" strokeWidth={2} />
            <span className="hidden sm:inline">Upload</span>
          </Link>

          <button
            onClick={sync}
            disabled={syncing || cooldownLeft > 0}
            aria-label={cooldownLeft ? "Sync on cooldown" : "Sync data"}
            title={
              cooldownLeft
                ? `Garmin locked us out. Retrying in ${fmtCooldown(cooldownLeft)}. Use Upload instead.`
                : "Sync with Garmin (⌘⇧S)"
            }
            className={clsx(
              "group relative inline-flex items-center gap-2 rounded-md px-3 py-1.5",
              "text-[13px] font-medium transition-all",
              "disabled:cursor-not-allowed",
              cooldownLeft
                ? "border border-rose-400/30 bg-rose-400/5 text-rose-200 opacity-90"
                : "border border-cyan-400/30 bg-cyan-400/5 text-cyan-100 hover:bg-cyan-400/10 hover:border-cyan-400/50 disabled:opacity-60"
            )}
          >
            <RefreshCw
              className={clsx(
                "h-3.5 w-3.5",
                cooldownLeft ? "text-rose-300" : "text-cyan-300",
                syncing && "animate-spin"
              )}
              strokeWidth={2}
            />
            <span className="hidden sm:inline font-mono tabular-nums">
              {cooldownLeft
                ? fmtCooldown(cooldownLeft)
                : syncing
                ? "Syncing"
                : "Sync"}
            </span>
            {!cooldownLeft && (
              <Kbd className="hidden md:inline">⌘⇧S</Kbd>
            )}
          </button>

          <button
            onClick={() => signOut()}
            aria-label={isGuest ? "Exit guest mode" : "Sign out"}
            className={clsx(
              "inline-flex items-center gap-2 rounded-md px-3 py-1.5",
              "text-[13px] font-medium transition-all",
              "border border-slate-800 bg-slate-900/40 text-slate-300",
              "hover:bg-slate-800/60 hover:border-slate-700 hover:text-slate-100"
            )}
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
            <span className="hidden sm:inline">
              {isGuest ? "Exit" : "Sign out"}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}

function StatusPill({
  status,
  label,
  isGuest,
}: {
  status: "fresh" | "idle" | "syncing" | "blocked";
  label: string;
  isGuest: boolean;
}) {
  const dotColor =
    status === "fresh"
      ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]"
      : status === "syncing"
      ? "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.7)]"
      : status === "blocked"
      ? "bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.6)]"
      : "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.6)]";

  return (
    <div
      className={clsx(
        "group flex items-center gap-2 min-w-0",
        "pl-1 pr-2.5 py-1 rounded-md"
      )}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span
          className={clsx(
            "absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping",
            dotColor
          )}
        />
        <span
          className={clsx(
            "relative inline-flex h-2 w-2 rounded-full",
            dotColor
          )}
        />
      </span>

      <div className="flex items-center gap-2 min-w-0 text-[13px]">
        <span className="font-mono tabular-nums text-slate-200 truncate max-w-[200px] sm:max-w-none">
          {label}
        </span>
        {isGuest && (
          <span className="hidden xs:inline shrink-0 font-mono text-[10.5px] uppercase tracking-wider text-slate-500 border border-slate-700/60 px-1.5 py-0.5 rounded">
            guest
          </span>
        )}
      </div>
    </div>
  );
}

function Kbd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={clsx(
        "ml-1 font-mono text-[10px] tracking-wider text-cyan-200/60",
        "border border-cyan-400/20 rounded px-1 py-px",
        "bg-cyan-400/5",
        className
      )}
    >
      {children}
    </kbd>
  );
}
