import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { spawn } from "child_process";
import path from "path";
import { getInstall } from "@/lib/slackStore";
import { getGranolaConnection } from "@/lib/granolaStore";

interface ScriptResult {
  code: number;
  logs: string[];
}

function runScript(
  scriptPath: string,
  env: Record<string, string | undefined>
): Promise<ScriptResult> {
  return new Promise((resolve) => {
    const logs: string[] = [];
    const proc = spawn("python3", [scriptPath], { env: env as NodeJS.ProcessEnv });

    proc.stdout.on("data", (data) => {
      logs.push(data.toString());
    });

    proc.stderr.on("data", (data) => {
      logs.push("[err] " + data.toString());
    });

    proc.on("close", (code) => {
      resolve({ code: code || 0, logs });
    });
  });
}

export async function POST() {
  const cwd = process.cwd();

  const teamId = cookies().get("slack_team_id")?.value;
  const install = teamId ? await getInstall(teamId) : null;
  const granola = await getGranolaConnection();

  const env = {
    ...process.env,
    CONTEXT_DIR: path.join(cwd, "context"),
    XAI_API_KEY: process.env.XAI_API_KEY || "",
    XAI_MODEL: process.env.XAI_MODEL || "",
    SLACK_BOT_TOKEN: install?.accessToken || process.env.SLACK_BOT_TOKEN || "",
    SLACK_TEAM_ID: install?.teamId || process.env.SLACK_TEAM_ID || "",
    GRANOLA_API_KEY: granola?.apiKey || process.env.GRANOLA_API_KEY || "",
  };

  const logs: string[] = [];

  try {
    logs.push("Starting data aggregation...\n");

    // Run all three aggregators in parallel
    const [r1, r2, r3] = await Promise.all([
      runScript(path.join(cwd, "backend", "aggregator", "claude_code.py"), env),
      runScript(path.join(cwd, "backend", "aggregator", "slack.py"), env),
      runScript(path.join(cwd, "backend", "aggregator", "granola.py"), env),
    ]);

    logs.push(...r1.logs);
    logs.push(...r2.logs);
    logs.push(...r3.logs);

    const failed = [r1, r2, r3].filter((r) => r.code !== 0).length;
    if (failed > 0) {
      logs.push(`\n[warn] ${failed} of 3 aggregators failed — proceeding with available data\n`);
    }

    // Note: summarizer.py is no longer run. /api/ask reads source markdown directly per query,
    // so the weekly_brief.json step is dead weight.
    return NextResponse.json({ ok: true, logs });
  } catch (error) {
    logs.push(`\n[error] ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { error: "sync failed", logs },
      { status: 500 }
    );
  }
}
