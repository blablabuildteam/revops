import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql, ensureTables } from "@/lib/db";

export async function GET() {
  try {
    await ensureTables();

    const { rows: existing } = await sql`SELECT COUNT(*) AS count FROM users`;
    if (Number(existing[0].count) > 0) {
      return NextResponse.json({ message: "Users already exist." });
    }

    const kevinHash = await bcrypt.hash("kevin2026", 12);
    const xennithHash = await bcrypt.hash("xennith2026", 12);

    await sql`
      INSERT INTO users (email, name, password_hash) VALUES
        ('kevin@blablabuild.com', 'Kevin', ${kevinHash}),
        ('xennith@blablabuild.com', 'Xennith', ${xennithHash})
    `;

    return NextResponse.json({
      success: true,
      message: "Users created. Remove /api/setup-users.",
      credentials: [
        { email: "kevin@blablabuild.com", password: "kevin2026" },
        { email: "xennith@blablabuild.com", password: "xennith2026" },
      ],
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
