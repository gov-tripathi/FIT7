import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { UserRound, Zap } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { session, isGuest, continueAsGuest } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session || isGuest) nav("/", { replace: true });
  }, [session, isGuest, nav]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/reset-password",
        });
        if (error) throw error;
        toast.success("Check your email for a reset link");
        setMode("signin");
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success("Welcome back");
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success("Check your email to confirm your account");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    await supabase.auth.signInWithOAuth({ provider: "google" });
  };

  const guest = () => {
    continueAsGuest();
    toast.success("Continuing as guest");
    nav("/", { replace: true });
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
          <h1 className="text-2xl mb-1">
            {mode === "signin" ? "Sign in" : mode === "signup" ? "Join the squad" : "Reset password"}
          </h1>
          <p className="text-sm text-slate-400 mb-6">
            {mode === "signin"
              ? "Welcome back — let's get moving."
              : mode === "signup"
              ? "Free forever, no credit card."
              : "Enter your email and we'll send you a reset link."}
          </p>

          {mode === "forgot" ? (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="label">Email</label>
                <input
                  className="input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </div>
              <button className="btn-primary w-full" disabled={busy}>
                {busy ? "…" : "Send reset link"}
              </button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className="text-sm text-slate-400 hover:text-slate-300 transition"
                >
                  ← Back to sign in
                </button>
              </div>
            </form>
          ) : (
            <>
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label className="label">Email</label>
                  <input
                    className="input"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="label">Password</label>
                    {mode === "signin" && (
                      <button
                        type="button"
                        onClick={() => setMode("forgot")}
                        className="text-xs text-slate-400 hover:text-brand-300"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <input
                    className="input"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={
                      mode === "signin" ? "current-password" : "new-password"
                    }
                    placeholder="••••••••"
                  />
                </div>
                <button className="btn-primary w-full" disabled={busy}>
                  {busy ? "…" : mode === "signin" ? "Sign in" : "Sign up"}
                </button>
              </form>

              <div className="my-4 flex items-center gap-2 text-xs text-slate-500">
                <div className="flex-1 h-px bg-slate-800" />
                or
                <div className="flex-1 h-px bg-slate-800" />
              </div>

              <div className="space-y-2">
                <button onClick={google} className="btn-ghost w-full">
                  Continue with Google
                </button>
                <button onClick={guest} className="btn-ghost w-full">
                  <UserRound className="h-4 w-4" /> Continue as guest
                </button>
              </div>

              <div className="text-center text-sm text-slate-400 mt-6">
                {mode === "signin" ? "New here?" : "Have an account?"}{" "}
                <button
                  onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                  className="text-brand-400 hover:text-brand-300"
                >
                  {mode === "signin" ? "Create an account" : "Sign in"}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          Guest mode keeps everything local. Connect Supabase in{" "}
          <span className="text-slate-300">.env</span> to save your data.
        </p>
      </div>
    </div>
  );
}
