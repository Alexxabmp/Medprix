import { z } from "zod";

const optionalText = (max: number, message: string) =>
  z
    .string({ invalid_type_error: message })
    .trim()
    .max(max, message)
    .nullish()
    .transform((value) => value || null);

/** Same Philippine mobile formats normalized by User management's backend. */
export const wholesaleContactNumberSchema = optionalText(
  50,
  "Enter a valid contact number.",
).transform((value, ctx) => {
  if (!value) return null;
  if (!/^\+?[\d\s()-]+$/.test(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Use +639XXXXXXXXX or 09XXXXXXXXX for the contact number.",
    });
    return z.NEVER;
  }
  const digits = value.replace(/\D/g, "");
  if (/^639\d{9}$/.test(digits)) return `+${digits}`;
  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `+63${digits}`;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: "Use +639XXXXXXXXX or 09XXXXXXXXX for the contact number.",
  });
  return z.NEVER;
});

export const wholesaleClientContactsSchema = z.object({
  contactPerson: optionalText(
    255,
    "Enter a valid contact person (up to 255 characters).",
  ).refine(
    (value) =>
      !value ||
      (/\p{L}/u.test(value) && /^[\p{L}\p{M} .\u2019'\-]+$/u.test(value)),
    "Contact person must be a name using letters, spaces, apostrophes, periods or hyphens.",
  ),
  contactNumber: wholesaleContactNumberSchema,
  email: optionalText(
    255,
    "Enter a valid email address (up to 255 characters).",
  ).refine(
    (value) => !value || z.string().email().safeParse(value).success,
    "Enter a valid email address.",
  ),
});

/** Match User management's input guard without changing that page's behavior. */
export function cleanWholesalePhoneInput(value: string) {
  const cleaned = value.replace(/[^0-9+\s()-]/g, "");
  return (
    (cleaned.startsWith("+") ? "+" : "") + cleaned.replace(/\+/g, "")
  ).slice(0, 20);
}
