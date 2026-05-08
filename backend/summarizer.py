#!/usr/bin/env python3
import json
import os
import uuid
from pathlib import Path
from datetime import datetime, timedelta
from urllib import error, parse, request


XAI_API_KEY = os.environ.get("XAI_API_KEY", "")
XAI_MODEL = os.environ.get("XAI_MODEL", "grok-4-fast-non-reasoning")
XAI_URL = "https://api.x.ai/v1/chat/completions"
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SUPABASE_SECRET_KEY = os.environ.get("SUPABASE_SECRET_KEY", "")
SUPABASE_LLM_OUTPUTS_BUCKET = os.environ.get("SUPABASE_LLM_OUTPUTS_BUCKET", "llm-outputs")


def post_json(url: str, payload: dict, headers=None) -> dict:
    """POST JSON using the standard library to avoid a Python dependency install."""
    req = request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            **(headers or {}),
        },
        method="POST",
    )
    with request.urlopen(req, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def supabase_storage_headers(content_type=None) -> dict:
    headers = {
        "apikey": SUPABASE_SECRET_KEY,
        "Authorization": f"Bearer {SUPABASE_SECRET_KEY}",
    }
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def ensure_supabase_bucket() -> bool:
    """Create the private storage bucket on demand when Supabase is configured."""
    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        print("  [warn] Skipping Supabase upload: missing Supabase environment variables")
        return False

    bucket_id = parse.quote(SUPABASE_LLM_OUTPUTS_BUCKET, safe="")
    get_req = request.Request(
        f"{SUPABASE_URL}/storage/v1/bucket/{bucket_id}",
        headers=supabase_storage_headers(),
        method="GET",
    )

    try:
        with request.urlopen(get_req, timeout=30):
            return True
    except error.HTTPError as e:
        if e.code != 404:
            print(f"  [warn] Failed to inspect Supabase bucket: {e}")
            return False

    create_req = request.Request(
        f"{SUPABASE_URL}/storage/v1/bucket",
        data=json.dumps({
            "id": SUPABASE_LLM_OUTPUTS_BUCKET,
            "name": SUPABASE_LLM_OUTPUTS_BUCKET,
            "public": False,
        }).encode("utf-8"),
        headers=supabase_storage_headers("application/json"),
        method="POST",
    )

    try:
        with request.urlopen(create_req, timeout=30):
            return True
    except error.HTTPError as e:
        print(f"  [warn] Failed to create Supabase bucket: {e}")
        return False


def upload_llm_output(kind: str, payload: dict):
    """Upload an LLM output snapshot to Supabase Storage without adding dependencies."""
    if not ensure_supabase_bucket():
        return

    timestamp = datetime.utcnow().strftime("%Y-%m-%dT%H-%M-%SZ")
    day = datetime.utcnow().strftime("%Y-%m-%d")
    object_path = f"{kind}/{day}/{timestamp}-{uuid.uuid4()}.json"
    encoded_path = parse.quote(object_path, safe="/")
    upload_req = request.Request(
        f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_LLM_OUTPUTS_BUCKET}/{encoded_path}",
        data=json.dumps(payload, indent=2).encode("utf-8"),
        headers=supabase_storage_headers("application/json"),
        method="POST",
    )

    try:
        with request.urlopen(upload_req, timeout=30):
            print(f"  ✓ Uploaded LLM output to Supabase Storage: {object_path}")
    except Exception as e:
        print(f"  [warn] Failed to upload LLM output to Supabase Storage: {e}")


def call_xai(system: str, user_message: str) -> str:
    """Call Grok via xAI's OpenAI-compatible endpoint."""
    if not XAI_API_KEY:
        raise RuntimeError("XAI_API_KEY is required for Grok summarization")

    try:
        response = post_json(
            XAI_URL,
            {
                "model": XAI_MODEL,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_message},
                ],
                "temperature": 0.3,
                "stream": False,
            },
            headers={
                "Authorization": f"Bearer {XAI_API_KEY}",
            },
        )
        return response["choices"][0]["message"]["content"]
    except Exception as e:
        raise RuntimeError(f"xAI call failed: {e}")


