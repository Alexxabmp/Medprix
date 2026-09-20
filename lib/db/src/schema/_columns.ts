import { numeric } from "drizzle-orm/pg-core";

export const money = (name: string) => numeric(name, { precision: 12, scale: 2 });