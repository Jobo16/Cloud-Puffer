import {
  adminLimitInput,
  adminUsers,
  requireAdmin,
  updateUserPointLimit,
} from "@/server/admin";
import { errorResponse, json, readBody } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return json(
      await adminUsers(new URL(request.url).searchParams.get("search") ?? ""),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin(request);
    return json(
      await updateUserPointLimit(
        adminLimitInput.parse(await readBody(request)),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
