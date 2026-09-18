export type SlackChannelOption = {
  id: string;
  name: string;
  is_private: boolean;
  is_member: boolean;
};

export type SlackBindInput =
  | { action: "connect"; channelId: string }
  | { action: "create"; name: string; isPrivate?: boolean };

function slugPart(input?: string | null): string {
  return (input ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Slack channel names: lowercase letters, numbers, hyphens; max 80 chars. */
export function slackChannelName(input: string): string {
  return slugPart(input).slice(0, 80).replace(/-+$/g, "") || "channel";
}

/**
 * Default Slack channel name: `client-project`.
 * If the project name already starts with the client name, keep a single copy.
 */
export function suggestedSlackChannelName(
  clientName?: string | null,
  projectName?: string | null,
): string {
  const client = slugPart(clientName);
  const project = slugPart(projectName);
  if (client && project) {
    const combined =
      project === client || project.startsWith(`${client}-`)
        ? project
        : `${client}-${project}`;
    return combined.slice(0, 80).replace(/-+$/g, "") || "channel";
  }
  return client || project || "channel";
}

export function slackChannelUrl(channelId: string): string {
  const domain = (process.env.NEXT_PUBLIC_SLACK_WORKSPACE_DOMAIN || "blablabuild").replace(
    /\.slack\.com$/i,
    "",
  );
  return `https://${domain}.slack.com/archives/${channelId}`;
}
