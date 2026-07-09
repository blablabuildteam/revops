import { NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";

export async function GET() {
  await ensureTables();
  const { rows } = await sql`SELECT id, email, name FROM users ORDER BY name`;
  return NextResponse.json(rows);
}
