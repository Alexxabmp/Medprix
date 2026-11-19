import { useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, Pill } from "lucide-react";
import { changeOwnPassword, newPasswordProblem } from "@/lib/account-api";

/**
 * Shown after signing in with a temporary password (an admin created the account or reset the password).
 * The workspace opens only after the person sets their own password; the server enforces the same rule.
 */
export default function SetPasswordPage({ onDone, onLogout }: { onDone: () => void; onLogout: () => void }) {
  const name = localStorage.getItem("medprix-fullname") || localStorage.getItem("medprix-username") || "there";
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const problem = !current ? "Enter the temporary password you signed in with." : newPasswordProblem(current, next, confirm);
    if (problem) return setError(problem);
    setBusy(true);
    const result = await changeOwnPassword(current, next);
    setBusy(false);
    if (result) return setError(result);
    onDone();
  };

  const type = show ? "text" : "password";
  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit} noValidate data-testid="form-set-password">
        <div className="brand">
          <span className="brand-mark">
            <Pill size={16} strokeWidth={2.4} />
          </span>
          <span>Medprix</span>
        </div>
        <div className="eyebrow">One more step</div>
        <h1>Set your own password</h1>
        <p>
          Hi {name.split(" ")[0]}. You signed in with a temporary password from an administrator. Choose a password only you know before
          you continue.
        </p>
        <div className="field" style={{ marginBottom: 13 }}>
          <label htmlFor="sp-current">Temporary password</label>
          <input id="sp-current" data-testid="input-current-password" type={type} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" autoFocus />
        </div>
        <div className="field" style={{ marginBottom: 13 }}>
          <label htmlFor="sp-new">New password</label>
          <input id="sp-new" data-testid="input-new-password" type={type} value={next} onChange={(e) => setNext(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
        </div>
        <div className="field" style={{ position: "relative" }}>
          <label htmlFor="sp-confirm">Confirm new password</label>
          <input id="sp-confirm" data-testid="input-confirm-password" type={type} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" style={{ paddingRight: 38 }} />
          <button type="button" className="um-eye" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide passwords" : "Show passwords"}>
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        {error && (
          <p className="login-error" role="alert" data-testid="text-set-password-error">
            {error}
          </p>
        )}
        <button className="button dark full login-submit" type="submit" disabled={busy} data-testid="button-set-password">
          {busy ? "Saving…" : "Save and continue"} <KeyRound size={14} />
        </button>
        <button type="button" className="sp-logout" onClick={onLogout} data-testid="button-set-password-logout">
          Not you? Log out
        </button>
      </form>
    </main>
  );
}
