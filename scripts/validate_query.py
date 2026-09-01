"""Execute the app's real SQL against the Parquet fixture and check the results.

Asserting on SQL strings proves nothing. This runs the exact statement and
bound parameters the browser would issue, then verifies the rows are actually
correct - inside the radius, correctly ordered, and honouring the roof-age rules.
"""
import json
import math
import subprocess
import sys

import duckdb

FIXTURE = "test-fixtures/properties.parquet"
CENTER = (28.30, -80.72)   # Brevard, negative longitude on purpose
EARTH_MILES = 3958.7613


def haversine(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_MILES * math.asin(min(1.0, math.sqrt(h)))


def emit(radius, min_age, bases=""):
    out = subprocess.run(
        ["docker", "run", "--rm", "--user", f"{__import__('os').getuid()}:{__import__('os').getgid()}",
         "-v", f"{__import__('os').getcwd()}:/app", "-w", "/app", "node:22-alpine",
         "node", "scripts/emit-query.mjs", FIXTURE, str(CENTER[0]), str(CENTER[1]),
         str(radius), str(min_age), bases],
        capture_output=True, text=True, check=True,
    )
    return json.loads(out.stdout)


def run(q):
    con = duckdb.connect()
    return con.execute(q["sql"], q["params"]).fetchdf()


failures = []


def check(name, cond, detail=""):
    print(f"  {'PASS' if cond else 'FAIL'}  {name}{'' if cond else '  <- ' + detail}")
    if not cond:
        failures.append(name)


print("1. radius=5, no roof-age filter")
q = emit(5, "null")
df = run(q)
print(f"   returned {len(df)} rows")
check("returns rows (negative longitude did not truncate the SQL)", len(df) > 0,
      "zero rows usually means '--' opened a comment")
if len(df):
    dists = [haversine(CENTER, (r.lat, r.lon)) for r in df.itertuples()]
    check("every row is genuinely within the radius", max(dists) <= 5.0 + 1e-6, f"max {max(dists):.4f} mi")
    check("rows are ordered nearest-first", dists == sorted(dists))
    check("reported distance matches an independent haversine",
          all(abs(d - r.distance_miles) < 1e-6 for d, r in zip(dists, df.itertuples())))

print("2. no matching row is missed (geohash+bbox pruning must not drop rows)")
con = duckdb.connect()
brute = con.execute(f"SELECT lat, lon FROM read_parquet('{FIXTURE}')").fetchdf()
expected = sum(1 for r in brute.itertuples() if haversine(CENTER, (r.lat, r.lon)) <= 5.0)
check("pruned query count equals brute-force count", len(df) == expected, f"pruned {len(df)} vs brute {expected}")

print("3. roof age >= 15 must exclude UNKNOWN basis (null roof_age_years)")
q2 = emit(10, 15)
df2 = run(q2)
print(f"   returned {len(df2)} rows")
check("no null roof_age_years leaked through", df2["roof_age_years"].isna().sum() == 0)
check("no UNKNOWN basis leaked through", (df2["roof_age_basis"] == "UNKNOWN").sum() == 0)
check("all ages meet the threshold", bool((df2["roof_age_years"] >= 15).all()) if len(df2) else True)

print("4. basis restriction (Tier B: permit-derived only)")
q3 = emit(25, 15, "PERMIT")
df3 = run(q3)
print(f"   returned {len(df3)} rows")
check("only PERMIT basis returned", set(df3["roof_age_basis"].unique()) <= {"PERMIT"})

print()
if failures:
    print(f"{len(failures)} check(s) failed: {failures}")
    sys.exit(1)
print("all checks passed")
