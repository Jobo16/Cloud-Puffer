import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const language = request.nextUrl.pathname === "/en" ? "en" : "zh";
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-jojobot-language", language);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set("jojobot-language", language, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export const config = { matcher: ["/", "/en"] };
