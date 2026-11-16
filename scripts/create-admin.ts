/**
 * Creates (or repairs) an omniSEO admin login.
 *
 *   npm run create-admin -- you@example.com "Your Name"
 *       prints a one-time link to choose a password
 *   npm run create-admin -- you@example.com "Your Name" "a-strong-password"
 *       sets the password directly
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const [email, name, password] = process.argv.slice(2);
  if (!email || !name) {
    console.error('Usage: npm run create-admin -- <email> "<name>" [password]');
    process.exit(1);
  }

  const { eq } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const { users } = await import("../src/db/schema");
  const { hashPassword, MIN_PASSWORD_LENGTH } = await import("../src/lib/auth/password");
  const { issueUserToken, tokenUrl } = await import("../src/lib/auth/tokens");

  if (password && password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }

  const lower = email.trim().toLowerCase();
  let [user] = await db.select().from(users).where(eq(users.email, lower));
  if (user) {
    [user] = await db
      .update(users)
      .set({ role: "admin", isActive: true, name })
      .where(eq(users.id, user.id))
      .returning();
    console.log(`Updated existing login ${lower} to an active admin.`);
  } else {
    [user] = await db.insert(users).values({ email: lower, name, role: "admin" }).returning();
    console.log(`Created admin ${lower}.`);
  }

  if (password) {
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(password) })
      .where(eq(users.id, user!.id));
    console.log("Password set. You can sign in now.");
  } else {
    const token = await issueUserToken(user!.id, user!.passwordHash ? "reset" : "invite");
    console.log("Open this one-time link to choose a password:");
    console.log(tokenUrl(user!.passwordHash ? "reset" : "invite", token));
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
