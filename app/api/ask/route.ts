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

const STOPWORDS = new Set([
  "the","a","an","is","are","was","were","be","been","being","of","to","in","on","at","for","with","by","from","as","that","this","these","those","what","when","where","who","whom","why","how","tell","me","about","i","you","my","your","our","we","us","they","them","their","story","summarize","summary","please","pls","just","also","and","or","but","not","no","yes","do","did","does","get","got","make","made","whats","what's","its","it","theme","themes","connection","connections","find","show","give","like","right","now","here","there","some","more","less","very","really","actually","mention","mentions","mentioning",
]);

function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

function scoreSource(s: SourceFile, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const haystack = s.content.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    let i = 0;
    let hits = 0;
    while ((i = haystack.indexOf(kw, i)) !== -1) {
      hits++;
      i += kw.length;
      if (hits >= 5) break;
    }
    score += hits;
  }
  return score;
}

const MAX_CORPUS_CHARS = 90_000; // ~25k tokens — keeps Grok responsive (under 10s typical)
const MAX_PER_SOURCE_CHARS = 8_000; // some session files are 100k+ — truncate so one file doesn't eat the budget

function truncateSource(s: SourceFile, query: string): string {
  if (s.content.length <= MAX_PER_SOURCE_CHARS) return s.content.trim();
  // For long files, keep the head + the slice around the first keyword hit (if any).
  const keywords = extractKeywords(query);
  const lower = s.content.toLowerCase();
  let hitIdx = -1;
  for (const kw of keywords) {
    const idx = lower.indexOf(kw);
    if (idx !== -1) {
      hitIdx = idx;
      break;
    }
  }
  const head = s.content.slice(0, 2_000).trim();
  if (hitIdx === -1) {
    return `${head}\n\n[…truncated, ${s.content.length - 2_000} more chars…]`;
  }
  const start = Math.max(2_000, hitIdx - 1_500);
  const end = Math.min(s.content.length, start + (MAX_PER_SOURCE_CHARS - 2_000));
  const slice = s.content.slice(start, end).trim();
  return `${head}\n\n[…jumping to relevant section…]\n\n${slice}\n\n[…end of slice…]`;
}

function buildCorpus(
  sources: SourceFile[],
  query: string
): { corpus: string; index: string[] } {
  const keywords = extractKeywords(query);
  const scored = sources
    .map((s) => ({ s, score: scoreSource(s, keywords) }))
    .sort((a, b) => b.score - a.score);

  // Fallback ordering when no keywords matched: prioritize meeting/comms over code logs.
  const sourcePriority: Record<string, number> = { granola: 0, slack: 1, uploads: 2, code: 3 };
  if (scored.every((x) => x.score === 0)) {
    scored.sort((a, b) => (sourcePriority[a.s.source] ?? 9) - (sourcePriority[b.s.source] ?? 9));
  }

  const index: string[] = [];
  const blocks: string[] = [];
  let total = 0;

  for (const { s, score } of scored) {
    const id = `${s.source}/${s.filename}`;
    const body = truncateSource(s, query);
    const block = `--- BEGIN SOURCE: ${id} ---\n${body}\n--- END SOURCE: ${id} ---`;
    if (total + block.length > MAX_CORPUS_CHARS) break;
    blocks.push(block);
    index.push(id + (score > 0 ? ` (relevance ${score})` : ""));
    total += block.length;
  }

  return { corpus: blocks.join("\n\n"), index };
}

