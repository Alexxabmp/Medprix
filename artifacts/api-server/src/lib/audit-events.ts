type Query = (text: string, params?: any[]) => Promise<{ rows: any[] }>;
export type AuditActor = { id: string; username: string; role: string };
export type AuditStatus = "Success" | "Failed" | "Warning";
export type ActivityFlag = "Normal" | "Suspicious" | "Flagged";

/** Call inside the business transaction. A replay must return before this point. */
export async function writeAuditEvent(query: Query, input: {
  actor: AuditActor; action: string; activity: string; module: string; description: string; deviceIp?: string | null;
  status?: AuditStatus; flag?: ActivityFlag;
}) {
  // Immutable actor context is retained in the event text; the FK identifies the account.
  // The admin feed's role column is explicitly the account's current role.
  const description = `${input.description} (Actor: ${input.actor.username}; role at event: ${input.actor.role})`;
  await query(`INSERT INTO system_logs(user_id,action_type,module,description,status,device_ip)
    VALUES($1,$2,$3,$4,$5,$6)`, [input.actor.id, input.action, input.module, description, input.status ?? "Success", input.deviceIp ?? null]);
  await query(`INSERT INTO user_activities(user_id,activity,module,description,flag)
    VALUES($1,$2,$3,$4,$5)`, [input.actor.id, input.activity, input.module, description, input.flag ?? "Normal"]);
}

/**
 * Sign-in events where there may be no account to link (an unknown username).
 * The attempted name is shortened and stripped of control characters before it is stored.
 */
export async function writeSignInEvent(query: Query, input: {
  userId: string | null; action: string; activity: string; description: string; status: AuditStatus; flag?: ActivityFlag; deviceIp?: string | null;
}) {
  await query(`INSERT INTO system_logs(user_id,action_type,module,description,status,device_ip)
    VALUES($1,$2,'Authentication',$3,$4,$5)`, [input.userId, input.action, input.description, input.status, input.deviceIp ?? null]);
  await query(`INSERT INTO user_activities(user_id,activity,module,description,flag)
    VALUES($1,$2,'Authentication',$3,$4)`, [input.userId, input.activity, input.description, input.flag ?? "Normal"]);
}

/** A typed username, safe to put in a log line: no control characters, at most 40 characters. */
export function loggableUsername(value: unknown): string {
  const clean = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return clean.length > 40 ? `${clean.slice(0, 40)}…` : clean;
}
