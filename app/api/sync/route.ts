import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

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
  const env = {
    ...process.env,
    CONTEXT_DIR: path.join(cwd, "context"),
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
    SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN || "",
    SLACK_TEAM_ID: process.env.SLACK_TEAM_ID || "",
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

    if (r1.code !== 0 || r2.code !== 0 || r3.code !== 0) {
      logs.push(
        "\n[warn] one or more aggregators failed — proceeding with available data\n"
      );
    }

    logs.push("\nRunning summarizer...\n");

    // Run summarizer after aggregators
    const summaryResult = await runScript(
      path.join(cwd, "backend", "summarizer.py"),
      env
    );
    logs.push(...summaryResult.logs);

    if (summaryResult.code !== 0) {
      return NextResponse.json(
        { error: "summarizer failed", logs },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, logs });
  } catch (error) {
    logs.push(`\n[error] ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { error: "sync failed", logs },
      { status: 500 }
    );
  }
}
