#!/usr/bin/env python3
"""
Granola aggregator.

Two modes:
1. API mode (preferred) — when GRANOLA_API_KEY is set, fetch notes from
   public-api.granola.ai and save each as markdown to context/granola/.
2. File mode (fallback) — process .md files the user dropped into context/granola/.
"""
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib import error, request


GRANOLA_API = "https://public-api.granola.ai/v1"
DAYS_BACK = 7


def http_get(url: str, token: str) -> dict:
    req = request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        },
    )
    with request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def parse_iso(s: str) -> datetime:
    # Granola returns "2026-05-08T16:00:55.875Z"
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def fetch_recent_notes(token: str, days_back: int = DAYS_BACK) -> list[dict]:
    """List notes, filter to last N days, fetch full body for each."""
    listing = http_get(f"{GRANOLA_API}/notes", token)
    notes = listing.get("notes", [])
    cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)

    recent = [n for n in notes if parse_iso(n["updated_at"]) >= cutoff]
    print(f"  Found {len(recent)} note(s) updated in the last {days_back} days (of {len(notes)} total)")

    full_notes = []
    for n in recent:
        try:
            full = http_get(f"{GRANOLA_API}/notes/{n['id']}", token)
            full_notes.append(full)
        except error.HTTPError as e:
            print(f"  [warn] failed to fetch {n['id']}: HTTP {e.code}")
        except Exception as e:
            print(f"  [warn] failed to fetch {n['id']}: {e}")
    return full_notes


def note_to_markdown(note: dict) -> str:
    title = note.get("title", "Untitled meeting")
    created = note.get("created_at", "")
    attendees = note.get("attendees", [])
    attendee_lines = "\n".join(
        f"- {a.get('name') or a.get('email', 'unknown')}" for a in attendees
    ) or "- (none listed)"

    summary_md = note.get("summary_markdown") or note.get("summary_text") or "_No summary._"
    transcript = note.get("transcript")
    transcript_section = (
        f"\n## Transcript\n\n{transcript}\n" if transcript else ""
    )

    return f"""# {title}
**Source**: granola
**Created**: {created}
**Web URL**: {note.get('web_url', '')}

## Attendees
{attendee_lines}

## Summary
{summary_md}
{transcript_section}"""


def safe_filename(s: str) -> str:
    cleaned = "".join(c if c.isalnum() or c in "._-" else "_" for c in s)
    return cleaned[:100] or "note"


def fetch_via_api(out_dir: Path) -> int:
    token = os.environ.get("GRANOLA_API_KEY", "").strip()
    if not token:
        return 0
    try:
        notes = fetch_recent_notes(token)
    except error.HTTPError as e:
        print(f"  [error] Granola API HTTP {e.code}: {e.reason}")
        return 0
    except Exception as e:
        print(f"  [error] Granola API failed: {e}")
        return 0

    out_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    for note in notes:
        md = note_to_markdown(note)
        filename = f"{safe_filename(note['id'])}.md"
        (out_dir / filename).write_text(md, encoding="utf-8")
        print(f"  Wrote {filename}: {note.get('title', '')[:60]}")
        written += 1
    return written


def process_local_files(out_dir: Path) -> int:
    """Add the **Source**: granola header to any user-dropped .md files."""
    out_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for f in out_dir.glob("*.md"):
        try:
            text = f.read_text(encoding="utf-8")
            if "**Source**: granola" not in text:
                f.write_text(f"**Source**: granola\n\n{text}", encoding="utf-8")
                print(f"  Added source header to {f.name}")
            count += 1
        except Exception as e:
            print(f"  [warn] Failed to process {f.name}: {e}")
    return count


def main():
    context_dir = Path(os.environ.get("CONTEXT_DIR", "./context"))
    granola_dir = context_dir / "granola"

    api_count = fetch_via_api(granola_dir)
    if api_count > 0:
        print(f"\nGranola API: pulled {api_count} note(s) → {granola_dir}")
    else:
        print("  No Granola API key set or no recent notes — falling back to local files")

    file_count = process_local_files(granola_dir)
    if api_count == 0 and file_count == 0:
        print("  No Granola data (API or files)")
    elif file_count > 0 and api_count == 0:
        print(f"  Processed {file_count} local Granola files")


if __name__ == "__main__":
    main()
