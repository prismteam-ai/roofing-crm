import { PropertySchema } from "../../packages/contracts/src/index";
/** Synthetic nonempty evidence used to reach provider protocol/error paths. */
export const nonemptyEvidenceProperty = PropertySchema.parse({
  id: "SYN-PROVIDER-PROTOCOL",
  nativeId: "SYN-PROVIDER-PROTOCOL",
  parcelIds: [],
  address: "Synthetic provider protocol property",
  coordinates: { lat: 42.66, lng: -83.29 },
  usage: "unknown",
  roof: {
    ageYears: 30,
    basis: "built_year",
    confidence: "low",
    asOf: "2026-10-28",
    caveats: ["Synthetic building year only"],
  },
  permits: [],
  ownership: {
    lastTransferDate: null,
    historyCoverage: "unknown",
    ownerRegion: "unknown",
  },
  provenance: [
    {
      sourceId: "synthetic",
      recordId: "SYN-PROVIDER-PROTOCOL",
      kind: "synthetic",
      observedAt: "2026-10-28T00:00:00Z",
      digest: "synthetic",
    },
  ],
});
