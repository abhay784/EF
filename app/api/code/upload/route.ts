import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { saveSourceFile, listSourceFiles } from "@/lib/supabase/sourceStore";

export const dynamic = "force-dynamic";

interface UploadFile {
  name?: string;
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { files?: UploadFile[] };
    const files = body.files || [];
    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }
    const written: string[] = [];
    for (const f of files) {
      if (!f.content?.trim()) continue;
      const { name } = await saveSourceFile("uploads", f.name || `note_${Date.now()}`, f.content);
      written.push(name);
    }
    return NextResponse.json({ ok: true, written });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function GET() {
  const files = await listSourceFiles("uploads");
  return NextResponse.json({ files });
}
