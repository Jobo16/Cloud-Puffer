import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { adminUsers, isAdminEmail } from "@/server/admin";
import { AdminPage } from "@/components/admin-page";
import { LanguageProvider } from "@/components/language";

export const dynamic = "force-dynamic";

export default async function AdminRoute() {
  const language =
    (await cookies()).get("jojobot-language")?.value === "en" ? "en" : "zh";
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session?.user.emailVerified)
    redirect(language === "en" ? "/en?auth=login" : "/?auth=login");
  if (!isAdminEmail(session.user.email)) redirect("/app");
  return (
    <LanguageProvider language={language}>
      <AdminPage initial={await adminUsers("")} />
    </LanguageProvider>
  );
}
