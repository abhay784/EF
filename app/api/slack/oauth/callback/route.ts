import { NextResponse } from "next/server";
import { saveInstall } from "@/lib/slackStore";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) return errorPage(error);
  if (!code) return errorPage("Missing ?code parameter");

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return errorPage("SLACK_CLIENT_ID / SLACK_CLIENT_SECRET not set");
  }

  const redirectUri = `${url.origin}/api/slack/oauth/callback`;

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const slackRes = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await slackRes.json();

  if (!data.ok) {
    return errorPage(`Slack rejected exchange: ${data.error || "unknown"}`);
  }

  const teamId: string = data.team?.id;
  const teamName: string = data.team?.name || "(unknown)";

  // Prefer user token (xoxp-) so the app reads as the user — no /invite needed.
  // Fall back to bot token if for some reason only that's present.
  const userToken: string | undefined = data.authed_user?.access_token;
  const botToken: string | undefined = data.access_token;
  const accessToken = userToken || botToken;
  const tokenType: "user" | "bot" = userToken ? "user" : "bot";
  const authedUserId: string = data.authed_user?.id || "";

  if (!teamId || !accessToken) {
    return errorPage(
      "Slack returned no usable token. Make sure User Token Scopes are configured in your Slack app."
    );
  }

  await saveInstall({
    teamId,
    teamName,
    accessToken,
    tokenType,
    authedUserId,
    installedAt: new Date().toISOString(),
  });

  console.log(`[slack/oauth] ✓ Installed ${tokenType} token for "${teamName}" (${teamId}) — authedUser=${authedUserId}`);

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Slack connected</title>
<style>body{font-family:system-ui;max-width:560px;margin:80px auto;padding:0 20px;line-height:1.6;text-align:center}
.ok{background:#efe;border:1px solid #cfc;padding:24px;border-radius:12px;color:#060}
.next{margin-top:24px;color:#555;font-size:14px}
a.btn{display:inline-block;margin-top:20px;padding:10px 18px;background:#000;color:#fff;border-radius:8px;text-decoration:none;font-weight:500}</style>
</head><body>
<div class="ok"><h1 style="margin:0 0 8px">Slack connected ✓</h1>
<div>Workspace: <strong>${escapeHtml(teamName)}</strong></div>
<div style="font-size:12px;color:#080;margin-top:8px">Token type: ${tokenType} — ${tokenType === "user" ? "no /invite needed, reads what you can read." : "bot must be invited to channels."}</div></div>
<a class="btn" href="/studio">Back to studio</a>
<script>
  document.cookie = "slack_team_id=${encodeURIComponent(teamId)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax";
  setTimeout(() => { try { window.opener && window.opener.postMessage({ slackConnected: true, teamId: ${JSON.stringify(teamId)} }, "*"); } catch(e){} }, 100);
</script>
</body></html>`;

  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "set-cookie": `slack_team_id=${encodeURIComponent(teamId)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax; HttpOnly`,
    },
  });
}

function errorPage(msg: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Slack install — error</title>
<style>body{font-family:system-ui;max-width:560px;margin:80px auto;padding:0 20px;line-height:1.6}.err{background:#fee;border:1px solid #fcc;padding:16px;border-radius:8px;color:#900}</style>
</head><body><h1>Slack install failed</h1><div class="err">${escapeHtml(msg)}</div>
<p><a href="/api/slack/install">Try again</a></p></body></html>`;
  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
