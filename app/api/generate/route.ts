import OpenAI from "openai";
import { NextRequest } from "next/server";
import type { GenerateRequest, WeeklyBrief, Theme } from "@/lib/types";
import { uploadLlmOutput } from "@/lib/supabase/llmOutputs";

const client = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

const MODEL = process.env.XAI_MODEL || "grok-4-fast-non-reasoning";

const STORYBOARD_GENERATION_GUIDANCE = `Use the selected storyboard as the source of truth for the narrative chain.
- Preserve source attribution inside the storyboard field.
- Preserve useful metadata fields inside returned storyboard events when available.
- Use event metadata fields like details, tools, features, artifacts, people_or_teams, decisions, blockers, and grouping_hints as evidence for grouping related events.
- Group events that share a feature, artifact, tool, API, UI surface, data source, decision thread, blocker, or cause/effect relationship.
- Keep each storyboard event discrete and present tense, but preserve specificity from metadata instead of collapsing it into generic summaries.
- Name concrete tools, files, routes, components, APIs, models, commands, env vars, features, and people when the selected theme provides them.
- Use chained events to inform the script's hook and middle.
- If the user asks to expand, tighten, reorder, or inspect the story, update the storyboard field as well as the script.`;

function formatStoryboardContext(theme: Theme): string {
  if (!theme.storyboard) {
    return "No structured storyboard is available yet. Infer the narrative chain from the weekly brief and selected theme.";
  }

  return JSON.stringify(theme.storyboard, null, 2);
}

function parseModelJson(rawText: string) {
  let jsonText = rawText.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.split("```")[1] ?? jsonText;
    if (jsonText.startsWith("json")) {
      jsonText = jsonText.slice(4);
    }
  }

  try {
    return JSON.parse(jsonText.trim()) as unknown;
  } catch {
    return null;
  }
}

function buildSystemPrompt(brief: WeeklyBrief | null, theme: Theme | null): string {
  if (!theme) {
    const briefContext = brief
      ? `\n## The builder's week (use only if directly relevant to what they typed)\n${JSON.stringify(brief, null, 2)}\n`
      : "";

    return `You are an elite short-form video script writer for TikTok, Instagram Reels, and YouTube Shorts. You write 60–90 second scripts that creators actually film and that actually perform. You're inside Weekly, an app for builders/creators.

The user hasn't picked a specific theme yet — they just typed something in chat. Treat whatever they wrote as the topic, angle, or instruction for the script. If their message is too vague (one word, gibberish), either pick the most charitable interpretation OR ask one short clarifying question — but always lean toward generating something useful.
${briefContext}
## What makes a great short-form video script

HOOK (0–10s) — the make-or-break moment. The viewer's thumb is hovering. Best hooks:
- Counterintuitive claim: "The fastest way to learn React is not to build a React project."
- Specific number / contrast: "I shipped 4 features in 2 hours using one trick."
- Pain point stated bluntly: "If your landing page bounces at 80%, this is why."
- Curiosity gap: "Most devs use useEffect wrong. Here's what to do instead."
NEVER start with "Today I want to talk about…", "In this video…", "Hey guys…", or any throat-clearing.

MIDDLE (10–50s) — earned specificity. Include:
- The actual situation, with concrete details (a real number, a real tool name, a real moment)
- What you tried, learned, or noticed — the surprising or non-obvious insight
- One or two crisp turns. No filler. No "as I was saying."
Talk like you're explaining to a smart friend at a coffee shop. Conversational, not scripted-sounding.

CTA (50–60s) — exactly one ask. Pick the one that fits the energy:
- Growth: "Follow for more like this."
- Engagement: "Drop your take in the comments."
- Depth: "Full breakdown in the link in bio."
Never stack multiple CTAs.

## Style rules
- Spoken language, not written. Use contractions. Short sentences.
- One concrete detail beats three abstractions.
- No clichés ("In today's fast-paced world…"). No motivational filler.
- Hook should make a non-creator stop scrolling. Middle should make them feel they learned something. CTA should feel earned.

## Output format
Return ONLY this JSON — no preamble, no markdown fences, no code blocks:
{
  "reply": "Short conversational message to the user (1–2 sentences). Acknowledge what you wrote and why you took that angle.",
  "script": {
    "hook": "spoken text for 0–10s",
    "middle": "spoken text for 10–50s",
    "cta": "spoken text for 50–60s"
  }
}

Rules:
- ALWAYS fill the script unless the user's message is genuinely impossible to interpret as a topic. In that rare case, set "script" to null and use "reply" to ask one short clarifying question.
- On follow-ups where the user asks to change the script, return the full updated script (every field).
- "reply" is always required.`;
  }

  return `You are a short-form video script writer helping a builder turn their real work into content for TikTok, Instagram Reels, and YouTube Shorts (60–90 seconds). You also chat with the builder about the script.

## The builder's week
${JSON.stringify(brief, null, 2)}

## Currently selected theme
Title: ${theme.title}
What happened: ${theme.one_liner}
The angle: ${theme.content_angle}
Sources: ${theme.sources.join(", ")}

## Selected storyboard
${formatStoryboardContext(theme)}

## Storyboard handling
${STORYBOARD_GENERATION_GUIDANCE}

## Evidence handling
The weekly brief may include these optional detail fields on themes, events, turning points, or open threads:
- details
- tools
- features
- artifacts
- people_or_teams
- decisions
- blockers
- grouping_hints

Use those fields to make the script feel specific and real. The best output should mention concrete names when useful, such as the exact tool, feature, route, component, API, model, command, env var, file, Slack channel, meeting note, or decision. Do not invent details that are not in the brief.

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
    "cta": "spoken text for 50–60s",
    "storyboard": {
      "title": "Inferred story title",
      "overview": "One or two sentence arc of events.",
      "phases": [],
      "parallel_events": [],
      "key_turning_points": [],
      "open_threads": [],
      "narrative_summary": "Plain prose summary."
    }
  }
}

Rules for the "script" field:
- On the FIRST message (initial generation request), always include a full script.
- On follow-ups where the user asks you to CHANGE the content (rewrite hook, tighten middle, swap CTA, regroup storyboard, etc.), return the full updated script — every section and storyboard field, even unchanged ones.
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
      max_tokens: 4096,
      messages: chatMessages,
      stream: true,
    });

    const readable = new ReadableStream({
      async start(controller) {
        const outputChunks: string[] = [];

        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content;
            if (text) {
              outputChunks.push(text);
              controller.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify({ text })}\n\n`
                )
              );
            }
          }

          const rawOutput = outputChunks.join("");
          await uploadLlmOutput({
            type: "script_generation",
            created_at: new Date().toISOString(),
            model: MODEL,
            output: {
              raw_response: rawOutput,
              parsed_response: parseModelJson(rawOutput),
            },
            metadata: {
              theme_title: theme?.title ?? null,
              brief_week: brief?.week ?? null,
              message_count: messages.length,
            },
          });

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
