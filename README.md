# EF — Content Builder

Transform your work activity into short-form video scripts. Reads Claude Code sessions, Slack messages, and Granola meeting notes to create a weekly brief, then powers a chat interface to generate video content.

## Setup

### Prerequisites
- Node.js 18+
- Python 3.8+
- xAI API key (for Grok summarization and video script generation)

### 1. Environment Configuration

Copy `.env.example` to `.env.local` and fill in your API keys:

```bash
cp .env.example .env.local
```

Required:
- `XAI_API_KEY` — for Grok summarization and video script generation
- `CLAUDE_PROJECTS_DIR` — path to your Claude Code projects (usually `~/.claude/projects`)
- `CONTEXT_DIR` — where to store aggregated data (default: `./context`)

Optional:
- `XAI_MODEL` — defaults to `grok-4-fast-non-reasoning`
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` — enables private Supabase Storage snapshots of Grok outputs
- `SUPABASE_LLM_OUTPUTS_BUCKET` — storage bucket for LLM output JSON (defaults to `llm-outputs`)
- `SLACK_BOT_TOKEN` — Slack bot token (install MCP server first)
- `SLACK_TEAM_ID` — Slack workspace team ID

### 2. Install Dependencies

```bash
npm install
```

### 3. Optional: Slack Integration

To enable Slack data ingestion:

```bash
npm install -g @anthropic-ai/mcp-server-slack
```

Then set `SLACK_BOT_TOKEN` and `SLACK_TEAM_ID` in `.env.local`.

## Usage

### Start the Dev Server

```bash
npm run dev
```

Navigate to [http://localhost:3000/studio](http://localhost:3000/studio).

### Sync Data

Click the **Sync** button to:
1. Read Claude Code session logs from `~/.claude/projects/`
2. Fetch recent Slack messages (if configured)
3. Process Granola exports (if dropped in `context/granola/`)
4. Summarize everything with xAI Grok → `context/weekly_brief.json`
5. If Supabase is configured, upload the raw Grok response and normalized brief to Storage

### Create Video Scripts

1. Pick a theme from the brief
2. Chat interface generates Hook / Middle / CTA sections
3. Storyboard shows live word counts and estimated spoken duration
4. Copy the script or edit it inline ("make the hook punchier")

## Project Structure

```
EF/
├── app/
│   ├── api/
│   │   ├── sync/      → Aggregation pipeline (Claude Code + Slack + Granola)
│   │   ├── brief/     → Returns weekly_brief.json
│   │   └── generate/  → Grok SSE streaming for video scripts
│   ├── studio/        → Main UI (chat + storyboard split panel)
│   └── layout.tsx     → Root layout
├── components/
│   ├── ChatPanel.tsx          → Theme selection + chat interface
│   ├── StoryboardPanel.tsx    → Hook/Middle/CTA card display
│   ├── ThemeChip.tsx          → Clickable theme pill
│   └── CopyButton.tsx         → Copy to clipboard
├── lib/
│   ├── types.ts       → Shared TypeScript interfaces
│   └── utils.ts       → wordCount, spokenSeconds helpers
├── backend/
│   ├── aggregator/
│   │   ├── claude_code.py  → JSONL parser for Claude Code sessions
│   │   ├── slack.py        → Slack MCP client
│   │   └── granola.py      → Watched folder processor
│   └── summarizer.py       → Grok via xAI
└── context/
    ├── sessions/           → Claude Code session markdown files
    ├── slack/              → Slack channel summaries
    ├── granola/            → User-dropped Granola markdown files
    ├── uploads/            → User-provided context files
    └── weekly_brief.json   → Synthesized weekly brief
```

## Data Flow

```
~/.claude/projects/*.jsonl
    ↓ (claude_code.py)
context/sessions/*.md

Slack (#channels)
    ↓ (slack.py via MCP)
context/slack/*.md

context/granola/*.md (user drops files here)

    All ↓ (summarizer.py)
    
context/weekly_brief.json
    ↓ (UI loads /api/brief)
    
ChatPanel shows theme chips
    ↓ (user selects theme)
    
/api/generate → Grok SSE
    ↓
StoryboardPanel renders Hook/Middle/CTA
    ↓
Supabase Storage stores the raw and parsed script generation response
```

## Gotchas & Notes

### Claude Code JSONL Format
- The directory name at `~/.claude/projects/` encodes the absolute path (lossy encoding). We read `cwd` field from records instead.
- Active sessions may have partial JSON on the last line — we safely skip malformed lines.
- `ai-title` is often absent (~70% of sessions); we fall back to first user message.

### Grok / xAI
- Summarization and script generation both use the xAI API.
- Set `XAI_API_KEY` and optionally `XAI_MODEL` in `.env.local`.
- The default model is `grok-4-fast-non-reasoning`.

### Slack Integration
- Requires installing `@anthropic-ai/mcp-server-slack` globally
- Bot must be invited to channels to read them
- Pulls messages from past 7 days

### Granola
- v1 (current): Drop exported `.md` files into `context/granola/`
- v2 (future): Custom MCP server for direct API integration

## Next Steps

- [ ] Test the data pipeline end-to-end
- [ ] Add Slack bot setup instructions
- [ ] Implement remaining content formats (Twitter thread, carousel, etc.)
- [ ] Add exports: PDF, Notion, scheduled posting
- [ ] Build custom Granola MCP server

## Development

### Type Checking

```bash
npx tsc --noEmit
```

### Build for Production

```bash
npm run build
npm start
```

### Run Python Scripts Manually

```bash
CONTEXT_DIR=./context python3 backend/aggregator/claude_code.py
CONTEXT_DIR=./context python3 backend/summarizer.py
```
