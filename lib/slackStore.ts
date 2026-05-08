import { promises as fs } from "fs";
import path from "path";

const STORE_PATH = path.join(process.cwd(), "data", "slack_tokens.json");

export interface SlackInstall {
  teamId: string;
  teamName: string;
  accessToken: string;
  tokenType: "user" | "bot";
  authedUserId: string;
  installedAt: string;
}

type Store = Record<string, SlackInstall>;

async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

async function writeStore(store: Store): Promise<void> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

export async function saveInstall(install: SlackInstall): Promise<void> {
  const store = await readStore();
  store[install.teamId] = install;
  await writeStore(store);
}

export async function getInstall(teamId: string): Promise<SlackInstall | null> {
  if (!teamId) return null;
  const store = await readStore();
  return store[teamId] || null;
}

export async function deleteInstall(teamId: string): Promise<void> {
  const store = await readStore();
  if (store[teamId]) {
    delete store[teamId];
    await writeStore(store);
  }
}
