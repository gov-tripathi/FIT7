import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Search, Trash2, Plus } from "lucide-react";
import { http } from "../api";
import type { FoodLog, FoodSearchResult } from "../types";

const MEAL_TYPES = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "pre_workout",
  "post_workout",
] as const;

export default function FoodLogPage() {
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [picked, setPicked] = useState<FoodSearchResult | null>(null);
  const [mealType, setMealType] = useState<(typeof MEAL_TYPES)[number]>("breakfast");
  const [portion, setPortion] = useState(100);
  const [searching, setSearching] = useState(false);

  const load = () =>
    http.get<FoodLog[]>("/food/logs").then(setLogs).catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const search = async () => {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const r = await http.get<FoodSearchResult[]>(
        `/food/search?q=${encodeURIComponent(q)}`
      );
      setResults(r);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const log = async () => {
    if (!picked) return;
    const scale = portion / 100;
    const body = {
      meal_type: mealType,
      food_name: picked.food_name,
      brand: picked.brand,
      barcode: picked.barcode,
      openfoodfacts_id: picked.openfoodfacts_id,
      portion_g: portion,
      calories: Math.round((picked.calories_per_100g ?? 0) * scale),
      protein_g: picked.protein_g_per_100g ? +(picked.protein_g_per_100g * scale).toFixed(1) : undefined,
      carbs_g: picked.carbs_g_per_100g ? +(picked.carbs_g_per_100g * scale).toFixed(1) : undefined,
      fat_g: picked.fat_g_per_100g ? +(picked.fat_g_per_100g * scale).toFixed(1) : undefined,
      fiber_g: picked.fiber_g_per_100g ? +(picked.fiber_g_per_100g * scale).toFixed(1) : undefined,
    };
    try {
      await http.post("/food/log", body);
      toast.success(`Logged ${picked.food_name}`);
      setPicked(null);
      setQ("");
      setResults([]);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    await http.del(`/food/logs/${id}`);
    toast.success("Removed");
    load();
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="speed-chip">Refuel</span>
          <span className="text-[11px] font-display uppercase tracking-brutal text-slate-500">
            Log a meal
          </span>
        </div>
        <h1 className="section-title text-3xl sm:text-4xl">Food Log</h1>
        <p className="text-sm text-slate-400 mt-3">
          Search Open Food Facts and log meals in seconds.
        </p>
      </div>

      <div className="card">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
            <input
              className="input pl-10"
              placeholder="Search foods…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
          </div>
          <button
            className="btn-primary shrink-0"
            onClick={search}
            disabled={searching}
          >
            {searching ? "…" : "Search"}
          </button>
        </div>

        {results.length > 0 && (
          <div className="mt-4 grid sm:grid-cols-2 gap-3 max-h-96 overflow-auto pr-1">
            {results.map((r) => (
              <button
                key={r.openfoodfacts_id}
                onClick={() => setPicked(r)}
                className={`text-left rounded-xl border p-3 transition ${
                  picked?.openfoodfacts_id === r.openfoodfacts_id
                    ? "border-brand-500 bg-brand-500/10"
                    : "border-slate-800 hover:border-slate-600"
                }`}
              >
                <div className="flex items-center gap-3">
                  {r.image_url ? (
                    <img
                      src={r.image_url}
                      alt=""
                      className="h-12 w-12 rounded-lg object-cover bg-slate-800"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-slate-800" />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {r.food_name}
                    </div>
                    {r.brand && (
                      <div className="text-xs text-slate-500 truncate">{r.brand}</div>
                    )}
                    <div className="text-xs text-slate-400 mt-1">
                      {r.calories_per_100g ?? "?"} kcal · P{r.protein_g_per_100g ?? "?"}g
                      · C{r.carbs_g_per_100g ?? "?"}g · F{r.fat_g_per_100g ?? "?"}g /100g
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {picked && (
          <div className="mt-4 rounded-xl border border-slate-800 p-4">
            <div className="flex flex-wrap items-end gap-3 sm:gap-4">
              <div className="flex-1 min-w-full sm:min-w-[200px]">
                <div className="text-sm font-medium">{picked.food_name}</div>
                {picked.brand && (
                  <div className="text-xs text-slate-500">{picked.brand}</div>
                )}
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="label">Portion (g)</label>
                <input
                  type="number"
                  className="input w-full sm:w-28"
                  value={portion}
                  onChange={(e) => setPortion(Number(e.target.value))}
                />
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="label">Meal</label>
                <select
                  className="input w-full sm:w-44"
                  value={mealType}
                  onChange={(e) => setMealType(e.target.value as typeof MEAL_TYPES[number])}
                >
                  {MEAL_TYPES.map((m) => (
                    <option key={m} value={m}>
                      {m.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn-primary w-full sm:w-auto" onClick={log}>
                <Plus className="h-4 w-4" /> Log
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="font-semibold mb-4">Recent logs</h3>
        {logs.length === 0 ? (
          <div className="text-slate-500 text-sm text-center py-10">
            Nothing logged yet — search above to add your first meal.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {logs.map((l) => (
              <div key={l.id} className="flex items-center gap-3 py-3">
                <span className="pill bg-slate-800/80 text-slate-300 ring-slate-700 capitalize shrink-0">
                  {l.meal_type.replace("_", " ")}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{l.food_name}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {l.portion_g}g · {l.calories} kcal · P{l.protein_g ?? 0}g · C{l.carbs_g ?? 0}g · F{l.fat_g ?? 0}g
                  </div>
                </div>
                <button
                  className="btn-danger !px-3 shrink-0"
                  onClick={() => remove(l.id)}
                  aria-label="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
