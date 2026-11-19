import { SelectField } from "@/components/custom-ui/select-field";
import { AppTooltip } from "@/components/ui/tooltip";
import { useState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRightLeft,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LockOpen,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { SourceSummary as Summary, SourceFeedback, SourceTableBody, SourceText, SourceRefreshButton, type SourceState } from "@/components/custom-ui/source-state";
import type { ToastFn, UserRecord } from "@/lib/types";
import { accountLocks, canGrantAdmin, initialsOf, ROLE_TO_API } from "@/lib/user-permissions";
import { cleanStaffMobile, cleanStaffName, formatStaffMobile, staffMobileError, staffNameError } from "@workspace/api-zod";

type Draft = { name: string; username: string; role: string; phone: string };
type Confirm =
  | { kind: "role"; user: UserRecord; role: string }
  | { kind: "deactivate"; user: UserRecord };

/** PATCH/POST helper: resolves to the server's error message, or null when it worked. */
async function send(url: string, method: string, body: unknown): Promise<{ error: string | null; data: any }> {
  try {
    const response = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
    return { error: response.ok ? null : data.error ?? "That didn't go through. Please try again.", data };
  } catch {
    return { error: "Could not reach the server. Check the connection and try again.", data: {} };
  }
}

const isLocked = (user: UserRecord) => Boolean(user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now());
const lockTime = (iso: string) => new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** Digits only; a pasted +63 number becomes 09…; at most 11 digits. */
function typedMobile(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("63")) digits = `0${digits.slice(2)}`;
  return digits.slice(0, 11);
}

