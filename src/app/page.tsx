import type { Metadata } from "next";
import { Landing } from "@/components/landing";
export const metadata: Metadata = {
  title: "云上小肥鱼 — 开源的个人 AI 助手",
  robots: { index: true, follow: true },
};
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <Landing
      openAuth={
        typeof params.auth === "string" ||
        typeof params.token === "string" ||
        Boolean(params.error)
      }
      token={typeof params.token === "string" ? params.token : undefined}
      linkError={Boolean(params.error)}
    />
  );
}
