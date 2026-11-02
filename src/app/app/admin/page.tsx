import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { adminUsers, isAdminEmail } from "@/server/admin";
import { AdminPage } from "@/components/admin-page";

export const dynamic = "force-dynamic";

export default async function AdminRoute() {
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session?.user.emailVerified) redirect("/?auth=login");
  if (!isAdminEmail(session.user.email)) redirect("/app");
  return <AdminPage initial={await adminUsers("")} />;
}
