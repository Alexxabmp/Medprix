import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Eye, EyeOff, KeyRound, X } from "lucide-react";
import { cleanStaffMobile, cleanStaffName, formatStaffMobile, staffMobileError, staffNameError, toDisplayStaffMobile, STAFF_ROLE_LABELS } from "@workspace/api-zod";
import { changeOwnPassword, fetchOwnAccount, newPasswordProblem, updateOwnAccount, type OwnAccount } from "@/lib/account-api";

/** Digits only; a pasted +63 number becomes 09…; at most 11 digits. */
function typedMobile(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("63")) digits = `0${digits.slice(2)}`;
  return digits.slice(0, 11);
}

/**
 * My account (every role): edit your own name and mobile number, and change your password.
 * Username and role are shown but only an administrator can change them.
 */
export function MyAccountDialog({ onClose, onToast }: { onClose: () => void; onToast: (message: string) => void }) {
  const [account, setAccount] = useState<OwnAccount | null>(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [detailsError, setDetailsError] = useState("");
  const [detailsSaved, setDetailsSaved] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [busy, setBusy] = useState<"" | "details" | "password">("");
  // One short form at a time: details are edited more often than the password.
  const [tab, setTab] = useState<"details" | "password">("details");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    let live = true;
    void fetchOwnAccount().then(({ error, account: loaded }) => {
      if (!live) return;
      if (error || !loaded) return setLoadError(error ?? "Could not load your account.");
      setAccount(loaded);
      setName(loaded.fullName);
      setPhone(toDisplayStaffMobile(loaded.contactNumber));
    });
    return () => {
      live = false;
      document.body.style.overflow = "";
    };
  }, []);

  const saveDetails = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !account) return;
    setDetailsSaved("");
    const cleanName = cleanStaffName(name);
    const problem = staffNameError(cleanName) ?? staffMobileError(cleanStaffMobile(phone));
    if (problem) return setDetailsError(problem);
    setBusy("details");
    const { error, data } = await updateOwnAccount(cleanName, phone || null);
    setBusy("");
    if (error) return setDetailsError(error);
    setDetailsError("");
    setAccount(data as OwnAccount);
    setName(data.fullName);
    setPhone(toDisplayStaffMobile(data.contactNumber));
    localStorage.setItem("medprix-fullname", data.fullName);
    setDetailsSaved("Your details are saved.");
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const problem = !current ? "Enter your current password." : newPasswordProblem(current, next, confirm);
    if (problem) return setPasswordError(problem);
    setBusy("password");
    const error = await changeOwnPassword(current, next);
    setBusy("");
    if (error) return setPasswordError(error);
    setPasswordError("");
    setCurrent("");
    setNext("");
    setConfirm("");
    onToast("Your password is changed. Use the new one the next time you sign in.");
    onClose();
  };

  const type = show ? "text" : "password";
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <div className="modal dialog" role="dialog" aria-labelledby="my-account-title" data-testid="dialog-my-account">
        <div className="modal-header">
          <div>
            <h2 id="my-account-title">My account</h2>
            <p className="modal-sub">Your own details and password.</p>
          </div>
          <button type="button" className="modal-close" aria-label="Close" data-testid="button-close-my-account" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        {loadError && <p className="inline-error" role="alert">{loadError}</p>}
        {!account && !loadError && <p className="muted">Loading…</p>}
        {account && (
          <>
            <div className="account-tabs" role="tablist" aria-label="My account sections">
              <button type="button" role="tab" id="tab-details" aria-selected={tab === "details"} aria-controls="panel-details"
                className={tab === "details" ? "is-active" : ""} data-testid="tab-account-details" onClick={() => setTab("details")}>Details</button>
              <button type="button" role="tab" id="tab-password" aria-selected={tab === "password"} aria-controls="panel-password"
                className={tab === "password" ? "is-active" : ""} data-testid="tab-account-password" onClick={() => setTab("password")}>Password</button>
            </div>
            {tab === "details" && (
            <form className="account-section" id="panel-details" role="tabpanel" aria-labelledby="tab-details" onSubmit={saveDetails} noValidate>
              <p>Ask an administrator if your username or role needs to change.</p>
              <div className="account-readonly">
                <div><span>Username</span>{account.username}</div>
                <div><span>Role</span>{STAFF_ROLE_LABELS[account.role] ?? account.role}</div>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="acct-name">Full name</label>
                  <input id="acct-name" data-testid="input-account-name" value={name} maxLength={100} onChange={(e) => { setName(e.target.value); setDetailsSaved(""); }} autoComplete="name" />
                </div>
                <div className="field">
                  <label htmlFor="acct-phone">Mobile number <span className="muted">(optional)</span></label>
                  <input id="acct-phone" data-testid="input-account-phone" type="tel" inputMode="numeric" value={phone} placeholder="09XXXXXXXXX"
                    onChange={(e) => { setPhone(typedMobile(e.target.value)); setDetailsSaved(""); }} autoComplete="tel" />
                </div>
              </div>
              {detailsError && <p className="inline-error" role="alert" data-testid="text-account-error">{detailsError}</p>}
              {detailsSaved && <p className="account-success" role="status">{detailsSaved} {phone ? `Mobile: ${formatStaffMobile(phone)}.` : ""}</p>}
              <div className="section-actions">
                <button type="submit" className="button soft" data-testid="button-save-account" disabled={busy !== ""}>
                  <Check size={13} /> {busy === "details" ? "Saving…" : "Save details"}
                </button>
              </div>
            </form>
            )}
            {tab === "password" && (
            <form className="account-section" id="panel-password" role="tabpanel" aria-labelledby="tab-password" onSubmit={savePassword} noValidate>
              <p>Enter your current password first. The new one needs at least 8 characters.</p>
              <div className="form-grid">
                <div className="field account-span">
                  <label htmlFor="acct-current">Current password</label>
                  <input id="acct-current" data-testid="input-account-current" type={type} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
                </div>
                <div className="field">
                  <label htmlFor="acct-new">New password</label>
                  <input id="acct-new" data-testid="input-account-new" type={type} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
                </div>
                <div className="field um-password-field">
                  <label htmlFor="acct-confirm">Confirm new password</label>
                  <input id="acct-confirm" data-testid="input-account-confirm" type={type} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
                  <button type="button" className="um-eye" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide passwords" : "Show passwords"}>
                    {show ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              {passwordError && <p className="inline-error" role="alert" data-testid="text-password-error">{passwordError}</p>}
              <div className="section-actions">
                <button type="submit" className="button primary-action" data-testid="button-change-password" disabled={busy !== ""}>
                  {busy === "password" ? "Saving…" : "Change password"} <KeyRound size={13} />
                </button>
              </div>
            </form>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
