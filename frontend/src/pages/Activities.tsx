import { useEffect, useState } from "react";
import { http } from "../api";
import type { Activity } from "../types";
import {
  Bike,
  Dumbbell,
  Footprints,
  Activity as ActivityIcon,
  Waves,
} from "lucide-react";
import WorkoutFileUpload from "../components/WorkoutFileUpload";

const icons: Record<string, typeof ActivityIcon> = {
  running: Footprints,
  cycling: Bike,
  swimming: Waves,
  walking: Footprints,
  strength_training: Dumbbell,
};

export default function Activities() {
  const [items, setItems] = useState<Activity[]>([]);
  const [source, setSource] = useState<"all" | "garmin" | "strava">("all");

  useEffect(() => {
    const load = () =>
      http.get<Activity[]>("/activities?limit=60").then(setItems).catch(() => {});
    load();
    const h = () => load();
    window.addEventListener("fitfuel:synced", h);
    return () => window.removeEventListener("fitfuel:synced", h);
  }, []);

  const filtered = source === "all" ? items : items.filter((a) => a.source === source);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="speed-chip">Log</span>
          <span className="text-[11px] font-display uppercase tracking-brutal text-slate-500">
            All sessions
          </span>
        </div>
        <h1 className="section-title text-3xl sm:text-4xl">Activities</h1>
        <p className="text-sm text-slate-400 mt-3">
          Every workout Garmin recorded — pace, power, payoff.
        </p>
      </div>

      <WorkoutFileUpload />

      {/* Source filter */}
      <div className="flex items-center gap-2">
        {(["all", "garmin", "strava"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              source === s
                ? s === "strava"
                  ? "bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40"
                  : "bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/40"
                : "bg-slate-800/60 text-slate-400 hover:text-slate-200 ring-1 ring-slate-700"
            }`}
          >
            {s === "all" ? "All sources" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-16 text-slate-400">
          {source !== "all"
            ? `No ${source} activities found. Connect ${source.charAt(0).toUpperCase() + source.slice(1)} in Settings.`
            : "No activities yet. Drop a workout file above, or tap Sync Garmin in the top bar."}
        </div>
      ) : (
        <div className="card divide-y divide-slate-800">
          {filtered.map((a) => {
            const Icon = icons[a.type] ?? ActivityIcon;
            return (
              <div
                key={a.id}
                className="flex items-start sm:items-center gap-3 sm:gap-4 py-4 first:pt-0 last:pb-0"
              >
                <div className="h-10 w-10 rounded-xl bg-brand-500/10 ring-1 ring-brand-500/30 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-brand-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <div className="font-medium capitalize truncate max-w-full">
                      {a.name ?? a.type.replace("_", " ")}
                    </div>
                    <span className="pill bg-slate-800/80 text-slate-300 ring-slate-700">
                      {a.type.replace("_", " ")}
                    </span>
                    {a.source === "strava" && (
                      <span className="pill bg-orange-500/10 text-orange-300 ring-orange-500/30 text-[10px]">Strava</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{a.date}</div>
                  {/* Mobile: inline stats row */}
                  <div className="grid grid-cols-4 gap-2 mt-3 sm:hidden">
                    <Stat
                      label="Dist"
                      value={a.distance_km ? `${a.distance_km}km` : "—"}
                    />
                    <Stat
                      label="Time"
                      value={a.duration_mins ? `${Math.round(a.duration_mins)}m` : "—"}
                    />
                    <Stat
                      label="Kcal"
                      value={a.calories_burned?.toLocaleString() ?? "—"}
                    />
                    <Stat label="HR" value={a.avg_hr ? `${a.avg_hr}` : "—"} />
                  </div>
                </div>
                {/* Desktop: right-aligned stats */}
                <div className="hidden sm:grid grid-cols-4 gap-6 text-right shrink-0">
                  <Stat label="Distance" value={a.distance_km ? `${a.distance_km} km` : "—"} />
                  <Stat label="Duration" value={a.duration_mins ? `${Math.round(a.duration_mins)} min` : "—"} />
                  <Stat label="Kcal" value={a.calories_burned?.toLocaleString() ?? "—"} />
                  <Stat label="Avg HR" value={a.avg_hr ? `${a.avg_hr}` : "—"} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="text-xs sm:text-sm font-medium truncate">{value}</div>
    </div>
  );
}
