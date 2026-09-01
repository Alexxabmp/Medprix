import { db } from "./index";
import { usersTable } from "./schema/users";
import { eq } from "drizzle-orm";
import * as bcrypt from "bcrypt";

const SALT_ROUNDS = 12;
const bcryptHashPattern = /^\$2[aby]\$\d{2}\$.{53}$/;

async function seed() {
  console.log("Seeding database...");

  const defaultUsers = [
    { username: "admin1", password: "password 123", role: "admin" as const, fullName: "Admin User", contactNumber: "09123456789" },
    { username: "cashier1", password: "password 123", role: "cashier" as const, fullName: "Cashier User", contactNumber: "09123456789" },
    { username: "frontdesk1", password: "password 123", role: "frontdesk" as const, fullName: "Frontdesk User", contactNumber: "09123456789" },
  ];

  for (const user of defaultUsers) {
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, user.username));
    const passwordHash = await bcrypt.hash(user.password, SALT_ROUNDS);

    if (!existing) {
      await db.insert(usersTable).values({
        ...user,
        password: passwordHash,
      });
      console.log(`Created user: ${user.username} (role: ${user.role})`);
    } else if (
      !bcryptHashPattern.test(existing.password) ||
      !(await bcrypt.compare(user.password, existing.password))
    ) {
      await db
        .update(usersTable)
        .set({ password: passwordHash })
        .where(eq(usersTable.id, existing.id));
      console.log(`Updated password hash for existing user: ${user.username}`);
    } else {
      console.log(`- User ${user.username} already exists, skipping.`);
    }
  }

  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
