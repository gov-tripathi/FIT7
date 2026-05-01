import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import toast from "react-hot-toast";
import { Target } from "lucide-react";
import { http } from "../api";
import type { DailyTarget, NutritionSummary } from "../types";

export default function Nutrition() {
  const [summary, setSummary] = useState<NutritionSummary | null>(null);
  const [weekly, setWeekly] = useState<NutritionSummary[]>([]);
  const [target, setTarget] = useState<DailyTarget | null>(null);
  const [form, setForm] = useState<DailyTarget>({
    calories_target: 2200,
    protein_g: 160,
    carbs_g: 230,
    fat_g: 70,
    water_ml: 2500,
  });

  const load = async () => {
    try {
      const [s, w, t] = await Promise.all([
        http.get<NutritionSummary>("/nutrition/summary"),
        http.get<NutritionSummary[]>("/nutrition/weekly"),
        http.get<DailyTarget | null>("/nutrition/targets"),
      ]);
      setSummary(s);
      setWeekly(w);
      setTarget(t);
      if (t) setForm(t);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener("fitfuel:synced", h);
    return () => window.removeEventListener("fitfuel:synced", h);
  }, []);

  const saveTarget = async () => {
    try {
      await http.post("/nutrition/targets", form);
      toast.success("Target saved");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const chartData = weekly.map((d) => ({
    date: d.date.slice(5),
    consumed: d.calories_consumed,
    burned: d.calories_burned,
    net: d.net_calories,
  }));

  const progress = summary && summary.calories_target
    ? Math.min(100, Math.round((summary.calories_consumed / summary.calories_target) * 100))
    : 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="speed-chip">Fuel</span>
          <span className="text-[11px] font-display uppercase tracking-brutal text-slate-500">
            Intake vs burn
          </span>
        </div>
        <h1 className="section-title text-3xl sm:text-4xl">Nutrition</h1>
        <p className="text-sm text-slate-400 mt-3">
          Calorie balance, macros, and weekly trends.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-3 sm:gap-4">
        <div className="card lg:col-span-2">
          <h3 className="font-semibold mb-3">Today</h3>
          {summary ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-3xl sm:text-4xl font-bold">
                    {summary.calories_consumed}
                  </div>
                  <div className="text-sm text-slate-400">
                    of {summary.calories_target || "—"} kcal
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base sm:text-lg font-medium">
                    {summary.net_calories >= 0 ? "+" : ""}
                    {summary.net_calories} kcal net
                  </div>
                  <div className="text-xs text-slate-500">
                    minus {summary.calories_burned} burned
                  </div>
                </div>
              </div>
              <div className="mt-4 h-3 rounded-full bg-slate-800 overflow-hidden relative go-bar">
                <div
                  className="h-full bg-gradient-to-r from-brand-400 via-volt-400 to-ember-400 transition-[width] duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-6 grid grid-cols-3 gap-4">
                <Macro label="Protein" value={summary.protein_g} target={target?.protein_g} color="bg-brand-400" />
                <Macro label="Carbs" value={summary.carbs_g} target={target?.carbs_g} color="bg-volt-400" />
                <Macro label="Fat" value={summary.fat_g} target={target?.fat_g} color="bg-ember-400" />
              </div>
            </>
          ) : (
            <div className="text-slate-500 py-10 text-center">Loading…</div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Target className="h-4 w-4 text-brand-400" />
            <h3 className="font-semibold">Daily target</h3>
          </div>
          <div className="space-y-3">
            <NumberField label="Calories" value={form.calories_target} onChange={(v) => setForm({ ...form, calories_target: v })} />
            <NumberField label="Protein (g)" value={form.protein_g ?? 0} onChange={(v) => setForm({ ...form, protein_g: v })} />
            <NumberField label="Carbs (g)" value={form.carbs_g ?? 0} onChange={(v) => setForm({ ...form, carbs_g: v })} />
            <NumberField label="Fat (g)" value={form.fat_g ?? 0} onChange={(v) => setForm({ ...form, fat_g: v })} />
            <button className="btn-primary w-full" onClick={saveTarget}>
              Save target
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-4">This week</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
            <YAxis stroke="#64748b" fontSize={12} />
            <Tooltip
              contentStyle={{
                background: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: 12,
              }}
            />
            <Bar dataKey="consumed" fill="#22d3ee" radius={[6, 6, 0, 0]} />
            <Bar dataKey="burned" fill="#ff6b35" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Macro({
  label,
  value,
  target,
  color,
}: {
  label: string;
  value: number;
  target?: number;
  color: string;
}) {
  const pct = target ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="font-display text-[11px] uppercase tracking-brutal text-slate-400">
          {label}
        </span>
        <span className="text-xs font-mono tabular-nums text-slate-400">
          {Math.round(value)}g{target ? ` / ${target}g` : ""}
        </span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-[width] duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        className="input"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
