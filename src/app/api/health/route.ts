import { pool } from "@/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await pool().query("SELECT 1");
    return Response.json(
      { status: "ready" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
