import { readFile } from "node:fs/promises";
import { init as initJpegDec, default as decodeJpeg } from "@jsquash/jpeg/decode.js";
import { init as initJpegEnc, default as encodeJpeg } from "@jsquash/jpeg/encode.js";
import { init as initPngDec, default as decodePng } from "@jsquash/png/decode.js";
import { init as initWebpDec, default as decodeWebp } from "@jsquash/webp/decode.js";
import { init as initAvifDec, default as decodeAvif } from "@jsquash/avif/decode.js";
import { init as initWebpEnc, default as encodeWebp } from "@jsquash/webp/encode.js";
import { init as initAvifEnc, default as encodeAvif } from "@jsquash/avif/encode.js";
import resize, { initResize } from "@jsquash/resize/index.js";
import { AVIF_ENCODE, WEBP_ENCODE } from "../src/encode-settings.js";

if (!globalThis.ImageData) {
  globalThis.ImageData = class ImageData {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
}

async function wasm(path) {
  return readFile(new URL("../node_modules/" + path, import.meta.url));
}

export async function createNodeCodecs() {
  await initJpegDec({ wasmBinary: await wasm("@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm") });
  await initJpegEnc({ wasmBinary: await wasm("@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm") });
  await initPngDec(await wasm("@jsquash/png/codec/pkg/squoosh_png_bg.wasm"));
  await initWebpDec({ wasmBinary: await wasm("@jsquash/webp/codec/dec/webp_dec.wasm") });
  await initAvifDec({ wasmBinary: await wasm("@jsquash/avif/codec/dec/avif_dec.wasm") });
  await initWebpEnc({ wasmBinary: await wasm("@jsquash/webp/codec/enc/webp_enc.wasm") });
  await initAvifEnc({ wasmBinary: await wasm("@jsquash/avif/codec/enc/avif_enc.wasm") });
  await initResize(await wasm("@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm"));
  return {
    async decode(bytes, contentType) {
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      if (contentType === "image/jpeg") return decodeJpeg(buffer, { preserveOrientation: true });
      if (contentType === "image/png") return decodePng(buffer);
      if (contentType === "image/webp") return decodeWebp(buffer);
      if (contentType === "image/avif") return decodeAvif(buffer);
      throw new Error("unsupported_type");
    },
    resize(image, width, height) {
      return resize(image, {
        width,
        height,
        method: "lanczos3",
        fitMethod: "stretch",
        premultiply: true,
        linearRGB: true,
      });
    },
    async encode(image, format) {
      const picture = image instanceof ImageData ? image : new ImageData(image.data, image.width, image.height);
      if (format === "avif") return new Uint8Array(await encodeAvif(picture, AVIF_ENCODE));
      if (format === "webp") return new Uint8Array(await encodeWebp(picture, WEBP_ENCODE));
      if (format === "jpeg") return new Uint8Array(await encodeJpeg(picture, { quality: 75 }));
      throw new Error("unsupported_format");
    },
  };
}
