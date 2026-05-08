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
  return `You are a personal knowledge assistant. The user has integrations to Slack, Granola (meeting notes), Claude Code session logs, and manual uploads. All of their recent activity has been compiled into source files below. Your job is to answer questions about their work by drawing connections across these sources.

Typical questions:
- "What's the story with John?" → find every Slack DM, meeting, and document mentioning John, then narrate the timeline.
- "What did I ship last week?" → pull from Claude Code sessions and meeting notes.
- "Who's been blocking the auth migration?" → search for the topic across Slack and meetings.
- "Summarize my Tuesday." → find everything timestamped that day across all sources.

## Available source files (${index.length} total)
${fileList}

## How to answer
1. Read the question carefully. Identify the entities (people, projects, topics, dates) the user cares about.
2. Search the source content below for everything relevant. Be thorough — pull from multiple sources when possible.
3. Build a clear, narrative answer. Don't dump bullet lists unless the user asked for them.
4. **Always cite sources** by filename. Format: \`[granola/not_xyz.md]\` or \`[slack/general.md]\`. Cite inline as you mention facts.
5. If you can't find the answer, say so plainly — don't invent details. Suggest what they could sync to fill the gap.
6. Keep the tone direct and useful. Skip pleasantries and "Based on the sources you provided…" preambles.

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
