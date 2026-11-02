import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { appState } from "@/server/state";
import { Workspace } from "@/components/workspace";
import { isAdminEmail } from "@/server/admin";
export const dynamic = "force-dynamic";
export default async function AppPage() {
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session?.user.emailVerified) redirect("/?auth=login");
  return (
    <Workspace
      initial={await appState(session.user.id)}
      user={{ name: session.user.name, email: session.user.email }}
      admin={isAdminEmail(session.user.email)}
    />
  );
}
