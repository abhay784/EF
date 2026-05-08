import { promises as fs } from "fs";
import path from "path";

const STORE_PATH = path.join(process.cwd(), "data", "granola.json");

export interface GranolaConnection {
  apiKey: string;
  ownerName: string;
  ownerEmail: string;
  connectedAt: string;
}

function isReadOnlyFs(): boolean {
  return Boolean(process.env.VERCEL) || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

async function readStore(): Promise<GranolaConnection | null> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null;
  }
}

async function writeStore(conn: GranolaConnection): Promise<void> {
  if (isReadOnlyFs()) return; // Vercel — no-op
  try {
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
    await fs.writeFile(STORE_PATH, JSON.stringify(conn, null, 2), "utf-8");
  } catch (err) {
    console.warn("[granolaStore] write failed (continuing):", err);
  }
}

export async function saveGranolaConnection(conn: GranolaConnection): Promise<void> {
  await writeStore(conn);
}

async function validateAndDescribe(apiKey: string): Promise<GranolaConnection | null> {
  try {
    const res = await fetch("https://public-api.granola.ai/v1/notes", {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { notes?: Array<{ owner?: { name?: string; email?: string } }> };
    const owner = data.notes?.[0]?.owner;
    return {
      apiKey,
      ownerName: owner?.name || "Connected",
      ownerEmail: owner?.email || "",
      connectedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[granolaStore] validate failed:", err);
    return null;
  }
}

export async function getGranolaConnection(): Promise<GranolaConnection | null> {
  // 1. Filesystem store (local dev)
  if (!isReadOnlyFs()) {
    const stored = await readStore();
    if (stored) return stored;
  }

  // 2. Env var fallback (works on Vercel and locally)
  const envKey = process.env.GRANOLA_API_KEY?.trim();
  if (!envKey) return null;

  const conn = await validateAndDescribe(envKey);
  if (!conn) return null;

  await writeStore(conn); // no-op on Vercel
  return conn;
}

export async function deleteGranolaConnection(): Promise<void> {
  if (isReadOnlyFs()) return;
  try {
    await fs.unlink(STORE_PATH);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[granolaStore] delete failed:", err);
    }
  }
}
