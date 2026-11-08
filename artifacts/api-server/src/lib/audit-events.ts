type Query = (text: string, params?: any[]) => Promise<{ rows: any[] }>;
export type AuditActor = { id: string; username: string; role: string };

/** Call inside the business transaction. A replay must return before this point. */
export async function writeAuditEvent(query: Query, input: {
  actor: AuditActor; action: string; activity: string; module: string; description: string; deviceIp?: string | null;
}) {
  // Immutable actor context is retained in the event text; the FK identifies the account.
  // The admin feed's role column is explicitly the account's current role.
  const description = `${input.description} (Actor: ${input.actor.username}; role at event: ${input.actor.role})`;
  await query(`INSERT INTO system_logs(user_id,action_type,module,description,status,device_ip)
    VALUES($1,$2,$3,$4,'Success',$5)`, [input.actor.id, input.action, input.module, description, input.deviceIp ?? null]);
  await query(`INSERT INTO user_activities(user_id,activity,module,description,flag)
    VALUES($1,$2,$3,$4,'Normal')`, [input.actor.id, input.activity, input.module, description]);
}
