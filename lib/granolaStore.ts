import { promises as fs } from "fs";
import path from "path";

const STORE_PATH = path.join(process.cwd(), "data", "granola.json");

export interface GranolaConnection {
  apiKey: string;
  ownerName: string;
  ownerEmail: string;
  connectedAt: string;
}

async function readStore(): Promise<GranolaConnection | null> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function writeStore(conn: GranolaConnection): Promise<void> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(conn, null, 2), "utf-8");
}

export async function saveGranolaConnection(conn: GranolaConnection): Promise<void> {
  await writeStore(conn);
}

export async function getGranolaConnection(): Promise<GranolaConnection | null> {
  return readStore();
}

export async function deleteGranolaConnection(): Promise<void> {
  try {
    await fs.unlink(STORE_PATH);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
