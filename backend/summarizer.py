#!/usr/bin/env python3
import json
import os
from pathlib import Path
from datetime import datetime, timedelta
from urllib import error, request


OLLAMA_URL = "http://localhost:11434/v1/chat/completions"
QWEN_MODEL = "qwen3:8b"
XAI_API_KEY = os.environ.get("XAI_API_KEY", "")
XAI_MODEL = os.environ.get("XAI_MODEL", "grok-4-fast-non-reasoning")
XAI_URL = "https://api.x.ai/v1/chat/completions"


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


def call_qwen(system: str, user_message: str) -> str:
    """Call Qwen 3 via Ollama's OpenAI-compatible endpoint."""
    try:
        response = post_json(
            OLLAMA_URL,
            {
                "model": QWEN_MODEL,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_message},
                ],
                "temperature": 0.3,
                "stream": False,
            }
        )
        return response["choices"][0]["message"]["content"]
    except error.URLError as e:
        raise RuntimeError(
            f"Ollama call failed. Start it with `ollama serve` if it is not running. Details: {e}"
        )
    except Exception as e:
        raise RuntimeError(f"Ollama call failed: {e}")


def call_xai(system: str, user_message: str) -> str:
    """Fallback: Call Grok via xAI's OpenAI-compatible endpoint."""
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

Your job is to ingest labeled data sources and transform them into 3-5 content themes. Each theme must include a structured narrative storyboard: a clear, ordered chain of events that builds logically from raw code sessions, Slack conversations, and meeting notes.

Input handling rules:
- Treat each `--- SOURCE: type | filename ---` block as a labeled source.
- If timestamps exist, use them to establish chronological order across sources.
- If no timestamps are present, infer logical sequence from context and causality.
- Deduplicate overlapping events across sources into a single storyboard point.
- Resolve conflicts by adding a `discrepancy` field on the relevant event.
- If a source is ambiguous, set `confirmed` to false.

Theme selection rules:
- Find the 3-5 most interesting things the builder did, figured out, shipped, or decided.
- Interesting means surprising outcomes, misleading problems, useful decisions, or work other builders would care about.
- Keep titles under 8 words.
- `one_liner` is one sentence describing what happened.
- `content_angle` is why someone outside the team should care.
- `sources` is an array of source filenames used by the theme.
- `suggested_formats` uses values from ["video", "post", "thread", "carousel"].

Storyboard rules:
- Use present tense for event text.
- Each event is one discrete event, under 20 words.
- Use `relation: "root"` for the first event in a phase, `relation: "next"` for chained events, and `relation: "parallel"` for concurrent events.
- Attribute every event and turning point to a source filename.
- Group events into phases only when the story spans distinct stages.
- Do not editorialize. Report what the sources say.
- Include 2-4 key turning points.
- Include unresolved items, gaps, or missing data in `open_threads`.
- Include a one-paragraph `narrative_summary` after the structured storyboard fields.

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
                "confirmed": true
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

    print("  Calling LLM to summarize...")
    try:
        raw_response = call_qwen(system_prompt, user_message)
        print("  ✓ Qwen summarization complete")
    except RuntimeError as e:
        print(f"  [warn] {e}")
        if XAI_API_KEY:
            print(f"  Falling back to xAI ({XAI_MODEL})...")
            raw_response = call_xai(system_prompt, user_message)
            print("  ✓ xAI summarization complete")
        else:
            raise

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


if __name__ == "__main__":
    run_summarizer()