export default function UserManagementPage({
  users,
  setUsers,
  onToast,
  refreshUsers,
  usersSource,
}: {
  users: UserRecord[];
  setUsers: (users: UserRecord[]) => void;
  onToast: ToastFn;
  refreshUsers?: () => void;
  usersSource: SourceState;
}) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All roles");
  // Deactivated accounts are kept for the records but hidden unless asked for.
  const [showInactive, setShowInactive] = useState(false);
  const [userPage, setUserPage] = useState(1);
  const [dialog, setDialog] = useState<"create" | "edit" | "reset" | "transfer" | null>(null);
  const [selected, setSelected] = useState<UserRecord | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [confirmError, setConfirmError] = useState("");
  const [busy, setBusy] = useState(false);
  // One quick action at a time (unlock / reactivate), so a double click can't send it twice.
  const quickBusy = useRef(false);
  const [quickPending, setQuickPending] = useState<string | null>(null);
  const runQuick = async (userId: string, work: () => Promise<void>) => {
    if (quickBusy.current) return;
    quickBusy.current = true;
    setQuickPending(userId);
    try { await work(); } finally { quickBusy.current = false; setQuickPending(null); }
  };
  const currentUsername = localStorage.getItem("medprix-username");
  const meRecord = users.find((user) => currentUsername && user.username.toLowerCase() === currentUsername.toLowerCase());
  const me = { username: currentUsername, isPrimary: meRecord?.isPrimary === true };
  const primary = users.find((user) => user.isPrimary);

  useEffect(() => {
    if (!dialog && !confirm) return undefined;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [dialog, confirm]);

  const patchLocal = (id: string, change: Partial<UserRecord>) =>
    setUsers(users.map((user) => (user.id === id ? { ...user, ...change } : user)));

  const openConfirm = (next: Confirm) => {
    setConfirmError("");
    setConfirm(next);
  };

  const runConfirm = async () => {
    if (!confirm || busy) return;
    setBusy(true);
    const { user } = confirm;
    const body = confirm.kind === "role" ? { role: ROLE_TO_API[confirm.role] } : { isActive: false };
    const { error } = await send(`/api/users/${user.id}`, "PATCH", body);
    setBusy(false);
    if (error) {
      setConfirmError(error);
      return;
    }
    if (confirm.kind === "role") {
      patchLocal(user.id, { role: confirm.role });
      onToast(`${user.name}'s role is now ${confirm.role}.`);
    } else {
      patchLocal(user.id, { status: "Inactive" });
      onToast(showInactive ? `${user.name}'s account is deactivated.` : `${user.name}'s account is deactivated. Tick "Show inactive" to see it.`);
    }
    setConfirm(null);
    refreshUsers?.();
  };

  const unlock = (user: UserRecord) => runQuick(user.id, async () => {
    const { error } = await send(`/api/users/${user.id}/unlock`, "POST", {});
    if (error) {
      onToast(error);
      return;
    }
    patchLocal(user.id, { lockedUntil: null });
    refreshUsers?.();
    onToast(`${user.name} can sign in again.`);
  });

  const reactivate = (user: UserRecord) => runQuick(user.id, async () => {
    const { error } = await send(`/api/users/${user.id}`, "PATCH", { isActive: true });
    if (error) {
      onToast(error);
      return;
    }
    patchLocal(user.id, { status: "Active" });
    refreshUsers?.();
    onToast(`${user.name}'s account is active again.`);
  });

  /** Create or edit. Resolves to an error message to show in the dialog, or null when saved. */
  const saveUser = async (draft: Draft, password: string): Promise<string | null> => {
    const name = cleanStaffName(draft.name);
    const username = draft.username.trim();
    const contactNumber = draft.phone || null;
    if (dialog === "create") {
      const { error, data } = await send("/api/users", "POST", {
        username, password, fullName: name, contactNumber, role: ROLE_TO_API[draft.role],
      });
      if (error) return error;
      setUsers([
        ...users,
        { id: data.id, initials: initialsOf(name), name, username, role: draft.role, status: "Active", lastActive: "Never", phone: draft.phone, isPrimary: false, tempPassword: true },
      ]);
      onToast(`Account created for ${name}. Give them the temporary password privately; they'll set their own when they first sign in.`);
    } else if (selected) {
      const self = selected.username === currentUsername;
      const body: Record<string, unknown> = { username, fullName: name, contactNumber };
      if (!self && draft.role !== selected.role) body.role = ROLE_TO_API[draft.role];
      const { error } = await send(`/api/users/${selected.id}`, "PATCH", body);
      if (error) return error;
      patchLocal(selected.id, { name, username, phone: draft.phone, initials: initialsOf(name), ...(body.role ? { role: draft.role } : {}) });
      if (self) {
        // Keeps "this is you" detection and the sidebar name right after editing your own account.
        localStorage.setItem("medprix-username", username);
        localStorage.setItem("medprix-fullname", name);
      }
      onToast(self ? "Your details are updated." : `${name}'s details are updated.`);
    }
    refreshUsers?.();
    setDialog(null);
    return null;
  };

  const shown = users.filter((user) => {
    const matchesSearch = `${user.name} ${user.username} ${user.role} ${user.phone}`
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesRole = roleFilter === "All roles" || user.role === roleFilter;
    return matchesSearch && matchesRole && (showInactive || user.status === "Active");
  });
  const hiddenInactive = showInactive ? 0 : users.filter((user) => user.status === "Inactive").length;

  const USER_PAGE_SIZE = 15;
  const totalUserPages = Math.max(1, Math.ceil(shown.length / USER_PAGE_SIZE));
  const safeUserPage = Math.min(userPage, totalUserPages);
  const paginatedUsers = shown.slice((safeUserPage - 1) * USER_PAGE_SIZE, safeUserPage * USER_PAGE_SIZE);
  const transferCandidates = users.filter((user) => user.role === "Administrator" && user.status === "Active" && !user.isPrimary);

  return (
    <div>
      <PageHeading
        title="User Management"
        description="Give the right people the right access, without the guesswork."
        action={
          <div className="um-heading-actions">
            {me.isPrimary && (
              <button className="button soft" data-testid="button-transfer-primary" onClick={() => setDialog("transfer")}>
                <ArrowRightLeft size={14} /> Transfer primary admin
              </button>
            )}
            <button
              className="button dark"
              data-testid="button-create-account"
              onClick={() => {
                setSelected(null);
                setDialog("create");
              }}>
              <Plus size={14} /> Create account
            </button>
          </div>
        }
      />
      {primary && (
        <p className="um-primary-note" data-testid="text-primary-note">
          <ShieldCheck size={15} aria-hidden />
          {me.isPrimary ? (
            <span>
              <strong>You're the primary admin.</strong> Only you can change other administrators' accounts or make someone an administrator.
            </span>
          ) : (
            <span>
              <strong>{primary.name}</strong> is the primary admin. Only they can change other administrators' accounts or make someone an administrator.
            </span>
          )}
        </p>
      )}
      <SourceFeedback status={usersSource} label="user accounts" />
      <div className="summary-strip">
        <Summary status={usersSource} label="Team members" value={String(users.length)} caption="Across your workspace" />
        <Summary status={usersSource} label="Active accounts" value={String(users.filter((u) => u.status === "Active").length)} caption="Access is current" />
        <Summary status={usersSource}
          label="Inactive accounts"
          value={String(users.filter((u) => u.status === "Inactive").length)}
          caption="No workspace access"
          tone="warning"
        />
      </div>
      <section className="surface-card table-card">
        <div className="table-tools">
          <div className="search-wrap">
            <Search size={15} />
            <input
              data-testid="input-user-search"
              type="search"
              placeholder="Search name, username, role or phone..."
              aria-label="Search user accounts"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setUserPage(1);
              }}
            />
          </div>
          <div className="table-tools-right">
            <SourceRefreshButton status={usersSource} label="user accounts" onRefresh={() => refreshUsers?.()} />
            <label className="um-inactive-toggle">
              <input
                type="checkbox"
                data-testid="checkbox-show-inactive"
                checked={showInactive}
                onChange={(e) => {
                  setShowInactive(e.target.checked);
                  setUserPage(1);
                }}
              />
              Show inactive{hiddenInactive ? ` (${hiddenInactive})` : ""}
            </label>
            <SelectField
              className="select"
              aria-label="Filter users by role"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setUserPage(1);
              }}
              data-testid="select-user-role">
              <option value="All roles">All roles</option>
              <option value="Administrator">Administrator</option>
              <option value="Front Desk">Front Desk</option>
              <option value="Cashier">Cashier</option>
            </SelectField>
          </div>
        </div>
        <div className="table-scroll">
          <table data-page-table="users" className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Phone number</th>
                <th>Status</th>
                <th>Last active</th>
                <th className="table-action-head">Action</th>
              </tr>
            </thead>
            <SourceTableBody status={usersSource} label="User accounts" colSpan={6}>
              {paginatedUsers.map((user) => {
                const isCurrentUser = user.username === currentUsername;
                const locks = accountLocks(user, me);
                return (
                  <tr key={user.id} data-testid={`row-user-${user.id}`} aria-busy={quickPending === user.id}>
                    <td>
                      <div className="product-cell">
                        <span
                          className="avatar"
                          style={{ width: 32, height: 32, border: 0, boxShadow: "none", background: "#17171a", color: "#fff", flexShrink: 0 }}>
                          {user.initials}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div className="um-user-headline">
                            <strong>{user.name}</strong>
                            {user.isPrimary && (
                              <span className="pill neutral um-primary-pill" data-testid={`badge-primary-${user.id}`}>
                                <ShieldCheck size={11} aria-hidden /> Primary admin
                              </span>
                            )}
                            {isCurrentUser && <span className="um-you">You</span>}
                          </div>
                          <div className="muted" style={{ fontSize: 12, marginTop: 1 }}>
                            {user.username}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <SelectField
                        className="select"
                        style={{ height: 30, padding: "0 8px" }}
                        data-testid={`select-role-${user.id}`}
                        aria-label={`Role for ${user.name}`}
                        value={user.role}
                        disabled={Boolean(locks.role)}
                        onChange={(e) => {
                          if (locks.role || e.target.value === user.role) return;
                          openConfirm({ kind: "role", user, role: e.target.value });
                        }}>
                        <option disabled={user.role !== "Administrator" && !canGrantAdmin(me)}>Administrator</option>
                        <option>Front Desk</option>
                        <option>Cashier</option>
                      </SelectField>
                      {locks.role && (
                        <div className="muted um-lock-note">{isCurrentUser ? "Your own role is locked." : "Primary admin only."}</div>
                      )}
                    </td>
                    <td className="muted">{user.phone ? formatStaffMobile(user.phone) : "—"}</td>
                    <td>
                      <div className="page-inline-controls" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span className={`pill ${user.status === "Active" ? "success" : "neutral"}`}>{user.status}</span>
                        {isLocked(user) && (
                          <AppTooltip content="Locked after 5 wrong passwords. It unlocks by itself at this time, or use Unlock.">
                            <span className="pill danger um-temp-pill" data-testid={`pill-locked-${user.id}`}>Locked until {lockTime(user.lockedUntil!)}</span>
                          </AppTooltip>
                        )}
                        {user.tempPassword && user.status === "Active" && (
                          <AppTooltip content="They haven't set their own password yet. They'll be asked to when they next sign in.">
                            <span className="pill warning um-temp-pill" data-testid={`pill-temp-password-${user.id}`}>Temporary password</span>
                          </AppTooltip>
                        )}
                        <AppTooltip content={locks.status ?? (user.status === "Active" ? "Deactivate this account" : "Reactivate this account")}>
                          <button
                            className={`toggle ${user.status === "Active" ? "on" : ""}`}
                            data-testid={`toggle-status-${user.id}`}
                            aria-pressed={user.status === "Active"}
                            aria-label={`Set ${user.name} ${user.status === "Active" ? "inactive" : "active"}`}
                            disabled={Boolean(locks.status) || quickPending !== null}
                            onClick={() => (user.status === "Active" ? openConfirm({ kind: "deactivate", user }) : void reactivate(user))}>
                            <span />
                          </button>
                        </AppTooltip>
                      </div>
                      {locks.status && (
                        <div className="muted um-lock-note">{isCurrentUser ? "Your own status is locked." : "Primary admin only."}</div>
                      )}
                    </td>
                    <td className="muted">{user.lastActive}</td>
                    <td className="table-action-cell">
                      <div className="table-actions">
                        <AppTooltip content={locks.edit ?? `Edit ${user.name}`}>
                          <button
                            className="button soft table-action-btn"
                            data-testid={`button-edit-user-${user.id}`}
                            aria-label={`Edit ${user.name}`}
                            disabled={Boolean(locks.edit)}
                            onClick={() => {
                              setSelected(user);
                              setDialog("edit");
                            }}>
                            <Pencil size={13} />
                          </button>
                        </AppTooltip>
                        {isLocked(user) && (
                          <AppTooltip content={locks.edit ?? `Unlock ${user.name} now`}>
                            <button
                              className="button soft table-action-btn"
                              data-testid={`button-unlock-user-${user.id}`}
                              aria-label={`Unlock ${user.name}`}
                              disabled={Boolean(locks.edit) || quickPending !== null}
                              onClick={() => void unlock(user)}>
                              <LockOpen size={13} />
                            </button>
                          </AppTooltip>
                        )}
                        <AppTooltip content={locks.reset ?? `Reset password for ${user.name}`}>
                          <button
                            className="button soft table-action-btn"
                            data-testid={`button-reset-user-${user.id}`}
                            aria-label={`Reset password for ${user.name}`}
                            disabled={Boolean(locks.reset)}
                            onClick={() => {
                              setSelected(user);
                              setDialog("reset");
                            }}>
                            <KeyRound size={13} />
                          </button>
                        </AppTooltip>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </SourceTableBody>
          </table>
          {shown.length === 0 && (
            <div className="empty-state">
              <Users size={25} />
              <div>
                {hiddenInactive && users.some((user) => user.status === "Inactive")
                  ? "No active accounts match. Tick \"Show inactive\" to include deactivated accounts."
                  : "No user accounts match your search."}
              </div>
            </div>
          )}
        </div>
        <div className="table-pagination" role="navigation" aria-label="User accounts pagination">
          <span className="muted">
            <SourceText status={usersSource}>Page {safeUserPage} of {totalUserPages} ({shown.length} users)</SourceText>
          </span>
          <button type="button" className="button soft" disabled={safeUserPage <= 1} onClick={() => setUserPage((p) => Math.max(1, p - 1))}>
            Previous
          </button>
          <button
            type="button"
            className="button soft"
            disabled={safeUserPage >= totalUserPages}
            onClick={() => setUserPage((p) => Math.min(totalUserPages, p + 1))}>
            Next
          </button>
        </div>
      </section>

      {(dialog === "create" || (dialog === "edit" && selected)) && (
        <UserDialog
          isCreate={dialog === "create"}
          initial={
            dialog === "create"
              ? { name: "", username: "", role: "Cashier", phone: "" }
              : { name: selected!.name, username: selected!.username, role: selected!.role, phone: selected!.phone }
          }
          isCurrentUser={dialog === "edit" && selected?.username === currentUsername}
          canGrantAdmin={canGrantAdmin(me)}
          onClose={() => setDialog(null)}
          onSubmit={saveUser}
        />
      )}
      {dialog === "reset" && selected && (
        <ResetPasswordDialog
          user={selected}
          isSelf={selected.username === currentUsername}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            // A reset also ends a lockout.
            patchLocal(selected.id, selected.username !== currentUsername ? { tempPassword: true, lockedUntil: null } : { lockedUntil: null });
            onToast(
              selected.username === currentUsername
                ? "Your password is changed. Use it the next time you sign in."
                : `Password reset for ${selected.name}. Give them the temporary password privately; they'll set their own when they next sign in.`,
            );
          }}
        />
      )}
      {dialog === "transfer" && (
        <TransferPrimaryDialog
          candidates={transferCandidates}
          onClose={() => setDialog(null)}
          onDone={(name) => {
            setDialog(null);
            refreshUsers?.();
            onToast(`${name} is now the primary admin.`);
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.kind === "role" ? "Change role?" : "Deactivate account?"}
          confirmLabel={confirm.kind === "role" ? "Change role" : "Deactivate"}
          danger={confirm.kind === "deactivate"}
          busy={busy}
          error={confirmError}
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirm}>
          {confirm.kind === "role" ? (
            <>
              <p>
                Change <strong>{confirm.user.name}</strong> from <strong>{confirm.user.role}</strong> to <strong>{confirm.role}</strong>?
              </p>
              <p className="muted">
                {confirm.role === "Administrator"
                  ? "Administrators can manage staff accounts, inventory, suppliers, reports and system logs."
                  : "Their pages and permissions change the next time they open a page."}
              </p>
            </>
          ) : (
            <>
              <p>
                Deactivate <strong>{confirm.user.name}</strong> ({confirm.user.username})?
              </p>
              <p className="muted">
                They're signed out on their next action and can't sign in until an admin reactivates the account. Their sales and records are kept.
              </p>
            </>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

function ModalFrame({ children, onClose, onSubmit, testId }: { children: ReactNode; onClose: () => void; onSubmit: (e: FormEvent) => void; testId?: string }) {
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <form className="modal dialog" onSubmit={onSubmit} data-testid={testId} noValidate>
        {children}
      </form>
    </div>,
    document.body,
  );
}

function ModalHeader({ title, sub, onClose, closeTestId }: { title: string; sub: ReactNode; onClose: () => void; closeTestId: string }) {
  return (
    <div className="modal-header">
      <div>
        <h2>{title}</h2>
        <p className="modal-sub">{sub}</p>
      </div>
      <button type="button" className="modal-close" data-testid={closeTestId} aria-label="Close" onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  );
}

function PasswordField({ id, label, value, onChange, placeholder, testId, autoFocus }: {
  id: string; label: string; value: string; onChange: (value: string) => void; placeholder: string; testId: string; autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="field um-password-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        data-testid={testId}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="new-password"
        autoFocus={autoFocus}
      />
      <button type="button" className="um-eye" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

function ConfirmDialog({ title, children, confirmLabel, danger, busy, error, onConfirm, onCancel }: {
  title: string; children: ReactNode; confirmLabel: string; danger?: boolean; busy: boolean; error: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <ModalFrame testId="dialog-confirm-user-change" onClose={onCancel} onSubmit={(e) => { e.preventDefault(); onConfirm(); }}>
      <ModalHeader title={title} sub="Please check before confirming." onClose={onCancel} closeTestId="button-close-confirm" />
      <div className="um-confirm-body">{children}</div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="button soft" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className={`button ${danger ? "danger" : "primary-action"}`} data-testid="button-confirm-user-change" disabled={busy} autoFocus>
          {busy ? "Saving…" : confirmLabel}
        </button>
      </div>
    </ModalFrame>
  );
}

function UserDialog({ isCreate, initial, isCurrentUser, canGrantAdmin: mayGrantAdmin, onClose, onSubmit }: {
  isCreate: boolean;
  initial: Draft;
  isCurrentUser: boolean;
  canGrantAdmin: boolean;
  onClose: () => void;
  onSubmit: (draft: Draft, password: string) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [password, setPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const adminLocked = !mayGrantAdmin && initial.role !== "Administrator";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const problem =
      staffNameError(cleanStaffName(draft.name)) ??
      (!draft.username.trim() ? "Enter a username." : null) ??
      staffMobileError(cleanStaffMobile(draft.phone)) ??
      (isCreate && password.length < 8 ? "Passwords need at least 8 characters." : null) ??
      (isCreate && password !== confirmPwd ? "The two passwords don't match." : null);
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError("");
    setBusy(true);
    const error = await onSubmit(draft, password);
    setBusy(false);
    if (error) setFormError(error);
  };

  return (
    <ModalFrame onClose={onClose} onSubmit={submit} testId="dialog-user">
      <ModalHeader
        title={isCreate ? "Create account" : isCurrentUser ? "Edit your details" : "Edit account"}
        sub="Account details and workspace access."
        onClose={onClose}
        closeTestId="button-close-user-dialog"
      />
      <div className="form-grid">
        <div className="field">
          <label htmlFor="user-name">Full name</label>
          <input
            id="user-name"
            data-testid="input-user-name"
            value={draft.name}
            maxLength={100}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="e.g. Ma. Clara Dela Cruz"
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="user-username">Username</label>
          <input
            id="user-username"
            data-testid="input-user-username"
            value={draft.username}
            maxLength={100}
            onChange={(e) => setDraft({ ...draft, username: e.target.value })}
            placeholder="e.g. juan_dela_cruz"
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="user-phone">
            Mobile number <span className="muted">(optional)</span>
          </label>
          <input
            id="user-phone"
            data-testid="input-user-phone"
            type="tel"
            inputMode="numeric"
            value={draft.phone}
            onChange={(e) => setDraft({ ...draft, phone: typedMobile(e.target.value) })}
            placeholder="09XXXXXXXXX"
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="user-role">Role</label>
          <SelectField
            id="user-role"
            data-testid="select-user-role-dialog"
            value={draft.role}
            disabled={isCurrentUser}
            onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
            <option disabled={adminLocked}>Administrator</option>
            <option>Front Desk</option>
            <option>Cashier</option>
          </SelectField>
        </div>
        {isCurrentUser && <div className="muted um-lock-note">Your own role can't be changed from this account.</div>}
        {!isCurrentUser && adminLocked && (
          <div className="muted um-lock-note">Only the primary admin can make someone an administrator.</div>
        )}
        {isCreate && (
          <>
            <PasswordField id="user-password" label="Temporary password" value={password} onChange={setPassword} placeholder="At least 8 characters" testId="input-user-password" />
            <PasswordField id="user-confirm" label="Confirm password" value={confirmPwd} onChange={setConfirmPwd} placeholder="Re-enter password" testId="input-user-confirm" />
          </>
        )}
      </div>
      {formError && (
        <p className="inline-error" role="alert" data-testid="text-user-error">
          {formError}
        </p>
      )}
      <div className="modal-actions">
        <button className="button primary-action" data-testid="button-save-user" type="submit" disabled={busy}>
          <Check size={13} /> {busy ? "Saving…" : isCreate ? "Create account" : "Save changes"}
        </button>
      </div>
    </ModalFrame>
  );
}

function ResetPasswordDialog({ user, isSelf, onClose, onDone }: { user: UserRecord; isSelf: boolean; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (password.length < 8) return setError("Passwords need at least 8 characters.");
    if (password !== confirmPassword) return setError("The two passwords don't match.");
    setBusy(true);
    const result = await send(`/api/users/${user.id}/password`, "PATCH", { password });
    setBusy(false);
    if (result.error) return setError(result.error);
    onDone();
  };
  return (
    <ModalFrame onClose={onClose} onSubmit={submit} testId="dialog-reset-password">
      <ModalHeader
        title={isSelf ? "Change your password" : "Reset password"}
        sub={isSelf ? "Set a new password for your own account." : `Set a temporary password for ${user.name}. They'll choose their own at their next sign-in.`}
        onClose={onClose}
        closeTestId="button-close-reset"
      />
      <div className="form-grid">
        <PasswordField id="reset-password" label={isSelf ? "New password" : "Temporary password"} value={password} onChange={setPassword} placeholder="At least 8 characters" testId="input-reset-password" autoFocus />
        <PasswordField id="reset-confirm" label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Re-enter new password" testId="input-reset-confirm" />
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button className="button primary-action" data-testid="button-confirm-reset" type="submit" disabled={busy}>
          {busy ? "Saving…" : isSelf ? "Change password" : "Reset password"} <KeyRound size={13} />
        </button>
      </div>
    </ModalFrame>
  );
}

function TransferPrimaryDialog({ candidates, onClose, onDone }: { candidates: UserRecord[]; onClose: () => void; onDone: (name: string) => void }) {
  const [targetId, setTargetId] = useState(candidates[0]?.id ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const target = candidates.find((user) => user.id === targetId);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !target) return;
    if (!password) return setError("Enter your password to confirm.");
    setBusy(true);
    const result = await send(`/api/users/${target.id}/transfer-primary`, "POST", { password });
    setBusy(false);
    if (result.error) {
      setPassword("");
      return setError(result.error);
    }
    onDone(target.name);
  };
  return (
    <ModalFrame onClose={onClose} onSubmit={submit} testId="dialog-transfer-primary">
      <ModalHeader
        title="Transfer primary admin"
        sub="Hand the primary admin role to another active administrator."
        onClose={onClose}
        closeTestId="button-close-transfer"
      />
      {candidates.length === 0 ? (
        <div className="um-confirm-body">
          <p>There's no other active administrator yet.</p>
          <p className="muted">Create an administrator account, or change an active staff member's role to Administrator, then come back here.</p>
        </div>
      ) : (
        <>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="transfer-target">New primary admin</label>
              <SelectField id="transfer-target" data-testid="select-transfer-target" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                {candidates.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.username})
                  </option>
                ))}
              </SelectField>
            </div>
            <PasswordField id="transfer-password" label="Your password" value={password} onChange={setPassword} placeholder="Confirm it's you" testId="input-transfer-password" />
          </div>
          <div className="um-confirm-body">
            <p className="muted">
              {target ? <strong>{target.name}</strong> : "They"} will be the only one who can change other administrators' accounts. You stay an administrator, and they can hand the role back later.
            </p>
          </div>
        </>
      )}
      {error && <p className="inline-error" role="alert" data-testid="text-transfer-error">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="button soft" onClick={onClose}>
          {candidates.length ? "Cancel" : "Close"}
        </button>
        {candidates.length > 0 && (
          <button type="submit" className="button primary-action" data-testid="button-confirm-transfer" disabled={busy}>
            {busy ? "Saving…" : "Hand over"}
          </button>
        )}
      </div>
    </ModalFrame>
  );
}
