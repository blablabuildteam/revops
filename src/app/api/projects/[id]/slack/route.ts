import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { resolveSessionUser } from "@/lib/auth";
import { parseSlackBindInput, provisionSlackChannel, SlackError } from "@/lib/slack";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await resolveSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    await ensureTables();
    const { rows: existing } = await sql`
      SELECT id, name, slack_channel_id FROM projects WHERE id = ${id}
    `;
    if (!existing[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const input = parseSlackBindInput(await req.json());
    const bound = await provisionSlackChannel(input, {
      kind: "project",
      title: String(existing[0].name),
    });

    const { rows } = await sql`
      UPDATE projects SET
        slack_channel_id = ${bound.slack_channel_id},
        slack_channel_name = ${bound.slack_channel_name},
        updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `;
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error(err);
    if (err instanceof SlackError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to link Slack channel" }, { status: 500 });
  }
}
