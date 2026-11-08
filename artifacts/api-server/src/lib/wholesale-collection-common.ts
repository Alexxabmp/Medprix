import { WholesaleError, type WholesaleQuery } from "./wholesale-operations";

export function wholesaleFields(input: any, allowed: string[]) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !allowed.includes(key))
  )
    throw new WholesaleError(400, "Unexpected or missing request fields.");
}
export function wholesaleText(
  value: unknown,
  label: string,
  maximum = 500,
  required = true,
): string | null {
  if (!required && (value == null || value === "")) return null;
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > maximum
  )
    throw new WholesaleError(
      400,
      "Enter " + label + " (up to " + maximum + " characters).",
    );
  return value.trim();
}
export async function wholesaleActorName(
  query: WholesaleQuery,
  userId: string,
) {
  const {
    rows: [user],
  } = await query(
    "SELECT coalesce(nullif(full_name,''),username) AS name FROM users WHERE id=$1 AND is_active=true",
    [userId],
  );
  if (!user) throw new WholesaleError(409, "This user is no longer active.");
  return user.name as string;
}
