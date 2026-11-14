import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { addPhoto, appendEntry, uploadScript } from "../scripts/add-photo.js";
import { createNodeCodecs } from "../workers/dropin/node-codecs.js";

test("add-photo writes the ladder, a manifest entry, and upload commands for the public bucket only", async () => {
  const codecs = await createNodeCodecs();
  const pixels = new Uint8ClampedArray(4 * 2 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels[i + 3] = 255;
  const source = await codecs.encode({ data: pixels, width: 4, height: 2 }, "webp");
  const prepared = await addPhoto({
    bytes: source,
    contentType: "image/webp",
    theme: "florida",
    id: "05",
    filename: "gulf-shore.webp",
    alt: "Gulf shore",
    codecs,
  });
  assert.equal(prepared.entry.fit, "cover");
  assert.equal(prepared.entry.objectPosition, "50% 50%");
  assert.equal(prepared.entry.alt, "Gulf shore");
  assert.deepEqual(prepared.entry.widths, [4]);
  assert.deepEqual(prepared.files.map((file) => file.key), [
    "images/florida/05-4.avif",
    "images/florida/05-4.webp",
  ]);
  const manifest = {
    version: 1,
    base: "https://assets.churncapital.com",
    widths: [480, 960, 1280, 1600, 1920, 2560, 3840],
    formats: ["avif", "webp"],
    themes: [{ id: "florida", name: "Florida", images: [{ id: "04" }] }],
  };
  appendEntry(manifest, "florida", "Florida", prepared.entry);
  assert.deepEqual(manifest.themes[0].images.map((image) => image.id), ["04", "05"]);
  const dir = await mkdtemp(join(tmpdir(), "add-photo-"));
  const script = uploadScript(
    prepared.files.map((file) => ({ ...file, localPath: join(dir, file.key) })),
    join(dir, "home", "manifest.json")
  );
  assert.match(script, /churncapital-assets\/images\/florida\/05-4\.avif/);
  assert.match(script, /--cache-control='public, max-age=31536000, immutable'/);
  assert.match(script, /churncapital-assets\/home\/manifest\.json/);
  assert.match(script, /--cache-control='public, max-age=60'/);
  assert.equal(script.includes("churncapital-masters"), false);
  assert.equal(script.includes("incoming/"), false);
  await readFile(new URL("../scripts/add-photo.js", import.meta.url));
});