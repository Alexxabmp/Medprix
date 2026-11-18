import { pgEnum } from "drizzle-orm/pg-core";

export const paymentPlanEnum = pgEnum("payment_plan_enum", ["Net30", "Net60"]);
