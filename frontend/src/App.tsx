import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
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
