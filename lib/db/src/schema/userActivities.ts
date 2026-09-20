import { pgTable, pgEnum, uuid, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const activityFlagEnum = pgEnum("activity_flag_enum", ["Normal", "Suspicious", "Flagged"]);

export const userActivitiesTable = pgTable(
  "user_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    activity: varchar("activity", { length: 255 }).notNull(),
    module: varchar("module", { length: 100 }).notNull(),
    description: text("description").notNull(),
    flag: activityFlagEnum("flag").notNull().default("Normal"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_user_activities_user_id").on(t.userId),
    index("idx_user_activities_module").on(t.module),
    index("idx_user_activities_flag").on(t.flag),
    index("idx_user_activities_timestamp").on(t.timestamp),
  ],
);

export type UserActivityRecord = typeof userActivitiesTable.$inferSelect;
export type InsertUserActivityRecord = typeof userActivitiesTable.$inferInsert;
export type ActivityFlag = (typeof activityFlagEnum.enumValues)[number];