def read_all_markdown_sources() -> str:
    """Read all markdown files from sessions, slack, granola, and uploads."""
    context_dir = Path(os.environ.get("CONTEXT_DIR", "./context"))
    all_content = []

    sources = [
        ("sessions", "claude_code"),
        ("slack", "slack"),
        ("granola", "granola"),
        ("uploads", "manual_upload"),
    ]

    for subdir, source_type in sources:
        source_dir = context_dir / subdir
        if source_dir.exists():
            for f in sorted(source_dir.glob("*.md")):
                try:
                    content = f.read_text(encoding="utf-8")
                    all_content.append(
                        f"--- SOURCE: {source_type} | {f.stem} ---\n{content}\n"
                    )
                except Exception as e:
                    print(f"  [warn] Failed to read {f.name}: {e}")

    if not all_content:
        print("  [warn] No markdown source files found")
        return ""

    return "\n".join(all_content)


DETAIL_LIST_FIELDS = [
    "tools",
    "features",
    "artifacts",
    "people_or_teams",
    "decisions",
    "blockers",
    "grouping_hints",
]


def normalize_string_list(value) -> list[str]:
    """Normalize model-provided metadata lists while dropping empty items."""
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def normalize_detail_fields(item: dict) -> dict:
    """Preserve optional evidence fields that help downstream story generation."""
    details = {}
    if item.get("details"):
        details["details"] = str(item["details"]).strip()
    for field in DETAIL_LIST_FIELDS:
        values = normalize_string_list(item.get(field))
        if values:
            details[field] = values
    return details


def normalize_storyboard(storyboard, theme_title: str, fallback_sources):
    """Keep the frontend contract stable even if the model omits optional fields."""
    fallback_source = fallback_sources[0] if fallback_sources else "unknown"
    if not isinstance(storyboard, dict):
        storyboard = {}

    def normalize_event(event, relation: str):
        if not isinstance(event, dict):
            event = {"text": str(event)}
        event_relation = event.get("relation") if event.get("relation") in {"root", "next", "parallel"} else relation
        return {
            "text": str(event.get("text", "")).strip(),
            "source": str(event.get("source") or fallback_source).strip(),
            "relation": event_relation,
            "confirmed": bool(event.get("confirmed", True)),
            **normalize_detail_fields(event),
            **({"discrepancy": str(event["discrepancy"]).strip()} if event.get("discrepancy") else {}),
        }

    phases = storyboard.get("phases", [])
    if not isinstance(phases, list):
        phases = []
    normalized_phases = []
    for idx, phase in enumerate(phases):
        if not isinstance(phase, dict):
            continue
        events = phase.get("events", [])
        if not isinstance(events, list):
            events = []
        normalized_phases.append({
            "title": str(phase.get("title") or f"Phase {idx + 1}").strip(),
            "events": [
                normalize_event(event, "root" if event_idx == 0 else "next")
                for event_idx, event in enumerate(events)
                if str(event.get("text", event) if isinstance(event, dict) else event).strip()
            ],
        })

    def normalize_text_items(items):
        if not isinstance(items, list):
            return []
        normalized = []
        for item in items:
            if isinstance(item, dict):
                text = str(item.get("text", "")).strip()
                source = item.get("source")
            else:
                text = str(item).strip()
                source = None
            if text:
                normalized.append({
                    "text": text,
                    **({"source": str(source).strip()} if source else {}),
                    **(normalize_detail_fields(item) if isinstance(item, dict) else {}),
                })
        return normalized

    return {
        "title": str(storyboard.get("title") or theme_title).strip(),
        "overview": str(storyboard.get("overview", "")).strip(),
        "phases": normalized_phases,
        "parallel_events": [
            normalize_event(event, "parallel")
            for event in storyboard.get("parallel_events", [])
            if str(event.get("text", event) if isinstance(event, dict) else event).strip()
        ] if isinstance(storyboard.get("parallel_events", []), list) else [],
        "key_turning_points": [
            {
                "text": item["text"],
                "source": item.get("source") or fallback_source,
            }
            for item in normalize_text_items(storyboard.get("key_turning_points", []))
        ],
        "open_threads": normalize_text_items(storyboard.get("open_threads", [])),
        "narrative_summary": str(storyboard.get("narrative_summary", "")).strip(),
    }


def normalize_format(label: str) -> str:
    mapping = {
        "video_script": "video",
        "linkedin_post": "post",
        "twitter_thread": "thread",
    }
    return mapping.get(label, label)


