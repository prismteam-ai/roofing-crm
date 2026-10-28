import type { RuleContext } from "./rules";
import { PlaceReferenceSchema } from "../../../contracts/src/index";
import { officialPlaceResolver } from "../../../places/src/index";
import { rx, activeReference } from "./syntax";
export function placeRules(context: RuleContext) {
  const {
    text,
    base,
    draft,
    ledger,
    options,
    take,
    note,
    apply,
    setPlaceResolution,
  } = context;
  take(
    rx(
      "\\b(?:(?:in|near|around|at|of|from|within)\\s+)?" +
        activeReference +
        "\\b",
    ),
    (s) =>
      note(
        s,
        "center",
        "applied",
        "active_map_reference",
        "This phrase explicitly retains the active map center.",
        { lat: base.lat, lng: base.lng },
      ),
  );
  // Place identity is resolved only after typed numeric/owner clauses are consumed.
  take(
    /\b(?<relation>of|from|near|around|in|centered on|centered at)\s+(?<place>[a-z][a-z0-9 ,.'-]*?)(?=\s+(?:with|having|have|has|whose|where|that|and|but|sorted|sort|limit|roof|roofs|open|closed|regional|out-of-area|requires?)\b|\0|[;!?]|$)/gi,
    (s, m) => {
      const name = m.groups!.place.trim().replace(/[, .]+$/, "");
      const relation = m.groups!.relation;
      if (
        ["of", "from"].includes(relation) &&
        !/\b(?:miles?|mi)\s*$/.test(text.slice(0, s.start))
      ) {
        note(
          s,
          "placeId",
          "ambiguous",
          "unbound_place",
          "The geographic phrase is not bound to a radius or explicit center. Clarify the property search location.",
          name,
        );
        return;
      }
      if (relation === "in") {
        note(
          s,
          "placeId",
          "ambiguous",
          "municipal_containment",
          "Municipal polygon containment is distinct from a radius around its center. Ask for within N miles of the place.",
          name,
        );
        return;
      }
      const resolver = options.placeResolver ?? officialPlaceResolver;
      if (!resolver) {
        note(
          s,
          "placeId",
          "unsupported",
          "place_index_unavailable",
          "The authoritative Oakland place index is unavailable; no coordinates were guessed.",
          name,
        );
        return;
      }
      const resolved = resolver.resolve(name);
      if (resolved.status !== "resolved") {
        note(
          s,
          "placeId",
          resolved.status === "ambiguous" ? "ambiguous" : "unsupported",
          "place_" + resolved.status,
          ("reason" in resolved ? resolved.reason : undefined) ??
            "Several official municipalities match this alias; specify city, township or village.",
          name,
          resolved.status === "ambiguous"
            ? resolved.candidates
                .slice(0, 12)
                .map(
                  (x) =>
                    x.name +
                    " · " +
                    x.type +
                    " · FIPS " +
                    x.stateFips +
                    "/" +
                    x.countyFips +
                    "/" +
                    (x.localFips ?? "unavailable"),
                )
            : [],
        );
        return;
      }
      const parsed = PlaceReferenceSchema.safeParse(resolved.place);
      if (
        !parsed.success ||
        !parsed.data.resolutionEligible ||
        parsed.data.stateFips !== "26" ||
        parsed.data.countyFips !== "125" ||
        parsed.data.indexDigest !== resolver.indexDigest
      ) {
        note(
          s,
          "placeId",
          "unsupported",
          "invalid_place_identity",
          "The place did not pass eligibility, jurisdiction or index-digest validation.",
          name,
        );
        return;
      }
      const place = parsed.data;
      const activeReference = ledger.find(
        (entry) => entry.normalizedMeaning === "active_map_reference",
      );
      if (
        activeReference &&
        (Math.abs(place.center.lat - base.lat) > 1e-8 ||
          Math.abs(place.center.lng - base.lng) > 1e-8)
      ) {
        activeReference.classification = "conflicting";
        activeReference.reason =
          "The explicit active-map reference and named place specify different centers. Choose one search center.";
        note(
          s,
          "center",
          "conflicting",
          "center_reference_conflict",
          "A conjunction of two different search centers cannot be represented by one radius search.",
          place.center,
        );
        return;
      }
      if (
        apply(
          s,
          "placeId",
          place.placeId,
          "Official Oakland municipal geometry supplies the search-center identity.",
          [
            place.sourceUrl,
            "GeometrySHA256:" + place.geometrySha256,
            "IndexSHA256:" + place.indexDigest,
          ],
        )
      ) {
        draft.lat = place.center.lat;
        draft.lng = place.center.lng;
        draft.placeIndexDigest = place.indexDigest;
        setPlaceResolution(place);
        note(
          s,
          "center",
          "applied",
          "official_place_center",
          "The explicit place replaces the contextual center using the recorded official geometry method.",
          place.center,
          [place.centerMethod],
        );
      }
    },
  );
}
