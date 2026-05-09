import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { spawn } from "child_process";
import path from "path";
import { getInstall } from "@/lib/slackStore";
import { getGranolaConnection } from "@/lib/granolaStore";
import { aggregateGranola } from "@/lib/aggregators/granola";
import { aggregateSlack } from "@/lib/aggregators/slack";
import { saveSourceFile } from "@/lib/supabase/sourceStore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ScriptResult {
  code: number;
  logs: string[];
}

function isReadOnlyFs(): boolean {
  return Boolean(process.env.VERCEL) || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function runScript(scriptPath: string, env: Record<string, string | undefined>): Promise<ScriptResult> {
  return new Promise((resolve) => {
    const logs: string[] = [];
    const proc = spawn("python3", [scriptPath], { env: env as NodeJS.ProcessEnv });
    proc.stdout.on("data", (d) => logs.push(d.toString()));
    proc.stderr.on("data", (d) => logs.push("[err] " + d.toString()));
    proc.on("close", (code) => resolve({ code: code || 0, logs }));
    proc.on("error", (err) => resolve({ code: 1, logs: [`[err] spawn failed: ${err.message}\n`] }));
  });
}

export async function POST() {
  const cwd = process.cwd();
  const logs: string[] = [];
  const startedAt = Date.now();

  const ts = () => {
    const d = new Date();
    return `[${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, "0")}]`;
  };
  const log = (line: string) => logs.push(`${ts()} ${line}\n`);
  const elapsed = (since: number) => `${((Date.now() - since) / 1000).toFixed(2)}s`;

  log(`▶ sync started (env: ${isReadOnlyFs() ? "vercel/read-only" : "local"})`);

  const teamId = cookies().get("slack_team_id")?.value;
  log(`  · slack cookie team_id: ${teamId ?? "(none)"}`);
  const slackInstall = teamId ? await getInstall(teamId) : null;
  log(`  · slack install loaded: ${slackInstall ? `team=${slackInstall.teamId}` : "(none)"}`);
  const granola = await getGranolaConnection();
  log(`  · granola connection: ${granola?.apiKey ? "✓ has api key" : "(none)"}`);

  // ---- Granola ----
  log("");
  log("── granola ──");
  if (granola?.apiKey) {
    const stepStart = Date.now();
    log("  fetching notes from Granola API…");
    let result;
    try {
      result = await aggregateGranola(granola.apiKey);
    } catch (e) {
      log(`  ✗ aggregator threw: ${e instanceof Error ? e.message : e}`);
      result = { files: [], logs: [] };
    }
    for (const l of result.logs) log(`  ${l}`);
    log(`  fetched ${result.files.length} note(s) in ${elapsed(stepStart)}`);

    const saveStart = Date.now();
    let saved = 0;
    let failed = 0;
    for (const file of result.files) {
      try {
        await saveSourceFile("granola", file.name, file.content);
        saved++;
      } catch (e) {
        failed++;
        log(`  ✗ save ${file.name} failed: ${e instanceof Error ? e.message : e}`);
      }
    }
    log(`  ✓ saved ${saved}/${result.files.length} files to Supabase (${elapsed(saveStart)})${failed ? ` · ${failed} failed` : ""}`);
  } else {
    log("  skipped — not connected");
  }

  // ---- Slack ----
  log("");
  log("── slack ──");
  if (slackInstall?.accessToken) {
    const stepStart = Date.now();
    log("  fetching messages via Slack API…");
    let result;
    try {
      result = await aggregateSlack(slackInstall.accessToken);
    } catch (e) {
      log(`  ✗ aggregator threw: ${e instanceof Error ? e.message : e}`);
      result = { files: [], logs: [] };
    }
    for (const l of result.logs) log(`  ${l}`);
    log(`  fetched ${result.files.length} channel file(s) in ${elapsed(stepStart)}`);

    const saveStart = Date.now();
    let saved = 0;
    let failed = 0;
    for (const file of result.files) {
      try {
        await saveSourceFile("slack", file.name, file.content);
        saved++;
      } catch (e) {
        failed++;
        log(`  ✗ save ${file.name} failed: ${e instanceof Error ? e.message : e}`);
      }
    }
    log(`  ✓ saved ${saved}/${result.files.length} files to Supabase (${elapsed(saveStart)})${failed ? ` · ${failed} failed` : ""}`);
  } else {
    log("  skipped — not connected");
  }

  // ---- Claude Code sessions ----
  log("");
  log("── claude_code ──");
  if (!isReadOnlyFs()) {
    const stepStart = Date.now();
    log(`  spawning python3 backend/aggregator/claude_code.py (CONTEXT_DIR=${path.join(cwd, "context")})`);
    const env = {
      ...process.env,
      CONTEXT_DIR: path.join(cwd, "context"),
    };
    const result = await runScript(path.join(cwd, "backend", "aggregator", "claude_code.py"), env);
    for (const l of result.logs) {
      for (const line of l.split("\n").filter(Boolean)) log(`  ${line}`);
    }
    if (result.code !== 0) {
      log(`  ✗ script exited with code ${result.code} (${elapsed(stepStart)})`);
    } else {
      log(`  ✓ done in ${elapsed(stepStart)}`);
    }
  } else {
    log("  skipped — Vercel/read-only filesystem (sessions only exist on your local Mac)");
  }

  log("");
  log(`✓ sync finished in ${elapsed(startedAt)}`);

  return NextResponse.json({ ok: true, logs });
}
