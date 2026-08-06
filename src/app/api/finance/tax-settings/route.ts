import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { DEFAULT_TAX_SETTINGS, parseTaxSettings, type TaxSettings } from "@/lib/tax-settings";

const KEYS = Object.keys(DEFAULT_TAX_SETTINGS) as (keyof TaxSettings)[];

export async function GET() {
  try {
    await ensureTables();
    const { rows } = await sql`SELECT key, value FROM finance_settings`;
    const raw = Object.fromEntries(
      rows.map((r) => [String(r.key), String(r.value)]),
    );
    return NextResponse.json(parseTaxSettings(raw));
  } catch (err) {
    console.error(err);
    return NextResponse.json(DEFAULT_TAX_SETTINGS);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureTables();
    const body = (await req.json()) as Partial<TaxSettings>;

    const updates = KEYS.filter((key) => body[key] !== undefined).map((key) =>
      sql`
        INSERT INTO finance_settings (key, value, updated_at)
        VALUES (${key}, ${String(body[key])}, now())
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = now()
      `,
    );
    await Promise.all(updates);

    const { rows } = await sql`SELECT key, value FROM finance_settings`;
    const raw = Object.fromEntries(
      rows.map((r) => [String(r.key), String(r.value)]),
    );
    return NextResponse.json(parseTaxSettings(raw));
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to save tax settings" }, { status: 500 });
  }
}
