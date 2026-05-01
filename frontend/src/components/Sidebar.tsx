import { NavLink } from "react-router-dom";
import {
  Activity,
  Apple,
  Brain,
  CalendarRange,
  LayoutDashboard,
  LogOut,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings as SettingsIcon,
  Utensils,
  X,
  Zap,
} from "lucide-react";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

type Item = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
};

const sections: { label: string; items: Item[] }[] = [
  {
    label: "Training",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/activities", label: "Activities", icon: Activity },
    ],
  },
  {
    label: "Fuel",
    items: [
      { to: "/nutrition", label: "Nutrition", icon: Apple },
      { to: "/food-log", label: "Food Log", icon: Utensils },
      { to: "/planner", label: "Meal Planner", icon: CalendarRange },
    ],
  },
  {
    label: "Assist",
    items: [
      { to: "/ai", label: "AI Insights", icon: Brain },
      { to: "/orders", label: "Orders", icon: Package },
    ],
  },
  {
    label: "Account",
    items: [{ to: "/settings", label: "Settings", icon: SettingsIcon }],
  },
];

const STORAGE_KEY = "fitfuel-sidebar-collapsed";

export default function Sidebar({
  mobileOpen = false,
  onClose,
}: {
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const { user, isGuest, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "true";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, collapsed ? "true" : "false");
  }, [collapsed]);

  const initial = (user?.email ?? "?").slice(0, 1).toUpperCase();

  return (
    <>
      <div
        onClick={onClose}
        className={clsx(
          "fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm transition-opacity md:hidden",
          mobileOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        )}
        aria-hidden="true"
      />

      <aside
        className={clsx(
          // Mobile drawer always opens at full width, regardless of the
          // desktop collapsed state.
          "fixed inset-y-0 left-0 z-50 w-64 max-w-[82vw] flex flex-col border-r border-slate-800/80",
          "bg-slate-950 transition-transform duration-200 md:transition-[width] md:duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "md:static md:translate-x-0 md:sticky md:top-0 md:h-screen md:bg-slate-950/80",
          collapsed ? "md:w-[60px]" : "md:w-64"
        )}
      >
        {/* Header */}
        <div
          className={clsx(
            "h-14 flex items-center border-b border-slate-800/80",
            collapsed ? "md:justify-center md:px-0" : "px-3 justify-between"
          )}
        >
          {(!collapsed || mobileOpen) && (
            <div className="flex items-center gap-2.5 min-w-0">
              <Logo />
              <div className="text-[15px] font-semibold tracking-tight leading-none">
                FitFuel
              </div>
            </div>
          )}

          {collapsed && !mobileOpen && (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="hidden md:flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
            >
              <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}

          {/* Desktop collapse toggle (visible when expanded) */}
          {!collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="hidden md:flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:text-slate-100 hover:bg-slate-800/60"
            >
              <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}

          {/* Mobile close */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="md:hidden -mr-1 p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav
          className={clsx(
            "flex-1 overflow-y-auto py-3 space-y-5",
            collapsed ? "md:px-1.5" : "px-2"
          )}
        >
          {sections.map((section) => (
            <div key={section.label}>
              <div
                className={clsx(
                  "px-2 mb-1 text-[11px] font-medium text-slate-500",
                  collapsed && "md:hidden"
                )}
              >
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map(({ to, label, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    onClick={onClose}
                    title={collapsed ? label : undefined}
                    className={({ isActive }) =>
                      clsx(
                        "group flex items-center rounded-md",
                        "text-[13.5px] font-medium transition",
                        collapsed
                          ? "md:justify-center md:h-9 md:w-9 md:mx-auto md:p-0 px-2 py-1.5 gap-2.5"
                          : "gap-2.5 px-2 py-1.5",
                        isActive
                          ? "bg-slate-800/80 text-slate-100"
                          : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                    <span className={clsx("truncate", collapsed && "md:hidden")}>
                      {label}
                    </span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User tile */}
        {user && (
          <div
            className={clsx(
              "border-t border-slate-800/80",
              collapsed ? "md:p-1.5 p-2" : "p-2"
            )}
          >
            <div
              className={clsx(
                "flex items-center rounded-md hover:bg-slate-800/50 transition",
                collapsed ? "md:justify-center md:p-1.5 p-2 gap-2" : "p-2 gap-2"
              )}
              title={collapsed ? user.email ?? undefined : undefined}
            >
              <div className="h-7 w-7 rounded-full bg-slate-800 ring-1 ring-slate-700 flex items-center justify-center text-[12px] font-semibold text-slate-200 shrink-0">
                {initial}
              </div>
              <div
                className={clsx(
                  "flex-1 min-w-0",
                  collapsed && "md:hidden"
                )}
              >
                <div className="text-[13px] font-medium text-slate-100 truncate">
                  {user.email}
                </div>
                <div className="text-[11px] text-slate-500">
                  {isGuest ? "Guest mode" : "Personal"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => signOut()}
                aria-label="Sign out"
                title={isGuest ? "Exit guest" : "Sign out"}
                className={clsx(
                  "p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-700/60",
                  collapsed && "md:hidden"
                )}
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

function Logo() {
  return (
    <div className="relative h-7 w-7 rounded-md bg-gradient-to-br from-volt-400 via-brand-400 to-ember-400 flex items-center justify-center shrink-0">
      <div className="absolute inset-[1.5px] rounded-[4px] bg-slate-950 flex items-center justify-center">
        <Zap className="h-3.5 w-3.5 text-volt-400" strokeWidth={2.5} />
      </div>
    </div>
  );
}
