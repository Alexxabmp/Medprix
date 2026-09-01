import * as bcrypt from "bcrypt";

const MIN_PASSWORD_LENGTH = 8;
const MAX_BCRYPT_PASSWORD_BYTES = 72;
const DEFAULT_SALT_ROUNDS = 12;
const MIN_SALT_ROUNDS = 10;
const MAX_SALT_ROUNDS = 14;

function getSaltRounds(): number {
  const configuredRounds = Number(process.env.BCRYPT_SALT_ROUNDS);

  if (!Number.isInteger(configuredRounds)) {
    return DEFAULT_SALT_ROUNDS;
  }

  return Math.min(
    Math.max(configuredRounds, MIN_SALT_ROUNDS),
    MAX_SALT_ROUNDS,
  );
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string") {
    return "Password is required.";
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (Buffer.byteLength(password, "utf8") > MAX_BCRYPT_PASSWORD_BYTES) {
    return "Password must be 72 bytes or fewer.";
  }

  return null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, getSaltRounds());
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