function buildSystemPrompt(corpus: string, index: string[]): string {
  const fileList = index.length > 0 ? index.map((f) => `  - ${f}`).join("\n") : "  (no source files yet — user has not synced)";
  return `You are a personal knowledge assistant. The user has Slack, Granola (meeting notes), Claude Code session logs, and manual uploads. Answer questions about their work using ONLY these sources.

## Step 0 — pre-think before writing (silently)

Before answering, do this thinking *silently* (do not show it to the user):
1. Identify the **subject** of the question (a person, project, topic, decision, time window).
2. **Find every mention** of that subject across ALL source files. Don't stop at the first match. Search for the name, aliases (first name, last name, email, slack handle), and related concepts.
3. Group the mentions into **common themes** — recurring topics, shared people, repeated decisions, threads that connect across multiple sources. A theme is something that shows up in 2+ places.
4. Order them in time. Find the **earliest mention**, the **latest update**, and the **turning points** in between.
5. Decide what the user actually wants to know — surface the **most useful 1–3 facts**, not everything.

Only after that thinking, write the answer.

## Length: match the question

Match the question's ambition. A short question gets a short answer. A "tell me the story" question gets a substantive, well-structured answer that mixes prose and bullets.

- Direct factual question ("when did we ship X?", "who's John?", "what's the auth status?") → **1–3 sentences**, full stop.
- List request ("list bugs", "what features shipped") → **bulleted list, 4–8 items**, each with a concrete cited detail.
- "Tell me the story with X" / "What's going on with Y" / "Walk me through Z" → **the story format below — 350–550 words, prose mixed with bulleted blocks**.

For story-format answers, do NOT under-write. The user wants a piece they could read like a magazine article — substantive, with texture. Aim higher in the range, not lower.

## Story format (when asked about a person, project, topic, or "the story of…")

Magazine writer telling a colleague what really happened. Not a status report, not a one-liner. **350–550 words.** Mix prose paragraphs with one or two bulleted blocks — bullets are reserved for *concrete facts with citations*, prose carries the connective tissue and stakes.

Use this structure:

### {Headline — under 10 words, specific, no clichés}

**Lede (~3–4 sentences).** Open in medias res. Drop the reader into the most interesting moment or tension. No "Tyler is a content creator who…" intros, no "On May 8th…" timestamps as openers. Set up *what's at stake* in this story.

**Then a "Key beats" bulleted block — 4–6 bullets.** Each bullet starts with a *short italic label*, then a concrete fact with a name/number/decision and a citation. Reserve bullets for the load-bearing facts; everything else stays in prose.

- *short label* — concrete fact with a number/name [granola/x.md]
- *short label* — concrete fact with a number/name [slack/y.md]
- *short label* — concrete fact with a number/name [code/z.md]
- *short label* — concrete fact with a number/name [granola/w.md]

**The middle paragraph (~3–4 sentences).** This is the connective tissue — what those facts mean together, the through-line across sources, the turning point. Quote a specific phrase if it landed. Name the contradiction if two sources disagree.

**Optional second bulleted block** — only if there's a genuine list inside the story (open questions, decisions made, people involved). 3–5 bullets. Skip if not earned.

**Closing paragraph (~2–3 sentences).** Where it stands now. What's open. What you'd watch next. End on a line that lingers — a surprising twist, a sharp takeaway, or the open question that actually matters.

## Style rules

- **Specific over generic.** "2000+ Pearson correlation experiments on retention curves" stays. "Productive discussion" cuts.
- **Earned voice.** Contractions. Short sentences mixed with longer ones. One declarative line per paragraph if it lands.
- **Weave sources.** If the topic shows up in Slack and Granola, the prose connects them — "what started Tuesday in DMs [slack/x.md] turned into a Friday meeting [granola/y.md]".
- **Cite lightly.** Once per claim. Not after every sentence.
- **No labeled subsections** like "TL;DR" or "Timeline" — just the headline, lede, key beats, closing paragraph.

## Hard rules

- **Cross-source linking is mandatory.** If a person/topic appears in both Slack and Granola, the answer MUST connect them. Don't list Slack stuff then Granola stuff — weave them.
- **Cite inline** as \`[granola/file.md]\`, \`[slack/file.md]\`, \`[code/file.md]\`. One citation per claim, not after every sentence.
- **No "Based on the sources…"** preambles. No "It seems that…". Lead with the answer.
- If two sources disagree, name the conflict explicitly: "Slack [slack/x.md] said X but the meeting notes [granola/y.md] decided Y."
- Never invent. If you don't see something, say "I don't see {X} in the sources" — one line, then stop.

## When sources are thin

If the subject only appears once or twice, write the short version honestly:
> The only mention of John I see is in [granola/not_x.md] — he was a no-show on May 6 and you discussed pivoting to content strategy.

Don't pad. Don't invent connections that aren't there.

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
    // Use the most recent user message + recent context to score sources by relevance.
    const recentUserText = messages
      .filter((m) => m.role === "user")
      .slice(-3)
      .map((m) => m.content)
      .join(" ");
    const { corpus, index } = buildCorpus(sources, recentUserText);
    const systemPrompt = buildSystemPrompt(corpus, index);

    console.log(
      `[ask] ${sources.length} total sources, ${index.length} included (${corpus.length} chars)`
    );

    const chatMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const stream = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 2048,
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
