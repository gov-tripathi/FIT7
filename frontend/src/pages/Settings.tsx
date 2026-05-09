import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { http } from "../api";
import type { Profile } from "../types";

const GOALS: Profile["goal"][] = [
  "weight_loss",
  "muscle_gain",
  "performance",
  "recovery",
  "maintenance",
];

export default function Settings() {
  const [p, setP] = useState<Profile | null>(null);
  const [garmin, setGarmin] = useState({ email: "", password: "" });
  const [garminConnected, setGarminConnected] = useState(false);
  const [garminConnecting, setGarminConnecting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [stravaConnected, setStravaConnected] = useState(false);
  const [stravaConnecting, setStravaConnecting] = useState(false);

  const load = () => http.get<Profile>("/profile").then(setP).catch(() => {});
  const loadSession = () =>
    http
      .get<{ has_garth_session: boolean; has_browser_session: boolean }>("/profile/garmin/status")
      .then((r) => setGarminConnected(!!(r.has_garth_session || r.has_browser_session)))
      .catch(() => {});
  const loadStravaStatus = () =>
    http
      .get<{ connected: boolean }>("/strava/status")
      .then((r) => setStravaConnected(r.connected))
      .catch(() => {});

  useEffect(() => {
    load();
    loadSession();
    loadStravaStatus();
  }, []);

  const connectGarmin = async () => {
    if (!garmin.email || !garmin.password)
      return toast.error("Email and password required");
    setGarminConnecting(true);
    try {
      const res = await http.post<{
        ok: boolean;
        display_name?: string;
        imported?: Record<string, unknown>;
      }>("/profile/garmin/connect", garmin);
      const fields = Object.keys(res?.imported ?? {});
      toast.success(
        fields.length
          ? `Garmin connected — imported ${fields.join(", ")}`
          : `Garmin connected${res.display_name ? ` as ${res.display_name}` : ""}`
      );
      setGarmin({ email: "", password: "" });
      await loadSession();
      await load();
    } catch (e) {
      toast.error((e as Error).message, { duration: 8000 });
    } finally {
      setGarminConnecting(false);
    }
  };

  const disconnectGarmin = async () => {
    try {
      await http.del("/profile/garmin/browser-profile");
      await http.del("/profile/garmin/browser-session");
      setGarminConnected(false);
      toast.success("Garmin disconnected");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const importFromGarmin = async () => {
    try {
      const res = await http.post<{
        imported?: Record<string, unknown>;
        message?: string;
      }>("/profile/garmin/import", {});
      const fields = Object.keys(res?.imported ?? {});
      if (fields.length) {
        toast.success(`Imported from Garmin: ${fields.join(", ")}`);
        load();
      } else {
        toast(res?.message ?? "Nothing new to import");
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const connectStrava = async () => {
    setStravaConnecting(true);
    try {
      const { url } = await http.get<{ url: string }>("/strava/connect");
      const popup = window.open(url, "strava-auth", "width=600,height=700,left=200,top=100");
      const handleConnected = async () => {
        setStravaConnected(true);
        toast.success("Strava connected!");
        popup?.close();
        window.removeEventListener("strava:connected", handleConnected as EventListener);
      };
      window.addEventListener("strava:connected", handleConnected as EventListener);
      // Poll in case postMessage doesn't fire
      const poll = setInterval(() => {
        if (popup?.closed) {
          clearInterval(poll);
          loadStravaStatus();
          window.removeEventListener("strava:connected", handleConnected as EventListener);
        }
      }, 500);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStravaConnecting(false);
    }
  };

  const disconnectStrava = async () => {
    try {
      await http.del("/strava/disconnect");
      setStravaConnected(false);
      toast.success("Strava disconnected");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const syncStrava = async () => {
    try {
      const res = await http.post<{ activities_new: number }>("/strava/sync", {});
      toast.success(`Synced ${res.activities_new} activities from Strava`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const save = async () => {
    if (!p) return;
    try {
      await http.patch("/profile", {
        display_name: p.display_name,
        goal: p.goal,
        height_cm: p.height_cm,
        weight_kg: p.weight_kg,
        birth_year: p.birth_year,
        sex: p.sex,
      });
      toast.success("Saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!p) return <div className="text-slate-500">Loading…</div>;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="speed-chip">Locker</span>
          <span className="text-[11px] font-display uppercase tracking-brutal text-slate-500">
            Profile & integrations
          </span>
        </div>
        <h1 className="section-title text-3xl sm:text-4xl">Settings</h1>
        <p className="text-sm text-slate-400 mt-3">
          Profile, goals, and integrations.
        </p>
      </div>

      {/* ── Profile ── */}
      <div className="card space-y-4">
        <h3 className="font-semibold">Profile</h3>
        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
          <div>
            <label className="label">Display name</label>
            <input
              className="input"
              value={p.display_name ?? ""}
              onChange={(e) => setP({ ...p, display_name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Goal</label>
            <select
              className="input"
              value={p.goal ?? ""}
              onChange={(e) => setP({ ...p, goal: e.target.value as Profile["goal"] })}
            >
              <option value="">Select…</option>
              {GOALS.map((g) => (
                <option key={g!} value={g!}>
                  {g!.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Height (cm)</label>
            <input
              type="number"
              className="input"
              value={p.height_cm ?? ""}
              onChange={(e) => setP({ ...p, height_cm: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Weight (kg)</label>
            <input
              type="number"
              className="input"
              value={p.weight_kg ?? ""}
              onChange={(e) => setP({ ...p, weight_kg: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Birth year</label>
            <input
              type="number"
              className="input"
              value={p.birth_year ?? ""}
              onChange={(e) => setP({ ...p, birth_year: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Sex</label>
            <select
              className="input"
              value={p.sex ?? ""}
              onChange={(e) => setP({ ...p, sex: e.target.value as Profile["sex"] })}
            >
              <option value="">Select…</option>
              <option value="male">male</option>
              <option value="female">female</option>
              <option value="other">other</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" onClick={save}>
            Save profile
          </button>
          {garminConnected && (
            <button
              type="button"
              onClick={importFromGarmin}
              className="px-4 py-2 rounded-lg ring-1 ring-slate-700 text-slate-200 hover:bg-slate-800 text-sm"
            >
              Import from Garmin
            </button>
          )}
        </div>
      </div>

      {/* ── Garmin Connect ── */}
      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold">Garmin Connect</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-lg">
              Enter your Garmin Connect email and password once. We authenticate
              directly with Garmin's API (same as the mobile app) and store only
              a secure OAuth token — your password is never saved.
            </p>
          </div>
          {garminConnected ? (
            <span className="pill bg-emerald-400/10 text-emerald-300 ring-emerald-400/30">
              Connected
            </span>
          ) : (
            <span className="pill bg-slate-700/40 text-slate-400 ring-slate-600/50">
              Not connected
            </span>
          )}
        </div>

        {!garminConnected ? (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Garmin email</label>
                <input
                  className="input"
                  type="email"
                  placeholder="you@example.com"
                  value={garmin.email}
                  onChange={(e) => setGarmin({ ...garmin, email: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Garmin password</label>
                <div className="relative">
                  <input
                    className="input pr-16"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={garmin.password}
                    onChange={(e) => setGarmin({ ...garmin, password: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && connectGarmin()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            </div>
            <button
              className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={connectGarmin}
              disabled={garminConnecting}
            >
              {garminConnecting ? "Connecting…" : "Connect Garmin"}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={importFromGarmin}
              className="px-4 py-2 rounded-lg ring-1 ring-slate-700 text-slate-200 hover:bg-slate-800 text-sm"
            >
              Re-import profile
            </button>
            <button
              type="button"
              onClick={disconnectGarmin}
              className="px-4 py-2 rounded-lg ring-1 ring-rose-800/50 text-rose-400 hover:bg-rose-900/20 text-sm"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* ── Strava ── */}
      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold">Strava</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-lg">
              Connect your Strava account to sync running, cycling, and other activities.
              OAuth — your password is never shared.
            </p>
          </div>
          {stravaConnected ? (
            <span className="pill bg-orange-400/10 text-orange-300 ring-orange-400/30">Connected</span>
          ) : (
            <span className="pill bg-slate-700/40 text-slate-400 ring-slate-600/50">Not connected</span>
          )}
        </div>

        {!stravaConnected ? (
          <button className="btn-primary" onClick={connectStrava} disabled={stravaConnecting}>
            {stravaConnecting ? "Connecting…" : "Connect Strava"}
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={syncStrava}
              className="px-4 py-2 rounded-lg ring-1 ring-slate-700 text-slate-200 hover:bg-slate-800 text-sm"
            >
              Sync now
            </button>
            <button
              type="button"
              onClick={disconnectStrava}
              className="px-4 py-2 rounded-lg ring-1 ring-rose-800/50 text-rose-400 hover:bg-rose-900/20 text-sm"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
