import { z } from "zod";
import { isCalendarDate, pharmacyDate } from "./pharmacy-date";

export const WHOLESALE_PLAN_VERSION = "wholesale-terms-v2" as const;
export const WHOLESALE_MAX_CENTS = 999999999999n;
export const wholesalePaymentPlanSchema = z.enum(["Net30", "Net60"]);
export type WholesalePaymentPlan = z.infer<typeof wholesalePaymentPlanSchema>;

export const wholesalePlanTerms = Object.freeze({
  Net30: Object.freeze({
    installmentCount: 1,
    intervalDays: 30,
    settlementDays: 30,
  }),
  Net60: Object.freeze({
    installmentCount: 2,
    intervalDays: 30,
    settlementDays: 60,
  }),
});

/** Decimal strings only. Never round user input or convert money through Number. */
export const wholesaleMoneyInputSchema = z
  .string()
  .regex(/^\d{1,10}(?:\.\d{1,2})?$/);
export function wholesaleCents(value: string): bigint {
  const [whole, fraction = ""] = wholesaleMoneyInputSchema
    .parse(value)
    .split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
export function wholesaleAmount(value: bigint): string {
  if (value < 0n || value > WHOLESALE_MAX_CENTS)
    throw new RangeError("Wholesale amount is outside the supported range.");
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}
export const wholesaleAmountSchema = wholesaleMoneyInputSchema.transform(
  (value) => wholesaleAmount(wholesaleCents(value)),
);
export const wholesalePrincipalSchema = wholesaleAmountSchema.refine(
  (value) => wholesaleCents(value) > 0n,
  "The confirmed wholesale order total must be greater than zero.",
);
export const wholesaleCalendarDateSchema = z
  .string()
  .refine(isCalendarDate, "Enter a valid calendar date.");
export const wholesaleReceiptTimeSchema = z
  .string()
  .datetime({ offset: true })
  .refine(
    (value) =>
      isCalendarDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value)),
    "Enter a valid receipt time with a timezone.",
  );
export const wholesaleFullReceiptInputSchema = z
  .object({
    revision: z.number().int().positive().safe(),
    scheduleId: z.string().uuid(),
    receivedBy: z.string().trim().min(1).max(255),
    receivedAt: wholesaleReceiptTimeSchema.transform((value) =>
      new Date(value).toISOString(),
    ),
    receivedInFull: z.literal(true),
    nextPaymentDate: wholesaleCalendarDateSchema.optional(),
    finalDueDate: wholesaleCalendarDateSchema.optional(),
  })
  .strict();
export type WholesaleFullReceiptInput = z.infer<
  typeof wholesaleFullReceiptInputSchema
>;
export const wholesaleAgreementSchema = z
  .object({
    paymentPlan: wholesalePaymentPlanSchema,
    paymentPlanVersion: z.literal(WHOLESALE_PLAN_VERSION),
    total: wholesalePrincipalSchema,
  })
  .strict();
export type WholesaleAgreement = z.infer<typeof wholesaleAgreementSchema>;

export const wholesaleInstallmentSchema = z
  .object({
    sequenceNumber: z.number().int().min(1).max(2),
    dueDate: wholesaleCalendarDateSchema,
    amount: wholesaleAmountSchema,
  })
  .strict();
export type WholesaleInstallment = z.infer<typeof wholesaleInstallmentSchema>;
export type WholesaleInstallmentSchedule = WholesaleAgreement & {
  receivedAt: string;
  receiptDate: string;
  finalDueDate: string;
  nextPaymentDate: string;
  installments: WholesaleInstallment[];
};

export function addWholesaleCalendarDays(day: string, offset: number): string {
  wholesaleCalendarDateSchema.parse(day);
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return wholesaleCalendarDateSchema.parse(date.toISOString().slice(0, 10));
}

/** Pure calculation; persistence is activated only by confirmed client receipt. */
export function calculateWholesaleSchedule(input: {
  paymentPlan: WholesalePaymentPlan;
  total: string;
  receivedAt: string;
  paymentPlanVersion?: WholesaleAgreement["paymentPlanVersion"];
  nextPaymentDate?: string;
  finalDueDate?: string;
}): WholesaleInstallmentSchedule {
  const agreement = wholesaleAgreementSchema.parse({
    paymentPlan: input.paymentPlan,
    paymentPlanVersion: input.paymentPlanVersion ?? WHOLESALE_PLAN_VERSION,
    total: input.total,
  });
  const receivedAt = new Date(
    wholesaleReceiptTimeSchema.parse(input.receivedAt),
  ).toISOString();
  const receiptDate = wholesaleCalendarDateSchema.parse(
    pharmacyDate(new Date(receivedAt)),
  );
  const terms = wholesalePlanTerms[agreement.paymentPlan];
  const nextPaymentDate = wholesaleCalendarDateSchema.parse(
    input.nextPaymentDate ?? addWholesaleCalendarDays(receiptDate, 30),
  );
  const finalDueDate = wholesaleCalendarDateSchema.parse(
    input.finalDueDate ??
      (agreement.paymentPlan === "Net30"
        ? nextPaymentDate
        : addWholesaleCalendarDays(nextPaymentDate, 30)),
  );
  if (
    nextPaymentDate < receiptDate ||
    (agreement.paymentPlan === "Net30"
      ? finalDueDate !== nextPaymentDate
      : finalDueDate < addWholesaleCalendarDays(nextPaymentDate, 30))
  )
    throw new Error(
      "Next payment cannot precede receipt. Net 30 deadlines must match; Net 60 final deadline must be at least 30 days after the next payment date.",
    );
  const total = wholesaleCents(agreement.total);
  const base = total / BigInt(terms.installmentCount);
  return {
    ...agreement,
    receivedAt,
    receiptDate,
    nextPaymentDate,
    finalDueDate,
    installments: Array.from(
      { length: terms.installmentCount },
      (_, index) => ({
        sequenceNumber: index + 1,
        dueDate: index === 0 ? nextPaymentDate : finalDueDate,
        amount: wholesaleAmount(
          index === terms.installmentCount - 1
            ? total - base * BigInt(terms.installmentCount - 1)
            : base,
        ),
      }),
    ),
  };
}
