import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { saveSourceFile, listSourceFiles, type SourceTarget } from "@/lib/supabase/sourceStore";

export const dynamic = "force-dynamic";

const ALLOWED_TARGETS: SourceTarget[] = ["uploads", "granola", "slack", "sessions"];

function validateTarget(t: string): SourceTarget {
  if (!ALLOWED_TARGETS.includes(t as SourceTarget)) throw new Error(`Invalid target "${t}"`);
  return t as SourceTarget;
}

interface UploadFile {
  name?: string;
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const target = validateTarget(url.searchParams.get("target") || "uploads");

    const body = (await req.json()) as { files?: UploadFile[] };
    const files = body.files || [];
    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const written: string[] = [];
    for (const f of files) {
      if (!f.content?.trim()) continue;
      const { name } = await saveSourceFile(target, f.name || `note_${Date.now()}`, f.content);
      written.push(name);
      console.log(`[uploads/${target}] saved ${name} (${f.content.length} chars)`);
    }

    return NextResponse.json({ ok: true, target, written });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("[uploads] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const target = validateTarget(url.searchParams.get("target") || "uploads");
    const files = await listSourceFiles(target);
    return NextResponse.json({ target, files });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
