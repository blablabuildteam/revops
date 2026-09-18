import {
  slackChannelName,
  type SlackBindInput,
  type SlackChannelOption,
} from "@/lib/slack-channel-name";

export type { SlackBindInput, SlackChannelOption as SlackChannel };

export class SlackError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "slack_error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type SlackBindResult = {
  slack_channel_id: string;
  slack_channel_name: string;
};

type SlackApiResponse = {
  ok: boolean;
  error?: string;
  needed?: string;
  user?: { id?: string; real_name?: string };
  channel?: {
    id?: string;
    name?: string;
    is_private?: boolean;
    is_member?: boolean;
  };
  channels?: Array<{
    id: string;
    name: string;
    is_private?: boolean;
    is_member?: boolean;
    is_archived?: boolean;
  }>;
  response_metadata?: { next_cursor?: string };
};

function botToken(): string | null {
  return process.env.SLACK_BOT_TOKEN?.trim() || null;
}

export function slackConfigured(): boolean {
  return Boolean(botToken());
}

function humanizeSlackError(code: string, needed?: string): string {
  switch (code) {
    case "name_taken":
      return "That Slack channel name already exists. Pick it from the list instead.";
    case "missing_scope":
      return needed
        ? `The Slack app is missing the ${needed} permission. Add it and reinstall.`
        : "The Slack app is missing a permission. Add the extra bot scopes and reinstall.";
    case "not_in_channel":
      return "Invite the Workspace bot to that private channel first, then try again.";
    case "channel_not_found":
      return "Slack could not find that channel.";
    case "restricted_action":
      return "This Slack workspace does not allow the bot to create channels.";
    case "invalid_name":
    case "invalid_name_specials":
    case "invalid_name_punctuation":
      return "Slack channel names can only use lowercase letters, numbers, and hyphens.";
    default:
      return `Slack error: ${code}`;
  }
}

async function slackRequest(
  method: string,
  body: Record<string, unknown> = {},
): Promise<SlackApiResponse> {
  const token = botToken();
  if (!token) {
    throw new SlackError("Slack is not configured", 503, "not_configured");
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined) continue;
    params.set(key, typeof value === "boolean" ? String(value) : String(value));
  }

  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const json = (await res.json()) as SlackApiResponse;
  if (!json.ok) {
    throw new SlackError(
      humanizeSlackError(json.error || "unknown_error", json.needed),
      400,
      json.error || "unknown_error",
    );
  }
  return json;
}

export async function listSlackChannels(): Promise<SlackChannelOption[]> {
  const channels: SlackChannelOption[] = [];
  let cursor = "";

  do {
    const json = await slackRequest("conversations.list", {
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });
    for (const ch of json.channels ?? []) {
      if (ch.is_archived) continue;
      channels.push({
        id: ch.id,
        name: ch.name,
        is_private: Boolean(ch.is_private),
        is_member: Boolean(ch.is_member),
      });
    }
    cursor = json.response_metadata?.next_cursor ?? "";
  } while (cursor);

  return channels.sort((a, b) => a.name.localeCompare(b.name));
}

async function channelInfo(channelId: string): Promise<SlackChannelOption> {
  const json = await slackRequest("conversations.info", { channel: channelId });
  const ch = json.channel;
  if (!ch?.id || !ch.name) {
    throw new SlackError("Slack could not find that channel.", 400, "channel_not_found");
  }
  return {
    id: ch.id,
    name: ch.name,
    is_private: Boolean(ch.is_private),
    is_member: Boolean(ch.is_member),
  };
}

async function ensureMembership(channel: SlackChannelOption): Promise<void> {
  if (channel.is_member) return;
  if (channel.is_private) {
    throw new SlackError(
      "Invite the Workspace bot to that private channel first, then try again.",
      400,
      "not_in_channel",
    );
  }
  await slackRequest("conversations.join", { channel: channel.id });
}

const TEAM_MEMBERS = [
  { name: "Kevin", email: "kevin@blablabuild.com" },
  { name: "Xennith", email: "xennith@blablabuild.com" },
] as const;

let cachedTeamSlack: Array<{ name: string; email: string; slackId: string }> | null =
  null;

async function loadTeamSlack(): Promise<Array<{ name: string; email: string; slackId: string }>> {
  if (cachedTeamSlack) return cachedTeamSlack;
  const members: Array<{ name: string; email: string; slackId: string }> = [];
  for (const person of TEAM_MEMBERS) {
    try {
      const json = await slackRequest("users.lookupByEmail", { email: person.email });
      if (json.user?.id) {
        members.push({ ...person, slackId: json.user.id });
      }
    } catch (err) {
      console.warn(`Slack lookup failed for ${person.email}`, err);
    }
  }
  cachedTeamSlack = members;
  return members;
}

