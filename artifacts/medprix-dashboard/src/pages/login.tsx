import { useState, type FormEvent } from "react";
import { ArrowUpRight, Pill } from "lucide-react";

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Enter your username and password to continue.");
      return;
    }
    try {
      const response = await fetch("http://localhost:5000/api/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Invalid username or password.");
        return;
      }
      const data = await response.json();
      localStorage.setItem("medprix-role", data.role);
      localStorage.setItem("medprix-username", data.username ?? username);
      localStorage.setItem("medprix-fullname", data.fullName ?? username);
      onLogin();
    } catch {
      setError("Could not reach the server. Is the backend running?");
    }
  };

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <span className="brand-mark">
            <Pill size={16} strokeWidth={2.4} />
          </span>
          <span>Medprix</span>
        </div>
        <div className="eyebrow">Pharmacy operations workspace</div>
        <h1>Hello, User!</h1>
        <p>
          Sign in to keep your pharmacy moving with a clear view of sales,
          stock, and people.
        </p>
        <div className="field" style={{ marginBottom: 13 }}>
          <label htmlFor="login-username">Username</label>
          <input
            id="login-username"
            data-testid="input-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            data-testid="input-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
          />
        </div>
        {error && (
          <p
            style={{ color: "#b34f45", margin: "10px 0 0", fontSize: 11 }}
            data-testid="status-login-error">
            {error}
          </p>
        )}
        <button
          className="button dark full"
          data-testid="button-sign-in"
          type="submit"
          style={{ marginTop: 22 }}>
          Sign in <ArrowUpRight size={14} />
        </button>
        <div className="login-footer">
          Protected workspace · Medprix Pharmacy Group
        </div>
      </form>
    </main>
  );
}
