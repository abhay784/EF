import "server-only";

const GRANOLA_API = "https://public-api.granola.ai/v1";

interface GranolaNoteListed {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  owner?: { name?: string; email?: string };
}

interface GranolaNoteFull extends GranolaNoteListed {
  web_url?: string;
  attendees?: Array<{ name?: string; email?: string }>;
  summary_markdown?: string;
  summary_text?: string;
  transcript?: string | null;
  calendar_event?: Record<string, unknown>;
}

export interface AggregatedFile {
  name: string;
  content: string;
}

async function granolaGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${GRANOLA_API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Granola ${path} returned ${res.status}`);
  return (await res.json()) as T;
}

function noteToMarkdown(note: GranolaNoteFull): string {
  const attendees = (note.attendees || [])
    .map((a) => `- ${a.name || a.email || "unknown"}`)
    .join("\n") || "- (none listed)";

  const summary = note.summary_markdown || note.summary_text || "_No summary._";
  const transcript = note.transcript ? `\n## Transcript\n\n${note.transcript}\n` : "";

  return `# ${note.title || "Untitled meeting"}
**Source**: granola
**Created**: ${note.created_at}
**Web URL**: ${note.web_url || ""}

## Attendees
${attendees}

## Summary
${summary}
${transcript}`;
}

export async function aggregateGranola(
  apiKey: string,
  daysBack = 7
): Promise<{ files: AggregatedFile[]; logs: string[] }> {
  const logs: string[] = [];

  if (!apiKey) {
    logs.push("[granola] no api key — skipping");
    return { files: [], logs };
  }

  const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  let listing: { notes: GranolaNoteListed[] };
  try {
    listing = await granolaGet<{ notes: GranolaNoteListed[] }>("/notes", apiKey);
  } catch (e) {
    logs.push(`[granola] list failed: ${e instanceof Error ? e.message : e}`);
    return { files: [], logs };
  }

  const recent = (listing.notes || []).filter(
    (n) => new Date(n.updated_at).getTime() >= cutoff
  );
  logs.push(`[granola] ${recent.length} of ${listing.notes.length} notes within ${daysBack} days`);

  const files: AggregatedFile[] = [];
  for (const n of recent) {
    try {
      const full = await granolaGet<GranolaNoteFull>(`/notes/${n.id}`, apiKey);
      files.push({ name: `${n.id}.md`, content: noteToMarkdown(full) });
      logs.push(`[granola] fetched ${n.id}: ${(n.title || "").slice(0, 60)}`);
    } catch (e) {
      logs.push(`[granola] failed ${n.id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  return { files, logs };
}