def run_summarizer():
    """Main summarizer pipeline."""
    combined_text = read_all_markdown_sources()
    if not combined_text:
        raise RuntimeError("No source data to summarize")

    system_prompt = """You are a storyboard aggregation engine for a builder's weekly work activity.

Your job is to ingest labeled data sources and transform them into a comprehensive, evidence-rich set of content themes covering every interesting thing the builder did that week. Each theme must include a structured narrative storyboard: a clear, ordered chain of events that builds logically from raw code sessions, Slack conversations, and meeting notes.

Input handling rules:
- Treat each `--- SOURCE: type | filename ---` block as a labeled source.
- If timestamps exist, use them to establish chronological order across sources.
- If no timestamps are present, infer logical sequence from context and causality.
- Deduplicate overlapping events across sources into a single storyboard point.
- Resolve conflicts by adding a `discrepancy` field on the relevant event.
- If a source is ambiguous, set `confirmed` to false.

Theme selection rules:
- Find every interesting thing the builder did, figured out, shipped, debugged, discussed, planned, decided, learned, documented, or left unresolved that week.
- Interesting is broad: include not only surprising outcomes, misleading problems, and useful decisions, but also implementation work, product changes, technical investigations, design tradeoffs, workflow improvements, collaboration, recurring friction, open questions, and small but concrete progress.
- Optimize for full weekly coverage over brevity. Do not stop after a small shortlist if the sources contain more distinct work.
- Merge duplicate or tightly related events into one theme, but keep separate themes for distinct threads of work even if they seem minor.
- Keep titles under 8 words.
- `one_liner` is one sentence describing what happened.
- `content_angle` is why someone outside the team should care.
- `sources` is an array of source filenames used by the theme.
- `suggested_formats` uses values from ["video", "post", "thread", "carousel"].

Specificity rules:
- Be concrete enough that a second LLM can group related work into storyboard features without rereading the raw sources.
- Name exact tools, systems, vendors, models, APIs, routes, components, files, commands, env vars, data folders, UI labels, and feature names when the sources mention them.
- Explain what changed, what was added, what was removed, what was debugged, and what decision was made. Avoid vague wording like "worked on the app" when the source says what part changed.
- Capture relationships between events using `grouping_hints`: shared feature area, same bug, same launch path, same API, same UI surface, same data source, same decision thread, or cause/effect.
- Do not invent names or implementation details. If a detail is implied but not explicit, include it only in `details` with cautious wording and set `confirmed` to false when appropriate.
- Prefer specific nouns over generic categories: use "app/api/sync/route.ts", "context/granola", "XAI_MODEL", "Slack MCP server", or "PreviewPanel" if present in sources.

Storyboard rules:
- Use present tense for event text.
- Each event is one discrete event. Keep `text` concise but specific, and put supporting evidence in `details` and metadata fields.
- Use `relation: "root"` for the first event in a phase, `relation: "next"` for chained events, and `relation: "parallel"` for concurrent events.
- Attribute every event and turning point to a source filename.
- Group events into phases only when the story spans distinct stages.
- Do not editorialize. Report what the sources say.
- Include 2-4 key turning points.
- Include unresolved items, gaps, or missing data in `open_threads`.
- Include a one-paragraph `narrative_summary` after the structured storyboard fields.

Optional detail fields:
- `details`: 1-3 sentences with concrete evidence and implementation specifics.
- `tools`: tools, services, frameworks, models, MCP servers, SDKs, or commands involved.
- `features`: product or system capabilities affected.
- `artifacts`: files, routes, components, functions, folders, env vars, docs, channels, meetings, or named assets.
- `people_or_teams`: people, teams, Slack users, or stakeholder groups mentioned.
- `decisions`: specific decisions, tradeoffs, approvals, or rejected approaches.
- `blockers`: errors, missing data, ambiguity, setup problems, or unresolved constraints.
- `grouping_hints`: labels that help connect this event to related events in other themes or phases.

Return ONLY valid JSON, no preamble, no markdown fences. Use exactly this top-level shape:
{
  "week": "YYYY-MM-DD",
  "themes": [
    {
      "title": "Under 8 words",
      "one_liner": "One sentence.",
      "content_angle": "Why outsiders should care.",
      "sources": ["source_filename"],
      "suggested_formats": ["video"],
      "details": "Specific implementation context and evidence for this theme.",
      "tools": ["Tool or system name"],
      "features": ["Feature or capability name"],
      "artifacts": ["file_or_route_or_component"],
      "people_or_teams": ["person_or_team"],
      "decisions": ["Specific decision or tradeoff"],
      "blockers": ["Specific blocker or missing piece"],
      "grouping_hints": ["shared_feature_area_or_story_thread"],
      "storyboard": {
        "title": "Inferred story title",
        "overview": "One or two sentences summarizing the full arc.",
        "phases": [
          {
            "title": "Phase name",
            "events": [
              {
                "text": "Builder identifies the blocking issue",
                "source": "source_filename",
                "relation": "root",
                "confirmed": true,
                "details": "Specific evidence: what was inspected, changed, tested, or decided.",
                "tools": ["Tool or system name"],
                "features": ["Feature or capability name"],
                "artifacts": ["file_or_route_or_component"],
                "people_or_teams": ["person_or_team"],
                "decisions": ["Specific decision or tradeoff"],
                "blockers": ["Specific blocker or missing piece"],
                "grouping_hints": ["shared_feature_area_or_story_thread"]
              }
            ]
          }
        ],
        "parallel_events": [
          {
            "text": "Team discusses a related launch risk",
            "source": "source_filename",
            "relation": "parallel",
            "confirmed": true
          }
        ],
        "key_turning_points": [
          {
            "text": "The investigation shifts from frontend to data ingestion",
            "source": "source_filename"
          }
        ],
        "open_threads": [
          {
            "text": "Final production result is not present in sources",
            "source": "source_filename"
          }
        ],
        "narrative_summary": "Plain prose summary of the storyboard."
      }
    }
  ],
  "raw_highlights": ["..."],
  "user_uploads": []
}"""

    week_monday = (
        datetime.now() - timedelta(days=datetime.now().weekday())
    ).strftime("%Y-%m-%d")

    user_message = f"""Today is {datetime.now().strftime('%Y-%m-%d')}.
The week started on {week_monday}.

Here is the raw builder activity:

{combined_text}

Generate the weekly brief in JSON format."""

    print(f"  Calling Grok ({XAI_MODEL}) to summarize...")
    raw_response = call_xai(system_prompt, user_message)
    print("  ✓ Grok summarization complete")

    json_text = raw_response.strip()
    if json_text.startswith("```"):
        json_text = json_text.split("```")[1]
        if json_text.startswith("json"):
            json_text = json_text[4:]
    json_text = json_text.strip()

    try:
        brief = json.loads(json_text)
    except json.JSONDecodeError as e:
        print(f"  [error] Failed to parse JSON response: {e}")
        print(f"  Raw response: {json_text[:200]}")
        raise

    if "week" not in brief:
        brief["week"] = week_monday
    if "themes" not in brief:
        brief["themes"] = []
    if "raw_highlights" not in brief:
        brief["raw_highlights"] = []
    if "user_uploads" not in brief:
        brief["user_uploads"] = []
    if not isinstance(brief["themes"], list):
        brief["themes"] = []
    for theme in brief["themes"]:
        if not isinstance(theme, dict):
            continue
        theme["title"] = str(theme.get("title", "Untitled theme")).strip()
        theme["one_liner"] = str(theme.get("one_liner", "")).strip()
        theme["content_angle"] = str(theme.get("content_angle", "")).strip()
        if not isinstance(theme.get("sources"), list):
            theme["sources"] = []
        theme["sources"] = [str(source).strip() for source in theme["sources"] if str(source).strip()]
        if not isinstance(theme.get("suggested_formats"), list):
            theme["suggested_formats"] = ["video"]
        theme["suggested_formats"] = [
            normalize_format(str(fmt).strip())
            for fmt in theme["suggested_formats"]
            if str(fmt).strip()
        ] or ["video"]
        theme.update(normalize_detail_fields(theme))
        theme["storyboard"] = normalize_storyboard(
            theme.get("storyboard"),
            theme["title"],
            theme["sources"],
        )

    context_dir = Path(os.environ.get("CONTEXT_DIR", "./context"))
    context_dir.mkdir(parents=True, exist_ok=True)
    output_path = context_dir / "weekly_brief.json"
    output_path.write_text(json.dumps(brief, indent=2), encoding="utf-8")
    print(f"\n✓ Wrote {output_path}")
    print(f"  Found {len(brief['themes'])} themes")
    upload_llm_output(
        "weekly_brief",
        {
            "type": "weekly_brief",
            "created_at": datetime.utcnow().isoformat() + "Z",
            "model": XAI_MODEL,
            "output": {
                "raw_response": raw_response,
                "brief": brief,
            },
            "metadata": {
                "week": brief["week"],
                "theme_count": len(brief["themes"]),
            },
        },
    )


if __name__ == "__main__":
    run_summarizer()
