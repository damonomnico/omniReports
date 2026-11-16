import { redirect } from "next/navigation";
import { isStaff, listAccessibleClients } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/guards";

/** Sends each person to the most useful starting page for them. */
export default async function HomePage() {
  const user = await requireUser();
  if (isStaff(user)) redirect("/clients");

  const clients = await listAccessibleClients(user);
  if (clients.length === 1) redirect(`/c/${clients[0]!.id}`);
  redirect("/clients");
}
