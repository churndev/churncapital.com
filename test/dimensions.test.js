import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { imageDimensions } from "../src/dimensions.js";

function png(width, height) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes[11] = 13;
  bytes.set([73, 72, 68, 82], 12);
  bytes[16] = (width >>> 24) & 255;
  bytes[17] = (width >>> 16) & 255;
  bytes[18] = (width >>> 8) & 255;
  bytes[19] = width & 255;
  bytes[20] = (height >>> 24) & 255;
  bytes[21] = (height >>> 16) & 255;
  bytes[22] = (height >>> 8) & 255;
  bytes[23] = height & 255;
  return bytes;
}

function jpeg(width, height) {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    (height >> 8) & 255, height & 255,
    (width >> 8) & 255, width & 255,
    0x01, 0x00, 0x00, 0x00,
  ]);
}

test("png, jpeg, webp, and avif headers report pixel size without decoding", () => {
  assert.deepEqual(imageDimensions(png(640, 480), "image/png"), { width: 640, height: 480 });
  assert.deepEqual(imageDimensions(jpeg(320, 200), "image/jpeg"), { width: 320, height: 200 });
  const webp = new Uint8Array(readFileSync(new URL("./fixtures/webp-head.bin", import.meta.url)));
  assert.deepEqual(imageDimensions(webp, "image/webp"), { width: 1280, height: 854 });
  const avif = new Uint8Array(readFileSync(new URL("./fixtures/avif-head.bin", import.meta.url)));
  assert.deepEqual(imageDimensions(avif, "image/avif"), { width: 1280, height: 854 });
});

test("a header that is not an image has no dimensions", () => {
  assert.equal(imageDimensions(new Uint8Array([1, 2, 3, 4]), "image/jpeg"), null);
});
