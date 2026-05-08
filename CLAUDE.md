# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

EF is a content creation tool that transforms work activity (Claude Code sessions, Slack messages, Granola meeting notes) into short-form video scripts. The app is a Next.js 14 frontend with a Python backend pipeline.

The root URL `/` redirects to `/studio`, which is the only real page.

## Commands

```bash
# Dev server
npm run dev           # Next.js dev server at http://localhost:3000/studio

# Type checking
npx tsc --noEmit

# Lint
npm run lint

# Production
npm run build && npm start

# Run Python aggregators manually (requires CONTEXT_DIR and XAI_API_KEY env vars)
CONTEXT_DIR=./context python3 backend/aggregator/claude_code.py
CONTEXT_DIR=./context XAI_API_KEY=... python3 backend/summarizer.py
```

## Architecture

### Data Pipeline (Python → JSON → UI)

The sync flow runs when the user clicks **Sync** in the UI, which hits `POST /api/sync`:

1. `backend/aggregator/claude_code.py` — reads `~/.claude/projects/*.jsonl`, extracts session summaries → `context/sessions/*.md`
2. `backend/aggregator/slack.py` — fetches messages via `@anthropic-ai/mcp-server-slack` → `context/slack/*.md`
3. `backend/aggregator/granola.py` — watches `context/granola/` for user-dropped `.md` files
4. `backend/summarizer.py` — sends all markdown to xAI Grok (OpenAI-compatible endpoint) → `context/weekly_brief.json`

The Next.js API route at `app/api/sync/route.ts` shells out to run these Python scripts.

### Frontend Flow

```
/api/brief  →  ChatPanel (theme chips + chat)
                   ↓ user picks angle or types in chat
/api/generate  →  streams JSON {reply, script}
                   ↓ reply renders in chat, script renders in PreviewPanel
```

`/api/generate` streams xAI Grok's response via SSE using the `openai` SDK pointed at `https://api.x.ai/v1`. The `GenerateRequest` payload includes the selected `Theme`, full `ChatMessage[]` history, and the `WeeklyBrief` for context. The model returns `{"reply": "...", "script": {hook, middle, cta} | null}` — `script` is null on pure-question follow-ups so the existing draft is preserved.

### Key Type Contracts (`lib/types.ts`)

- `WeeklyBrief` — the synthesized output of the pipeline; `themes[]` drives the UI
- `Theme` — has `title`, `one_liner`, `content_angle`, `sources[]`, `suggested_formats[]`
- `VideoScript` — `hook`, `middle`, `cta` strings returned by Claude
- `ChatMessage` — standard `role`/`content` for the conversation history

## Environment Variables

Copy `.env.example` → `.env.local`:

| Variable | Required | Purpose |
|---|---|---|
| `XAI_API_KEY` | Yes | xAI API key — powers both summarization and script generation |
| `XAI_MODEL` | No | Defaults to `grok-4-fast-non-reasoning` |
| `CLAUDE_PROJECTS_DIR` | Yes | Path to `~/.claude/projects` JSONL files |
| `CONTEXT_DIR` | Yes | Working directory for aggregated data (default `./context`) |
| `SLACK_BOT_TOKEN` | No | Slack bot token for message ingestion |
| `SLACK_TEAM_ID` | No | Slack workspace ID |

## Gotchas

- **Claude Code JSONL**: The directory name at `~/.claude/projects/` encodes the path (lossy). Always use the `cwd` field from individual JSONL records, not the directory name. `ai-title` is absent ~70% of the time — fall back to the first user message.
- **xAI**: Both `backend/summarizer.py` and `app/api/generate/route.ts` hit `https://api.x.ai/v1`. The summarizer is non-streaming; the generate route streams SSE. No local model is required.
- **Slack**: The `@anthropic-ai/mcp-server-slack` global package must be installed (`npm install -g`). The bot must be manually invited to each channel.
- **Granola**: Currently manual — user drops exported `.md` files into `context/granola/`. A direct API integration via MCP is planned but not implemented.
