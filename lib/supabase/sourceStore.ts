import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const BUCKET = process.env.SUPABASE_SOURCES_BUCKET || "recall-sources";

export type SourceTarget = "uploads" | "granola" | "slack" | "sessions";

export interface StoredFile {
  name: string;
  size: number;
  mtime: string;
}

function hasConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

async function ensureBucket() {
  const supabase = createServerSupabaseClient();
  const { error: getError } = await supabase.storage.getBucket(BUCKET);
  if (!getError) return supabase;

  const { error: createError } = await supabase.storage.createBucket(BUCKET, { public: false });
  if (createError && !String(createError.message || "").toLowerCase().includes("already exists")) {
    throw createError;
  }
  return supabase;
}

function sanitize(name: string): string {
  const trimmed = name.trim().replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  return trimmed || `file_${Date.now()}`;
}

export async function saveSourceFile(
  target: SourceTarget,
  rawName: string,
  content: string
): Promise<{ name: string; path: string }> {
  if (!hasConfig()) throw new Error("Supabase not configured");
  const base = sanitize(rawName || `note_${Date.now()}`);
  const name = base.endsWith(".md") ? base : `${base}.md`;
  const path = `${target}/${name}`;

  const supabase = await ensureBucket();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, content, {
      contentType: "text/markdown; charset=utf-8",
      upsert: true,
    });
  if (error) throw error;
  return { name, path };
}

export async function listSourceFiles(target: SourceTarget): Promise<StoredFile[]> {
  if (!hasConfig()) return [];
  const supabase = await ensureBucket();
  const { data, error } = await supabase.storage.from(BUCKET).list(target, {
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) {
    console.warn(`[sourceStore] list ${target} failed:`, error.message);
    return [];
  }
  return (data || []).map((f) => ({
    name: f.name,
    size: (f.metadata?.size as number) ?? 0,
    mtime: f.created_at ?? new Date().toISOString(),
  }));
}

export async function readSourceFile(target: SourceTarget, name: string): Promise<string | null> {
  if (!hasConfig()) return null;
  const supabase = await ensureBucket();
  const { data, error } = await supabase.storage.from(BUCKET).download(`${target}/${name}`);
  if (error || !data) return null;
  return await data.text();
}

export async function readAllForTarget(target: SourceTarget): Promise<Array<{ name: string; content: string }>> {
  const files = await listSourceFiles(target);
  const out: Array<{ name: string; content: string }> = [];
  for (const f of files) {
    const content = await readSourceFile(target, f.name);
    if (content) out.push({ name: f.name, content });
  }
  return out;
}

export async function deleteSourceFile(target: SourceTarget, name: string): Promise<void> {
  if (!hasConfig()) return;
  const supabase = await ensureBucket();
  await supabase.storage.from(BUCKET).remove([`${target}/${name}`]);
}
