import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Auto-close the mobile drawer on route change so tapping a link dismisses it.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Prevent background scroll while the mobile drawer is open.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen md:flex">
      <Sidebar mobileOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onOpenMenu={() => setMenuOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-10 max-w-7xl w-full mx-auto pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
