import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Sparkles, Check, X, ShoppingBag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { http } from "../api";
import type { SupplementSuggestion } from "../types";

const categoryColor: Record<string, string> = {
  protein: "bg-brand-500/10 text-brand-300 ring-brand-500/30",
  recovery: "bg-lime-400/10 text-lime-400 ring-lime-400/30",
  sleep: "bg-indigo-400/10 text-indigo-300 ring-indigo-400/30",
  energy: "bg-amber-400/10 text-amber-300 ring-amber-400/30",
  diet: "bg-rose-400/10 text-rose-300 ring-rose-400/30",
};

export default function AIInsights() {
  const nav = useNavigate();
  const [items, setItems] = useState<SupplementSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () =>
    http.get<SupplementSuggestion[]>("/ai/suggestions").then(setItems).catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const generate = async () => {
    setLoading(true);
    try {
      await http.post("/ai/suggest");
      toast.success("New insights ready");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const act = async (id: string, status: "accepted" | "dismissed") => {
    try {
      await http.patch(`/ai/suggestions/${id}`, { status });
      toast.success(status === "accepted" ? "Accepted" : "Dismissed");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="speed-chip">Coach</span>
            <span className="text-[11px] font-display uppercase tracking-brutal text-slate-500">
              Powered by Claude
            </span>
          </div>
          <h1 className="section-title text-3xl sm:text-4xl">AI Insights</h1>
          <p className="text-sm text-slate-400 mt-3">
            Claude reads your last 7 days of training, sleep, and fuel to call
            your next play.
          </p>
        </div>
        <button className="btn-primary" onClick={generate} disabled={loading}>
          <Sparkles className="h-4 w-4" />
          {loading ? "Thinking…" : "Generate insight"}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="card text-center py-16 text-slate-400">
          No insights yet. Hit <span className="text-brand-400">Generate insight</span> — it's free in dev mode.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((s) => (
            <div key={s.id} className="card">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs text-slate-500">
                  {new Date(s.generated_at).toLocaleString()}
                </div>
                <span
                  className={`pill ${
                    s.status === "pending"
                      ? "bg-slate-800/80 text-slate-300 ring-slate-700"
                      : s.status === "accepted" || s.status === "ordered"
                      ? "bg-lime-400/10 text-lime-400 ring-lime-400/30"
                      : "bg-rose-500/10 text-rose-300 ring-rose-500/30"
                  }`}
                >
                  {s.status}
                </span>
              </div>

              <div className="space-y-3">
                {s.suggestions.map((item, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-slate-800 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`pill ring-1 ${
                              categoryColor[item.category] ??
                              "bg-slate-800/80 text-slate-300 ring-slate-700"
                            }`}
                          >
                            {item.category}
                          </span>
                          <div className="font-semibold">{item.name}</div>
                        </div>
                        <div className="text-sm text-slate-400 mt-2">
                          {item.reason}
                        </div>
                        <div className="text-xs text-slate-500 mt-2">
                          <span className="text-slate-400">Dose:</span> {item.dose}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {s.status === "pending" && (
                <div className="mt-4 flex items-center gap-2">
                  <button className="btn-primary" onClick={() => act(s.id, "accepted")}>
                    <Check className="h-4 w-4" /> Accept
                  </button>
                  <button className="btn-ghost" onClick={() => act(s.id, "dismissed")}>
                    <X className="h-4 w-4" /> Dismiss
                  </button>
                </div>
              )}
              {s.status === "accepted" && (
                <div className="mt-4">
                  <button
                    className="btn-primary"
                    onClick={() =>
                      nav("/orders", {
                        state: {
                          queries: s.suggestions.map((i) => i.name),
                          suggestion_id: s.id,
                        },
                      })
                    }
                  >
                    <ShoppingBag className="h-4 w-4" /> Order now
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
