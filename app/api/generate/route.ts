import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import type { GenerateRequest, WeeklyBrief, Theme } from "@/lib/types";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function buildSystemPrompt(brief: WeeklyBrief, theme: Theme): string {
  return `You are a short-form video script writer helping a builder turn their real work into content for TikTok, Instagram Reels, and YouTube Shorts (60–90 seconds).

## The builder's week
${JSON.stringify(brief, null, 2)}

## Currently selected theme
Title: ${theme.title}
What happened: ${theme.one_liner}
The angle: ${theme.content_angle}
Sources: ${theme.sources.join(", ")}

## What makes great short-form video scripts

HOOK (0–10s): Must create a pattern interrupt. Best hooks are:
- A counterintuitive claim ("The bug wasn't in my code at all")
- A specific number or result ("Cut build time by 60% with one config change")
- A relatable pain point stated bluntly ("I wasted two days on a problem that didn't exist")
Never start with "Today I want to talk about..." or "In this video..."

MIDDLE (10–50s): Tell the story with earned specificity. Include:
- The actual problem or context (brief, real)
- What you tried or discovered
- The surprising or non-obvious part — this is the value
Keep it conversational. Talk like you're explaining to a smart friend, not presenting.

CTA (50–60s): One clear action. Options:
- "Follow for more of this" (growth)
- "What's your take on this?" (engagement)
- "I'm writing this up in more detail — link in bio" (depth signal)
Don't stack multiple CTAs.

## Output format
Return ONLY this JSON — no preamble, no markdown fences:
{
  "hook": "spoken text for 0–10s",
  "middle": "spoken text for 10–50s",
  "cta": "spoken text for 50–60s"
}

For follow-up edits (user asks to change something), return the full updated JSON with all three sections — even sections that didn't change.`;
}

export async function POST(req: NextRequest) {
  try {
    const body: GenerateRequest = await req.json();
    const { theme, messages, brief } = body;

    if (!theme || !messages || !brief) {
      return new Response(
        "data: " + JSON.stringify({ error: "Missing required fields" }) + "\n\n",
        { status: 400, headers: { "Content-Type": "text/event-stream" } }
      );
    }

    const systemPrompt = buildSystemPrompt(brief, theme);

    const anthropicMessages = messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: anthropicMessages,
    });

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              const text = chunk.delta.text;
              const data = { text };
              controller.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify(data)}\n\n`
                )
              );
            }
          }
          controller.enqueue(
            new TextEncoder().encode("data: [DONE]\n\n")
          );
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
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      `data: ${JSON.stringify({ error: message })}\n\n`,
      {
        status: 500,
        headers: { "Content-Type": "text/event-stream" },
      }
    );
  }
}
