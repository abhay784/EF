import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return new NextResponse(renderPage({ error }), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  if (!code) {
    return new NextResponse(renderPage({ error: "Missing ?code parameter" }), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return new NextResponse(
      renderPage({ error: "SLACK_CLIENT_ID / SLACK_CLIENT_SECRET not set" }),
      { headers: { "content-type": "text/html; charset=utf-8" } }
    );
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
    return new NextResponse(
      renderPage({ error: `Slack rejected exchange: ${data.error || "unknown"}` }),
      { headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }

  return new NextResponse(
    renderPage({
      botToken: data.access_token,
      teamId: data.team?.id,
      teamName: data.team?.name,
      botUserId: data.bot_user_id,
    }),
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

function renderPage(opts: {
  error?: string;
  botToken?: string;
  teamId?: string;
  teamName?: string;
  botUserId?: string;
}) {
  const { error, botToken, teamId, teamName, botUserId } = opts;

  if (error) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>Slack install — error</title>
<style>body{font-family:system-ui;max-width:680px;margin:48px auto;padding:0 20px;line-height:1.6}code{background:#f4f4f4;padding:2px 6px;border-radius:4px}.err{background:#fee;border:1px solid #fcc;padding:16px;border-radius:8px;color:#900}</style>
</head><body><h1>Slack install failed</h1><div class="err">${escapeHtml(error)}</div>
<p><a href="/api/slack/install">Try again</a></p></body></html>`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>Slack install — success</title>
<style>body{font-family:system-ui;max-width:680px;margin:48px auto;padding:0 20px;line-height:1.6}code,pre{background:#f4f4f4;padding:2px 6px;border-radius:4px;font-family:ui-monospace,Menlo,monospace}pre{padding:16px;overflow-x:auto}.ok{background:#efe;border:1px solid #cfc;padding:16px;border-radius:8px;color:#060}</style>
</head><body>
<h1>Slack app installed ✓</h1>
<div class="ok">Workspace: <strong>${escapeHtml(teamName || "(unknown)")}</strong></div>
<h2>Step 1 — Paste these into <code>.env.local</code></h2>
<pre>SLACK_BOT_TOKEN=${escapeHtml(botToken || "")}
SLACK_TEAM_ID=${escapeHtml(teamId || "")}</pre>
<p>Bot user ID: <code>${escapeHtml(botUserId || "")}</code></p>
<h2>Step 2 — Restart the dev server</h2>
<p>Stop and re-run <code>npm run dev</code> so it picks up the new env vars.</p>
<h2>Step 3 — Invite the bot to channels you want to read</h2>
<p>In Slack: <code>/invite @YourBotName</code> in each channel.</p>
<h2>Step 4 — Sync</h2>
<p>Open <a href="/studio">/studio</a> and click <strong>Sync</strong>.</p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
