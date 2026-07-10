import { NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await resolveSessionUser();
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({ user });
}
