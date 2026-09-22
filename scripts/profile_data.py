"""Read-only source schema, coverage, and numeric profile. Python standard library only."""
import csv
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

NUMBER = re.compile(r"[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?", re.I)
DATE = re.compile(r"\d{4}-\d{2}-\d{2}")

def profile(path, date_column):
    with path.open(encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        rows = list(reader)
        fields = reader.fieldnames
    assert all(None not in row and all(v is not None for v in row.values()) for row in rows), "CSV column mismatch"
    columns = []
    for key in fields:
        values = [row[key].strip() for row in rows if row[key].strip()]
        if not values:
            kind = "empty"
        elif all(v.lower() in ("true", "false") for v in values):
            kind = "boolean text"
        elif all(NUMBER.fullmatch(v) for v in values):
            kind = "numeric text"
        elif all(DATE.fullmatch(v) for v in values):
            kind = "ISO date text"
        else:
            kind = "categorical/free text"
        columns.append({"column": key, "source_type": kind, "nonblank": len(values), "missing": len(rows)-len(values)})
    dates = [r[date_column] for r in rows if r[date_column]]
    result = {"file": str(path), "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "rows": len(rows), "earliest": min(dates), "latest": max(dates), "columns": columns}
    if "Model" in fields:
        result["frontier"] = dict(Counter(r["Frontier model"] for r in rows))
        result["confidence"] = dict(Counter(r["Confidence"] for r in rows))
        result["weights"] = dict(Counter(r["Open model weights?"] for r in rows))
    return result

if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    print(json.dumps([profile(root / "data/frontier_ai_models.csv", "Publication date"), profile(root / "data/ml_hardware.csv", "Release date")], indent=2))
