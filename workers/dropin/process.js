import { imageDimensions } from "./dimensions.js";
import {
  IMAGE_CACHE,
  MANIFEST_CACHE,
  MAX_INPUT_BYTES,
  MAX_PIXELS,
  PRIVATE_CACHE,
  altFromFilename,
  emptyManifest,
  nameFromSlug,
  nextImageId,
  parseIncomingKey,
  scaledHeight,
  variantKey,
  variantPlan,
} from "../../public/plan.js";

var LOCK_KEY = "jobs/lock.json";
var JOB_KEY = "jobs/active.json";
var RGBA_KEY = "jobs/rgba.bin";
var SKIP_KEY = "jobs/skipped.json";
var MANIFEST_KEY = "home/manifest.json";
var LOCK_MS = 180000;

export async function processIncoming(env, codecs, options) {
  var now = options && options.now ? options.now : Date.now();
  var masters = env.MASTERS_BUCKET;
  var photos = env.PUBLIC_BUCKET;
  if (!(await acquireLock(masters, now))) {
    return finish("busy");
  }
  try {
    var job = await readJson(masters, JOB_KEY);
    if (job) return await resumeJob(photos, masters, codecs, job);
    return await claimIncoming(photos, masters, codecs);
  } finally {
    await masters.delete(LOCK_KEY);
  }
}

async function claimIncoming(photos, masters, codecs) {
  var skipped = await readJson(masters, SKIP_KEY) || {};
  var listed = await listAll(masters, "incoming/");
  var candidates = [];
  for (var i = 0; i < listed.length; i++) {
    var item = listed[i];
    if (!item.key || item.key.charAt(item.key.length - 1) === "/") continue;
    if (skipped[item.key]) continue;
    candidates.push(item);
  }
  candidates.sort(function (a, b) { return uploadedMs(a) - uploadedMs(b); });
  if (!candidates.length) return finish("idle");
  var next = candidates[0];
  if (next.size > MAX_INPUT_BYTES) {
    skipped[next.key] = { reason: "too_large_bytes", bytes: next.size, maxBytes: MAX_INPUT_BYTES, at: new Date().toISOString() };
    await writeJson(masters, SKIP_KEY, skipped);
    log("error", "incoming_rejected", { key: next.key, reason: "too_large_bytes", bytes: next.size, maxBytes: MAX_INPUT_BYTES });
    return finish("rejected", { key: next.key, reason: "too_large_bytes" });
  }
  var parsed = parseIncomingKey(next.key);
  var object = await masters.get(next.key);
  if (!object) return finish("idle");
  var bytes = new Uint8Array(await object.arrayBuffer());
  if (!parsed) {
    await movePrivate(masters, next.key, rejectedKey(next.key), bytes, object.httpMetadata, { reason: "bad_key" });
    log("error", "incoming_rejected", { key: next.key, reason: "bad_key" });
    return finish("rejected", { key: next.key, reason: "bad_key" });
  }
  var header = imageDimensions(bytes, parsed.contentType);
  if (!header) {
    await movePrivate(masters, next.key, rejectedKey(next.key), bytes, object.httpMetadata, { reason: "unknown_dimensions" });
    log("error", "incoming_rejected", { key: next.key, reason: "unknown_dimensions" });
    return finish("rejected", { key: next.key, reason: "unknown_dimensions" });
  }
  if (header.width * header.height > MAX_PIXELS) {
    await movePrivate(masters, next.key, rejectedKey(next.key), bytes, object.httpMetadata, {
      reason: "too_large_pixels",
      width: String(header.width),
      height: String(header.height),
    });
    log("error", "incoming_rejected", {
      key: next.key,
      reason: "too_large_pixels",
      width: header.width,
      height: header.height,
      pixels: header.width * header.height,
      maxPixels: MAX_PIXELS,
    });
    return finish("rejected", { key: next.key, reason: "too_large_pixels" });
  }
  var image;
  try {
    image = await codecs.decode(bytes, parsed.contentType);
  } catch (err) {
    await movePrivate(masters, next.key, rejectedKey(next.key), bytes, object.httpMetadata, { reason: "decode_failed" });
    log("error", "incoming_rejected", { key: next.key, reason: "decode_failed", message: err && err.message ? err.message : String(err) });
    return finish("rejected", { key: next.key, reason: "decode_failed" });
  }
  if (!image || !image.width || !image.height || image.width * image.height > MAX_PIXELS) {
    await movePrivate(masters, next.key, rejectedKey(next.key), bytes, object.httpMetadata, { reason: "too_large_pixels" });
    log("error", "incoming_rejected", { key: next.key, reason: "too_large_pixels" });
    return finish("rejected", { key: next.key, reason: "too_large_pixels" });
  }
  var manifest = await readManifest(photos);
  var ids = idsFor(manifest, parsed.theme);
  var theme = findTheme(manifest, parsed.theme);
  var job = {
    sourceKey: next.key,
    theme: parsed.theme,
    themeName: theme ? theme.name : nameFromSlug(parsed.theme),
    id: nextImageId(ids),
    filename: parsed.filename,
    contentType: parsed.contentType,
    width: image.width,
    height: image.height,
    widths: variantPlan(image.width).reduce(function (list, step) {
      if (list.indexOf(step.width) === -1) list.push(step.width);
      return list;
    }, []),
    alt: altFromFilename(parsed.filename),
    done: [],
    rgbaKey: RGBA_KEY,
  };
  await masters.put(RGBA_KEY, image.data, {
    httpMetadata: { contentType: "application/octet-stream", cacheControl: PRIVATE_CACHE },
  });
  await writeJson(masters, JOB_KEY, job);
  return writeNextVariant(photos, masters, codecs, job, image);
}

