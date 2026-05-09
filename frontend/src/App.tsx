import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { supabase } from "./supabaseClient";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Activities from "./pages/Activities";
import Nutrition from "./pages/Nutrition";
import FoodLogPage from "./pages/FoodLog";
import AIInsights from "./pages/AIInsights";
import MealPlanner from "./pages/MealPlanner";
import Orders from "./pages/Orders";
import Settings from "./pages/Settings";
import ResetPassword from "./pages/ResetPassword";
import Onboarding from "./pages/Onboarding";

function Protected({ children }: { children: JSX.Element }) {
  const { session, isGuest, loading } = useAuth();
  if (loading)
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  if (!session && !isGuest) return <Navigate to="/login" replace />;
  return children;
}

function ProfileGate({ children }: { children: JSX.Element }) {
  const { session, isGuest } = useAuth();
  const [checked, setChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    if (!session || isGuest) { setChecked(true); return; }
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        if (!data?.display_name) setNeedsOnboarding(true);
        setChecked(true);
      }, () => setChecked(true));
  }, [session, isGuest]);

  useEffect(() => {
    if (checked && needsOnboarding) nav("/onboarding", { replace: true });
  }, [checked, needsOnboarding, nav]);

  if (!checked) return <div className="flex h-screen items-center justify-center text-slate-400">Loading…</div>;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/onboarding" element={<Protected><Onboarding /></Protected>} />
      <Route
        path="/"
        element={
          <Protected>
            <ProfileGate>
              <Layout />
            </ProfileGate>
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="activities" element={<Activities />} />
        <Route path="nutrition" element={<Nutrition />} />
        <Route path="food-log" element={<FoodLogPage />} />
        <Route path="ai" element={<AIInsights />} />
        <Route path="planner" element={<MealPlanner />} />
        <Route path="orders" element={<Orders />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
