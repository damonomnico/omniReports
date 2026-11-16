import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Reuse one pool across hot reloads in dev and across invocations of a warm
// serverless function in production.
const globalForDb = globalThis as unknown as { __omniPool?: Pool };

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
  return new Pool({
    connectionString,
    max: isLocal ? 10 : 5,
    ssl: isLocal || /sslmode=disable/.test(connectionString) ? undefined : true,
  });
}

const pool = globalForDb.__omniPool ?? createPool();
globalForDb.__omniPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
