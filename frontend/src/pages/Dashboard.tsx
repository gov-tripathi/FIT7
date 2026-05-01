import { useCallback, useEffect, useState } from "react";
import {
  Activity as ActivityIcon,
  BatteryCharging,
  Flame,
  Footprints,
  Gauge,
  Heart,
  Moon,
  TrendingUp,
  Utensils,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import clsx from "clsx";
import { http } from "../api";
import type { Activity, HealthMetric, NutritionSummary } from "../types";
import StatCard from "../components/StatCard";
import { Link } from "react-router-dom";

const CHART_TOOLTIP = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 12,
  color: "#e2e8f0",
};

export default function Dashboard() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [nutrition, setNutrition] = useState<NutritionSummary | null>(null);

  const load = useCallback(() => {
    http
      .get<Activity[]>("/activities?limit=60")
      .then(setActivities)
      .catch(() => {});
    http
      .get<HealthMetric[]>("/health/metrics?days=30")
      .then(setMetrics)
      .catch(() => {});
    http
      .get<NutritionSummary>("/nutrition/summary")
      .then(setNutrition)
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const refresh = () => load();
    window.addEventListener("fitfuel:synced", refresh);
    return () => window.removeEventListener("fitfuel:synced", refresh);
  }, [load]);

  const last = activities[0];
  const latestMetric = metrics[0];

  const last7Activities = activities.filter((a) => {
    const days = Math.floor(
      (Date.now() - new Date(a.date).getTime()) / 86_400_000
    );
    return days >= 0 && days < 7;
  });
  const weekKcal = last7Activities.reduce(
    (s, a) => s + (a.calories_burned ?? 0),
    0
  );
  const weekDist = last7Activities.reduce(
    (s, a) => s + (a.distance_km ?? 0),
    0
  );
  const weekMins = last7Activities.reduce(
    (s, a) => s + (a.duration_mins ?? 0),
    0
  );

  const last7Metrics = [...metrics].slice(0, 7).reverse();
  const last14Metrics = [...metrics].slice(0, 14).reverse();
  const last30Metrics = [...metrics].reverse();

  const sleepSeries = last7Metrics.map((m) => ({
    date: m.date.slice(5),
    hours: m.sleep_hours ?? 0,
  }));

  const burnSeries = [...activities]
    .slice(0, 12)
    .reverse()
    .map((a) => ({ date: a.date.slice(5), kcal: a.calories_burned ?? 0 }));

  const stressBatterySeries = last14Metrics.map((m) => ({
    date: m.date.slice(5),
    stress: m.stress_level ?? 0,
    battery: m.body_battery ?? 0,
  }));

  const vo2Series = last30Metrics
    .filter((m) => m.vo2_max != null)
    .map((m) => ({ date: m.date.slice(5), vo2: m.vo2_max }));

  const stepsSeries = last14Metrics.map((m) => ({
    date: m.date.slice(5),
    steps: m.steps ?? 0,
  }));

  const avgSteps = stepsSeries.length
    ? Math.round(
        stepsSeries.reduce((s, d) => s + d.steps, 0) / stepsSeries.length
      )
    : 0;

  const fmtDate = last ? formatActivityDate(last.date) : null;
  const fmtType = last?.type
    ? last.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  const vo2Delta =
    vo2Series.length > 1
      ? Number(
          (
            (vo2Series[vo2Series.length - 1].vo2 ?? 0) -
            (vo2Series[0].vo2 ?? 0)
          ).toFixed(1)
        )
      : null;

  const sleepDelta =
    sleepSeries.length >= 2
      ? Number(
          (
            sleepSeries[sleepSeries.length - 1].hours -
            sleepSeries[sleepSeries.length - 2].hours
          ).toFixed(1)
        )
      : null;

  return (
    <div className="space-y-6 sm:space-y-8">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[12px] font-medium text-slate-500 mb-1">
            Overview · Last 7 days
          </div>
          <h1
            className="text-[26px] sm:text-[32px] font-semibold tracking-tight text-slate-50"
            style={{
              fontFamily: '"Inter", system-ui, sans-serif',
              letterSpacing: "-0.02em",
              textTransform: "none",
            }}
          >
            {greeting()}
          </h1>
          <p className="text-sm text-slate-400 mt-1.5">
            Here's how your training and recovery are trending.
          </p>
        </div>
      </header>

      {/* Hero: last activity */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-sm p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-slate-800/80 ring-1 ring-slate-700/80 flex items-center justify-center">
              <ActivityIcon
                className="h-4 w-4 text-slate-300"
                strokeWidth={1.75}
              />
            </div>
            <div>
              <div className="text-[12px] text-slate-500 leading-none">
                Last activity
              </div>
              <div className="text-[15px] font-semibold text-slate-100 mt-1 leading-none">
                {fmtType ?? "No activity yet"}
              </div>
            </div>
          </div>
          {fmtDate && (
            <div className="text-[12px] text-slate-500">{fmtDate}</div>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
          <HeroStat
            label="Distance"
            value={last ? `${(last.distance_km ?? 0).toFixed(2)}` : "—"}
            unit="km"
          />
          <HeroStat
            label="Duration"
            value={last ? `${Math.round(last.duration_mins ?? 0)}` : "—"}
            unit="min"
          />
          <HeroStat
            label="Calories"
            value={last ? `${Math.round(last.calories_burned ?? 0)}` : "—"}
            unit="kcal"
          />
          <HeroStat
            label="Avg HR"
            value={last?.avg_hr ? `${last.avg_hr}` : "—"}
            unit="bpm"
          />
        </div>
        {!last && (
          <p className="mt-4 text-[13px] text-slate-500">
            Connect Garmin or upload a workout file to see your latest session.
          </p>
        )}
      </div>

      {/* Supporting stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon={Flame}
          label="Calories burned · 7d"
          value={weekKcal.toLocaleString()}
          hint={`${weekDist.toFixed(1)} km · ${Math.round(weekMins)} min`}
          trend={burnSeries.map((b) => b.kcal)}
          tone="warning"
        />
        <StatCard
          icon={Moon}
          label="Sleep last night"
          value={
            latestMetric?.sleep_hours
              ? `${latestMetric.sleep_hours.toFixed(1)}h`
              : "—"
          }
          hint={
            latestMetric?.sleep_score
              ? `Score ${latestMetric.sleep_score}`
              : "Not yet recorded"
          }
          trend={sleepSeries.map((s) => s.hours)}
          delta={sleepDelta != null ? `${sleepDelta > 0 ? "+" : ""}${sleepDelta}h` : undefined}
          deltaDirection={
            sleepDelta == null
              ? undefined
              : sleepDelta > 0
              ? "up"
              : sleepDelta < 0
              ? "down"
              : "flat"
          }
          tone={sleepDelta != null && sleepDelta >= 0 ? "positive" : "negative"}
        />
        <StatCard
          icon={Heart}
          label="HRV"
          value={latestMetric?.hrv ? `${latestMetric.hrv}` : "—"}
          hint={
            latestMetric?.hrv
              ? `ms${latestMetric.resting_hr ? ` · RHR ${latestMetric.resting_hr}` : ""}`
              : "Waiting on overnight data"
          }
          trend={last14Metrics.map((m) => m.hrv ?? 0).filter((v) => v > 0)}
          tone="neutral"
        />
        <StatCard
          icon={BatteryCharging}
          label="Body battery"
          value={latestMetric?.body_battery ?? "—"}
          hint={
            latestMetric?.stress_level != null
              ? `Stress ${latestMetric.stress_level}`
              : "Not yet recorded"
          }
          trend={stressBatterySeries.map((d) => d.battery)}
          tone="positive"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon={Footprints}
          label="Daily steps · 14d avg"
          value={avgSteps.toLocaleString()}
          hint={
            latestMetric?.steps
              ? `Today ${latestMetric.steps.toLocaleString()}`
              : "Sync to see today"
          }
          trend={stepsSeries.map((s) => s.steps)}
          tone="neutral"
        />
        <StatCard
          icon={Gauge}
          label="VO₂ max"
          value={latestMetric?.vo2_max ?? "—"}
          hint={vo2Delta != null ? "vs 30 days ago" : "Not yet recorded"}
          delta={vo2Delta != null ? `${vo2Delta > 0 ? "+" : ""}${vo2Delta}` : undefined}
          deltaDirection={
            vo2Delta == null
              ? undefined
              : vo2Delta > 0
              ? "up"
              : vo2Delta < 0
              ? "down"
              : "flat"
          }
          trend={vo2Series.map((v) => v.vo2 ?? 0)}
          tone={vo2Delta != null && vo2Delta >= 0 ? "positive" : "negative"}
        />
        <StatCard
          icon={ActivityIcon}
          label="Active minutes"
          value={latestMetric?.active_mins ?? "—"}
          hint={`${last7Activities.length} workouts this week`}
          tone="neutral"
        />
        <StatCard
          icon={Flame}
          label="Workouts · 7d"
          value={last7Activities.length}
          hint={
            last7Activities.length === 0
              ? "Take a rest day or log one"
              : `${Math.round(weekMins)} active min`
          }
          tone="neutral"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-3 sm:gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
            <h3 className="font-semibold text-sm sm:text-base">
              Calories burned per activity (last 12)
            </h3>
            <TrendingUp className="h-4 w-4 text-slate-500 shrink-0" />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={burnSeries}>
              <defs>
                <linearGradient id="burn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff6b35" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#ff6b35" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip contentStyle={CHART_TOOLTIP} />
              <Area
                type="monotone"
                dataKey="kcal"
                stroke="#ff6b35"
                strokeWidth={2}
                fill="url(#burn)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
            <h3 className="font-semibold text-sm sm:text-base">Sleep trend (7d)</h3>
            <Moon className="h-4 w-4 text-slate-500 shrink-0" />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={sleepSeries}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} domain={[4, 10]} />
              <Tooltip contentStyle={CHART_TOOLTIP} />
              <Line
                type="monotone"
                dataKey="hours"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={{ fill: "#22d3ee", r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
            <h3 className="font-semibold text-sm sm:text-base">
              Body Battery & Stress (14d)
            </h3>
            <BatteryCharging className="h-4 w-4 text-slate-500 shrink-0" />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={stressBatterySeries}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} domain={[0, 100]} />
              <Tooltip contentStyle={CHART_TOOLTIP} />
              <Line
                type="monotone"
                dataKey="battery"
                stroke="#d4ff00"
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="stress"
                stroke="#ff6b35"
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
            <h3 className="font-semibold text-sm sm:text-base">VO2 max trend (30d)</h3>
            <Gauge className="h-4 w-4 text-slate-500 shrink-0" />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={vo2Series}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
              <YAxis
                stroke="#64748b"
                fontSize={12}
                domain={["dataMin - 1", "dataMax + 1"]}
              />
              <Tooltip contentStyle={CHART_TOOLTIP} />
              <Line
                type="monotone"
                dataKey="vo2"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
            <h3 className="font-semibold text-sm sm:text-base">Daily steps (14d)</h3>
            <Footprints className="h-4 w-4 text-slate-500 shrink-0" />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stepsSeries}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip contentStyle={CHART_TOOLTIP} />
              <Bar
                dataKey="steps"
                fill="#d4ff00"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {nutrition && (
        <div className="card">
          <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
            <h3 className="font-semibold">Today's fuel</h3>
            <Link
              to="/food-log"
              className="text-sm text-brand-400 hover:text-brand-300 inline-flex items-center gap-1 shrink-0"
            >
              <Utensils className="h-4 w-4" />{" "}
              <span className="hidden sm:inline">Log food</span>
              <span className="sm:hidden">Log</span>
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <Metric
              label="Consumed"
              value={`${nutrition.calories_consumed} kcal`}
              hint={`${nutrition.calories_target || "—"} target`}
            />
            <Metric
              label="Burned"
              value={`${nutrition.calories_burned} kcal`}
              hint="Garmin activities"
            />
            <Metric
              label="Net"
              value={`${nutrition.net_calories >= 0 ? "+" : ""}${nutrition.net_calories} kcal`}
              hint={nutrition.net_calories > 0 ? "Surplus" : "Deficit"}
            />
            <Metric
              label="Protein"
              value={`${nutrition.protein_g ?? 0} g`}
              hint={`Carbs ${nutrition.carbs_g ?? 0}g · Fat ${nutrition.fat_g ?? 0}g`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 p-4">
      <div className="text-xs uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

function HeroStat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  const hasData = value !== "—";
  return (
    <div>
      <div className="text-[11px] text-slate-500 leading-none">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span
          className={clsx(
            "font-mono font-semibold tabular-nums tracking-tight text-2xl sm:text-[26px] leading-none",
            hasData ? "text-slate-50" : "text-slate-600"
          )}
        >
          {value}
        </span>
        {unit && hasData && (
          <span className="text-[12px] font-medium text-slate-500">{unit}</span>
        )}
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Still up?";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Good night";
}

function formatActivityDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
