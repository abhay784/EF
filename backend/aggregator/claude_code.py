#!/usr/bin/env python3
import json
import os
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Optional


def discover_sessions(days_back: int = 7) -> list[dict]:
    """
    Walk ~/.claude/projects/*/ for *.jsonl files modified in the past N days.
    Returns list of dicts with session_id, jsonl_path, mtime.
    """
    claude_projects = Path.home() / ".claude" / "projects"
    if not claude_projects.exists():
        print(f"  [warn] {claude_projects} does not exist")
        return []

    cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)
    sessions = []

    for jsonl_path in claude_projects.glob("*/*.jsonl"):
        try:
            mtime = datetime.fromtimestamp(jsonl_path.stat().st_mtime, tz=timezone.utc)
            if mtime < cutoff:
                continue

            session_id = jsonl_path.stem
            sessions.append({
                "session_id": session_id,
                "jsonl_path": jsonl_path,
                "mtime": mtime.isoformat()
            })
        except (OSError, ValueError):
            continue

    return sorted(sessions, key=lambda s: s["mtime"], reverse=True)


def parse_session(jsonl_path: Path) -> Optional[dict]:
    """
    Parse a single JSONL session file into structured data.
    Returns: {session_id, project_path, git_branch, title, start_time, end_time, user_messages, files_touched}
    """
    session_id = jsonl_path.stem
    records = []

    with open(jsonl_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue

    if not records:
        return None

    title = None
    cwd = None
    git_branch = None
    start_time = None
    end_time = None
    user_messages = []
    files_touched = set()

    for rec in records:
        rec_type = rec.get("type", "")
        ts = rec.get("timestamp")

        if ts:
            if start_time is None:
                start_time = ts
            end_time = ts

        if not cwd and rec.get("cwd"):
            cwd = rec["cwd"]
        if not git_branch and rec.get("gitBranch"):
            git_branch = rec["gitBranch"]

        if rec_type == "ai-title" and not title:
            title = rec.get("aiTitle")

        elif rec_type == "user":
            msg = rec.get("message", {})
            content = msg.get("content", "")

            if isinstance(content, str):
                text = content.strip()
                if text and not text.startswith("<local-command") and not text.startswith("<command"):
                    user_messages.append(text)
            elif isinstance(content, list):
                for item in content:
                    if isinstance(item, dict):
                        if item.get("type") == "text":
                            text = item.get("text", "").strip()
                            if text and not text.startswith("<local-command") and not text.startswith("<command"):
                                user_messages.append(text)
                        elif item.get("type") == "tool_result":
                            continue

        elif rec_type == "assistant":
            content = rec.get("message", {}).get("content", [])
            if isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and item.get("type") == "tool_use":
                        tool_name = item.get("name", "")
                        if tool_name in ("Write", "Edit", "Read"):
                            fp = item.get("input", {}).get("file_path", "")
                            if fp:
                                files_touched.add(fp)

    if not user_messages:
        return None

    if not title and user_messages:
        title = user_messages[0][:60] + ("..." if len(user_messages[0]) > 60 else "")

    return {
        "session_id": session_id,
        "project_path": cwd or "unknown",
        "git_branch": git_branch or "unknown",
        "title": title or f"Session {session_id[:8]}",
        "start_time": start_time or "",
        "end_time": end_time or "",
        "user_messages": user_messages,
        "files_touched": sorted(files_touched),
    }


def render_markdown(parsed: dict) -> str:
    """Render parsed session into markdown format."""
    content = f"""# Session: {parsed['title']}
**Source**: claude_code
**Date**: {parsed['start_time']}
**Project**: {parsed['project_path']}
**Branch**: {parsed['git_branch']}
**Session ID**: {parsed['session_id']}

## What the builder worked on
"""

    for msg in parsed["user_messages"][:5]:
        content += f"\n- {msg}"

    content += "\n\n## Files touched\n"
    for fp in parsed["files_touched"]:
        content += f"\n- {fp}"

    return content + "\n"


def main():
    context_dir = Path(os.environ.get("CONTEXT_DIR", "./context"))
    output_dir = context_dir / "sessions"
    output_dir.mkdir(parents=True, exist_ok=True)

    sessions = discover_sessions(days_back=7)
    if not sessions:
        print("  No sessions found in past 7 days")
        return

    count = 0
    for s in sessions:
        parsed = parse_session(s["jsonl_path"])
        if not parsed:
            continue

        md = render_markdown(parsed)
        out_path = output_dir / f"{parsed['session_id']}.md"
        out_path.write_text(md, encoding="utf-8")
        print(f"  Wrote {out_path.name}: {parsed['title']}")
        count += 1

    print(f"\nProcessed {count} sessions → {output_dir}")


if __name__ == "__main__":
    main()
