import assert from "node:assert/strict";
import test from "node:test";
import { IMAGE_CACHE, MANIFEST_CACHE, MAX_INPUT_BYTES } from "../public/plan.js";
import { processIncoming } from "../workers/dropin/process.js";
import { memoryBucket } from "./bucket.js";

function png(width, height) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes[11] = 13;
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function fakeCodecs(size) {
  const calls = { decode: 0, resize: [] };
  return {
    calls,
    async decode() {
      calls.decode += 1;
      return { width: size.width, height: size.height, data: new Uint8ClampedArray(16) };
    },
    async resize(image, width, height) {
      calls.resize.push({ width, height });
      return { width, height, data: new Uint8ClampedArray(16) };
    },
    async encode(image, format) {
      return new TextEncoder().encode(`${format}:${image.width}x${image.height}`);
    },
  };
}

function env() {
  return { PUBLIC_BUCKET: memoryBucket(), MASTERS_BUCKET: memoryBucket() };
}

async function text(bucket, key) {
  const object = await bucket.get(key);
  return object ? object.text() : "";
}

test("a drop-in is encoded one variant at a time, then published to the public bucket", async () => {
  const boxes = env();
  const codecs = fakeCodecs({ width: 500, height: 250 });
  await boxes.MASTERS_BUCKET.put("incoming/desert/red_dune.png", png(500, 250), {
    httpMetadata: { contentType: "image/png" },
    uploaded: new Date("2026-11-14T00:00:00Z"),
  });
  await boxes.MASTERS_BUCKET.put("incoming/florida/later.png", png(100, 50), {
    uploaded: new Date("2026-11-14T01:00:00Z"),
  });

  const first = await processIncoming(boxes, codecs);
  assert.equal(first.status, "variant");
  assert.equal(first.id, "01");
  assert.equal(codecs.calls.decode, 1);
  assert.deepEqual(codecs.calls.resize, [{ width: 480, height: 240 }]);
  assert.equal((await boxes.PUBLIC_BUCKET.get("images/desert/01-480.avif")).httpMetadata.cacheControl, IMAGE_CACHE);
  assert.ok(await boxes.MASTERS_BUCKET.get("incoming/florida/later.png"));

  const second = await processIncoming(boxes, codecs);
  assert.equal(second.format, "webp");
  assert.equal(codecs.calls.decode, 1);

  const published = await processIncoming(boxes, codecs);
  assert.equal(published.status, "published");
  assert.equal(published.master, "masters/desert/01-red_dune.png");
  assert.equal(await boxes.MASTERS_BUCKET.get("incoming/desert/red_dune.png"), null);
  const manifest = JSON.parse(await text(boxes.PUBLIC_BUCKET, "home/manifest.json"));
  assert.equal((await boxes.PUBLIC_BUCKET.get("home/manifest.json")).httpMetadata.cacheControl, MANIFEST_CACHE);
  assert.equal(manifest.themes.length, 1);
  assert.equal(manifest.themes[0].name, "Desert");
  assert.equal(manifest.themes[0].images.length, 1);
  assert.equal(manifest.themes[0].images[0].fit, "cover");
  assert.equal(manifest.themes[0].images[0].objectPosition, "50% 50%");
  assert.equal(manifest.themes[0].images[0].alt, "Red dune");
  assert.deepEqual(manifest.themes[0].images[0].widths, [480]);
  assert.equal(manifest.base, "https://assets.churncapital.com");

  const next = await processIncoming(boxes, fakeCodecs({ width: 100, height: 50 }));
  assert.equal(next.status, "variant");
  assert.equal(next.theme, "florida");
});

test("an existing theme keeps its name and gets the next id", async () => {
  const boxes = env();
  await boxes.PUBLIC_BUCKET.put("home/manifest.json", JSON.stringify({
    version: 1,
    base: "https://assets.churncapital.com",
    widths: [480],
    formats: ["avif", "webp"],
    themes: [{ id: "florida", name: "Florida", images: [{ id: "04" }] }],
  }));
  await boxes.MASTERS_BUCKET.put("incoming/florida/gulf.png", png(100, 40), {
    httpMetadata: { contentType: "image/png" },
  });
  const codecs = fakeCodecs({ width: 100, height: 40 });
  assert.equal((await processIncoming(boxes, codecs)).id, "05");
  await processIncoming(boxes, codecs);
  const published = await processIncoming(boxes, codecs);
  assert.equal(published.status, "published");
  const manifest = JSON.parse(await text(boxes.PUBLIC_BUCKET, "home/manifest.json"));
  assert.equal(manifest.themes[0].name, "Florida");
  assert.deepEqual(manifest.themes[0].images.map((image) => image.id), ["04", "05"]);
});

test("files over the byte limit are skipped without being downloaded", async () => {
  const boxes = env();
  let reads = 0;
  const original = boxes.MASTERS_BUCKET.get.bind(boxes.MASTERS_BUCKET);
  boxes.MASTERS_BUCKET.get = async (key) => {
    if (key.startsWith("incoming/")) reads += 1;
    return original(key);
  };
  await boxes.MASTERS_BUCKET.put("incoming/florida/huge.jpg", new Uint8Array([1]));
  const listed = boxes.MASTERS_BUCKET.list.bind(boxes.MASTERS_BUCKET);
  boxes.MASTERS_BUCKET.list = async (options) => {
    const result = await listed(options);
    for (const object of result.objects) {
      if (object.key.endsWith("huge.jpg")) object.size = MAX_INPUT_BYTES + 1;
    }
    return result;
  };
  const result = await processIncoming(boxes, fakeCodecs({ width: 10, height: 10 }));
  assert.equal(result.reason, "too_large_bytes");
  assert.equal(reads, 0);
  assert.ok(await boxes.MASTERS_BUCKET.get("incoming/florida/huge.jpg"));
  const again = await processIncoming(boxes, fakeCodecs({ width: 10, height: 10 }));
  assert.equal(again.status, "idle");
});

test("a file with too many pixels or a bad name is moved to rejected", async () => {
  const boxes = env();
  const codecs = fakeCodecs({ width: 10, height: 10 });
  await boxes.MASTERS_BUCKET.put("incoming/florida/wide.png", png(8000, 2000), {
    uploaded: new Date("2026-11-14T01:00:00Z"),
  });
  await boxes.MASTERS_BUCKET.put("incoming/florida/notes.txt", new Uint8Array([1, 2, 3]), {
    uploaded: new Date("2026-11-14T02:00:00Z"),
  });
  const pixels = await processIncoming(boxes, codecs);
  assert.equal(pixels.reason, "too_large_pixels");
  assert.equal(codecs.calls.decode, 0);
  assert.equal(await boxes.MASTERS_BUCKET.get("incoming/florida/wide.png"), null);
  assert.ok(await boxes.MASTERS_BUCKET.get("rejected/florida/wide.png"));
  const bad = await processIncoming(boxes, codecs);
  assert.equal(bad.reason, "bad_key");
  assert.ok(await boxes.MASTERS_BUCKET.get("rejected/florida/notes.txt"));
});

test("a held lock does not start a second image", async () => {
  const boxes = env();
  await boxes.MASTERS_BUCKET.put("jobs/lock.json", JSON.stringify({ until: Date.now() + 60000 }));
  await boxes.MASTERS_BUCKET.put("incoming/florida/a.jpg", png(20, 10));
  const result = await processIncoming(boxes, fakeCodecs({ width: 20, height: 10 }));
  assert.equal(result.status, "busy");
  assert.equal(await boxes.PUBLIC_BUCKET.get("images/florida/01-20.avif"), null);
});
