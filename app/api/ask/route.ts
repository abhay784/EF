import OpenAI from "openai";
import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { readAllForTarget, type SourceTarget } from "@/lib/supabase/sourceStore";

const client = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

const MODEL = process.env.XAI_MODEL || "grok-4-fast-non-reasoning";

interface AskMessage {
  role: "user" | "assistant";
  content: string;
}

interface AskRequest {
  messages: AskMessage[];
}

interface SourceFile {
  source: "slack" | "granola" | "code" | "uploads";
  filename: string;
  content: string;
}

const DIR_TO_SOURCE: Record<string, SourceFile["source"]> = {
  sessions: "code",
  slack: "slack",
  granola: "granola",
  uploads: "uploads",
};

async function loadFromDisk(): Promise<SourceFile[]> {
  const cwd = process.cwd();
  const out: SourceFile[] = [];
  for (const [dir, source] of Object.entries(DIR_TO_SOURCE)) {
    const fullDir = path.join(cwd, "context", dir);
    let entries: string[];
    try {
      entries = await fs.readdir(fullDir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith(".md")) continue;
      try {
        const content = await fs.readFile(path.join(fullDir, name), "utf-8");
        out.push({ source, filename: name, content });
      } catch {
        // skip unreadable
      }
    }
  }
  return out;
}

async function loadFromSupabase(): Promise<SourceFile[]> {
  const targets: SourceTarget[] = ["uploads", "granola", "slack", "sessions"];
  const out: SourceFile[] = [];
  for (const target of targets) {
    try {
      const files = await readAllForTarget(target);
      const source = DIR_TO_SOURCE[target] ?? (target as SourceFile["source"]);
      for (const f of files) {
        out.push({ source, filename: f.name, content: f.content });
      }
    } catch (err) {
      console.warn(`[ask] supabase load ${target} failed:`, err);
    }
  }
  return out;
}

async function loadAllSources(): Promise<SourceFile[]> {
  // Load from both disk (local) and Supabase (Vercel/shared). De-dupe by source/filename.
  const [disk, remote] = await Promise.all([loadFromDisk(), loadFromSupabase()]);
  const map = new Map<string, SourceFile>();
  for (const f of disk) map.set(`${f.source}/${f.filename}`, f);
  for (const f of remote) map.set(`${f.source}/${f.filename}`, f);
  return Array.from(map.values());
}

function buildCorpus(sources: SourceFile[]): { corpus: string; index: string[] } {
  const index: string[] = [];
  const blocks: string[] = [];
  for (const s of sources) {
    const id = `${s.source}/${s.filename}`;
    index.push(id);
    blocks.push(`--- BEGIN SOURCE: ${id} ---\n${s.content.trim()}\n--- END SOURCE: ${id} ---`);
  }
  return { corpus: blocks.join("\n\n"), index };
}

function buildSystemPrompt(corpus: string, index: string[]): string {
  const fileList = index.length > 0 ? index.map((f) => `  - ${f}`).join("\n") : "  (no source files yet — user has not synced)";
  return `You are a personal knowledge assistant. The user has Slack, Granola (meeting notes), Claude Code session logs, and manual uploads. Answer questions about their work using ONLY these sources.

## Length: match the question

This is the most important rule. The user hates walls of text.

- Direct factual question ("main insight?", "who's John?", "when did we ship?") → **1–3 sentences**. One short paragraph. Stop.
- List request ("list the bugs", "what features did I ship") → **a tight bulleted list**, no preamble.
- Recap request ("tell me the story with John", "summarize this week", "give me the full thread") → **3–5 short paragraphs**, narrative prose.

If the question is short, the answer is short. Don't write a five-paragraph essay because the user asked one thing.

## Style

- Lead with the answer. No "Based on the sources…", no "It seems that…", no scene-setting unless they asked for the story.
- Cite inline as \`[granola/file.md]\`, \`[slack/file.md]\`, \`[code/file.md]\`. Cite once per claim, not after every sentence.
- Use specific details (names, numbers, decisions) — that's what makes it feel real.
- If two sources disagree, say so briefly.
- Never invent. If the sources don't say it, say "I don't see that in the sources."

## When sources are thin

Be honest in one sentence:
> The only mention of John I see is in [granola/not_x.md] — he was a no-show on May 6.

Don't pad to fill space.

## Available source files (${index.length} total)
${fileList}

## Source content
${corpus || "(empty — no sources have been synced yet — tell the user to click Sync)"}
`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AskRequest;
    const messages = body.messages || [];
    if (messages.length === 0) {
      return new Response(
        `data: ${JSON.stringify({ error: "Missing messages" })}\n\n`,
        { status: 400, headers: { "Content-Type": "text/event-stream" } }
      );
    }

    const sources = await loadAllSources();
    const { corpus, index } = buildCorpus(sources);
    const systemPrompt = buildSystemPrompt(corpus, index);

    console.log(`[ask] loaded ${sources.length} source files, corpus length=${corpus.length} chars`);

    const chatMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const stream = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 1024,
      messages: chatMessages,
      stream: true,
    });

    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Send a meta event with source count first
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ meta: { sourceCount: sources.length, sources: index } })}\n\n`
            )
          );
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content;
            if (text) {
              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify({ text })}\n\n`)
              );
            }
          }
          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ask] failed:", message);
    return new Response(
      `data: ${JSON.stringify({ error: message })}\n\n`,
      { status: 500, headers: { "Content-Type": "text/event-stream" } }
    );
  }
}
