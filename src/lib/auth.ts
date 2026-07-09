import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "bb_auth";
const secret = () =>
  new TextEncoder().encode(process.env.AUTH_SECRET ?? "fallback-secret-change-me");

export interface SessionUser {
  id: string;
  email: string;
  name: string;
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

export const COOKIE_NAME = COOKIE;
