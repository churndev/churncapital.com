var SOF = {
  0xc0: 1, 0xc1: 1, 0xc2: 1, 0xc3: 1, 0xc5: 1, 0xc6: 1, 0xc7: 1,
  0xc9: 1, 0xca: 1, 0xcb: 1, 0xcd: 1, 0xce: 1, 0xcf: 1,
};

export function imageDimensions(bytes, contentType) {
  var data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  var type = String(contentType || "");
  if (type === "image/jpeg" || looksLikeJpeg(data)) return jpegSize(data);
  if (type === "image/png" || looksLikePng(data)) return pngSize(data);
  if (type === "image/webp" || looksLikeWebp(data)) return webpSize(data);
  if (type === "image/avif" || looksLikeAvif(data)) return avifSize(data);
  return jpegSize(data) || pngSize(data) || webpSize(data) || avifSize(data);
}

function looksLikeJpeg(data) {
  return data.length > 3 && data[0] === 0xff && data[1] === 0xd8;
}

function looksLikePng(data) {
  return data.length >= 24 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47;
}

function looksLikeWebp(data) {
  return data.length > 16 && ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 4) === "WEBP";
}

function looksLikeAvif(data) {
  return data.length > 12 && ascii(data, 4, 4) === "ftyp";
}

function jpegSize(data) {
  if (!looksLikeJpeg(data)) return null;
  var i = 2;
  var guard = 0;
  while (i + 8 < data.length && guard < 10000) {
    guard++;
    if (data[i] !== 0xff) return null;
    while (data[i] === 0xff && i < data.length) i++;
    if (i >= data.length) return null;
    var marker = data[i++];
    if (marker === 0xd9 || marker === 0xda) return null;
    if (i + 1 >= data.length) return null;
    var length = (data[i] << 8) | data[i + 1];
    if (length < 2 || i + length > data.length) return null;
    if (SOF[marker]) {
      if (length < 7) return null;
      var height = (data[i + 3] << 8) | data[i + 4];
      var width = (data[i + 5] << 8) | data[i + 6];
      return plausible(width, height);
    }
    i += length;
  }
  return null;
}

function pngSize(data) {
  if (!looksLikePng(data)) return null;
  if (ascii(data, 12, 4) !== "IHDR") return null;
  var width = readU32(data, 16);
  var height = readU32(data, 20);
  return plausible(width, height);
}

function webpSize(data) {
  if (!looksLikeWebp(data) || data.length < 30) return null;
  var fourcc = ascii(data, 12, 4);
  if (fourcc === "VP8X") {
    var width = 1 + data[24] + (data[25] << 8) + (data[26] << 16);
    var height = 1 + data[27] + (data[28] << 8) + (data[29] << 16);
    return plausible(width, height);
  }
  if (fourcc === "VP8 ") {
    if (data[23] !== 0x9d || data[24] !== 0x01 || data[25] !== 0x2a) return null;
    var lossyWidth = (data[26] | (data[27] << 8)) & 0x3fff;
    var lossyHeight = (data[28] | (data[29] << 8)) & 0x3fff;
    return plausible(lossyWidth, lossyHeight);
  }
  if (fourcc === "VP8L" && data.length >= 25) {
    if (data[20] !== 0x2f) return null;
    var bits = data[21] | (data[22] << 8) | (data[23] << 16) | (data[24] << 24);
    return plausible((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
  }
  return null;
}

function avifSize(data) {
  var target = [0x69, 0x73, 0x70, 0x65];
  var fallback = null;
  for (var i = 4; i + 16 <= data.length; i++) {
    if (data[i] !== target[0] || data[i + 1] !== target[1] || data[i + 2] !== target[2] || data[i + 3] !== target[3]) continue;
    var size = readU32(data, i - 4);
    var width = readU32(data, i + 8);
    var height = readU32(data, i + 12);
    var dims = plausible(width, height);
    if (!dims) continue;
    if (size === 20) return dims;
    if (!fallback) fallback = dims;
  }
  return fallback;
}

function plausible(width, height) {
  if (!width || !height || width < 1 || height < 1) return null;
  if (width > 100000 || height > 100000) return null;
  return { width: width, height: height };
}

function readU32(data, offset) {
  return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
}

function ascii(data, offset, length) {
  var text = "";
  for (var i = 0; i < length; i++) text += String.fromCharCode(data[offset + i]);
  return text;
}
