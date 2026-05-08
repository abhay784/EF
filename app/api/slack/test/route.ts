import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getInstall } from "@/lib/slackStore";

async function slackGet(method: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`https://slack.com/api/${method}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function GET() {
  const teamId = cookies().get("slack_team_id")?.value;
  if (!teamId) {
    return NextResponse.json(
      { error: "no_cookie", message: "No Slack workspace linked to this browser. Connect first." },
      { status: 400 }
    );
  }

  const install = await getInstall(teamId);
  if (!install) {
    return NextResponse.json(
      { error: "no_install", message: `Cookie team_id ${teamId} not found in token store.` },
      { status: 400 }
    );
  }

  const token = install.accessToken;

  const channelTypes = install.tokenType === "user"
    ? "public_channel,private_channel,mpim,im"
    : "public_channel,private_channel";

  console.log(`[slack/test] Querying Slack for team=${install.teamId} (${install.teamName}) using ${install.tokenType} token`);

  const [authTest, conversations, users] = await Promise.all([
    slackGet("auth.test", token),
    slackGet("conversations.list", token, { types: channelTypes, limit: "100" }),
    slackGet("users.list", token, { limit: "20" }),
  ]);

  console.log(`[slack/test] auth.test ok=${authTest.ok} as user=${authTest.user}`);
  console.log(`[slack/test] conversations.list returned ${(conversations.channels || []).length} channels`);
  console.log(`[slack/test] users.list returned ${(users.members || []).length} users`);

  const channels = (conversations.channels || []).map((c: { id: string; name?: string; is_member?: boolean; is_private?: boolean; is_im?: boolean; is_mpim?: boolean; num_members?: number; user?: string }) => ({
    id: c.id,
    name: c.name || (c.is_im ? `dm:${c.user || c.id}` : c.id),
    is_member: c.is_member ?? (c.is_im || c.is_mpim || false),
    is_private: c.is_private || false,
    is_im: c.is_im || false,
    is_mpim: c.is_mpim || false,
    num_members: c.num_members,
  }));

  // For user tokens, user is implicit member of all DMs/MPIMs they appear in.
  const memberChannels = channels.filter((c: { is_member: boolean; is_im: boolean; is_mpim: boolean }) => c.is_member || c.is_im || c.is_mpim);

  let sampleMessages: Array<{ user: string; text: string; ts: string; channel: string }> = [];
  let sampleChannelName: string | null = null;

  // Try each channel/DM until we find one with messages, so the user actually sees data flow.
  const candidates = memberChannels.length > 0 ? memberChannels : channels;
  for (const c of candidates.slice(0, 10)) {
    const history = await slackGet("conversations.history", token, {
      channel: c.id,
      limit: "3",
    });
    const msgs = (history.messages || []) as Array<{ user?: string; text?: string; ts: string }>;
    if (msgs.length > 0) {
      sampleChannelName = c.name || c.id;
      sampleMessages = msgs.map((m) => ({
        user: m.user || "(bot)",
        text: (m.text || "").slice(0, 200),
        ts: m.ts,
        channel: c.name || c.id,
      }));
      console.log(`[slack/test] sampled ${msgs.length} messages from ${c.name || c.id}`);
      break;
    }
  }
  if (sampleMessages.length === 0) {
    console.log(`[slack/test] no messages found in any of ${candidates.length} accessible channels`);
  }

  return NextResponse.json({
    install: {
      teamId: install.teamId,
      teamName: install.teamName,
      tokenType: install.tokenType,
      authedUserId: install.authedUserId,
      installedAt: install.installedAt,
    },
    auth_test: {
      ok: authTest.ok,
      user: authTest.user,
      team: authTest.team,
      url: authTest.url,
      bot_id: authTest.bot_id,
      error: authTest.error,
    },
    channels: {
      total_visible: channels.length,
      bot_is_member_of: memberChannels.length,
      list: channels,
    },
    sample_messages: {
      from_channel: sampleChannelName,
      messages: sampleMessages,
      hint: memberChannels.length === 0
        ? install.tokenType === "user"
          ? "You are not a member of any channels in this workspace."
          : "Bot is not in any channels. In Slack run: /invite @YourBotName"
        : null,
    },
    users_count: (users.members || []).length,
  });
}
