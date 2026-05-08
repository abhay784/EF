import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

interface UploadFile {
  name: string;
  content: string;
}

function sanitize(name: string): string {
  const trimmed = name.trim().replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  return trimmed || `upload_${Date.now()}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { files?: UploadFile[] };
    const files = body.files || [];
    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), "context", "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    const written: string[] = [];
    for (const f of files) {
      if (!f.content || !f.content.trim()) continue;
      const base = sanitize(f.name || `note_${Date.now()}`);
      const filename = base.endsWith(".md") ? base : `${base}.md`;
      const fullPath = path.join(uploadsDir, filename);
      await fs.writeFile(fullPath, f.content, "utf-8");
      written.push(filename);
      console.log(`[code/upload] wrote ${filename} (${f.content.length} chars)`);
    }

    return NextResponse.json({ ok: true, written });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("[code/upload] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  const uploadsDir = path.join(process.cwd(), "context", "uploads");
  try {
    const files = await fs.readdir(uploadsDir);
    const stats = await Promise.all(
      files.map(async (name) => {
        const stat = await fs.stat(path.join(uploadsDir, name));
        return { name, size: stat.size, mtime: stat.mtime };
      })
    );
    return NextResponse.json({ files: stats });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ files: [] });
    }
    throw err;
  }
}
