import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ASSET_ORIGIN,
  LADDER,
  MAX_INPUT_BYTES,
  MAX_PIXELS,
  altFromFilename,
  imageUrl,
  nameFromSlug,
  neededWidth,
  nextImageId,
  parseIncomingKey,
  parseManifest,
  pickWidth,
  variantPlan,
  variantWidths,
} from "../public/plan.js";

const manifest = JSON.parse(readFileSync(new URL("./fixtures/manifest.json", import.meta.url), "utf8"));

test("portrait cover width is the height times the image aspect, not the longer viewport edge", () => {
  const photo = { width: 3840, height: 2560 };
  const vw = 390;
  const vh = 844;
  const dpr = 3;
  const oldNeed = Math.max(vw, vh) * dpr;
  const need = neededWidth(vw, vh, dpr, photo.width, photo.height, "cover");
  assert.equal(oldNeed, 2532);
  assert.equal(need, 3798);
  assert.ok(need > oldNeed);
  assert.equal(pickWidth(oldNeed, LADDER), 2560);
  assert.equal(pickWidth(need, LADDER), 3840);
});

test("contain uses the smaller of the two edges", () => {
  const need = neededWidth(390, 844, 3, 3840, 2560, "contain");
  assert.equal(need, 1170);
  assert.equal(pickWidth(need, LADDER), 1280);
  const square = neededWidth(1920, 1080, 1, 3840, 3840, "contain");
  assert.equal(square, 1080);
  assert.equal(pickWidth(square, LADDER), 1280);
});

test("viewport matrix picks the smallest covering width", () => {
  const photo = { width: 3840, height: 2560 };
  const cases = [
    [844, 390, 3, "cover", 2560],
    [768, 1024, 2, "cover", 3840],
    [1024, 768, 2, "cover", 2560],
    [1920, 1080, 1, "cover", 1920],
    [2560, 1440, 1, "cover", 2560],
  ];
  for (const [vw, vh, dpr, fit, expected] of cases) {
    const need = neededWidth(vw, vh, dpr, photo.width, photo.height, fit);
    assert.equal(pickWidth(need, LADDER), expected, `${vw}x${vh}@${dpr}`);
  }
});

test("ladder widths never exceed the source, and a tiny source is kept as itself", () => {
  assert.deepEqual(variantWidths(4000), [480, 960, 1280, 1600, 1920, 2560, 3840]);
  assert.deepEqual(variantWidths(2000), [480, 960, 1280, 1600, 1920]);
  assert.deepEqual(variantWidths(480), [480]);
  assert.deepEqual(variantWidths(100), [100]);
  assert.deepEqual(variantPlan(100).map((step) => step.format + step.width), ["avif100", "webp100"]);
});

test("image urls use the manifest base", () => {
  assert.equal(
    imageUrl(ASSET_ORIGIN, "florida", "01", 1280, "avif"),
    "https://assets.churncapital.com/images/florida/01-1280.avif"
  );
});

test("live manifest snapshot parses and keeps crop fields", () => {
  const parsed = parseManifest(manifest);
  assert.equal(parsed.themes.map((theme) => theme.name).join(","), "Florida,Ocean,Mountains,Space,City");
  assert.equal(parsed.themes[0].images[1].objectPosition, "70% 50%");
  assert.equal(parsed.themes[3].images[1].fit, "contain");
  assert.equal(parsed.themes[3].images[1].id, "02");
  assert.equal(parsed.themes[4].images[3].objectPosition, "50% 35%");
  assert.equal(parsed.formats.join(","), "avif,webp");
});

test("a manifest whose base is not the asset host is rejected", () => {
  const copy = structuredClone(manifest);
  copy.base = "https://example.com";
  assert.equal(parseManifest(copy), null);
  const badFit = structuredClone(manifest);
  badFit.themes[0].images[0].fit = "fill";
  assert.equal(parseManifest(badFit).themes[0].images[0].fit, "cover");
  const badPos = structuredClone(manifest);
  badPos.themes[0].images[0].objectPosition = "left top";
  assert.equal(parseManifest(badPos).themes[0].images[0].objectPosition, "50% 50%");
});

test("incoming keys, ids, and alt text", () => {
  assert.equal(parseIncomingKey("incoming/dry-tortugas/east_beach.JPG").theme, "dry-tortugas");
  assert.equal(parseIncomingKey("incoming/dry-tortugas/east_beach.JPG").contentType, "image/jpeg");
  assert.equal(parseIncomingKey("incoming/Florida/a.jpg"), null);
  assert.equal(parseIncomingKey("incoming/florida/../a.jpg"), null);
  assert.equal(parseIncomingKey("incoming/florida/notes.txt"), null);
  assert.equal(altFromFilename("east_beach-sunset.jpg"), "East beach sunset");
  assert.equal(nameFromSlug("dry-tortugas"), "Dry Tortugas");
  assert.equal(nextImageId(["01", "04", "02"]), "05");
  assert.equal(nextImageId(["99"]), "100");
});

test("documented limits are the values the job enforces", () => {
  assert.equal(MAX_INPUT_BYTES, 15728640);
  assert.equal(MAX_PIXELS, 10000000);
});
