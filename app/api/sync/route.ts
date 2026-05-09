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

  const teamId = cookies().get("slack_team_id")?.value;
  const slackInstall = teamId ? await getInstall(teamId) : null;
  const granola = await getGranolaConnection();

  logs.push(`Starting sync (env: ${isReadOnlyFs() ? "vercel/read-only" : "local"})\n`);

  // ---- Granola: TypeScript aggregator → Supabase Storage ----
  if (granola?.apiKey) {
    const result = await aggregateGranola(granola.apiKey);
    logs.push(...result.logs.map((l) => l + "\n"));
    let saved = 0;
    for (const file of result.files) {
      try {
        await saveSourceFile("granola", file.name, file.content);
        saved++;
      } catch (e) {
        logs.push(`[granola] save ${file.name} failed: ${e instanceof Error ? e.message : e}\n`);
      }
    }
    logs.push(`[granola] saved ${saved} files to Supabase Storage\n`);
  } else {
    logs.push("[granola] not connected — skipping\n");
  }

  // ---- Slack: TypeScript aggregator → Supabase Storage ----
  if (slackInstall?.accessToken) {
    const result = await aggregateSlack(slackInstall.accessToken);
    logs.push(...result.logs.map((l) => l + "\n"));
    let saved = 0;
    for (const file of result.files) {
      try {
        await saveSourceFile("slack", file.name, file.content);
        saved++;
      } catch (e) {
        logs.push(`[slack] save ${file.name} failed: ${e instanceof Error ? e.message : e}\n`);
      }
    }
    logs.push(`[slack] saved ${saved} files to Supabase Storage\n`);
  } else {
    logs.push("[slack] not connected — skipping\n");
  }

  // ---- Claude Code sessions: local-only (files live on the user's Mac) ----
  if (!isReadOnlyFs()) {
    const env = {
      ...process.env,
      CONTEXT_DIR: path.join(cwd, "context"),
    };
    const result = await runScript(path.join(cwd, "backend", "aggregator", "claude_code.py"), env);
    logs.push(...result.logs);
    if (result.code !== 0) {
      logs.push("[claude_code] script failed (this only runs locally)\n");
    }
  } else {
    logs.push("[claude_code] skipped on Vercel — sessions only exist on your local Mac\n");
  }

  return NextResponse.json({ ok: true, logs });
}
