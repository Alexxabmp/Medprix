/** Driver errors may be nested by Drizzle; never expose SQL/driver text to clients. */
export function identifierConflict(error: unknown, names: readonly string[]): boolean {
  const item = error as { code?: string; constraint?: string; constraint_name?: string; cause?: unknown } | null;
  return Boolean(item && ((item.code === '23505' && names.some(name => name === item.constraint || name === item.constraint_name)) ||
    (item.cause && identifierConflict(item.cause, names))));
}
