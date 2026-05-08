#!/usr/bin/env python3
import json
import os
import subprocess
from pathlib import Path
from datetime import datetime, timedelta, timezone


class SlackMCPClient:
    """Simple JSON-RPC client for Slack MCP server via stdio."""

    def __init__(self):
        self.proc = None
        self.request_id = 0

    def start(self):
        """Start the Slack MCP server."""
        try:
            self.proc = subprocess.Popen(
                ["npx", "@anthropic-ai/mcp-server-slack"],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env={**os.environ},
                text=True,
                bufsize=1,
            )
        except FileNotFoundError:
            raise RuntimeError(
                "npx not found. Install Node.js or run: npm install -g @anthropic-ai/mcp-server-slack"
            )

    def call(self, method: str, params: dict = None) -> dict:
        """Call a method on the Slack MCP server."""
        if not self.proc:
            self.start()

        self.request_id += 1
        request = {
            "jsonrpc": "2.0",
            "id": self.request_id,
            "method": method,
            "params": params or {},
        }

        try:
            self.proc.stdin.write(json.dumps(request) + "\n")
            self.proc.stdin.flush()

            response_line = self.proc.stdout.readline()
            if not response_line:
                raise RuntimeError("No response from Slack MCP server")

            response = json.loads(response_line)
            if "error" in response:
                raise RuntimeError(f"RPC error: {response['error']}")

            return response.get("result", {})
        except Exception as e:
            print(f"  [error] Slack MCP call failed: {e}")
            return {}

    def close(self):
        """Close the MCP connection."""
        if self.proc:
            self.proc.terminate()
            self.proc.wait(timeout=5)


def fetch_slack_data() -> list[dict]:
    """
    Fetch recent Slack messages and threads.
    Returns list of dicts with markdown content per channel.
    """
    bot_token = os.environ.get("SLACK_BOT_TOKEN")
    team_id = os.environ.get("SLACK_TEAM_ID")

    if not bot_token or not team_id:
        print("  [warn] SLACK_BOT_TOKEN or SLACK_TEAM_ID not set — skipping Slack")
        return []

    client = SlackMCPClient()

    try:
        channels = client.call("slack_list_channels", {})
        if not isinstance(channels, list):
            print("  [warn] Failed to fetch Slack channels")
            return []

        results = []
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)

        for channel in channels:
            channel_name = channel.get("name", "unknown")
            channel_id = channel.get("id", "")

            if not channel_id:
                continue

            messages = client.call("slack_get_channel_history", {"channel_id": channel_id})
            if not isinstance(messages, list):
                messages = []

            filtered_messages = []
            for msg in messages:
                try:
                    ts = float(msg.get("ts", 0))
                    msg_time = datetime.fromtimestamp(ts, tz=timezone.utc)
                    if msg_time < cutoff:
                        continue

                    user = msg.get("user", "bot")
                    text = msg.get("text", "").strip()

                    if text and not text.startswith("_") and len(text) > 10:
                        filtered_messages.append(f"- [@{user}] {text}")
                except (ValueError, TypeError):
                    continue

            if filtered_messages:
                md = f"""# Slack: #{channel_name}
**Source**: slack
**Week**: {(cutoff + timedelta(days=7)).strftime('%Y-%m-%d')}

## Key messages
{"".join(m + "\n" for m in filtered_messages[:10])}
"""
                results.append({"channel": channel_name, "markdown": md})

        client.close()
        return results

    except Exception as e:
        print(f"  [error] Slack fetch failed: {e}")
        client.close()
        return []


def main():
    context_dir = Path(os.environ.get("CONTEXT_DIR", "./context"))
    slack_dir = context_dir / "slack"
    slack_dir.mkdir(parents=True, exist_ok=True)

    channels = fetch_slack_data()
    if not channels:
        print("  No Slack data fetched")
        return

    for ch in channels:
        out_path = slack_dir / f"{ch['channel']}.md"
        out_path.write_text(ch["markdown"], encoding="utf-8")
        print(f"  Wrote {out_path.name}")

    print(f"\nFetched {len(channels)} Slack channels → {slack_dir}")


if __name__ == "__main__":
    main()
