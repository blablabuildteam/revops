import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = ["/login", "/project", "/robots.txt"]; // /project/[token] is public client view
const COOKIE = "bb_auth";

function secret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET ?? "fallback-secret-change-me"
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public routes and API routes that don't need auth
  const isPublic =
    PUBLIC.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/api/project/") || // public client task submission
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/setup-users") ||
    pathname.startsWith("/api/seed-sample-data");

  const token = req.cookies.get(COOKIE)?.value;

  if (!token) {
    if (isPublic) return NextResponse.next();
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    await jwtVerify(token, secret());
    if (pathname === "/login")
      return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  } catch {
    if (isPublic) return NextResponse.next();
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete(COOKIE);
    return res;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
