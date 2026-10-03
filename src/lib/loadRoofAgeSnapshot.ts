import { readFileSync } from "node:fs";
import {
  installRoofAgeSnapshot,
  type RoofAgeSnapshotFile,
} from "./roofAgeProof.ts";
import { ROOF_AGE_SNAPSHOT_URL } from "./roofAgeSnapshotPath.ts";

let pending: Promise<RoofAgeSnapshotFile> | null = null;

function snapshotFromJson(text: string) {
  const snapshot = JSON.parse(text) as RoofAgeSnapshotFile;
  if (snapshot?.parcels == null || typeof snapshot.parcels !== "object") {
    throw new Error("Roof age snapshot is missing parcels");
  }
  installRoofAgeSnapshot(snapshot.parcels);
  return snapshot;
}

export function loadRoofAgeSnapshot() {
  const override = process.env.ROOF_AGE_SNAPSHOT_FILE;
  if (override) {
    return Promise.resolve(
      snapshotFromJson(readFileSync(override, "utf8"))
    );
  }

  if (!pending) {
    pending = fetch(ROOF_AGE_SNAPSHOT_URL, {
      next: { revalidate: 86_400 },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Roof age snapshot failed with HTTP ${response.status}`
          );
        }
        return snapshotFromJson(await response.text());
      })
      .catch((error) => {
        pending = null;
        throw error;
      });
  }

  return pending;
}
