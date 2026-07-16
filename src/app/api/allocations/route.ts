import { NextRequest, NextResponse } from "next/server";
import { ensureTables, sql } from "@/lib/db";
import { resolveSessionUser } from "@/lib/auth";
import type { AllocationTargetType } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set<AllocationTargetType>(["project", "opportunity", "generic"]);

/** Return week as YYYY-MM-DD so clients don't hit timezone shifts from DATE → Date. */
async function listAllocations() {
  const { rows } = await sql`
    SELECT
      id,
      person,
      target_type,
      target_id,
      to_char(week, 'YYYY-MM-DD') AS week,
      percentage,
      created_at,
      updated_at
    FROM allocations
    ORDER BY person, week, target_type, target_id
  `;
  return rows;
}

export async function GET() {
  await ensureTables();
  await resolveSessionUser();
  return NextResponse.json(await listAllocations());
}

export async function PUT(request: NextRequest) {
  await ensureTables();
  await resolveSessionUser();

  const body = await request.json();
  const { entries } = body as {
    entries: {
      person: string;
      target_type: AllocationTargetType;
      target_id: string;
      week: string;
      percentage: number;
    }[];
  };

  if (!Array.isArray(entries)) {
    return NextResponse.json({ error: "entries array required" }, { status: 400 });
  }

  for (const entry of entries) {
    const { person, target_type, target_id, week, percentage } = entry;
    if (!person || !target_type || !target_id || !week || percentage == null) continue;
    if (!VALID_TYPES.has(target_type)) continue;

    const weekKey = String(week).slice(0, 10);
    const pct = Math.max(0, Math.min(100, Math.round(Number(percentage))));

    if (pct === 0) {
      await sql`
        DELETE FROM allocations
        WHERE person = ${person}
          AND target_type = ${target_type}
          AND target_id = ${target_id}
          AND week = ${weekKey}::date
      `;
      continue;
    }

    const existing = await sql`
      SELECT id FROM allocations
      WHERE person = ${person}
        AND target_type = ${target_type}
        AND target_id = ${target_id}
        AND week = ${weekKey}::date
      LIMIT 1
    `;

    if (existing.rows.length > 0) {
      await sql`
        UPDATE allocations
        SET percentage = ${pct}, updated_at = now()
        WHERE id = ${existing.rows[0].id}::uuid
      `;
    } else {
      await sql`
        INSERT INTO allocations (person, target_type, target_id, week, percentage)
        VALUES (${person}, ${target_type}, ${target_id}, ${weekKey}::date, ${pct})
      `;
    }
  }

  return NextResponse.json(await listAllocations());
}
