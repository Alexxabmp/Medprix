import { SelectField } from "@/components/custom-ui/select-field";
import { AppTooltip } from "@/components/ui/tooltip";
import { PageTableValue } from "@/components/page-table-context";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";
import { createPortal } from "react-dom";
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { Summary } from "@/components/custom-ui/summary-card";
import type { ToastFn, UserRecord } from "@/lib/types";

type PendingAction = { kind: "create" | "edit" | "reset" | "role" | "status"; userId?: string };

export default function UserManagementPage({
  users,
  setUsers,
  onToast,
  refreshUsers,
}: {
  users: UserRecord[];
  setUsers: (users: UserRecord[]) => void;
  onToast: ToastFn;
  refreshUsers?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All roles");
  const [userPage, setUserPage] = useState(1);
  const [dialog, setDialog] = useState<"create" | "edit" | "reset" | null>(
    null,
  );
  const [selected, setSelected] = useState<UserRecord | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    username: "",
    role: "Cashier",
    phone: "",
  });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetError, setResetError] = useState("");
  const busy = useRef(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const startAction = (action: PendingAction) => {
    if (busy.current) return false;
    busy.current = true;
    setPending(action);
    return true;
  };
  const finishAction = () => {
    busy.current = false;
    setPending(null);
  };
  const closeDialog = () => { if (!busy.current) setDialog(null); };
  useDialogAccessibility(dialog !== null, '.user-account-dialog', closeDialog, pending !== null);
  const currentUsername = localStorage.getItem("medprix-username");

  useEffect(() => {
    if (!dialog) {
      return undefined;
    }

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [dialog]);

  const openCreate = () => {
    if (busy.current) return;
    setSelected(null);
    setDraft({ name: "", username: "", role: "Cashier", phone: "" });
    setDialog("create");
  };
  const openEdit = (user: UserRecord) => {
    if (busy.current) return;
    setSelected(user);
    setDraft({
      name: user.name,
      username: user.username,
      role: user.role,
      phone: user.phone && user.phone !== "—" && user.phone !== "\u2014" ? user.phone : "",
    });
    setDialog("edit");
  };
  const toggleStatus = async (user: UserRecord) => {
    if (user.username === currentUsername) {
      onToast("You cannot change your own account status.");
      return;
    }

    const next = user.status === "Active" ? "Inactive" : "Active";
    const nextIsActive = next === "Active";
    if (!startAction({ kind: "status", userId: user.id })) return;
    try {
      const response = await fetch(
        `/api/users/${user.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: nextIsActive }),
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        onToast(data.error ?? "Failed to update status");
        return;
      }
      setUsers(
        users.map((u) => (u.id === user.id ? { ...u, status: next } : u)),
      );
      refreshUsers?.();
      onToast(`${user.name} is now ${next.toLowerCase()}`);
    } catch {
      onToast("Could not reach the server.");
    } finally {
      finishAction();
    }
  };
  const updateRole = async (user: UserRecord, role: string) => {
    if (user.username === currentUsername || !startAction({ kind: "role", userId: user.id })) return;
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: role === "Administrator" ? "Admin" : role === "Front Desk" ? "FrontDesk" : "Cashier" }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        onToast(data.error ?? "Failed to update role");
        return;
      }
      setUsers(users.map(item => item.id === user.id ? { ...item, role } : item));
      refreshUsers?.();
      onToast("Role updated");
    } catch {
      onToast("Could not reach the server.");
    } finally {
      finishAction();
    }
  };
  const submitUser = async (event: FormEvent, password = "") => {
    event.preventDefault();
    if (busy.current) return;
    if (!draft.name.trim() || !draft.username.trim()) return;

    const rawPhone = draft.phone.trim();
    const validPhone = rawPhone && rawPhone !== "—" && rawPhone !== "\u2014" ? rawPhone : null;

    if (!startAction({ kind: dialog === "create" ? "create" : "edit", userId: selected?.id })) return;
    try {
      if (dialog === "create") {
        const dbRole =
          draft.role === "Administrator"
            ? "Admin"
            : draft.role === "Front Desk"
              ? "FrontDesk"
              : "Cashier";
        try {
          const response = await fetch("/api/users", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username: draft.username.trim(),
              password,
              fullName: draft.name.trim(),
              contactNumber: validPhone,
              role: dbRole,
            }),
          });
          const data = await response.json();
          if (!response.ok) {
            onToast(data.error ?? "Failed to create user");
            return;
          }
          const initials = draft.name
            .trim()
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          setUsers([
            ...users,
            {
              id: data.id,
              initials,
              name: draft.name.trim(),
              username: draft.username.trim(),
              role: draft.role,
              status: "Active",
              lastActive: "Never",
              phone: validPhone || "",
            },
          ]);
          refreshUsers?.();
          onToast("Account created");
        } catch {
          onToast("Could not create user. Please check your session.");
          return;
        }
      } else if (selected) {
        const isEditingSelf = selected.username === currentUsername;
        const dbRole =
          draft.role === "Administrator"
            ? "Admin"
            : draft.role === "Front Desk"
              ? "FrontDesk"
              : "Cashier";
        try {
          const body: {
            username: string;
            fullName: string;
            contactNumber: string | null;
            role?: string;
          } = {
            username: draft.username.trim(),
            fullName: draft.name.trim(),
            contactNumber: validPhone,
          };
          if (!isEditingSelf) {
            body.role = dbRole;
          }

          const response = await fetch(
            `/api/users/${selected.id}`,
            {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
          );
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            onToast(data.error ?? "Failed to update user");
            return;
          }
        } catch {
          onToast("Could not reach the server.");
          return;
        }
        setUsers(
          users.map((user) =>
            user.id === selected.id
              ? {
                ...user,
                name: draft.name.trim(),
                username: draft.username.trim(),
                role: isEditingSelf ? user.role : draft.role,
                phone: validPhone || "",
                initials: draft.name
                  .trim()
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase(),
              }
              : user,
          ),
        );
        refreshUsers?.();
        onToast("User profile updated");
      }

      setDialog(null);
      return;
    } finally {
      finishAction();
    }
  };
  const reset = async (event: FormEvent) => {
    event.preventDefault();
    if (busy.current) return;
    if (!selected) return;
    if (password.length < 8) {
      setResetError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setResetError("Passwords do not match.");
      return;
    }
    if (!startAction({ kind: "reset", userId: selected.id })) return;
    setResetError("");
    try {
      const response = await fetch(
        `/api/users/${selected.id}/password`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResetError(data.error ?? "Failed to reset password.");
        return;
      }
      setResetError("");
      setDialog(null);
      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setShowConfirmPassword(false);
      onToast(`Password successfully updated for ${selected.name}`);
    } catch {
      setResetError("Could not reach the server.");
    } finally {
      finishAction();
    }
  };
  const shown = users.filter((user) => {
    const matchesSearch = `${user.name} ${user.username} ${user.role}`
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesRole = roleFilter === "All roles" || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const USER_PAGE_SIZE = 15;
  const totalUserPages = Math.max(1, Math.ceil(shown.length / USER_PAGE_SIZE));
  const safeUserPage = Math.min(userPage, totalUserPages);
  const paginatedUsers = shown.slice(
    (safeUserPage - 1) * USER_PAGE_SIZE,
    safeUserPage * USER_PAGE_SIZE,
  );

  return (
    <div>
      <PageHeading
        title="User Management"
        description="Give the right people the right access, without the guesswork."
        action={
          <button
            className="button dark"
            data-testid="button-create-account"
            disabled={pending !== null}
            onClick={openCreate}>
            <Plus size={14} /> Create account
          </button>
        }
      />
      <div className="summary-strip">
        <Summary
          label="Team members"
          value={String(users.length)}
          caption="Across your workspace"
        />
        <Summary
          label="Active accounts"
          value={String(users.filter((u) => u.status === "Active").length)}
          caption="Access is current"
        />
        <Summary
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
              placeholder="Search name, username, or role..."
              aria-label="Search user accounts"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setUserPage(1);
              }}
            />
          </div>
          <div className="table-tools-right">
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
            <tbody>
              {paginatedUsers.map((user) => {
                const isCurrentUser = user.username === currentUsername;

                return (
                <tr key={user.id} data-testid={`row-user-${user.id}`} aria-busy={pending?.userId === user.id}>
                  <td>
                    <div className="product-cell">
                      <span
                        className="avatar"
                        style={{
                          width: 32,
                          height: 32,
                          border: 0,
                          boxShadow: "none",
                          background: "#17171a",
                          color: "#fff",
                        }}>
                        {user.initials}
                      </span>
                      <div>
                        <strong><PageTableValue value={user.name} /></strong>
                        <div className="muted" style={{ fontSize: 12 }}>
                          <PageTableValue value={user.username} />
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
                      disabled={isCurrentUser || pending !== null}
                      onChange={(e) => void updateRole(user, e.target.value)}>
                      <option>Administrator</option>
                      <option>Front Desk</option>
                      <option>Cashier</option>
                    </SelectField>
                    {pending?.userId === user.id && pending.kind === "role" && <span className="action-progress" role="status"><LoaderCircle size={13} className="spin action-spinner" aria-hidden="true" />Saving role…</span>}
                    {isCurrentUser && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>
                        Your own role is locked.
                      </div>
                    )}
                  </td>
                  <td className="muted">{user.phone || "\u2014"}</td>
                  <td>
                    <div
                      className="page-inline-controls"
                      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span
                        className={`pill ${user.status === "Active" ? "success" : "neutral"}`}>
                        {user.status}
                      </span>
                      <AppTooltip content={
                          isCurrentUser
                            ? "You cannot deactivate your own account"
                            : `Set ${user.status === "Active" ? "inactive" : "active"}`
                        }><button
                        className={`toggle ${user.status === "Active" ? "on" : ""}`}
                        data-testid={`toggle-status-${user.id}`}
                        aria-pressed={user.status === "Active"}
                        aria-label={`Set ${user.name} ${user.status === "Active" ? "inactive" : "active"}`}
                        onClick={() => toggleStatus(user)}
                        disabled={isCurrentUser || pending !== null}
                        >
                        <span />
                      </button></AppTooltip>
                      {pending?.userId === user.id && pending.kind === "status" && <span className="action-progress" role="status"><LoaderCircle size={13} className="spin action-spinner" aria-hidden="true" /><span className="sr-only">Updating account status…</span></span>}
                    </div>
                    {isCurrentUser && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>
                        Your own status is locked.
                      </div>
                    )}
                  </td>
                  <td className="muted">{user.lastActive}</td>
                  <td className="table-action-cell">
                    <div className="table-actions">
                      <AppTooltip content={`Edit ${user.name}`}><button
                        className="button soft table-action-btn"
                        data-testid={`button-edit-user-${user.id}`}
                        disabled={pending !== null}
                        aria-label={`Edit ${user.name}`}

                        onClick={() => openEdit(user)}>
                        <Pencil size={13} />
                      </button></AppTooltip>
                      <AppTooltip content={`Reset password for ${user.name}`}><button
                        className="button soft table-action-btn"
                        data-testid={`button-reset-user-${user.id}`}
                        disabled={pending !== null}
                        aria-label={`Reset password for ${user.name}`}

                        onClick={() => {
                          if (busy.current) return;
                          setSelected(user);
                          setPassword("");
                          setConfirmPassword("");
                          setShowPassword(false);
                          setShowConfirmPassword(false);
                          setResetError("");
                          setDialog("reset");
                        }}>
                        <KeyRound size={13} />
                      </button></AppTooltip>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length === 0 && (
            <div className="empty-state">
              <Users size={25} />
              <div>No user accounts match your search.</div>
            </div>
          )}
        </div>
        <div className="table-pagination" role="navigation" aria-label="User accounts pagination">
          <span className="muted">
            Page {safeUserPage} of {totalUserPages} ({shown.length} users)
          </span>
          <button
            type="button"
            className="button soft"
            disabled={safeUserPage <= 1}
            onClick={() => setUserPage((p) => Math.max(1, p - 1))}>
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
      {(dialog === "create" || dialog === "edit") && (
        <UserDialog
          title={dialog === "create" ? "Create account" : "Edit profile"}
          isCreate={dialog === "create"}
          draft={draft}
          setDraft={setDraft}
          onClose={closeDialog}
          pending={pending !== null}
          onSubmit={submitUser}
          isCurrentUser={selected?.username === currentUsername}
        />
      )}
      {dialog === "reset" &&
        createPortal(
          <div
            className="modal-backdrop"
            onMouseDown={(event) =>
              event.currentTarget === event.target && closeDialog()
            }>
            <form className="modal dialog user-account-dialog" onSubmit={reset} aria-busy={pending !== null}>
              <div className="modal-header">
                <div>
                  <h2>Reset password</h2>
                  <p className="modal-sub">
                    Set a new password for {selected?.name}.
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  data-testid="button-close-reset"
                  disabled={pending !== null}
                  onClick={closeDialog}>
                  <X size={16} />
                </button>
              </div>
              <fieldset className="form-grid action-fields" disabled={pending !== null}>
                <div className="field" style={{ position: "relative" }}>
                  <label htmlFor="reset-password">New password</label>
                  <input
                    id="reset-password"
                    data-testid="input-reset-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    style={{ paddingRight: 38 }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    style={{
                      position: "absolute",
                      right: 10,
                      bottom: 9,
                      background: "none",
                      border: 0,
                      color: "#a9a6b1",
                      cursor: "pointer",
                      padding: 2,
                    }}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }>
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <div className="field" style={{ position: "relative" }}>
                  <label htmlFor="reset-confirm">Confirm password</label>
                  <input
                    id="reset-confirm"
                    data-testid="input-reset-confirm"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    style={{ paddingRight: 38 }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    style={{
                      position: "absolute",
                      right: 10,
                      bottom: 9,
                      background: "none",
                      border: 0,
                      color: "#a9a6b1",
                      cursor: "pointer",
                      padding: 2,
                    }}
                    aria-label={
                      showConfirmPassword ? "Hide password" : "Show password"
                    }>
                    {showConfirmPassword ? (
                      <EyeOff size={15} />
                    ) : (
                      <Eye size={15} />
                    )}
                  </button>
                </div>
              </fieldset>
              {resetError && (
                <p className="inline-error" role="alert">
                  {resetError}
                </p>
              )}
              <div className="modal-actions">
                <button
                  className="button dark"
                  data-testid="button-confirm-reset"
                  disabled={pending !== null}
                  type="submit">
                  {pending ? <><LoaderCircle size={13} className="spin action-spinner" aria-hidden="true" />Resetting password…</> : <>Reset password <KeyRound size={13} aria-hidden="true" /></>}
                </button>
              </div>
              <span className="sr-only" role="status">{pending ? "Resetting password…" : ""}</span>
            </form>
          </div>,
          document.body,
        )}
    </div>
  );
}

function cleanPhoneNumber(val: string): string {
  // Allow digits, single leading +, spaces, hyphens, and parentheses
  let sanitized = val.replace(/[^0-9+\s\-()]/g, "");
  if (sanitized.includes("+")) {
    sanitized =
      (sanitized.startsWith("+") ? "+" : "") + sanitized.replace(/\+/g, "");
  }
  return sanitized.slice(0, 20);
}

function UserDialog({
  title,
  isCreate,
  draft,
  setDraft,
  onClose,
  onSubmit,
  isCurrentUser = false,
  pending,
}: {
  title: string;
  isCreate: boolean;
  draft: { name: string; username: string; role: string; phone: string };
  setDraft: (draft: {
    name: string;
    username: string;
    role: string;
    phone: string;
  }) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent, password: string) => void;
  isCurrentUser?: boolean;
  pending: boolean;
}) {
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;

    const cleaned = draft.phone.trim();
    const phoneRegex = /^\+639\d{9}$/;
    if (cleaned && cleaned !== "—" && cleaned !== "\u2014" && !phoneRegex.test(cleaned)) {
      setFormError("Invalid phone number format. Expected +639XXXXXXXXX or leave blank.");
      return;
    }
    if (isCreate) {
      if (password.length < 8) {
        setFormError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirmPwd) {
        setFormError("Passwords do not match.");
        return;
      }
    }
    setFormError("");
    onSubmit(e, password);
  };

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) =>
        event.currentTarget === event.target && onClose()
      }>
      <form className="modal dialog user-account-dialog" onSubmit={handleSubmit} aria-busy={pending}>
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            <p className="modal-sub">Account details and workspace access.</p>
          </div>
          <button
            type="button"
            className="modal-close"
            data-testid="button-close-user-dialog"
            disabled={pending}
            onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <fieldset className="form-grid action-fields" disabled={pending}>
          <div className="field">
            <label htmlFor="user-name">Full name</label>
            <input
              id="user-name"
              data-testid="input-user-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Full name"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="user-username">Username</label>
            <input
              id="user-username"
              data-testid="input-user-username"
              value={draft.username}
              onChange={(e) => setDraft({ ...draft, username: e.target.value })}
              placeholder="e.g. juan_dela_cruz"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="user-phone">Phone number</label>
            <input
              id="user-phone"
              data-testid="input-user-phone"
              type="tel"
              inputMode="tel"
              value={draft.phone}
              onChange={(e) =>
                setDraft({ ...draft, phone: cleanPhoneNumber(e.target.value) })
              }
              placeholder="+639XXXXXXXXX"
              minLength={13}
              maxLength={13}
            />
          </div>
          <div className="field">
            <label htmlFor="user-role">Role</label>
            <SelectField
              id="user-role"
              data-testid="select-user-role"
              value={draft.role}
              disabled={isCurrentUser || pending}
              onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
              <option>Administrator</option>
              <option>Front Desk</option>
              <option>Cashier</option>
            </SelectField>
          </div>
          {isCurrentUser && (
            <div className="muted" style={{ fontSize: 12 }}>
              Your own role cannot be changed from this account.
            </div>
          )}
          {isCreate && (
            <>
              <div className="field" style={{ position: "relative" }}>
                <label htmlFor="user-password">Password</label>
                <input
                  id="user-password"
                  data-testid="input-user-password"
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  style={{ paddingRight: 38 }}
                  required={isCreate}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  style={{
                    position: "absolute",
                    right: 10,
                    bottom: 9,
                    background: "none",
                    border: 0,
                    color: "#a9a6b1",
                    cursor: "pointer",
                    padding: 2,
                  }}
                  aria-label={showPwd ? "Hide password" : "Show password"}>
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <div className="field" style={{ position: "relative" }}>
                <label htmlFor="user-confirm">Confirm password</label>
                <input
                  id="user-confirm"
                  data-testid="input-user-confirm"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  placeholder="Re-enter password"
                  style={{ paddingRight: 38 }}
                  required={isCreate}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  style={{
                    position: "absolute",
                    right: 10,
                    bottom: 9,
                    background: "none",
                    border: 0,
                    color: "#a9a6b1",
                    cursor: "pointer",
                    padding: 2,
                  }}
                  aria-label={showConfirm ? "Hide password" : "Show password"}>
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </>
          )}
        </fieldset>
        {formError && (
          <p className="inline-error" role="alert">
            {formError}
          </p>
        )}
        <div className="modal-actions">
          <button
            className="button dark"
            data-testid="button-save-user"
            disabled={pending}
            type="submit">
            {pending ? <LoaderCircle size={13} className="spin action-spinner" aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
            {pending ? (isCreate ? "Creating account…" : "Saving changes…") : (isCreate ? "Create account" : "Save changes")}
          </button>
        </div>
        <span className="sr-only" role="status">{pending ? (isCreate ? "Creating account…" : "Saving changes…") : ""}</span>
      </form>
    </div>,
    document.body,
  );
}
