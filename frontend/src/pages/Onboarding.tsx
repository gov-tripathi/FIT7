import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Zap } from "lucide-react";
import { http } from "../api";
import { useAuth } from "../context/AuthContext";

const GOALS = ["weight_loss", "muscle_gain", "performance", "recovery", "maintenance"] as const;

export default function Onboarding() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    display_name: "",
    goal: "" as string,
    height_cm: "" as string | number,
    weight_kg: "" as string | number,
    birth_year: "" as string | number,
    sex: "" as string,
  });

  const set = (k: keyof typeof form, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.display_name.trim()) return toast.error("Display name is required");
    setBusy(true);
    try {
      await http.patch("/profile", {
        display_name: form.display_name.trim(),
        goal: form.goal || undefined,
        height_cm: form.height_cm ? Number(form.height_cm) : undefined,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : undefined,
        birth_year: form.birth_year ? Number(form.birth_year) : undefined,
        sex: form.sex || undefined,
      });
      toast.success("Profile saved — welcome to FitFuel!");
      nav("/", { replace: true });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="relative h-14 w-14 rounded-xl bg-gradient-to-br from-volt-400 via-brand-400 to-ember-400 flex items-center justify-center shadow-glow-volt">
            <div className="absolute inset-[3px] rounded-lg bg-slate-950 flex items-center justify-center">
              <Zap className="h-7 w-7 text-volt-400" strokeWidth={2.5} />
            </div>
          </div>
          <div>
            <div className="font-display text-3xl font-bold uppercase tracking-brutal leading-none">
              Fit<span className="text-volt-400">Fuel</span>
            </div>
            <div className="text-[10px] uppercase tracking-brutal text-slate-500 mt-1.5 font-display">
              Move · Fuel · Optimize
            </div>
          </div>
        </div>

        <div className="card card-accent space-y-5">
          <div>
            <h1 className="text-2xl mb-1">Set up your profile</h1>
            <p className="text-sm text-slate-400">
              Welcome{user?.email ? `, ${user.email}` : ""}! Tell us a bit about yourself so we can personalise your experience.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Display name *</label>
              <input className="input" placeholder="Your name" required
                value={form.display_name} onChange={(e) => set("display_name", e.target.value)} />
            </div>

            <div>
              <label className="label">Fitness goal</label>
              <select className="input" value={form.goal} onChange={(e) => set("goal", e.target.value)}>
                <option value="">Select a goal…</option>
                {GOALS.map((g) => (
                  <option key={g} value={g}>{g.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Height (cm)</label>
                <input className="input" type="number" placeholder="175"
                  value={form.height_cm} onChange={(e) => set("height_cm", e.target.value)} />
              </div>
              <div>
                <label className="label">Weight (kg)</label>
                <input className="input" type="number" placeholder="70"
                  value={form.weight_kg} onChange={(e) => set("weight_kg", e.target.value)} />
              </div>
              <div>
                <label className="label">Birth year</label>
                <input className="input" type="number" placeholder="1990"
                  value={form.birth_year} onChange={(e) => set("birth_year", e.target.value)} />
              </div>
              <div>
                <label className="label">Sex</label>
                <select className="input" value={form.sex} onChange={(e) => set("sex", e.target.value)}>
                  <option value="">Select…</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <button className="btn-primary w-full" disabled={busy}>
              {busy ? "Saving…" : "Save & continue →"}
            </button>
          </form>

          <div className="text-center">
            <button onClick={() => nav("/", { replace: true })}
              className="text-sm text-slate-500 hover:text-slate-300 transition">
              Skip for now →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
