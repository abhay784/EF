#!/usr/bin/env python3
import json
import os
from pathlib import Path
from datetime import datetime, timedelta
import httpx


XAI_API_KEY = os.environ.get("XAI_API_KEY", "")
XAI_MODEL = os.environ.get("XAI_MODEL", "grok-4-fast-non-reasoning")
XAI_URL = "https://api.x.ai/v1/chat/completions"


def call_xai(system: str, user_message: str) -> str:
    """Call Grok via xAI's OpenAI-compatible endpoint."""
    if not XAI_API_KEY:
        raise RuntimeError("XAI_API_KEY is not set. Add it to .env.local.")
    response = httpx.post(
        XAI_URL,
        headers={
            "Authorization": f"Bearer {XAI_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": XAI_MODEL,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user_message},
            ],
            "temperature": 0.3,
            "stream": False,
        },
        timeout=120,
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]


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


def run_summarizer():
    """Main summarizer pipeline."""
    combined_text = read_all_markdown_sources()
    if not combined_text:
        raise RuntimeError("No source data to summarize")

    system_prompt = """You are reading a builder's raw work activity from the past 7 days across multiple sources: code sessions, Slack conversations, and meeting notes.

Your job: find the 3–5 most interesting things they did, figured out, shipped, or decided.
"Interesting" means: surprising outcomes, problems that turned out to be different than expected, things other builders would want to know, decisions that had non-obvious reasoning.

For each theme, return:
- title: under 8 words
- one_liner: one sentence, what happened
- content_angle: the hook — why anyone outside the team should care
- sources: array of source filenames it came from
- suggested_formats: array from ["video_script", "linkedin_post", "twitter_thread"]

Return ONLY valid JSON, no preamble, no explanation:
{"week":"YYYY-MM-DD","themes":[...],"raw_highlights":["..."],"user_uploads":[]}"""

    week_monday = (
        datetime.now() - timedelta(days=datetime.now().weekday())
    ).strftime("%Y-%m-%d")

    user_message = f"""Today is {datetime.now().strftime('%Y-%m-%d')}.
The week started on {week_monday}.

Here is the raw builder activity:

{combined_text}

Generate the weekly brief in JSON format."""

    print(f"  Calling xAI ({XAI_MODEL}) to summarize...")
    raw_response = call_xai(system_prompt, user_message)
    print("  ✓ xAI summarization complete")

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

    context_dir = Path(os.environ.get("CONTEXT_DIR", "./context"))
    context_dir.mkdir(parents=True, exist_ok=True)
    output_path = context_dir / "weekly_brief.json"
    output_path.write_text(json.dumps(brief, indent=2), encoding="utf-8")
    print(f"\n✓ Wrote {output_path}")
    print(f"  Found {len(brief['themes'])} themes")


if __name__ == "__main__":
    run_summarizer()
