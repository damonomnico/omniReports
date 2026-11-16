"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";
import { DEMO_DOMAIN, seedDemoClient } from "@/lib/demo/seed";

/** Creates the demo client, or rebuilds it with fresh dates. */
export async function createDemoClientAction(): Promise<void> {
  await requireStaff();
  const id = await seedDemoClient();
  revalidatePath("/", "layout");
  redirect(`/c/${id}`);
}

export async function removeDemoClientAction(): Promise<void> {
  await requireStaff();
  await db.delete(clients).where(eq(clients.domain, DEMO_DOMAIN));
  revalidatePath("/", "layout");
}
