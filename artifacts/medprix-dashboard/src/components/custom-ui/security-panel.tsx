import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowUpRight, ShieldAlert, ShieldCheck } from "lucide-react";
import { readResponse, safeError } from "@/lib/feedback";
import { EmptyState } from "@/components/custom-ui/empty-state";

type Summary = {
  failedLoginsToday: number;
  suspiciousToday: number;
  temporaryPasswords: number;
  lockedAccounts: { username: string; name: string; lockedUntil: string }[];
  recent: { id: string; dateTime: string; activity: string; module: string; flag: string; user: string }[];
};

const time = (iso: string) => new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const when = (iso: string) => {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? time(iso) : new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
};

/**
 * Admin dashboard "Security & access" (Part D; backlog item 3, recent user activity and system logs on the dashboard).
 * Today's failed sign-ins, accounts locked right now, accounts still on a temporary password, and the latest activity.
 */
export function SecurityPanel() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const response = await fetch("/api/admin/security-summary", { credentials: "include" });
      setSummary((await readResponse(response, "Security summary is unavailable right now.")) as Summary);
      setError("");
    } catch (err) {
      setError(safeError(err, "Security summary is unavailable right now."));
    }
  };
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const stats = summary
    ? [
        { label: "Failed sign-ins today", value: summary.failedLoginsToday, alert: summary.failedLoginsToday >= 5 },
        { label: "Suspicious today", value: summary.suspiciousToday, alert: summary.suspiciousToday > 0 },
        { label: "Locked right now", value: summary.lockedAccounts.length, alert: summary.lockedAccounts.length > 0 },
        { label: "On a temporary password", value: summary.temporaryPasswords, alert: false },
      ]
    : [];

  return (
    <section className="surface-card list-card security-panel" data-testid="card-security">
      <div className="card-header">
        <div>
          <h2 className="card-title">Security &amp; access</h2>
          <p className="card-subtitle">Sign-ins, lockouts and the latest account activity. Refreshes every minute.</p>
        </div>
        <Link href="/system-ad" className="button soft" data-testid="link-security-logs">
          Open logs <ArrowUpRight size={12} />
        </Link>
      </div>
      {error && <EmptyState>{error}</EmptyState>}
      {summary && (
        <>
          <div className="security-stats">
            {stats.map((stat) => (
              <div key={stat.label} className={`security-stat ${stat.alert ? "is-alert" : ""}`}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
          {summary.lockedAccounts.length > 0 && (
            <p className="security-locked" role="status">
              <ShieldAlert size={14} aria-hidden />
              Locked:{" "}
              {summary.lockedAccounts.map((account) => `${account.name} (until ${time(account.lockedUntil)})`).join(", ")}. Unlock them in User Management.
            </p>
          )}
          {summary.recent.map((row) => (
            <div className="list-row" key={row.id}>
              <div className="row-icon">{row.flag === "Normal" ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />}</div>
              <div className="row-main">
                <strong>{row.activity}</strong>
                <span>
                  {row.user} · {row.module}
                </span>
              </div>
              {row.flag !== "Normal" && <span className="pill danger">{row.flag}</span>}
              <span className="muted security-when">{when(row.dateTime)}</span>
            </div>
          ))}
          {summary.recent.length === 0 && <EmptyState>No account activity recorded yet.</EmptyState>}
        </>
      )}
    </section>
  );
}
