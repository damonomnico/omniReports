/**
 * Creates or rebuilds the demo client (a fictional Cardiff plumber) with
 * generated sample data:  npm run seed:demo
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { seedDemoClient } = await import("../src/lib/demo/seed");
  const id = await seedDemoClient();
  console.log(`Demo client ready: /c/${id}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
