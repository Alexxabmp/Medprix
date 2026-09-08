import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { Summary } from "@/components/custom-ui/summary-card";
import type { ToastFn, UserRecord } from "@/lib/types";

export default function UserManagementPage({
  users,
  setUsers,
  onToast,
}: {
  users: UserRecord[];
  setUsers: (users: UserRecord[]) => void;
  onToast: ToastFn;
}) {
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<"create" | "edit" | "reset" | null>(
    null,
  );
  const [selected, setSelected] = useState<UserRecord | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    username: "",
    role: "Pharmacist",
    phone: "",
  });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetError, setResetError] = useState("");

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
    setSelected(null);
    setDraft({ name: "", username: "", role: "Cashier", phone: "" });
    setDialog("create");
  };
  const openEdit = (user: UserRecord) => {
    setSelected(user);
    setDraft({
      name: user.name,
      username: user.username,
      role: user.role,
      phone: user.phone,
    });
    setDialog("edit");
  };
  const toggleStatus = (user: UserRecord) => {
    const next = user.status === "Active" ? "Inactive" : "Active";
    setUsers(users.map((u) => (u.id === user.id ? { ...u, status: next } : u)));
    onToast(`${user.name} is now ${next.toLowerCase()}`);
  };
  const submitUser = async (event: FormEvent, password = "") => {
    event.preventDefault();
    if (!draft.name.trim() || !draft.username.trim()) return;

    if (dialog === "create") {
      const dbRole =
        draft.role === "Administrator"
          ? "admin"
          : draft.role === "Front Desk"
            ? "frontdesk"
            : "cashier";
      try {
        const response = await fetch("http://localhost:5000/api/users", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: draft.username,
            password,
            fullName: draft.name,
            contactNumber: draft.phone,
            role: dbRole,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          onToast(data.error ?? "Failed to create user");
          return;
        }
        const initials = draft.name
          .split(" ")
          .map((part) => part[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();
        setUsers([
          ...users,
          {
            id: data.id || Date.now(),
            initials,
            name: draft.name,
            username: draft.username,
            role: draft.role,
            status: "Active",
            lastActive: "Just now",
            phone: draft.phone,
          },
        ]);
        onToast("Account created");
      } catch {
        onToast("Could not create user. Please check your session.");
        return;
      }
    } else if (selected) {
      const dbRole =
        draft.role === "Administrator"
          ? "admin"
          : draft.role === "Front Desk"
            ? "frontdesk"
            : "cashier";
      try {
        const response = await fetch(
          `http://localhost:5000/api/users/${selected.id}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              role: dbRole,
              fullName: draft.name,
              contactNumber: draft.phone,
            }),
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
              name: draft.name,
              username: draft.username,
              role: draft.role,
              phone: draft.phone,
              initials: draft.name
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase(),
            }
            : user,
        ),
      );
      onToast("User profile updated");
    }

    setDialog(null);
    return;
  };
  const remove = (user: UserRecord) => {
    if (window.confirm(`Remove ${user.name} from Medprix?`)) {
      setUsers(users.filter((item) => item.id !== user.id));
      onToast("User account removed");
    }
  };
  const reset = (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 6) {
      setResetError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setResetError("Passwords do not match.");
      return;
    }
    setResetError("");
    setDialog(null);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    onToast(`Password successfully updated for ${selected?.name}`);
  };
  const shown = users.filter((user) =>
    `${user.name} ${user.username} ${user.role}`
      .toLowerCase()
      .includes(search.toLowerCase()),
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
              placeholder="Search name, email, or role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="muted" style={{ fontSize: 11 }}>
            {shown.length} accounts
          </span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Phone number</th>
                <th>Status</th>
                <th>Last active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((user) => (
                <tr key={user.id} data-testid={`row-user-${user.id}`}>
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
                        <strong>{user.name}</strong>
                        <div className="muted" style={{ fontSize: 10 }}>
                          {user.username}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <select
                      className="select"
                      style={{ height: 30, padding: "0 8px" }}
                      data-testid={`select-role-${user.id}`}
                      value={user.role}
                      onChange={async (e) => {
                        const newRoleLabel = e.target.value;
                        const dbRole =
                          newRoleLabel === "Administrator"
                            ? "admin"
                            : newRoleLabel === "Front Desk"
                              ? "frontdesk"
                              : "cashier";
                        try {
                          const response = await fetch(
                            `http://localhost:5000/api/users/${user.id}`,
                            {
                              method: "PATCH",
                              credentials: "include",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ role: dbRole }),
                            },
                          );
                          if (!response.ok) {
                            const data = await response
                              .json()
                              .catch(() => ({}));
                            onToast(data.error ?? "Failed to update role");
                            return;
                          }
                        } catch {
                          onToast("Could not reach the server.");
                          return;
                        }
                        setUsers(
                          users.map((item) =>
                            item.id === user.id
                              ? { ...item, role: newRoleLabel }
                              : item,
                          ),
                        );
                        onToast("Role updated");
                      }}>
                      <option>Administrator</option>
                      <option>Front Desk</option>
                      <option>Cashier</option>
                    </select>
                  </td>
                  <td className="muted">{user.phone || "\u2014"}</td>
                  <td>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        className={`pill ${user.status === "Active" ? "success" : "neutral"}`}>
                        {user.status}
                      </span>
                      <button
                        className={`toggle ${user.status === "Active" ? "on" : ""}`}
                        data-testid={`toggle-status-${user.id}`}
                        aria-pressed={user.status === "Active"}
                        onClick={() => toggleStatus(user)}
                        title={`Set ${user.status === "Active" ? "inactive" : "active"}`}>
                        <span />
                      </button>
                    </div>
                  </td>
                  <td className="muted">{user.lastActive}</td>
                  <td>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button
                        className="icon-button"
                        data-testid={`button-edit-user-${user.id}`}
                        aria-label={`Edit ${user.name}`}
                        onClick={() => openEdit(user)}>
                        <Pencil size={13} />
                      </button>
                      <button
                        className="icon-button"
                        data-testid={`button-reset-user-${user.id}`}
                        aria-label={`Reset password for ${user.name}`}
                        onClick={() => {
                          setSelected(user);
                          setPassword("");
                          setConfirmPassword("");
                          setShowPassword(false);
                          setShowConfirmPassword(false);
                          setResetError("");
                          setDialog("reset");
                        }}>
                        <KeyRound size={13} />
                      </button>
                      <button
                        className="icon-button"
                        data-testid={`button-delete-user-${user.id}`}
                        aria-label={`Delete ${user.name}`}
                        onClick={() => remove(user)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && (
            <div className="empty-state">
              <Users size={25} />
              <div>No user accounts match your search.</div>
            </div>
          )}
        </div>
      </section>
      {(dialog === "create" || dialog === "edit") && (
        <UserDialog
          title={dialog === "create" ? "Create account" : "Edit profile"}
          isCreate={dialog === "create"}
          draft={draft}
          setDraft={setDraft}
          onClose={() => setDialog(null)}
          onSubmit={submitUser}
        />
      )}
      {dialog === "reset" &&
        createPortal(
          <div
            className="modal-backdrop"
            onMouseDown={(event) =>
              event.currentTarget === event.target && setDialog(null)
            }>
            <form className="modal dialog" onSubmit={reset}>
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
                  onClick={() => setDialog(null)}>
                  <X size={16} />
                </button>
              </div>
              <div className="form-grid">
                <div className="field" style={{ position: "relative" }}>
                  <label htmlFor="reset-password">New password</label>
                  <input
                    id="reset-password"
                    data-testid="input-reset-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
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
              </div>
              {resetError && (
                <p
                  style={{
                    color: "#FF453A",
                    fontSize: 11,
                    margin: "10px 0 0",
                  }}>
                  {resetError}
                </p>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="button soft"
                  onClick={() => setDialog(null)}>
                  Cancel
                </button>
                <button
                  className="button dark"
                  data-testid="button-confirm-reset"
                  type="submit">
                  Reset password <KeyRound size={13} />
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </div>
  );
}

function UserDialog({
  title,
  isCreate,
  draft,
  setDraft,
  onClose,
  onSubmit,
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
}) {
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdError, setPwdError] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isCreate) {
      if (password.length < 6) {
        setPwdError("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirmPwd) {
        setPwdError("Passwords do not match.");
        return;
      }
    }
    setPwdError("");
    onSubmit(e, password);
  };

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) =>
        event.currentTarget === event.target && onClose()
      }>
      <form className="modal dialog" onSubmit={handleSubmit}>
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            <p className="modal-sub">Account details and workspace access.</p>
          </div>
          <button
            type="button"
            className="modal-close"
            data-testid="button-close-user-dialog"
            onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="form-grid">
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
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              placeholder="+63 9XX XXX XXXX"
            />
          </div>
          <div className="field">
            <label htmlFor="user-role">Role</label>
            <select
              id="user-role"
              data-testid="select-user-role"
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
              <option>Administrator</option>
              <option>Front Desk</option>
              <option>Cashier</option>
            </select>
          </div>
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
                  placeholder="At least 6 characters"
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
        </div>
        {pwdError && (
          <p style={{ color: "#FF453A", fontSize: 11, margin: "10px 0 0" }}>
            {pwdError}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button soft" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button dark"
            data-testid="button-save-user"
            type="submit">
            <Check size={13} /> {isCreate ? "Create account" : "Save changes"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
