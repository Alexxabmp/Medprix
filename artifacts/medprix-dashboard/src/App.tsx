import { useEffect, useState } from "react";
import { Check } from "lucide-react";
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
      <TooltipProvider>
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
  const [toast, setToast] = useState("");
  const [users, setUsers] = useState<UserRecord[]>([]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("medprix-theme", dark ? "dark" : "light");
  }, [dark]);

  const fetchUsers = () => {
    fetch("http://localhost:5000/api/users", { credentials: "include" })
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
              user.role === "admin"
                ? "Administrator"
                : user.role === "frontdesk"
                  ? "Front Desk"
                  : "Cashier",
            status: user.isActive ? "Active" : "Inactive",
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
      })
      .catch(() => {
        // Backend offline — users list stays empty
      });
  };

  useEffect(() => {
    if (!session) return;
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    if (!session) return;

    fetch("http://localhost:5000/api/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        localStorage.setItem("medprix-role", data.role);
        localStorage.setItem("medprix-username", data.username);
        setRole(data.role);
      })
      .catch(() => {
        localStorage.removeItem("medprix-session");
        localStorage.removeItem("medprix-role");
        localStorage.removeItem("medprix-username");
        localStorage.removeItem("medprix-fullname");
        setSession(false);
        setRole("");
        setLocation("/login");
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

  const notify: ToastFn = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  if (location === "/login") {
    return (
      <LoginPage
        onLogin={() => {
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
            fetch("http://localhost:5000/api/logout", {
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
        <div className="toast" data-testid="status-toast">
          <Check size={15} />
          {toast}
        </div>
      )}
    </>
  );
}

export default App;
