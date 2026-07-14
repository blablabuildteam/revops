import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { sql } from "@/lib/db";

const COOKIE = "bb_auth";
const secret = () =>
  new TextEncoder().encode(process.env.AUTH_SECRET ?? "fallback-secret-change-me");

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatar_url?: string | null;
}

export async function signToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** Resolve the logged-in user against the database (JWT id can go stale after re-seed). */
export async function resolveSessionUser(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;

  const { rows } = await sql`
    SELECT id, email, name, avatar_url FROM users WHERE email = ${session.email.toLowerCase()}
  `;
  if (rows[0]) {
    return rows[0] as SessionUser;
  }

  return session;
}

export const COOKIE_NAME = COOKIE;
