#!/usr/bin/env python3
import os
from pathlib import Path


def process_granola_exports():
    """
    Read user-dropped .md files in context/granola/.
    Add a standard **Source**: granola header if missing.
    """
    context_dir = Path(os.environ.get("CONTEXT_DIR", "./context"))
    granola_dir = context_dir / "granola"
    granola_dir.mkdir(parents=True, exist_ok=True)

    count = 0
    for f in granola_dir.glob("*.md"):
        try:
            text = f.read_text(encoding="utf-8")
            if "**Source**: granola" not in text:
                f.write_text(f"**Source**: granola\n\n{text}", encoding="utf-8")
                print(f"  Added source header to {f.name}")
            count += 1
        except Exception as e:
            print(f"  [warn] Failed to process {f.name}: {e}")

    if count == 0:
        print("  No Granola files found in context/granola/")
    else:
        print(f"\nProcessed {count} Granola files → {granola_dir}")


def main():
    process_granola_exports()


if __name__ == "__main__":
    main()
