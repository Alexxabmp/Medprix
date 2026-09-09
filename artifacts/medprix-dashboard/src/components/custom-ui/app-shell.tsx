import { useState } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import { Moon, Pill, Sun, X } from "lucide-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { navGroups } from "@/lib/data";
import type { ToastFn, UserRecord } from "@/lib/types";
import NotFound from "@/pages/not-found";
import AdminDashboardPage from "@/pages/admin-dashboard";
import CashierDashboardPage from "@/pages/cashier-dashboard";
import CashierReviewPage from "@/pages/cashier-review-page";
import InventoryPage from "@/pages/inventory";
import SupplierPage from "@/pages/supplier";
import ProcurementPage from "@/pages/procurement";
import WholesalePage from "@/pages/wholesale";
import SystemAdminPage from "@/pages/system-admin";
import UserManagementPage from "@/pages/user-management";

export function AppShell({
  dark,
  setDark,
  onToast,
  onLogout,
  role,
  users,
  setUsers,
  refreshUsers,
}: {
  dark: boolean;
  setDark: (value: boolean) => void;
  onToast: ToastFn;
  onLogout: () => void;
  role: string;
  users: UserRecord[];
  setUsers: (users: UserRecord[]) => void;
  refreshUsers: () => void;
}) {
  const [location] = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const storedFullName = localStorage.getItem("medprix-fullname");
  const storedUsername = localStorage.getItem("medprix-username");
  const displayName = storedFullName || storedUsername || "User";
  const displayInitials = displayName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const displayTitle =
    role === "admin"
      ? "Administrator"
      : role === "frontdesk"
        ? "Front Desk"
        : "Cashier";
  const currentUser = {
    initials: displayInitials,
    name: displayName,
    title: displayTitle,
  };

  return (
    <div className="app-shell">
      <div className="main-wrap">
        <header className="topbar">
          <div className="topbar-left">
            <Link
              href="/dashboard"
              className="brand"
              data-testid="link-medprix-home">
              <span className="brand-mark">
                <Pill size={16} strokeWidth={2.4} />
              </span>
              <span>Medprix</span>
            </Link>
          </div>
          <nav
            className="top-nav"
            aria-label="Primary navigation"
            data-testid="nav-primary">
            {navGroups
              .flatMap((group) => group.items)
              .filter((item) => item.roles.includes(role))
              .map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  data-testid={`link-${label.toLowerCase().replaceAll(" ", "-")}`}
                  className={`top-nav-item ${location === href ? "active" : ""}`}>
                  {label}
                </Link>
              ))}
          </nav>
          <div className="top-actions">
            <button
              className="icon-button"
              data-testid="button-theme-toggle"
              aria-label="Toggle dark mode"
              onClick={() => setDark(!dark)}>
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <div className="user-menu-wrap">
              <button
                className="avatar"
                data-testid="avatar-admin"
                aria-label="User menu"
                onClick={() => setShowUserMenu((v) => !v)}>
                {currentUser.initials}
              </button>
              {showUserMenu && (
                <>
                  <div
                    className="user-menu-backdrop"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="user-menu" data-testid="user-menu">
                    <div className="user-menu-info">
                      <span
                        className="avatar"
                        style={{
                          width: 36,
                          height: 36,
                          border: 0,
                          boxShadow: "none",
                          fontSize: 13,
                        }}>
                        {currentUser.initials}
                      </span>
                      <div>
                        <strong>{currentUser.name}</strong>
                        <span>{currentUser.title}</span>
                      </div>
                    </div>
                    <div className="user-menu-divider" />
                    <button
                      className="user-menu-item danger"
                      data-testid="button-logout"
                      onClick={() => {
                        setShowUserMenu(false);
                        onLogout();
                      }}>
                      <X size={14} /> Log out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="content">
          <Switch>
            <Route path="/">
              {role === "cashier" ? (
                <CashierDashboardPage onToast={onToast} />
              ) : (
                <AdminDashboardPage onToast={onToast} />
              )}
            </Route>
            <Route path="/dashboard">
              {role === "cashier" ? (
                <CashierDashboardPage onToast={onToast} />
              ) : (
                <AdminDashboardPage onToast={onToast} />
              )}
            </Route>
            <Route path="/pos">
              <CashierDashboardPage onToast={onToast} />
            </Route>
            <Route path="/review">
              <CashierReviewPage onToast={onToast} />
            </Route>
            <Route path="/inventory">
              <InventoryPage onToast={onToast} />
            </Route>
            <Route path="/supplier">
              <SupplierPage onToast={onToast} />
            </Route>
            <Route path="/procurement">
              <ProcurementPage onToast={onToast} />
            </Route>
            <Route path="/wholesale">
              <WholesalePage onToast={onToast} />
            </Route>
            <Route path="/system-ad">
              <SystemAdminPage onToast={onToast} />
            </Route>
            <Route path="/user-management">
              <UserManagementPage
                users={users}
                setUsers={setUsers}
                onToast={onToast}
              />
            </Route>
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>
    </div>
  );
}
