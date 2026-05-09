import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Zap } from "lucide-react";
import { supabase } from "../supabaseClient";

export default function ResetPassword() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return toast.error("Passwords do not match");
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated — please sign in");
      await supabase.auth.signOut();
      nav("/login", { replace: true });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
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

        <div className="card card-accent">
          <h1 className="text-2xl mb-1">Set new password</h1>
          {!ready ? (
            <p className="text-sm text-slate-400 mt-2">Verifying reset link…</p>
          ) : (
            <>
              <p className="text-sm text-slate-400 mb-6">Choose a strong password for your account.</p>
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label className="label">New password</label>
                  <input className="input" type="password" required minLength={6} value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
                </div>
                <div>
                  <label className="label">Confirm password</label>
                  <input className="input" type="password" required minLength={6} value={confirm}
                    onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
                </div>
                <button className="btn-primary w-full" disabled={busy}>
                  {busy ? "Updating…" : "Update password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
