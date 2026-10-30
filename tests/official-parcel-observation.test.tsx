import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { officialParcelObservation } from "./support/official-parcel-observation";
import { OfficialParcelObservation } from "../apps/crm-web/src/OfficialParcelObservation";

const observation = officialParcelObservation;

it("displays permitted official source values and provenance without a capture mask", () => {
  const html = renderToStaticMarkup(
    <OfficialParcelObservation observation={observation} />,
  );
  expect(html).toContain(observation.postalAddressAsObserved);
  expect(html).toContain("SYNTHETIC-PIN");
  expect(html).toContain("123 / ");
  expect(html).toContain(observation.observedAt);
  expect(html).toContain("aaaaaaaaaaaa");
  expect(html).toContain("cccccccccccc");
  expect(html).toContain("dddddddddddd");
  expect(html).toContain("Not observed in the retained record");
  expect(html).toContain("Null or empty in the source observation");
  expect(html).toContain("not verified legal ownership");
  expect(html).not.toContain("data-private-evidence");
  expect(html).not.toContain("private-protected-evidence");
});

it("does not invent an owner observation and escapes source text as text", () => {
  expect(renderToStaticMarkup(<OfficialParcelObservation />)).toBe("");
  const html = renderToStaticMarkup(
    <OfficialParcelObservation
      observation={{
        ...observation,
        name1: "<script>synthetic()</script>",
        fieldAvailability: {
          ...observation.fieldAvailability,
          NAME1: "observed_value",
        },
      }}
    />,
  );
  expect(html).toContain("&lt;script&gt;synthetic()&lt;/script&gt;");
  expect(html).not.toContain("<script>");
});
