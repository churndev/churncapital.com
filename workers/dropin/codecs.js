import jpegDecWasm from "@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm";
import pngWasm from "@jsquash/png/codec/pkg/squoosh_png_bg.wasm";
import webpDecWasm from "@jsquash/webp/codec/dec/webp_dec.wasm";
import avifDecWasm from "@jsquash/avif/codec/dec/avif_dec.wasm";
import webpEncWasm from "@jsquash/webp/codec/enc/webp_enc.wasm";
import avifEncWasm from "@jsquash/avif/codec/enc/avif_enc.wasm";
import resizeWasm from "@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm";
import { init as initJpegDec, default as decodeJpeg } from "@jsquash/jpeg/decode.js";
import { init as initPngDec, default as decodePng } from "@jsquash/png/decode.js";
import { init as initWebpDec, default as decodeWebp } from "@jsquash/webp/decode.js";
import { init as initAvifDec, default as decodeAvif } from "@jsquash/avif/decode.js";
import { init as initWebpEnc, default as encodeWebp } from "@jsquash/webp/encode.js";
import { init as initAvifEnc, default as encodeAvif } from "@jsquash/avif/encode.js";
import resize, { initResize } from "@jsquash/resize";
import { AVIF_ENCODE, WEBP_ENCODE } from "./encode-settings.js";

var ready;

export async function createCodecs() {
  if (!ready) {
    ready = (async function () {
      await initJpegDec(jpegDecWasm);
      await initPngDec(pngWasm);
      await initWebpDec(webpDecWasm);
      await initAvifDec(avifDecWasm);
      await initWebpEnc(webpEncWasm);
      await initAvifEnc(avifEncWasm);
      await initResize(resizeWasm);
    })();
  }
  await ready;
  return {
    decode: decodeImage,
    resize: resizeImage,
    encode: encodeImage,
  };
}

async function decodeImage(bytes, contentType) {
  var buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  if (contentType === "image/jpeg") return decodeJpeg(buffer, { preserveOrientation: true });
  if (contentType === "image/png") return decodePng(buffer);
  if (contentType === "image/webp") return decodeWebp(buffer);
  if (contentType === "image/avif") {
    var image = await decodeAvif(buffer);
    if (!image) throw new Error("decode_failed");
    return image;
  }
  throw new Error("unsupported_type");
}

function resizeImage(image, width, height) {
  return resize(image, {
    width: width,
    height: height,
    method: "lanczos3",
    fitMethod: "stretch",
    premultiply: true,
    linearRGB: true,
  });
}

async function encodeImage(image, format) {
  if (format === "avif") return new Uint8Array(await encodeAvif(image, AVIF_ENCODE));
  if (format === "webp") return new Uint8Array(await encodeWebp(image, WEBP_ENCODE));
  throw new Error("unsupported_format");
}