export function assigneeMatchesPerson(
  assignees: Array<{ name?: string | null; email?: string | null }>,
  person: { name: string; email: string },
): boolean {
  const personEmail = person.email.toLowerCase();
  const personName = person.name.toLowerCase();
  return assignees.some((assignee) => {
    const email = assignee.email?.trim().toLowerCase();
    const name = assignee.name?.trim().toLowerCase();
    return (
      email === personEmail ||
      name === personName ||
      Boolean(name?.split(/[+,&]/).some((part) => part.trim() === personName))
    );
  });
}

async function teamMemberSlackIds(): Promise<string[]> {
  return (await loadTeamSlack()).map((person) => person.slackId);
}

export async function teamSlackMembers(): Promise<Array<{ name: string; email: string; slackId: string }>> {
  return loadTeamSlack();
}

/** Slack mention tokens (`<@U…>`) for Kevin / Xennith based on names or emails. */
export async function slackMentionsForAssignees(
  assignees: Array<{ name?: string | null; email?: string | null }>,
): Promise<string[]> {
  const team = await loadTeamSlack();
  return team
    .filter((person) => assigneeMatchesPerson(assignees, person))
    .map((person) => `<@${person.slackId}>`);
}

export async function openSlackDm(slackUserId: string): Promise<string> {
  const json = await slackRequest("conversations.open", {
    users: slackUserId,
    return_im: true,
  });
  const id = json.channel?.id;
  if (!id) {
    throw new SlackError("Could not open a Slack DM.", 502, "dm_open_failed");
  }
  return id;
}

export async function postSlackMessage(channel: string, text: string): Promise<void> {
  await slackRequest("chat.postMessage", {
    channel,
    text,
    unfurl_links: false,
    unfurl_media: false,
  });
}

async function inviteTeamMembers(channelId: string): Promise<void> {
  const users = await teamMemberSlackIds();
  if (users.length === 0) return;
  try {
    await slackRequest("conversations.invite", {
      channel: channelId,
      users: users.join(","),
      force: true,
    });
  } catch (err) {
    if (err instanceof SlackError && err.code === "already_in_channel") return;
    console.warn("Slack invite failed", err);
  }
}

export async function provisionSlackChannel(
  input: SlackBindInput,
  context: { kind: "project" | "retainer"; title: string },
): Promise<SlackBindResult> {
  if (!slackConfigured()) {
    throw new SlackError("Slack is not configured", 503, "not_configured");
  }

  let channel: SlackChannelOption;

  if (input.action === "connect") {
    if (!input.channelId) {
      throw new SlackError("Pick a Slack channel.", 400, "invalid_arguments");
    }
    channel = await channelInfo(input.channelId);
    await ensureMembership(channel);
  } else {
    const name = slackChannelName(input.name);
    const json = await slackRequest("conversations.create", {
      name,
      is_private: true,
    });
    const created = json.channel;
    if (!created?.id || !created.name) {
      throw new SlackError("Slack did not return the new channel.", 502, "create_failed");
    }
    channel = {
      id: created.id,
      name: created.name,
      is_private: Boolean(created.is_private),
      is_member: true,
    };
  }

  await inviteTeamMembers(channel.id);

  const label = context.kind === "project" ? "project" : "retainer";
  const purpose = `blablabuild ${label}: ${context.title}`.slice(0, 250);
  try {
    await slackRequest("conversations.setPurpose", {
      channel: channel.id,
      purpose,
    });
  } catch (err) {
    console.warn("Slack setPurpose failed", err);
  }
  try {
    await slackRequest("chat.postMessage", {
      channel: channel.id,
      text: `Linked to the ${label} *${context.title}* in Workspace.`,
    });
  } catch (err) {
    console.warn("Slack intro message failed", err);
  }

  return {
    slack_channel_id: channel.id,
    slack_channel_name: channel.name,
  };
}

export function parseSlackBindInput(body: unknown): SlackBindInput {
  if (!body || typeof body !== "object") {
    throw new SlackError("Invalid Slack payload.", 400, "invalid_arguments");
  }
  const data = body as {
    action?: string;
    channelId?: string;
    channel_id?: string;
    name?: string;
    isPrivate?: boolean;
    is_private?: boolean;
  };
  if (data.action === "connect") {
    const channelId = data.channelId || data.channel_id;
    if (!channelId) {
      throw new SlackError("Pick a Slack channel.", 400, "invalid_arguments");
    }
    return { action: "connect", channelId };
  }
  if (data.action === "create") {
    if (!data.name?.trim()) {
      throw new SlackError("Enter a Slack channel name.", 400, "invalid_arguments");
    }
    return {
      action: "create",
      name: data.name,
      isPrivate: true,
    };
  }
  throw new SlackError("Choose connect or create.", 400, "invalid_arguments");
}
