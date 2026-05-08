import { NextResponse } from "next/server";

const BOT_SCOPES = [
  "channels:history",
  "channels:read",
  "groups:history",
  "groups:read",
  "users:read",
  "team:read",
].join(",");

export async function GET(req: Request) {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "SLACK_CLIENT_ID not set in .env.local" },
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  const redirectUri = `${url.origin}/api/slack/oauth/callback`;

  const authUrl = new URL("https://slack.com/oauth/v2/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("scope", BOT_SCOPES);
  authUrl.searchParams.set("redirect_uri", redirectUri);

  return NextResponse.redirect(authUrl.toString());
}