async function resumeJob(photos, masters, codecs, job) {
  var source = await masters.get(job.sourceKey);
  if (!source) {
    await abandon(photos, masters, job, "source_missing");
    return finish("rejected", { key: job.sourceKey, reason: "source_missing" });
  }
  var rgba = await masters.get(job.rgbaKey || RGBA_KEY);
  if (!rgba) {
    await abandon(photos, masters, job, "rgba_missing");
    return finish("rejected", { key: job.sourceKey, reason: "rgba_missing" });
  }
  var pixels = new Uint8ClampedArray(await rgba.arrayBuffer());
  var image = { data: pixels, width: job.width, height: job.height };
  var pending = pendingVariant(job);
  if (!pending) return publish(photos, masters, job);
  return writeNextVariant(photos, masters, codecs, job, image);
}

async function writeNextVariant(photos, masters, codecs, job, image) {
  var step = pendingVariant(job);
  if (!step) return publish(photos, masters, job);
  var height = scaledHeight(image.width, image.height, step.width);
  var frame = step.width === image.width ? image : await codecs.resize(image, step.width, height);
  var encoded = await codecs.encode(frame, step.format);
  var key = variantKey(job.theme, job.id, step.width, step.format);
  await photos.put(key, encoded, {
    httpMetadata: {
      contentType: step.format === "avif" ? "image/avif" : "image/webp",
      cacheControl: IMAGE_CACHE,
    },
  });
  job.done = (job.done || []).concat(step.width + "." + step.format);
  await writeJson(masters, JOB_KEY, job);
  log("info", "variant_written", { key: key, theme: job.theme, id: job.id, width: step.width, format: step.format });
  return finish("variant", { key: job.sourceKey, theme: job.theme, id: job.id, width: step.width, format: step.format });
}

async function publish(photos, masters, job) {
  var source = await masters.get(job.sourceKey);
  if (!source) {
    await abandon(photos, masters, job, "source_missing_at_publish");
    return finish("rejected", { key: job.sourceKey, reason: "source_missing_at_publish" });
  }
  var bytes = new Uint8Array(await source.arrayBuffer());
  var manifest = await readManifest(photos);
  var theme = findTheme(manifest, job.theme);
  if (!theme) {
    theme = { id: job.theme, name: job.themeName || nameFromSlug(job.theme), images: [] };
    manifest.themes.push(theme);
  }
  var exists = false;
  for (var i = 0; i < theme.images.length; i++) {
    if (theme.images[i].id === job.id) exists = true;
  }
  if (!exists) {
    theme.images.push({
      id: job.id,
      width: job.width,
      height: job.height,
      fit: "cover",
      objectPosition: "50% 50%",
      alt: job.alt || altFromFilename(job.filename),
      credit: "",
      widths: job.widths,
    });
  }
  await writeJson(photos, MANIFEST_KEY, manifest, MANIFEST_CACHE);
  var masterKey = "masters/" + job.theme + "/" + job.id + "-" + job.filename;
  await masters.put(masterKey, bytes, {
    httpMetadata: {
      contentType: job.contentType || "application/octet-stream",
      cacheControl: PRIVATE_CACHE,
    },
    customMetadata: { theme: job.theme, id: job.id, source: job.sourceKey },
  });
  await masters.delete(job.sourceKey);
  await masters.delete(JOB_KEY);
  await masters.delete(job.rgbaKey || RGBA_KEY);
  log("info", "image_published", { theme: job.theme, id: job.id, source: job.sourceKey, master: masterKey, widths: job.widths });
  return finish("published", { key: job.sourceKey, theme: job.theme, id: job.id, master: masterKey });
}

