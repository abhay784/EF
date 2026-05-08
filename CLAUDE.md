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

# Run Python aggregators manually (requires CONTEXT_DIR env var)
CONTEXT_DIR=./context python3 backend/aggregator/claude_code.py
CONTEXT_DIR=./context python3 backend/summarizer.py

# Ollama (must be running for local summarization)
ollama serve          # Runs on http://localhost:11434
```

## Architecture

### Data Pipeline (Python → JSON → UI)

The sync flow runs when the user clicks **Sync** in the UI, which hits `POST /api/sync`:

1. `backend/aggregator/claude_code.py` — reads `~/.claude/projects/*.jsonl`, extracts session summaries → `context/sessions/*.md`
2. `backend/aggregator/slack.py` — fetches messages via `@anthropic-ai/mcp-server-slack` → `context/slack/*.md`
3. `backend/aggregator/granola.py` — watches `context/granola/` for user-dropped `.md` files
4. `backend/summarizer.py` — sends all markdown to Qwen 3 via Ollama (fallback: Claude Haiku) → `context/weekly_brief.json`

The Next.js API route at `app/api/sync/route.ts` shells out to run these Python scripts.

### Frontend Flow

```
/api/brief  →  ChatPanel (theme chips)
                   ↓ user selects theme
/api/generate  →  StoryboardPanel (Hook / Middle / CTA cards)
```

`/api/generate` streams Claude's response via SSE using `@anthropic-ai/sdk`. The `GenerateRequest` payload includes the selected `Theme`, full `ChatMessage[]` history, and the `WeeklyBrief` for context.

### Key Type Contracts (`lib/types.ts`)

- `WeeklyBrief` — the synthesized output of the pipeline; `themes[]` drives the UI
- `Theme` — has `title`, `one_liner`, `content_angle`, `sources[]`, `suggested_formats[]`
- `VideoScript` — `hook`, `middle`, `cta` strings returned by Claude
- `ChatMessage` — standard `role`/`content` for the conversation history

## Environment Variables

Copy `.env.example` → `.env.local`:

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API for script generation + Haiku fallback |
| `CLAUDE_PROJECTS_DIR` | Yes | Path to `~/.claude/projects` JSONL files |
| `CONTEXT_DIR` | Yes | Working directory for aggregated data (default `./context`) |
| `SLACK_BOT_TOKEN` | No | Slack bot token for message ingestion |
| `SLACK_TEAM_ID` | No | Slack workspace ID |

## Gotchas

- **Claude Code JSONL**: The directory name at `~/.claude/projects/` encodes the path (lossy). Always use the `cwd` field from individual JSONL records, not the directory name. `ai-title` is absent ~70% of the time — fall back to the first user message.
- **Ollama**: First run pulls ~5GB Qwen 3 model. Summarization takes 10-20s on Apple Silicon. The summarizer auto-falls back to Claude Haiku if Ollama isn't reachable.
- **Slack**: The `@anthropic-ai/mcp-server-slack` global package must be installed (`npm install -g`). The bot must be manually invited to each channel.
- **Granola**: Currently manual — user drops exported `.md` files into `context/granola/`. A direct API integration via MCP is planned but not implemented.
