import { ReactNode } from "react";
import { LucideIcon, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import clsx from "clsx";

type Tone = "neutral" | "positive" | "negative" | "warning";

const deltaTone: Record<Tone, string> = {
  neutral: "text-slate-400 bg-slate-800/60 ring-slate-700/80",
  positive: "text-emerald-300 bg-emerald-500/10 ring-emerald-500/20",
  negative: "text-rose-300 bg-rose-500/10 ring-rose-500/20",
  warning: "text-amber-300 bg-amber-500/10 ring-amber-500/20",
};

const sparkStroke: Record<Tone, string> = {
  neutral: "#64748b",
  positive: "#34d399",
  negative: "#fb7185",
  warning: "#f59e0b",
};

export default function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  delta,
  deltaDirection,
  tone = "neutral",
  trend,
  loading,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  delta?: string;
  deltaDirection?: "up" | "down" | "flat";
  tone?: Tone;
  trend?: number[];
  loading?: boolean;
  children?: ReactNode;
}) {
  const hasData =
    value !== "—" && value !== "" && value !== null && value !== undefined;

  const trendData = trend?.length
    ? trend.map((v, i) => ({ i, v: Number.isFinite(v) ? v : 0 }))
    : undefined;

  const DeltaIcon =
    deltaDirection === "up"
      ? TrendingUp
      : deltaDirection === "down"
      ? TrendingDown
      : Minus;

  return (
    <div
      className={clsx(
        "group relative rounded-xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-sm",
        "p-4 sm:p-5 transition-all duration-200",
        "hover:border-slate-700 hover:bg-slate-900/60"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-slate-400 leading-tight">
            {label}
          </div>
          <div
            className={clsx(
              "mt-2 font-mono font-semibold tabular-nums tracking-tight",
              "text-2xl sm:text-[28px] leading-none",
              hasData ? "text-slate-50" : "text-slate-600"
            )}
          >
            {loading ? (
              <span className="inline-block h-7 w-16 rounded bg-slate-800/80 animate-pulse" />
            ) : (
              value
            )}
          </div>
          {(hint || delta) && (
            <div className="mt-2 flex items-center gap-1.5 text-[12px] text-slate-500 leading-none">
              {delta && (
                <span
                  className={clsx(
                    "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 ring-1 font-medium text-[11px]",
                    deltaTone[tone]
                  )}
                >
                  <DeltaIcon className="h-3 w-3" strokeWidth={2.5} />
                  {delta}
                </span>
              )}
              {hint && <span className="truncate">{hint}</span>}
            </div>
          )}
        </div>
        <Icon
          className="h-4 w-4 text-slate-500 shrink-0 mt-0.5"
          strokeWidth={1.75}
        />
      </div>

      {trendData && trendData.length > 1 && (
        <div className="-mx-4 sm:-mx-5 -mb-4 sm:-mb-5 mt-3 h-10 opacity-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={trendData}
              margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient
                  id={`spark-${tone}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={sparkStroke[tone]}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="100%"
                    stopColor={sparkStroke[tone]}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={sparkStroke[tone]}
                strokeWidth={1.5}
                fill={`url(#spark-${tone})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
