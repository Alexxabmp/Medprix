/** "My account" calls for every role (Part B). Each resolves to an error message, or null when it worked. */
export type OwnAccount = {
  id: string; username: string; fullName: string; contactNumber: string | null; role: "Admin" | "Cashier" | "FrontDesk"; mustChangePassword: boolean;
};

async function call(url: string, method: string, body?: unknown): Promise<{ error: string | null; data: any }> {
  const token = localStorage.getItem("medprix-token");
  try {
    const response = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
    return { error: response.ok ? null : data.error ?? "That didn't go through. Please try again.", data };
  } catch {
    return { error: "Could not reach the server. Check the connection and try again.", data: {} };
  }
}

export async function fetchOwnAccount(): Promise<{ error: string | null; account: OwnAccount | null }> {
  const { error, data } = await call("/api/account", "GET");
  return { error, account: error ? null : (data as OwnAccount) };
}

export async function updateOwnAccount(fullName: string, contactNumber: string | null) {
  return call("/api/account", "PATCH", { fullName, contactNumber });
}

export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<string | null> {
  return (await call("/api/account/password", "POST", { currentPassword, newPassword })).error;
}

/** Same rules as the server: at least 8 characters, different from the current one, typed twice the same. */
export function newPasswordProblem(current: string, next: string, confirm: string): string | null {
  if (next.length < 8) return "New passwords need at least 8 characters.";
  if (next === current) return "Choose a new password that's different from your current one.";
  if (next !== confirm) return "The two new passwords don't match.";
  return null;
}
