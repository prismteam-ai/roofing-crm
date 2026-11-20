/**
 * The site's own favicon (no third-party asset): public/favicon.ico (16 and 32 px, 32-bit) and the hand-drawn
 * public/favicon.svg it was drawn from, both linked from index.html. Vite copies public/ to the root of the
 * build, so /favicon.ico is served (Amplify's single-page rule leaves .ico and .svg paths alone).
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url));

describe("favicon", () => {
  test("favicon.ico is an icon file with a 16 and a 32 px image, each inside the file", () => {
    const ico = read("public/favicon.ico");
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2)]).toEqual([0, 1]);
    const n = ico.readUInt16LE(4);
    const entries = Array.from({ length: n }, (_, i) => {
      const e = 6 + 16 * i;
      return {
        size: ico[e]!,
        bits: ico.readUInt16LE(e + 6),
        bytes: ico.readUInt32LE(e + 8),
        offset: ico.readUInt32LE(e + 12),
      };
    });
    expect(entries.map((e) => [e.size, e.bits])).toEqual([
      [16, 32],
      [32, 32],
    ]);
    for (const e of entries) {
      expect(e.offset + e.bytes).toBeLessThanOrEqual(ico.length);
      // A BITMAPINFOHEADER of that size (height doubled for the mask).
      expect(ico.readUInt32LE(e.offset)).toBe(40);
      expect(ico.readInt32LE(e.offset + 4)).toBe(e.size);
      expect(ico.readInt32LE(e.offset + 8)).toBe(e.size * 2);
    }
    expect(ico.length).toBeLessThan(8_000);
  });

  test("favicon.svg is self-contained (no external reference)", () => {
    const svg = read("public/favicon.svg").toString("utf8");
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /);
    expect(svg).not.toMatch(/href|url\(|<image|<script/i);
  });

  test("index.html links both", () => {
    const html = read("index.html").toString("utf8");
    expect(html).toContain(
      '<link rel="icon" href="/favicon.ico" sizes="32x32" />',
    );
    expect(html).toContain(
      '<link rel="icon" href="/favicon.svg" type="image/svg+xml" />',
    );
  });
});
