"""Prepare versioned lexical data locally; never connects to a database.

Full source files are required. No empty-data fallback and no credential input.
Output is COPY-compatible CSV plus a provenance manifest, not an auto-import.
"""
import argparse
import csv
import hashlib
import json
import re
from pathlib import Path


def cefr(collins, frq, bnc):
    def number(value):
        match = re.match(r"^[+-]?\d+", str(value).strip())
        return int(match[0]) if match else 0
    c, f = number(collins), number(frq) or number(bnc)
    if c >= 5 or 0 < f < 1000: return "A1"
    if c == 4 or 0 < f < 2000: return "A2"
    if c == 3 or 0 < f < 4000: return "B1"
    if c == 2 or 0 < f < 8000: return "B2"
    if c == 1 or 0 < f < 15000: return "C1"
    return "C2" if f >= 15000 else None


def prepare(data_dir, output_dir):
    sources = [
        ("cedict_ts.u8", "https://cc-cedict.org/wiki/", "CC-BY-SA; retain source header and attribution"),
        ("ecdict.csv", "https://github.com/skywind3000/ECDICT", "MIT; retain upstream and source attribution"),
        ("hsk30.json", "https://github.com/profesorm/hsk30", "CC-BY-4.0; CTI syllabus, via upstream dataset"),
    ]
    metadata = []
    for name, url, license_name in sources:
        path = data_dir / name
        if not path.is_file() or path.stat().st_size == 0:
            raise ValueError(f"Required dictionary is missing or empty: {name}")
        digest = hashlib.sha256()
        with path.open("rb") as source:
            for chunk in iter(lambda: source.read(1048576), b""): digest.update(chunk)
        metadata.append(dict(file=name, source=url, license=license_name,
                             bytes=path.stat().st_size, sha256=digest.hexdigest()))
    version = "lex-" + hashlib.sha256(json.dumps(metadata, sort_keys=True).encode()).hexdigest()[:24]
    zh = {}
    for line in (data_dir / "cedict_ts.u8").open(encoding="utf8"):
        match = re.match(r"^(\S+)\s+(\S+)\s+\[[^\]]*\]\s+/(.+)/\s*$", line)
        if match:
            entry = zh.setdefault(match[2], dict(reading=None, candidates=[], level=None))
            entry["candidates"].extend(s for s in match[3].split("/") if s)
    hsk = json.loads((data_dir / "hsk30.json").read_text())
    levels = {}
    if isinstance(hsk, list):
        levels = {str(e["word"]): "HSK " + re.sub(r"\D", "", str(e["level"])) for e in hsk if e.get("word") and e.get("level")}
    else:
        for key, value in hsk.items():
            if isinstance(value, list):
                levels.update({word: "HSK " + re.sub(r"\D", "", key) for word in value})
            elif isinstance(value, (str, int, float)):
                levels[key] = "HSK " + re.sub(r"\D", "", str(value))
    for word, level in levels.items():
        zh.setdefault(word, dict(reading=None, candidates=[], level=None))["level"] = level
    en = {}
    with (data_dir / "ecdict.csv").open(encoding="utf8", newline="") as handle:
        for row in csv.DictReader(handle):
            if not row["word"]: continue
            phonetic = row.get("phonetic", "")
            en[row["word"].lower()] = dict(reading=f"/{phonetic}/" if phonetic else None,
                candidates=[s.strip() for s in re.split(r"\\n|\n", row.get("translation", "")) if s.strip()][:6],
                level=cefr(row.get("collins", ""), row.get("frq", ""), row.get("bnc", "")))
    if not zh or not en or not levels: raise ValueError("Dictionary parsing produced incomplete lexical data")
    output_dir.mkdir(parents=True, exist_ok=True)
    total_payload = 0
    with (output_dir / "entries.csv").open("w", encoding="utf8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["version", "language", "word", "reading", "candidates", "level"])
        for lang, entries in [("zh", zh), ("en", en)]:
            for word, entry in sorted(entries.items()):
                if not 1 <= len(word) <= 256: raise ValueError("Dictionary word exceeds schema bounds")
                candidates = json.dumps(entry["candidates"], ensure_ascii=False, separators=(",", ":"))
                writer.writerow([version, lang, word, entry["reading"], candidates, entry["level"]])
                total_payload += sum(len(s.encode()) for s in [version, lang, word, entry["reading"] or "", candidates, entry["level"] or ""])
    manifest = dict(version=version, ready=False, expected_rows=len(zh)+len(en),
        rows_by_language=dict(zh=len(zh), en=len(en)), logical_payload_bytes=total_payload,
        prepared_csv_bytes=(output_dir / "entries.csv").stat().st_size, sources=metadata,
        notes=["CEFR is the existing ECDICT frequency/Collins heuristic, not an official CEFR classification.",
               "No upload performed. Check actual project capacity and an isolated PostgreSQL size sample before import.",
               "Retain source attribution, licenses and source-file headers alongside any redistribution."])
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    prepare(args.data_dir, args.output_dir)
