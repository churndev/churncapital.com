import assert from "node:assert/strict";
import test from "node:test";
import { imageDimensions } from "../workers/dropin/dimensions.js";
import { processIncoming } from "../workers/dropin/process.js";
import { memoryBucket } from "./bucket.js";
import { createNodeCodecs } from "./node-codecs.js";

test("jSquash Lanczos encodes a real drop-in to AVIF and WebP", async () => {
  const codecs = await createNodeCodecs();
  const pixels = new Uint8ClampedArray(8 * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 20;
    pixels[i + 1] = 180;
    pixels[i + 2] = 90;
    pixels[i + 3] = 255;
  }
  const png = await codecs.encode({ data: pixels, width: 4, height: 2 }, "webp");
  const webpSize = imageDimensions(png, "image/webp");
  assert.equal(webpSize.width, 4);
  assert.equal(webpSize.height, 2);
  const jpeg = await codecs.encode({ data: pixels, width: 4, height: 2 }, "jpeg");
  assert.deepEqual(imageDimensions(jpeg, "image/jpeg"), { width: 4, height: 2 });

  const source = await codecs.encode({ data: pixels, width: 4, height: 2 }, "webp");
  const env = { PUBLIC_BUCKET: memoryBucket(), MASTERS_BUCKET: memoryBucket() };
  await env.MASTERS_BUCKET.put("incoming/swatch/green.webp", source, {
    httpMetadata: { contentType: "image/webp" },
  });
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await processIncoming(env, codecs)).status);
  assert.deepEqual(statuses, ["variant", "variant", "published", "idle"]);
  const avif = await env.PUBLIC_BUCKET.get("images/swatch/01-4.avif");
  const webp = await env.PUBLIC_BUCKET.get("images/swatch/01-4.webp");
  const avifBytes = new Uint8Array(await avif.arrayBuffer());
  const webpBytes = new Uint8Array(await webp.arrayBuffer());
  assert.equal(String.fromCharCode(...avifBytes.slice(4, 8)), "ftyp");
  assert.equal(String.fromCharCode(...webpBytes.slice(0, 4)), "RIFF");
  const manifest = JSON.parse(await (await env.PUBLIC_BUCKET.get("home/manifest.json")).text());
  assert.equal(manifest.themes[0].images[0].width, 4);
  assert.equal(manifest.themes[0].images[0].height, 2);
  assert.deepEqual(manifest.themes[0].images[0].widths, [4]);
  assert.equal(await env.MASTERS_BUCKET.get("incoming/swatch/green.webp"), null);
  assert.ok(await env.MASTERS_BUCKET.get("masters/swatch/01-green.webp"));
});
