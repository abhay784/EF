import "server-only";

interface SlackChannel {
  id: string;
  name?: string;
  is_member?: boolean;
  is_private?: boolean;
  is_im?: boolean;
  is_mpim?: boolean;
  user?: string;
}

interface SlackMessage {
  user?: string;
  text?: string;
  ts: string;
  bot_id?: string;
}

interface SlackUser {
  id: string;
  name?: string;
  real_name?: string;
}

export interface AggregatedFile {
  name: string;
  content: string;
}

async function slackGet<T>(method: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`https://slack.com/api/${method}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return (await res.json()) as T;
}

function channelLabel(c: SlackChannel, userMap: Map<string, string>): string {
  if (c.is_im) {
    const name = userMap.get(c.user || "") || c.user || c.id;
    return `dm-${name}`;
  }
  if (c.is_mpim) return c.name || `mpim-${c.id}`;
  return c.name || c.id;
}

function safeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || `chan_${Date.now()}`;
}

export async function aggregateSlack(
  accessToken: string,
  daysBack = 7
): Promise<{ files: AggregatedFile[]; logs: string[] }> {
  const logs: string[] = [];

  if (!accessToken) {
    logs.push("[slack] no access token — skipping");
    return { files: [], logs };
  }

  const cutoffTs = Math.floor((Date.now() - daysBack * 24 * 60 * 60 * 1000) / 1000);

  // Resolve user IDs to display names
  const userMap = new Map<string, string>();
  try {
    const usersRes = await slackGet<{ ok: boolean; members?: SlackUser[] }>("users.list", accessToken, { limit: "200" });
    if (usersRes.ok) {
      for (const u of usersRes.members || []) {
        userMap.set(u.id, u.real_name || u.name || u.id);
      }
    }
  } catch (e) {
    logs.push(`[slack] users.list failed: ${e instanceof Error ? e.message : e}`);
  }

  // List all conversations the token can see
  const convRes = await slackGet<{ ok: boolean; channels?: SlackChannel[]; error?: string }>(
    "conversations.list",
    accessToken,
    { types: "public_channel,private_channel,im,mpim", limit: "100" }
  );

  if (!convRes.ok) {
    logs.push(`[slack] conversations.list error: ${convRes.error}`);
    return { files: [], logs };
  }

  const channels = convRes.channels || [];
  // For user tokens, the user is always implicit member of their own DMs/MPIMs.
  const accessible = channels.filter((c) => c.is_member ?? (c.is_im || c.is_mpim));
  logs.push(`[slack] ${channels.length} channels visible, ${accessible.length} accessible`);

  const files: AggregatedFile[] = [];

  for (const c of accessible) {
    try {
      const histRes = await slackGet<{ ok: boolean; messages?: SlackMessage[] }>(
        "conversations.history",
        accessToken,
        { channel: c.id, oldest: String(cutoffTs), limit: "50" }
      );

      const messages = (histRes.messages || []).filter(
        (m) => (m.text || "").trim().length > 0 && Number(m.ts) >= cutoffTs
      );

      if (messages.length === 0) continue;

      const label = channelLabel(c, userMap);
      const lines: string[] = [
        `# Slack: ${c.is_im ? "DM with" : "#"}${label.replace(/^dm-/, "")}`,
        `**Source**: slack`,
        `**Channel ID**: ${c.id}`,
        ``,
        `## Messages (last ${daysBack}d)`,
      ];
      for (const m of messages.reverse()) {
        const userName = userMap.get(m.user || "") || m.user || (m.bot_id ? "bot" : "unknown");
        const tsDate = new Date(Number(m.ts) * 1000).toISOString().slice(0, 16).replace("T", " ");
        const text = (m.text || "").replace(/\s+/g, " ").trim();
        lines.push(`- [${tsDate}] @${userName}: ${text.slice(0, 500)}`);
      }
      const content = lines.join("\n") + "\n";
      files.push({ name: `${safeFilename(label)}.md`, content });
      logs.push(`[slack] ${label}: ${messages.length} messages`);
    } catch (e) {
      logs.push(`[slack] ${c.id} failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  return { files, logs };
}
