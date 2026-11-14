export const MANIFEST_URL = "https://assets.churncapital.com/home/manifest.json";
export const ASSET_ORIGIN = "https://assets.churncapital.com";
export const LADDER = [480, 960, 1280, 1600, 1920, 2560, 3840];
export const FORMATS = ["avif", "webp"];
export const MAX_INPUT_BYTES = 15 * 1024 * 1024;
export const MAX_PIXELS = 10000000;
export const IMAGE_CACHE = "public, max-age=31536000, immutable";
export const MANIFEST_CACHE = "public, max-age=60";
export const PRIVATE_CACHE = "private, no-store";

const SLUG = /^[a-z0-9][a-z0-9-]{0,40}$/;
const EXTENSIONS = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

export function isSlug(value) {
  return typeof value === "string" && SLUG.test(value);
}

export function neededWidth(vw, vh, dpr, imageWidth, imageHeight, fit) {
  var ratio = Number(dpr);
  if (!ratio || ratio < 1) ratio = 1;
  var aspect = imageWidth / imageHeight;
  var alongWidth = vw * ratio;
  var alongHeight = vh * ratio * aspect;
  if (fit === "contain") return Math.min(alongWidth, alongHeight);
  return Math.max(alongWidth, alongHeight);
}

export function pickWidth(need, widths) {
  var list = [];
  var source = widths || [];
  for (var i = 0; i < source.length; i++) {
    var n = Number(source[i]);
    if (n > 0) list.push(n);
  }
  list.sort(function (a, b) { return a - b; });
  if (!list.length) return 0;
  for (var j = 0; j < list.length; j++) {
    if (list[j] >= need) return list[j];
  }
  return list[list.length - 1];
}

export function variantWidths(sourceWidth) {
  var widths = [];
  for (var i = 0; i < LADDER.length; i++) {
    if (LADDER[i] <= sourceWidth) widths.push(LADDER[i]);
  }
  if (!widths.length && sourceWidth > 0) widths.push(sourceWidth);
  return widths;
}

export function variantPlan(sourceWidth) {
  var widths = variantWidths(sourceWidth);
  var plan = [];
  for (var i = 0; i < widths.length; i++) {
    for (var f = 0; f < FORMATS.length; f++) {
      plan.push({ width: widths[i], format: FORMATS[f] });
    }
  }
  return plan;
}

export function scaledHeight(sourceWidth, sourceHeight, targetWidth) {
  if (targetWidth === sourceWidth) return sourceHeight;
  return Math.max(1, Math.round(sourceHeight * targetWidth / sourceWidth));
}

export function imageUrl(base, theme, id, width, format) {
  return String(base).replace(/\/$/, "") + "/images/" + theme + "/" + id + "-" + width + "." + format;
}

export function variantKey(theme, id, width, format) {
  return "images/" + theme + "/" + id + "-" + width + "." + format;
}

export function normalizeFit(fit) {
  return fit === "contain" ? "contain" : "cover";
}

export function normalizePosition(value) {
  if (typeof value !== "string") return "50% 50%";
  var match = /^(\d{1,3})%\s+(\d{1,3})%$/.exec(value.trim());
  if (!match) return "50% 50%";
  var x = Number(match[1]);
  var y = Number(match[2]);
  if (x > 100 || y > 100) return "50% 50%";
  return x + "% " + y + "%";
}

export function altFromFilename(filename) {
  var stem = String(filename).replace(/\.[^.]+$/, "");
  var text = stem.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return "Wallpaper";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function nameFromSlug(slug) {
  return String(slug).split("-").filter(Boolean).map(function (word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(" ");
}

export function nextImageId(existingIds) {
  var max = 0;
  var ids = existingIds || [];
  for (var i = 0; i < ids.length; i++) {
    if (/^\d+$/.test(ids[i])) max = Math.max(max, Number(ids[i]));
  }
  var next = max + 1;
  return next < 100 ? String(next).padStart(2, "0") : String(next);
}

export function parseIncomingKey(key) {
  var match = /^incoming\/([a-z0-9][a-z0-9-]{0,40})\/([^/]+)$/.exec(key);
  if (!match) return null;
  var filename = match[2];
  if (filename.charAt(0) === "." || filename.indexOf("..") !== -1) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,120}$/.test(filename)) return null;
  var extMatch = /\.([A-Za-z0-9]+)$/.exec(filename);
  if (!extMatch) return null;
  var ext = extMatch[1].toLowerCase();
  if (!EXTENSIONS[ext]) return null;
  return {
    theme: match[1],
    filename: filename,
    ext: ext,
    contentType: EXTENSIONS[ext],
  };
}

export function emptyManifest() {
  return {
    version: 1,
    base: ASSET_ORIGIN,
    widths: LADDER.slice(),
    formats: FORMATS.slice(),
    themes: [],
  };
}

export function parseManifest(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (data.base !== ASSET_ORIGIN) return null;
  if (!Array.isArray(data.themes)) return null;
  var widths = numbers(data.widths);
  if (!widths.length) widths = LADDER.slice();
  var formats = [];
  if (Array.isArray(data.formats)) {
    for (var f = 0; f < data.formats.length; f++) {
      if (data.formats[f] === "avif" || data.formats[f] === "webp") formats.push(data.formats[f]);
    }
  }
  if (!formats.length) formats = FORMATS.slice();
  var themes = [];
  for (var i = 0; i < data.themes.length; i++) {
    var theme = data.themes[i];
    if (!theme || !isSlug(theme.id) || typeof theme.name !== "string" || !theme.name.trim()) return null;
    if (!Array.isArray(theme.images)) return null;
    var images = [];
    for (var j = 0; j < theme.images.length; j++) {
      var image = normalizeImage(theme.images[j], widths);
      if (!image) return null;
      images.push(image);
    }
    themes.push({ id: theme.id, name: theme.name, images: images });
  }
  return {
    version: Number(data.version) || 1,
    base: ASSET_ORIGIN,
    widths: widths,
    formats: formats,
    themes: themes,
  };
}

function normalizeImage(image, fallbackWidths) {
  if (!image || typeof image.id !== "string" || !SLUG.test(image.id)) return null;
  var width = Number(image.width);
  var height = Number(image.height);
  if (!width || !height || width < 1 || height < 1) return null;
  var available = numbers(image.widths);
  if (!available.length) available = fallbackWidths.slice();
  return {
    id: image.id,
    width: width,
    height: height,
    fit: normalizeFit(image.fit),
    objectPosition: normalizePosition(image.objectPosition),
    alt: typeof image.alt === "string" ? image.alt : "",
    credit: typeof image.credit === "string" ? image.credit : "",
    widths: available,
  };
}

function numbers(list) {
  var out = [];
  if (!Array.isArray(list)) return out;
  for (var i = 0; i < list.length; i++) {
    var n = Number(list[i]);
    if (n > 0) out.push(n);
  }
  out.sort(function (a, b) { return a - b; });
  return out;
}
