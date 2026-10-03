import { NextResponse, type NextRequest } from "next/server";
import { auth, authConfigured } from "@/lib/auth/server";
export async function proxy(request: NextRequest) {
  if (!authConfigured)
    return NextResponse.redirect(new URL("/auth/sign-in", request.url));
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user)
    return NextResponse.redirect(new URL("/auth/sign-in", request.url));
  return NextResponse.next();
}
export const config = {
  matcher: [
    "/((?!api|auth|setup|invitacion|_next|notifications-sw.js|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
