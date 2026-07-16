#!/usr/bin/env python3
"""Populate harf_arabic on verbs.csv from the source PDF verb tables."""

from __future__ import annotations

import csv
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
VOCAB_DIR = ROOT / "vocabulary"
PDF = Path("/Applications/Work/Courses/Arabic/andalus_arabic_textbook.pdf")


def nfkc(text: str) -> str:
    return unicodedata.normalize("NFKC", text or "")


def clean_ar(text: str) -> str:
    if not text:
        return ""
    text = nfkc(text).replace("\n", " ")
    text = re.sub(r"[\u200f\u200e\u061c\u202a-\u202e\u2066-\u2069]", "", text)
    text = re.sub(r"\s+", "", text.strip())
    return text


def norm_match(text: str) -> str:
    text = clean_ar(text)
    text = re.sub(r"[\u0640\u0670\u064b-\u065f\u06d6-\u06ed]", "", text)
    return text


def rev(text: str) -> str:
    return text[::-1]


def clean_harf(text: str) -> str:
    harf = rev(clean_ar(text)) if text else ""
    harf = harf.replace("ـ", "").strip()
    if harf in {"", "-", "—"}:
        return ""
    if len(norm_match(harf)) > 6:
        return ""
    return harf


def is_verb_table_header(header: list[str | None]) -> bool:
    if len(header) not in (5, 6):
        return False
    cells = [norm_match(cell or "") for cell in header]
    return "حرف" in rev(cells[-2]) and "ماض" in rev(cells[-1])


def extract_pdf_verbs() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    with pdfplumber.open(PDF) as pdf:
        for page_index, page in enumerate(pdf.pages):
            for table in page.extract_tables() or []:
                if not table or not table[0] or not is_verb_table_header(table[0]):
                    continue
                column_count = len(table[0])
                harf_index = column_count - 2
                past_index = column_count - 1
                present_index = column_count - 3
                for row in table[1:]:
                    if not row or len(row) != column_count:
                        continue
                    past_raw = clean_ar(row[past_index] or "")
                    if not past_raw or past_raw in {"-", "—"}:
                        continue
                    past = rev(past_raw)
                    present = rev(clean_ar(row[present_index] or "")) if present_index >= 0 else ""
                    rows.append(
                        {
                            "page": str(page_index + 1),
                            "past": past,
                            "present": present,
                            "harf": clean_harf(row[harf_index] or ""),
                            "past_norm": norm_match(past),
                            "present_norm": norm_match(present),
                        }
                    )
    return rows


def load_csv_verbs() -> list[dict]:
    entries: list[dict] = []
    for path in sorted(VOCAB_DIR.glob("*/verbs.csv")):
        with path.open(newline="", encoding="utf-8-sig") as handle:
            for index, row in enumerate(csv.DictReader(handle)):
                entries.append(
                    {
                        "path": path,
                        "index": index,
                        "row": row,
                        "past_norm": norm_match(row.get("past_arabic", "")),
                        "present_norm": norm_match(row.get("present_arabic", "")),
                    }
                )
    return entries


def choose_harf(values: list[str]) -> str:
    non_empty = [value for value in values if value]
    if not non_empty:
        return ""
    return Counter(non_empty).most_common(1)[0][0]


def build_harf_lookup(pdf_rows: list[dict[str, str]]) -> tuple[dict[str, str], dict[str, str]]:
    by_past: dict[str, list[str]] = defaultdict(list)
    by_present: dict[str, list[str]] = defaultdict(list)
    for row in pdf_rows:
        if row["past_norm"]:
            by_past[row["past_norm"]].append(row["harf"])
        if row["present_norm"]:
            by_present[row["present_norm"]].append(row["harf"])

    past_lookup = {key: choose_harf(values) for key, values in by_past.items()}
    present_lookup = {key: choose_harf(values) for key, values in by_present.items()}
    return past_lookup, present_lookup


def update_csv_files(past_lookup: dict[str, str], present_lookup: dict[str, str]) -> tuple[int, int, int]:
    updated_files = 0
    updated_rows = 0
    unmatched_rows = 0

    for path in sorted(VOCAB_DIR.glob("*/verbs.csv")):
        with path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            fieldnames = list(reader.fieldnames or [])
            rows = list(reader)

        if "harf_arabic" not in fieldnames:
            insert_at = fieldnames.index("past_english") if "past_english" in fieldnames else 1
            fieldnames.insert(insert_at, "harf_arabic")

        file_changed = False
        for row in rows:
            past_norm = norm_match(row.get("past_arabic", ""))
            present_norm = norm_match(row.get("present_arabic", ""))
            harf = past_lookup.get(past_norm, "")
            if not harf:
                harf = present_lookup.get(present_norm, "")

            if not harf:
                unmatched_rows += 1

            existing = (row.get("harf_arabic") or "").strip()
            if existing != harf:
                row["harf_arabic"] = harf
                file_changed = True
                if harf:
                    updated_rows += 1

        if file_changed:
            updated_files += 1
            with path.open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n", extrasaction="ignore")
                writer.writeheader()
                writer.writerows(rows)

    return updated_files, updated_rows, unmatched_rows


def main() -> None:
    if not PDF.exists():
        raise SystemExit(f"PDF not found: {PDF}")

    pdf_rows = extract_pdf_verbs()
    past_lookup, present_lookup = build_harf_lookup(pdf_rows)
    updated_files, updated_rows, unmatched_rows = update_csv_files(past_lookup, present_lookup)

    with_harf = sum(1 for value in past_lookup.values() if value)
    print(f"Extracted {len(pdf_rows)} verb rows from PDF ({with_harf} past keys with harf).")
    print(f"Updated {updated_rows} verb rows across {updated_files} files.")
    print(f"Rows still without harf: {unmatched_rows}.")


if __name__ == "__main__":
    main()
