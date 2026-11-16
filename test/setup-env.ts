import { config } from "dotenv";

// Runs in every test worker: point the app's database at the test database.
config({ path: ".env.test.local" });
config({ path: ".env.test" });
process.env.APP_SECRET ??= "a".repeat(64);
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
