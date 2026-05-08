import { cookies } from "next/headers";
import { promises as fs } from "fs";
import path from "path";

const COOKIE_NAME = "slack_install";
const STORE_PATH = path.join(process.cwd(), "data", "slack_tokens.json");

export interface SlackInstall {
  teamId: string;
  teamName: string;
  accessToken: string;
  tokenType: "user" | "bot";
  authedUserId: string;
  installedAt: string;
}

function isReadOnlyFs(): boolean {
  // Vercel and most serverless runtimes set this — falls back to filesystem locally.
  return Boolean(process.env.VERCEL) || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function encodeInstall(install: SlackInstall): string {
  return Buffer.from(JSON.stringify(install), "utf-8").toString("base64");
}

function decodeInstall(value: string): SlackInstall | null {
  try {
    const json = Buffer.from(value, "base64").toString("utf-8");
    return JSON.parse(json) as SlackInstall;
  } catch {
    return null;
  }
}

async function readFsStore(): Promise<Record<string, SlackInstall>> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

async function writeFsStore(store: Record<string, SlackInstall>): Promise<void> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

export async function saveInstall(install: SlackInstall): Promise<void> {
  // Set the cookie (works in both local and serverless)
  cookies().set(COOKIE_NAME, encodeInstall(install), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  // Also persist to disk locally so multiple browser sessions on the same dev machine see it.
  if (!isReadOnlyFs()) {
    try {
      const store = await readFsStore();
      store[install.teamId] = install;
      await writeFsStore(store);
    } catch {
      // ignore — cookie is the source of truth
    }
  }
}

export async function getInstall(teamId?: string): Promise<SlackInstall | null> {
  // Cookie first — works everywhere.
  const cookieValue = cookies().get(COOKIE_NAME)?.value;
  if (cookieValue) {
    const decoded = decodeInstall(cookieValue);
    if (decoded && (!teamId || decoded.teamId === teamId)) return decoded;
  }

  // Fallback: filesystem (local dev only)
  if (!isReadOnlyFs() && teamId) {
    try {
      const store = await readFsStore();
      return store[teamId] || null;
    } catch {
      return null;
    }
  }

  return null;
}

export async function deleteInstall(): Promise<void> {
  cookies().set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
}
