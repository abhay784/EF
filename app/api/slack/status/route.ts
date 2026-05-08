import { NextResponse } from "next/server";

export async function GET() {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const teamId = process.env.SLACK_TEAM_ID;
  const connected = Boolean(botToken && botToken.startsWith("xoxb-") && teamId);

  return NextResponse.json({
    connected,
    teamId: connected ? teamId : null,
  });
}
