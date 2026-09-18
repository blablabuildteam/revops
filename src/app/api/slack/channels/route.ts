import { NextResponse } from "next/server";
import { listSlackChannels, SlackError, slackConfigured } from "@/lib/slack";
import { resolveSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await resolveSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!slackConfigured()) {
    return NextResponse.json({ configured: false, channels: [] });
  }

  try {
    const channels = await listSlackChannels();
    return NextResponse.json({ configured: true, channels });
  } catch (err) {
    console.error(err);
    if (err instanceof SlackError) {
      return NextResponse.json(
        { error: err.message, configured: true, channels: [] },
        { status: err.status },
      );
    }
    return NextResponse.json({ error: "Failed to list Slack channels" }, { status: 500 });
  }
}
