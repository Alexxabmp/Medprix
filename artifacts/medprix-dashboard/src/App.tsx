import { clearTransactionSession } from "@/lib/pharmacy-store";
import { createFeedbackNotifier, type Feedback } from "@/lib/feedback";
import { useEffect, useMemo, useState } from "react";
import { Check, AlertTriangle, CircleAlert, X } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router as WouterRouter, useLocation } from "wouter";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/custom-ui/app-shell";
import LoginPage from "@/pages/login";
import { getAllowedHrefs, getDefaultRoute } from "@/lib/data";
import type { ToastFn, UserRecord } from "@/lib/types";

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={250}>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppContent />
          <Toaster />
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function AppContent() {
  const [location, setLocation] = useLocation();
  const [session, setSession] = useState(
    () => localStorage.getItem("medprix-session") === "active",
  );
  const [role, setRole] = useState(
    () => localStorage.getItem("medprix-role") || "",
  );
  const [dark, setDark] = useState(
    () => localStorage.getItem("medprix-theme") === "dark",
  );
  const [toast, setToast] = useState<Feedback | null>(null);
  const notifications = useMemo(() => createFeedbackNotifier(setToast), []);
  useEffect(() => () => notifications.dispose(), [notifications]);
  const [users, setUsers] = useState<UserRecord[]>(() => {
    try {
      const raw = localStorage.getItem("medprix_cached_users");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("medprix-theme", dark ? "dark" : "light");
  }, [dark]);

  const fetchUsers = () => {
    fetch("/api/users", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: any[]) => {
        if (!Array.isArray(data)) return;
        const mapped: UserRecord[] = data.map((user) => {
          const name = user.fullName || user.username;
          const initials = name
            .split(" ")
            .map((p: string) => p[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          return {
            id: user.id,
            initials,
            name,
            username: user.username,
            role:
              user.role === "Admin"
                ? "Administrator"
                : user.role === "FrontDesk"
                  ? "Front Desk"
                  : "Cashier",
            status: user.isActive === false ? "Inactive" : "Active",
            lastActive: user.lastLogin
              ? new Date(user.lastLogin).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
              : "Never",
            phone: user.contactNumber || "",
          };
        });
        setUsers(mapped);
        try { localStorage.setItem("medprix_cached_users", JSON.stringify(mapped)); } catch {}
      })
      .catch(() => {
        // Backend offline — users list stays empty
      });
  };

  useEffect(() => {
    if (!session || role !== "Admin") return;
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, role]);

  useEffect(() => {
    if (!session) return;

    const token = localStorage.getItem("medprix-token");
    fetch("/api/me", {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          throw new Error("Unauthorized");
        }
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem("medprix-role", data.role);
          localStorage.setItem("medprix-username", data.username);
          setRole(data.role);
        }
      })
      .catch((err) => {
        if (err.message === "Unauthorized") {
          clearTransactionSession();
          localStorage.removeItem("medprix-session");
          localStorage.removeItem("medprix-role");
          localStorage.removeItem("medprix-username");
          localStorage.removeItem("medprix-fullname");
          localStorage.removeItem("medprix-token");
          setSession(false);
          setRole("");
          setLocation("/login");
        }
      });
  }, [session, setLocation]);

  useEffect(() => {
    if (!session && location !== "/login") {
      setLocation("/login");
      return;
    }
    if (location === "/") {
      setLocation(session ? getDefaultRoute(role) : "/login");
      return;
    }
    if (
      session &&
      location !== "/login" &&
      !getAllowedHrefs(role).includes(location)
    ) {
      setLocation(getDefaultRoute(role));
    }
  }, [location, session, role, setLocation]);

  const notify: ToastFn = notifications.notify;

  if (location === "/login") {
    return (
      <LoginPage
        onLogin={() => {
          clearTransactionSession();
          const loggedInRole = localStorage.getItem("medprix-role") || "";
          localStorage.setItem("medprix-session", "active");
          setRole(loggedInRole);
          setSession(true);
          setLocation(getDefaultRoute(loggedInRole));
        }}
      />
    );
  }

  return (
    <>
      <ErrorBoundary resetKey={location}>
        <AppShell
          dark={dark}
          setDark={setDark}
          onToast={notify}
          role={role}
          onLogout={() => {
            clearTransactionSession();
            localStorage.removeItem("medprix-token");
            fetch("/api/logout", {
              method: "POST",
              credentials: "include",
            }).catch(() => { });
            localStorage.removeItem("medprix-session");
            localStorage.removeItem("medprix-role");
            localStorage.removeItem("medprix-username");
            localStorage.removeItem("medprix-fullname");
            setSession(false);
            setRole("");
            setLocation("/login");
          }}
          users={users}
          setUsers={setUsers}
          refreshUsers={fetchUsers}
        />
      </ErrorBoundary>
      {toast && (
        <div className={`toast toast-${toast.variant}`} role={toast.variant === "error" ? "alert" : "status"} data-testid="status-toast">
          {toast.variant === "success" ? <Check size={15} /> : toast.variant === "warning" ? <AlertTriangle size={15} /> : <CircleAlert size={15} />}
          <span>{toast.message}</span><button aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={15} /></button>
        </div>
      )}
    </>
  );
}

export default App;
