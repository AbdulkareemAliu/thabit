#!/usr/bin/env python3
"""Restore verb English glosses to root + tense tag format from masdar_english."""

from __future__ import annotations

import csv
import glob
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VOCAB_DIR = ROOT / "vocabulary"

FORM_TAGS: dict[str, str] = {
    "past_english": "(past + m)",
    "present_english": "(present + m)",
    "passive_english": "(passive + m)",
    "command_english": "(command)",
    "masdar_english": "(masdar)",
}

ARABIC_KEYS = {
    "past_english": "past_arabic",
    "present_english": "present_arabic",
    "passive_english": "passive_arabic",
    "command_english": "command_arabic",
    "masdar_english": "masdar_arabic",
}


def normalize_base(masdar_english: str) -> str:
    text = masdar_english.strip()
    if text.lower().startswith("to "):
        return "to " + text[3:].strip()
    return text


def tagged_english(base: str, tag: str) -> str:
    return f"{base} {tag}".strip()


def process_file(path: Path) -> int:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        fieldnames = reader.fieldnames
        if not fieldnames:
            return 0
        rows = list(reader)

    updated = 0
    for row in rows:
        masdar = (row.get("masdar_english") or "").strip()
        if not masdar:
            continue
        base = normalize_base(masdar)

        for english_key, arabic_key in ARABIC_KEYS.items():
            tag = FORM_TAGS.get(english_key)
            if not tag:
                continue
            if not (row.get(arabic_key) or "").strip():
                row[english_key] = ""
                continue
            row[english_key] = tagged_english(base, tag)
            updated += 1

    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    return updated


def main() -> None:
    total = 0
    files = 0
    for path in sorted(VOCAB_DIR.glob("*/verbs.csv")):
        count = process_file(path)
        total += count
        files += 1
    print(f"Updated {total} verb English cells across {files} files.")


if __name__ == "__main__":
    main()
