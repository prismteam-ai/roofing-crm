"""Generate a contract-shaped Parquet fixture for query-layer tests.

This is SYNTHETIC test data, never shipped to the site. Its only job is to have
the same schema, geohash sorting and basis distribution as the pipeline's real
Brevard extract, so the SQL we run in production is exercised against a
realistically shaped file.
"""
import json
import random
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"


def encode_geohash(lat: float, lon: float, precision: int = 9) -> str:
    lat_min, lat_max, lon_min, lon_max = -90.0, 90.0, -180.0, 180.0
    out, bit, ch, even = [], 0, 0, True
    while len(out) < precision:
        if even:
            mid = (lon_min + lon_max) / 2
            if lon >= mid:
                ch = (ch << 1) | 1
                lon_min = mid
            else:
                ch <<= 1
                lon_max = mid
        else:
            mid = (lat_min + lat_max) / 2
            if lat >= mid:
                ch = (ch << 1) | 1
                lat_min = mid
            else:
                ch <<= 1
                lat_max = mid
        even = not even
        bit += 1
        if bit == 5:
            out.append(BASE32[ch])
            bit, ch = 0, 0
    return "".join(out)


# Real Brevard basis distribution, scaled down (pipeline: 260472/73845/14357/6).
BASIS_WEIGHTS = [("ACT_YR_BLT", 260472), ("UNKNOWN", 73845), ("PERMIT", 14357), ("EFF_YR_BLT", 6)]
BOUNDS = dict(min_lat=27.79, max_lat=28.81, min_lon=-81.21, max_lon=-80.43)


def build(n: int, seed: int = 42):
    rng = random.Random(seed)
    bases = [b for b, _ in BASIS_WEIGHTS]
    weights = [w for _, w in BASIS_WEIGHTS]
    rows = []
    for i in range(n):
        lat = rng.uniform(BOUNDS["min_lat"], BOUNDS["max_lat"])
        lon = rng.uniform(BOUNDS["min_lon"], BOUNDS["max_lon"])
        basis = rng.choices(bases, weights=weights, k=1)[0]
        if basis == "UNKNOWN":
            roof_age, basis_year = None, None
        else:
            basis_year = rng.randint(1945, 2024)
            roof_age = 2026 - basis_year
        rows.append(
            {
                "parcel_id": f"2{i:07d}-00-00{i % 9}",
                "parcel_id_norm": f"2{i:07d}0000{i % 9}",
                "lat": lat,
                "lon": lon,
                "geohash": encode_geohash(lat, lon, 9),
                "situs_address": f"{rng.randint(100, 9999)} DEMO ST",
                "situs_city": rng.choice(["TITUSVILLE", "MELBOURNE", "PALM BAY", "MERRITT ISLAND"]),
                "situs_zip": rng.choice(["32780", "32901", "32905", "32953"]),
                "year_built": basis_year,
                "roof_age_years": roof_age,
                "roof_age_basis": basis,
                "roof_basis_year": basis_year,
                "owner_tenure_years": None,
                "owner_tenure_basis": "UNKNOWN_NO_SALE_IN_ROLL",
                "source_system": "FIXTURE",
                "run_id": "fixture",
            }
        )
    # Sorted by geohash, exactly as the pipeline writes it, so row-group
    # min/max on that column are non-overlapping.
    rows.sort(key=lambda r: r["geohash"])
    return rows


def main() -> None:
    out_dir = Path("test-fixtures")
    out_dir.mkdir(exist_ok=True)
    rows = build(5000)
    table = pa.Table.from_pylist(rows)
    # 500-row groups so pruning is observable on a small fixture.
    pq.write_table(table, out_dir / "properties.parquet", row_group_size=500, compression="zstd")

    counts: dict[str, int] = {}
    for r in rows:
        counts[r["roof_age_basis"]] = counts.get(r["roof_age_basis"], 0) + 1
    (out_dir / "manifest.json").write_text(
        json.dumps({"rows": len(rows), "roof_age_basis": counts}, indent=2) + "\n"
    )
    print(f"wrote {len(rows)} rows -> {out_dir/'properties.parquet'}")
    print("basis:", counts)


if __name__ == "__main__":
    main()
