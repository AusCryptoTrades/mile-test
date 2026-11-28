"""Join the Apple foundation and final permission cutover into one staging transaction."""
from pathlib import Path

root = Path(__file__).resolve().parents[2]
sources = (
    "supabase/proposals/batch86-device-sync.sql",
    "supabase/migrations/20261128113000_apple_health_beta.sql",
)
print("-- MILE Staging only. Verified Running manual matching is a prerequisite.\nbegin;")
for source in sources:
    lines = (root / source).read_text().splitlines()
    if lines[-1] != "commit;" or lines.count("begin;") != 1 or lines.count("commit;") != 1:
        raise SystemExit(f"Unexpected transaction markers in {source}")
    print(f"\n-- Source: {source}")
    print("\n".join(line for line in lines[:-1] if line != "begin;"))
print("commit;")
