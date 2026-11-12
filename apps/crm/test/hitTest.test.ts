import { expect, test } from "vitest";
import {
  DETAIL_MIN_ZOOM,
  HIT_TOLERANCE_PX,
  nearestPoint,
} from "../src/hitTest.ts";

const f = (id: string, lon: number, lat: number) => ({
  properties: { id },
  geometry: { type: "Point", coordinates: [lon, lat] as [number, number] },
});
const project = (c: [number, number]) => ({ x: c[0], y: c[1] });

test("nearestPoint picks the candidate nearest the click in pixels and ignores invalid features", () => {
  const feats = [
    f("a", 0, 0),
    f("b", 4, 0),
    { properties: { id: 7 }, geometry: { type: "Point", coordinates: [3, 0] } },
    { properties: null, geometry: { type: "Point", coordinates: [3, 0] } },
  ];
  expect(nearestPoint(feats, { x: 3, y: 1 }, project)?.id).toBe("b");
  expect(nearestPoint(feats, { x: 1, y: 0 }, project)?.id).toBe("a");
  expect(nearestPoint([], { x: 0, y: 0 }, project)).toBeUndefined();
});

test("the measured rule: details from zoom 16 with a +/-6 px box", () => {
  expect(DETAIL_MIN_ZOOM).toBe(16);
  expect(HIT_TOLERANCE_PX).toBe(6);
});

test("stacked points (same pixel distance): the lowest parcel id opens", () => {
  const stack = [
    f("0000000009", 5, 5),
    f("0000000003", 5, 5),
    f("0000000007", 5, 5),
  ];
  expect(nearestPoint(stack, { x: 4, y: 5 }, project)?.id).toBe("0000000003");
  expect(nearestPoint([...stack].reverse(), { x: 4, y: 5 }, project)?.id).toBe(
    "0000000003",
  );
});
