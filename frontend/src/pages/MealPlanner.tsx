import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CalendarRange, ShoppingBag, Sparkles } from "lucide-react";
import { http } from "../api";
import type { MealItem, MealPlan } from "../types";

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export default function MealPlanner() {
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    http.get<MealPlan | null>("/planner/current").then(setPlan).catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const r = await http.post<MealPlan>("/planner/generate", {});
      setPlan(r);
      toast.success("Meal plan generated");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="speed-chip">Gameplan</span>
            <span className="text-[11px] font-display uppercase tracking-brutal text-slate-500">
              7 days
            </span>
          </div>
          <h1 className="section-title text-3xl sm:text-4xl">Meal Planner</h1>
          <p className="text-sm text-slate-400 mt-3">
            Claude builds a 7-day plan around your calorie target and goal.
          </p>
        </div>
        <button className="btn-primary" onClick={generate} disabled={busy}>
          <Sparkles className="h-4 w-4" />
          {busy ? "Building…" : plan ? "Regenerate plan" : "Generate plan"}
        </button>
      </div>

      {!plan ? (
        <div className="card text-center py-16 text-slate-400">
          <CalendarRange className="h-10 w-10 mx-auto mb-3 text-slate-600" />
          No plan yet this week.
        </div>
      ) : (
        <>
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400">
                  Week of {plan.week_start}
                </div>
                <div className="font-semibold">
                  Goal: {plan.goal?.replace("_", " ")} · Target {plan.calorie_target} kcal/day
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3">
              {DAYS.map((d) => {
                const day = plan.plan_json[d];
                if (!day) return null;
                const total =
                  (day.breakfast?.calories ?? 0) +
                  (day.lunch?.calories ?? 0) +
                  (day.dinner?.calories ?? 0) +
                  (day.snacks?.reduce((s, m) => s + m.calories, 0) ?? 0);
                return (
                  <div key={d} className="rounded-xl border border-slate-800 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold capitalize">{d}</div>
                      <div className="text-[10px] text-slate-500">{total} kcal</div>
                    </div>
                    <Meal label="Breakfast" m={day.breakfast} />
                    <Meal label="Lunch" m={day.lunch} />
                    <Meal label="Dinner" m={day.dinner} />
                    {day.snacks?.map((s, i) => (
                      <Meal key={i} label="Snack" m={s} />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {plan.shopping_list && (
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <ShoppingBag className="h-4 w-4 text-brand-400" />
                <h3 className="font-semibold">Shopping list</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                {Object.entries(plan.shopping_list).map(([k, v]) => (
                  <div key={k}>
                    <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">
                      {k}
                    </div>
                    <ul className="space-y-1 text-sm text-slate-200">
                      {(v ?? []).map((it, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="h-1 w-1 rounded-full bg-brand-400" />
                          {it}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Meal({ label, m }: { label: string; m?: MealItem }) {
  if (!m) return null;
  return (
    <div className="rounded-lg bg-slate-900/50 border border-slate-800 p-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="text-xs font-medium leading-snug">{m.name}</div>
      <div className="text-[10px] text-slate-500 mt-1">
        {m.calories} kcal · P{m.protein_g}g
      </div>
    </div>
  );
}
