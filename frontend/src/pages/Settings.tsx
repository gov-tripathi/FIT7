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
  const [browserSession, setBrowserSession] = useState(false);
  const [browserConnecting, setBrowserConnecting] = useState(false);

  const load = () => http.get<Profile>("/profile").then(setP).catch(() => {});
  const loadSession = () =>
    http
      .get<{ has_browser_session: boolean }>("/profile/garmin/status")
      .then((r) => setBrowserSession(!!r.has_browser_session))
      .catch(() => {});

  useEffect(() => {
    load();
    loadSession();
  }, []);

  const connectGarminBrowser = async () => {
    setBrowserConnecting(true);
    const notice = toast.loading(
      "A Chromium window is opening — sign into Garmin there, including any captcha. Come back once you see your dashboard.",
      { duration: 1000 * 60 * 4 }
    );
    try {
      const res = await http.post<{
        ok: boolean;
        duration_s?: number;
        imported?: Record<string, unknown>;
      }>("/profile/garmin/browser-login", {});
      toast.dismiss(notice);
      const fields = Object.keys(res?.imported ?? {});
      toast.success(
        fields.length
          ? `Garmin connected — imported ${fields.join(", ")}`
          : "Garmin connected — you can now Sync from the top bar"
      );
      await loadSession();
      await load();
    } catch (e) {
      toast.dismiss(notice);
      const msg = (e as Error).message;
      toast.error(
        msg.length > 220 ? msg.slice(0, 220) + "…" : msg,
        { duration: 8000 }
      );
    } finally {
      setBrowserConnecting(false);
    }
  };

  const disconnectBrowser = async () => {
    try {
      await http.del("/profile/garmin/browser-session");
      toast.success("Garmin browser session removed");
      await loadSession();
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

  const connectGarmin = async () => {
    if (!garmin.email || !garmin.password)
      return toast.error("Email and password required");
    try {
      const res = await http.post<{
        ok: boolean;
        imported?: Record<string, unknown>;
        import_error?: string | null;
      }>("/profile/garmin", garmin);
      const fields = Object.keys(res?.imported ?? {});
      if (fields.length) {
        toast.success(`Garmin connected — imported ${fields.join(", ")}`);
      } else if (res?.import_error) {
        toast.success("Garmin connected");
        toast.error(`Profile import: ${res.import_error}`);
      } else {
        toast.success("Garmin connected");
      }
      setGarmin({ email: "", password: "" });
      load();
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
        toast(res?.message ?? "Nothing to import");
      }
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
          {p.garmin_enabled && (
            <button
              type="button"
              onClick={importFromGarmin}
              className="px-4 py-2 rounded-lg ring-1 ring-slate-700 text-slate-200 hover:bg-slate-800 text-sm"
            >
              Import from Garmin
            </button>
          )}
          {p.garmin_enabled && (
            <span className="text-xs text-slate-500">
              Pulls name, height, weight, birth year, and sex from your Garmin
              account.
            </span>
          )}
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold">Garmin Connect</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-lg">
              Recommended: connect via browser login. We open a local Chromium
              window where you sign in (and solve Garmin's captcha) once. We
              store the session cookies on your machine and reuse them for
              every future sync — no passwords, captcha-proof.
            </p>
          </div>
          {browserSession ? (
            <span className="pill bg-emerald-400/10 text-emerald-300 ring-emerald-400/30">
              Browser session active
            </span>
          ) : p.garmin_enabled ? (
            <span className="pill bg-amber-400/10 text-amber-300 ring-amber-400/30">
              Password-only (may fail)
            </span>
          ) : (
            <span className="pill bg-slate-700/40 text-slate-400 ring-slate-600/50">
              Not connected
            </span>
          )}
        </div>

        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
          <div className="text-sm font-medium text-cyan-200">
            {browserSession
              ? "Garmin is connected via browser session"
              : "Connect Garmin (browser login — captcha-proof)"}
          </div>
          <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
            <li>Click the button below — a Chromium window will open.</li>
            <li>Sign in to Garmin Connect there (email, password, captcha, MFA if any).</li>
            <li>Wait until you see your Garmin dashboard, then come back here.</li>
          </ol>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={connectGarminBrowser}
              disabled={browserConnecting}
              className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {browserConnecting
                ? "Waiting for login…"
                : browserSession
                ? "Re-connect Garmin"
                : "Connect Garmin (browser)"}
            </button>
            {browserSession && (
              <button
                type="button"
                onClick={disconnectBrowser}
                className="px-4 py-2 rounded-lg ring-1 ring-slate-700 text-slate-300 hover:bg-slate-800 text-sm"
              >
                Disconnect session
              </button>
            )}
          </div>
        </div>

        <details className="group">
          <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300 select-none">
            Advanced: save password instead (fragile — fails if Garmin shows captcha)
          </summary>
          <div className="mt-3 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="label">Garmin email</label>
                <input
                  className="input"
                  value={garmin.email}
                  onChange={(e) =>
                    setGarmin({ ...garmin, email: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">Garmin password</label>
                <input
                  type="password"
                  className="input"
                  value={garmin.password}
                  onChange={(e) =>
                    setGarmin({ ...garmin, password: e.target.value })
                  }
                />
              </div>
            </div>
            <button
              type="button"
              onClick={connectGarmin}
              className="px-4 py-2 rounded-lg ring-1 ring-slate-700 text-slate-200 hover:bg-slate-800 text-sm"
            >
              Save credentials
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}
