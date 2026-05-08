import { NextResponse } from "next/server";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) return errorPage(error);
  if (!code) return errorPage("Missing ?code parameter");

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return errorPage("SLACK_CLIENT_ID / SLACK_CLIENT_SECRET not set on the server");
  }

  const redirectUri = `${url.origin}/api/slack/oauth/callback`;

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  let data: Record<string, unknown>;
  try {
    const slackRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    data = await slackRes.json();
  } catch (err) {
    console.error("[slack/oauth] fetch failed", err);
    return errorPage(`Network error contacting Slack: ${err instanceof Error ? err.message : "unknown"}`);
  }

  if (!data.ok) {
    console.error("[slack/oauth] exchange rejected", data);
    return errorPage(`Slack rejected exchange: ${(data.error as string) || "unknown"}`);
  }

  const team = (data.team || {}) as { id?: string; name?: string };
  const authedUser = (data.authed_user || {}) as { id?: string; access_token?: string };

  const teamId = team.id || "";
  const teamName = team.name || "(unknown)";
  const userToken = authedUser.access_token;
  const botToken = (data.access_token as string | undefined) || undefined;
  const accessToken = userToken || botToken;
  const tokenType: "user" | "bot" = userToken ? "user" : "bot";
  const authedUserId = authedUser.id || "";

  if (!teamId || !accessToken) {
    return errorPage(
      "Slack returned no usable token. Make sure User Token Scopes are configured in your Slack app."
    );
  }

  const install = {
    teamId,
    teamName,
    accessToken,
    tokenType,
    authedUserId,
    installedAt: new Date().toISOString(),
  };

  console.log(`[slack/oauth] ✓ Installed ${tokenType} token for "${teamName}" (${teamId}) — authedUser=${authedUserId}`);

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Slack connected</title>
<style>body{font-family:system-ui;max-width:560px;margin:80px auto;padding:0 20px;line-height:1.6;text-align:center}
.ok{background:#efe;border:1px solid #cfc;padding:24px;border-radius:12px;color:#060}
a.btn{display:inline-block;margin-top:20px;padding:10px 18px;background:#000;color:#fff;border-radius:8px;text-decoration:none;font-weight:500}</style>
</head><body>
<div class="ok"><h1 style="margin:0 0 8px">Slack connected ✓</h1>
<div>Workspace: <strong>${escapeHtml(teamName)}</strong></div>
<div style="font-size:12px;color:#080;margin-top:8px">Token type: ${tokenType} — ${tokenType === "user" ? "no /invite needed, reads what you can read." : "bot must be invited to channels."}</div></div>
<a class="btn" href="/studio">Back to studio</a>
<script>
  setTimeout(() => { try { window.opener && window.opener.postMessage({ slackConnected: true, teamId: ${JSON.stringify(teamId)} }, "*"); } catch(e){} }, 100);
</script>
</body></html>`;

  const res = new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });

  // Cookies: full install (encoded) + lightweight team_id pointer for backward compatibility
  const installCookie = Buffer.from(JSON.stringify(install), "utf-8").toString("base64");
  res.cookies.set("slack_install", installCookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  res.cookies.set("slack_team_id", teamId, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });

  return res;
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
