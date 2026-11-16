import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * Database tests run against TEST_DATABASE_URL (never the real database) and
 * are skipped when it is not set. The schema is rebuilt before each run.
 */
export default async function setup() {
  config({ path: ".env.test.local" });
  config({ path: ".env.test" });
  process.env.APP_SECRET ??= "a".repeat(64);

  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error("TEST_DATABASE_URL must point at a database with 'test' in its name.");
  }
  process.env.DATABASE_URL = url;

  const pool = new Pool({ connectionString: url });
  await pool.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
}
