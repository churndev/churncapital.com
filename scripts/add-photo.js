import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { imageDimensions } from "../workers/dropin/dimensions.js";
import { createNodeCodecs } from "../workers/dropin/node-codecs.js";
import {
  IMAGE_CACHE,
  MANIFEST_CACHE,
  MAX_INPUT_BYTES,
  MAX_PIXELS,
  altFromFilename,
  isSlug,
  nameFromSlug,
  nextImageId,
  normalizePosition,
  scaledHeight,
  variantKey,
  variantPlan,
} from "../public/plan.js";

const CONTENT_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

export async function addPhoto(options) {
  const bytes = options.bytes instanceof Uint8Array ? options.bytes : new Uint8Array(options.bytes);
  if (!isSlug(options.theme)) throw new Error("theme must be a lowercase slug");
  if (bytes.byteLength > MAX_INPUT_BYTES) {
    throw new Error("file is over " + MAX_INPUT_BYTES + " bytes");
  }
  const header = imageDimensions(bytes, options.contentType);
  if (!header) throw new Error("could not read image dimensions");
  if (header.width * header.height > MAX_PIXELS) {
    throw new Error("image is over " + MAX_PIXELS + " pixels");
  }
  const codecs = options.codecs || await createNodeCodecs();
  const image = await codecs.decode(bytes, options.contentType);
  if (!image || image.width * image.height > MAX_PIXELS) throw new Error("decoded image is over the pixel limit");
  const plan = variantPlan(image.width);
  const widths = [];
  const files = [];
  for (const step of plan) {
    if (widths.indexOf(step.width) === -1) widths.push(step.width);
    const height = scaledHeight(image.width, image.height, step.width);
    const frame = step.width === image.width ? image : await codecs.resize(image, step.width, height);
    const encoded = await codecs.encode(frame, step.format);
    const key = variantKey(options.theme, options.id, step.width, step.format);
    files.push({
      key,
      bytes: encoded,
      contentType: step.format === "avif" ? "image/avif" : "image/webp",
      cacheControl: IMAGE_CACHE,
    });
  }
  const entry = {
    id: options.id,
    width: image.width,
    height: image.height,
    fit: options.fit === "contain" ? "contain" : "cover",
    objectPosition: normalizePosition(options.objectPosition || "50% 50%"),
    alt: options.alt || altFromFilename(options.filename || "photo"),
    credit: options.credit || "",
    widths,
  };
  return { entry, files, plan };
}

export function appendEntry(manifest, themeId, themeName, entry) {
  if (!manifest.themes) manifest.themes = [];
  let theme = null;
  for (const item of manifest.themes) {
    if (item.id === themeId) theme = item;
  }
  if (!theme) {
    theme = { id: themeId, name: themeName || nameFromSlug(themeId), images: [] };
    manifest.themes.push(theme);
  }
  if (!Array.isArray(theme.images)) theme.images = [];
  if (theme.images.some((image) => image.id === entry.id)) {
    throw new Error("manifest already has " + themeId + "/" + entry.id);
  }
  theme.images.push(entry);
  return manifest;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return "";
  return process.argv[index + 1];
}

function contentTypeOf(filename) {
  const match = /\.([A-Za-z0-9]+)$/.exec(filename);
  if (!match) return "";
  return CONTENT_TYPES[match[1].toLowerCase()] || "";
}

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

export function uploadScript(files, manifestFile) {
  const lines = ["#!/bin/sh", "set -eu", ""];
  for (const file of files) {
    lines.push(
      "npx wrangler r2 object put " + shellQuote("churncapital-assets/" + file.key) +
      " --file=" + shellQuote(file.localPath) +
      " --content-type=" + shellQuote(file.contentType) +
      " --cache-control=" + shellQuote(file.cacheControl) +
      " --remote"
    );
    lines.push("");
  }
  if (manifestFile) {
    lines.push(
      "npx wrangler r2 object put " + shellQuote("churncapital-assets/home/manifest.json") +
      " --file=" + shellQuote(manifestFile) +
      " --content-type=" + shellQuote("application/json") +
      " --cache-control=" + shellQuote(MANIFEST_CACHE) +
      " --remote"
    );
    lines.push("");
  }
  return lines.join("\n");
}

async function main() {
  const file = argument("--file");
  const theme = argument("--theme");
  const out = argument("--out") || "out";
  const manifestPath = argument("--manifest");
  if (!file || !theme) {
    console.error("Usage: node scripts/add-photo.js --file photo.jpg --theme florida [--id 05] [--alt text] [--credit text] [--fit cover|contain] [--position '50% 50%'] [--name 'Theme name'] [--manifest ./manifest.json] [--out out]");
    process.exit(1);
  }
  const contentType = contentTypeOf(file);
  if (!contentType) throw new Error("file must be jpg, jpeg, png, webp, or avif");
  const bytes = new Uint8Array(await readFile(file));
  let manifest = null;
  if (manifestPath) manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const existing = manifest && Array.isArray(manifest.themes)
    ? (manifest.themes.find((item) => item.id === theme) || { images: [] })
    : { images: [] };
  const id = argument("--id") || nextImageId((existing.images || []).map((image) => image.id));
  const prepared = await addPhoto({
    bytes,
    contentType,
    theme,
    id,
    filename: file.split(/[\\/]/).pop(),
    alt: argument("--alt"),
    credit: argument("--credit"),
    fit: argument("--fit") || "cover",
    objectPosition: argument("--position") || "50% 50%",
  });
  const written = [];
  for (const item of prepared.files) {
    const localPath = join(out, item.key);
    await mkdir(dirname(localPath), { recursive: true });
    await writeFile(localPath, item.bytes);
    written.push({ ...item, localPath, bytes: undefined });
  }
  let manifestOut = "";
  if (manifest) {
    appendEntry(manifest, theme, argument("--name") || nameFromSlug(theme), prepared.entry);
    manifestOut = join(out, "home", "manifest.json");
    await mkdir(dirname(manifestOut), { recursive: true });
    await writeFile(manifestOut, JSON.stringify(manifest, null, 2) + "\n");
    if (manifestPath) await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  } else {
    const snippet = join(out, "manifest-entry.json");
    await mkdir(out, { recursive: true });
    await writeFile(snippet, JSON.stringify(prepared.entry, null, 2) + "\n");
  }
  const script = uploadScript(written, manifestOut);
  await writeFile(join(out, "upload.sh"), script);
  console.log(script);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  });
}
