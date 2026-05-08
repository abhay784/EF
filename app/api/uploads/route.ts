import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

interface UploadFile {
  name: string;
  content: string;
}

const ALLOWED_TARGETS = new Set(["uploads", "granola"]);

function sanitize(name: string): string {
  const trimmed = name.trim().replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  return trimmed || `upload_${Date.now()}`;
}

function resolveDir(target: string): string {
  if (!ALLOWED_TARGETS.has(target)) {
    throw new Error(`Invalid target "${target}"`);
  }
  return path.join(process.cwd(), "context", target);
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const target = url.searchParams.get("target") || "uploads";
    const dir = resolveDir(target);

    const body = (await req.json()) as { files?: UploadFile[] };
    const files = body.files || [];
    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    await fs.mkdir(dir, { recursive: true });

    const written: string[] = [];
    for (const f of files) {
      if (!f.content || !f.content.trim()) continue;
      const base = sanitize(f.name || `note_${Date.now()}`);
      const filename = base.endsWith(".md") ? base : `${base}.md`;
      const fullPath = path.join(dir, filename);
      await fs.writeFile(fullPath, f.content, "utf-8");
      written.push(filename);
      console.log(`[uploads/${target}] wrote ${filename} (${f.content.length} chars)`);
    }

    return NextResponse.json({ ok: true, target, written });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("[uploads] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const target = url.searchParams.get("target") || "uploads";
  try {
    const dir = resolveDir(target);
    const files = await fs.readdir(dir);
    const stats = await Promise.all(
      files.map(async (name) => {
        const stat = await fs.stat(path.join(dir, name));
        return { name, size: stat.size, mtime: stat.mtime };
      })
    );
    return NextResponse.json({ target, files: stats });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ target, files: [] });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