function pendingVariant(job) {
  var plan = variantPlan(job.width);
  var done = job.done || [];
  for (var i = 0; i < plan.length; i++) {
    var token = plan[i].width + "." + plan[i].format;
    if (done.indexOf(token) === -1) return plan[i];
  }
  return null;
}

async function abandon(photos, masters, job, reason) {
  var manifest = await readManifest(photos);
  var published = false;
  var theme = findTheme(manifest, job.theme);
  if (theme) {
    for (var i = 0; i < theme.images.length; i++) {
      if (theme.images[i].id === job.id) published = true;
    }
  }
  if (!published) {
    var plan = variantPlan(job.width);
    for (var p = 0; p < plan.length; p++) {
      await photos.delete(variantKey(job.theme, job.id, plan[p].width, plan[p].format));
    }
  }
  await masters.delete(JOB_KEY);
  await masters.delete(job.rgbaKey || RGBA_KEY);
  log("error", "incoming_rejected", { key: job.sourceKey, reason: reason });
}

async function readManifest(photos) {
  var parsed = await readJson(photos, MANIFEST_KEY);
  if (!parsed) return emptyManifest();
  if (!Array.isArray(parsed.themes)) throw new Error("manifest_invalid");
  return parsed;
}

function findTheme(manifest, id) {
  for (var i = 0; i < manifest.themes.length; i++) {
    if (manifest.themes[i].id === id) return manifest.themes[i];
  }
  return null;
}

function idsFor(manifest, themeId) {
  var theme = findTheme(manifest, themeId);
  if (!theme || !Array.isArray(theme.images)) return [];
  return theme.images.map(function (image) { return image.id; });
}

async function acquireLock(bucket, now) {
  var current = await readJson(bucket, LOCK_KEY);
  if (current && current.until > now) return false;
  await writeJson(bucket, LOCK_KEY, { until: now + LOCK_MS });
  return true;
}

async function listAll(bucket, prefix) {
  var out = [];
  var cursor;
  for (var page = 0; page < 20; page++) {
    var listed = await bucket.list({ prefix: prefix, cursor: cursor, limit: 1000 });
    var objects = listed.objects || [];
    for (var i = 0; i < objects.length; i++) out.push(objects[i]);
    if (!listed.truncated || !listed.cursor) break;
    cursor = listed.cursor;
  }
  return out;
}

async function readJson(bucket, key) {
  var object = await bucket.get(key);
  if (!object) return null;
  var text = await object.text();
  return JSON.parse(text);
}

async function writeJson(bucket, key, value, cacheControl) {
  await bucket.put(key, JSON.stringify(value, null, 2) + "\n", {
    httpMetadata: {
      contentType: "application/json",
      cacheControl: cacheControl || PRIVATE_CACHE,
    },
  });
}

async function movePrivate(bucket, from, to, bytes, httpMetadata, customMetadata) {
  await bucket.put(to, bytes, {
    httpMetadata: {
      contentType: (httpMetadata && httpMetadata.contentType) || "application/octet-stream",
      cacheControl: PRIVATE_CACHE,
    },
    customMetadata: customMetadata || {},
  });
  await bucket.delete(from);
}

function rejectedKey(sourceKey) {
  return "rejected/" + sourceKey.slice("incoming/".length);
}

function uploadedMs(object) {
  if (!object.uploaded) return 0;
  var time = object.uploaded instanceof Date ? object.uploaded.getTime() : new Date(object.uploaded).getTime();
  return time === time ? time : 0;
}

function finish(status, extra) {
  var result = { status: status };
  if (extra) {
    var keys = Object.keys(extra);
    for (var i = 0; i < keys.length; i++) result[keys[i]] = extra[keys[i]];
  }
  return result;
}

function log(level, event, fields) {
  var payload = { level: level, event: event };
  var keys = Object.keys(fields || {});
  for (var i = 0; i < keys.length; i++) payload[keys[i]] = fields[keys[i]];
  var line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else console.log(line);
}
