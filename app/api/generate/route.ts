import OpenAI from "openai";
import { NextRequest } from "next/server";
import type { GenerateRequest, WeeklyBrief, Theme } from "@/lib/types";

const client = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

const MODEL = process.env.XAI_MODEL || "grok-4-fast-non-reasoning";

function buildSystemPrompt(brief: WeeklyBrief | null, theme: Theme | null): string {
  if (!theme) {
    return `You are the chat assistant inside Weekly — an app that turns a builder's work activity (Claude Code sessions, Slack messages, Granola meeting notes) into short-form video scripts.

The builder hasn't synced their week yet, so you don't have any of their activity to draw on. Be helpful and direct: answer questions about the app, what Sync does, how to get started, or anything else they ask. If they want a script, tell them to hit the Sync button so you can read their week first.

## Output format
Return ONLY this JSON — no preamble, no markdown fences, no code blocks:
{
  "reply": "Your conversational message to the builder. 1–4 sentences.",
  "script": null
}

Always set "script" to null in this mode — there's no week to draw on yet.
The "reply" field is always required.`;
  }

  return `You are a short-form video script writer helping a builder turn their real work into content for TikTok, Instagram Reels, and YouTube Shorts (60–90 seconds). You also chat with the builder about the script.

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
Return ONLY this JSON — no preamble, no markdown fences, no code blocks:
{
  "reply": "Short conversational message to the builder (1–3 sentences). What you did, or your answer if they asked a question.",
  "script": {
    "hook": "spoken text for 0–10s",
    "middle": "spoken text for 10–50s",
    "cta": "spoken text for 50–60s"
  }
}

Rules for the "script" field:
- On the FIRST message (initial generation request), always include a full script.
- On follow-ups where the user asks you to CHANGE the content (rewrite hook, tighten middle, swap CTA, etc.), return the full updated script — every section, even unchanged ones.
- On pure questions where the user is NOT asking to change the script (e.g. "why did you choose that hook?", "what would work for LinkedIn?"), set "script" to null.

The "reply" field is always required.`;
}

export async function POST(req: NextRequest) {
  try {
    const body: GenerateRequest = await req.json();
    const { theme, messages, brief } = body;

    if (!messages || messages.length === 0) {
      return new Response(
        "data: " + JSON.stringify({ error: "Missing messages" }) + "\n\n",
        { status: 400, headers: { "Content-Type": "text/event-stream" } }
      );
    }

    const systemPrompt = buildSystemPrompt(brief ?? null, theme ?? null);

    const chatMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
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
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content;
            if (text) {
              controller.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify({ text })}\n\n`
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
