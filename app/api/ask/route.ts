import OpenAI from "openai";
import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";

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

const SOURCE_DIRS: Array<{ dir: string; source: SourceFile["source"] }> = [
  { dir: "sessions", source: "code" },
  { dir: "slack", source: "slack" },
  { dir: "granola", source: "granola" },
  { dir: "uploads", source: "uploads" },
];

async function loadAllSources(): Promise<SourceFile[]> {
  const cwd = process.cwd();
  const out: SourceFile[] = [];

  for (const { dir, source } of SOURCE_DIRS) {
    const fullDir = path.join(cwd, "context", dir);
    let entries: string[];
    try {
      entries = await fs.readdir(fullDir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith(".md")) continue;
      const fullPath = path.join(fullDir, name);
      try {
        const content = await fs.readFile(fullPath, "utf-8");
        out.push({ source, filename: name, content });
      } catch {
        // skip unreadable
      }
    }
  }

  return out;
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
  return `You are a context extractor. The user has Slack, Granola (meeting notes), Claude Code session logs, and manual uploads. Your job is to pull relevant facts from these sources and present them as grouped bullet points — raw material the user can use to build their own content.

Never write prose, narratives, or paragraphs. Always respond in structured bullet points grouped by source.

## Output format
Always use this structure:

**[Source label]** (e.g. Claude Code, Slack, Granola, Uploads)
- Specific fact from that source [source/filename.md]
- Another specific fact [source/filename.md]

**Key connections**
- Cross-source insight connecting two or more sources

Rules:
- Every bullet is one concrete fact, decision, or moment — under 15 words
- Cite the source file inline on every bullet: [source/filename.md]
- Group bullets by source first, then add a "Key connections" section for cross-source links
- If a source has nothing relevant, omit it entirely
- If you can't find relevant information, say so in one line and suggest what to sync
- No introductions, no summaries, no "Based on the sources…" preambles

## Available source files (${index.length} total)
${fileList}

## Source content
${corpus || "(empty — no sources have been synced yet)"}
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
      max_tokens: 4096,
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
