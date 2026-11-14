import {
  MANIFEST_URL,
  imageUrl,
  neededWidth,
  parseManifest,
  pickWidth,
} from "./plan.js";

var THEME_KEY = "wallpaper-theme";
var INTERVAL_KEY = "wallpaper-interval";
var SPEED_KEY = "wallpaper-speed";
var INTERVAL_VALUES = ["slideshow", "1", "3", "5", "10", "30", "60", "never"];
var SPEED_VALUES = ["3", "5", "8", "10", "15"];
var MINUTES = {
  "1": 60000,
  "3": 180000,
  "5": 300000,
  "10": 600000,
  "30": 1800000,
  "60": 3600000
};
var SWIPE_PX = 48;
var HISTORY_LIMIT = 40;
var RESIZE_MS = 200;

function save(key, value) {
  try { localStorage.setItem(key, value); } catch (err) {}
}

function readSetting(key, allowed, fallback) {
  try {
    var saved = localStorage.getItem(key);
    if (allowed.indexOf(saved) !== -1) return saved;
  } catch (err) {}
  save(key, fallback);
  return fallback;
}

function copyPhoto(photo) {
  if (!photo) return null;
  return {
    theme: photo.theme,
    id: photo.id,
    width: photo.width,
    height: photo.height,
    fit: photo.fit,
    objectPosition: photo.objectPosition,
    alt: photo.alt,
    widths: photo.widths
  };
}

function samePhoto(a, b) {
  return !!(a && b && a.theme === b.theme && a.id === b.id);
}

function withTheme(themeId, image) {
  return {
    theme: themeId,
    id: image.id,
    width: image.width,
    height: image.height,
    fit: image.fit,
    objectPosition: image.objectPosition,
    alt: image.alt,
    widths: image.widths
  };
}

function photosIn(themeId) {
  if (!manifest) return [];
  for (var i = 0; i < manifest.themes.length; i++) {
    if (manifest.themes[i].id !== themeId) continue;
    return manifest.themes[i].images.map(function (image) {
      return withTheme(themeId, image);
    });
  }
  return [];
}

function allPhotos() {
  var list = [];
  if (!manifest) return list;
  for (var i = 0; i < manifest.themes.length; i++) {
    var themeId = manifest.themes[i].id;
    var images = manifest.themes[i].images;
    for (var j = 0; j < images.length; j++) list.push(withTheme(themeId, images[j]));
  }
  return list;
}

function shuffle(list) {
  for (var i = list.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

var manifest = null;
var deck = [];
var deckAt = 0;
var queued = null;
var history = [];
var cursor = -1;

function refillDeck(avoid) {
  deck = shuffle(allPhotos());
  deckAt = 0;
  if (samePhoto(deck[0], avoid) && deck.length > 1) {
    var j = 1 + Math.floor(Math.random() * (deck.length - 1));
    var tmp = deck[0];
    deck[0] = deck[j];
    deck[j] = tmp;
  }
}

function beginRandom(avoid) {
  queued = null;
  refillDeck(avoid);
  if (!deck.length) return null;
  var photo = copyPhoto(deck[0]);
  deckAt = 1;
  return photo;
}

function namedNext(from) {
  var images = photosIn(theme);
  if (!images.length) return null;
  var index = 0;
  if (from && from.theme === theme) {
    for (var i = 0; i < images.length; i++) {
      if (images[i].id === from.id) {
        index = i + 1 < images.length ? i + 1 : 0;
        break;
      }
    }
  }
  return copyPhoto(images[index]);
}

function peekForward() {
  if (cursor >= 0 && cursor < history.length - 1) return history[cursor + 1];
  if (theme !== "random") return namedNext(current);
  if (!queued) {
    if (deckAt >= deck.length) refillDeck(current);
    if (!deck.length) return null;
    queued = copyPhoto(deck[deckAt]);
    deckAt++;
  }
  return queued;
}

function takeForward() {
  var photo = peekForward();
  if (!photo) return null;
  var replaying = cursor >= 0 && cursor < history.length - 1;
  if (!replaying && queued && samePhoto(queued, photo)) queued = null;
  return copyPhoto(photo);
}

function remember(photo) {
  if (!photo) return;
  if (cursor >= 0 && samePhoto(history[cursor], photo)) return;
  if (cursor + 1 < history.length && samePhoto(history[cursor + 1], photo)) {
    cursor++;
    return;
  }
  if (cursor > 0 && samePhoto(history[cursor - 1], photo)) {
    cursor--;
    return;
  }
  history = history.slice(0, cursor + 1);
  history.push(copyPhoto(photo));
  cursor = history.length - 1;
  if (history.length > HISTORY_LIMIT) {
    history.shift();
    cursor--;
  }
}

var interval = readSetting(INTERVAL_KEY, INTERVAL_VALUES, "slideshow");
var speed = readSetting(SPEED_KEY, SPEED_VALUES, "5");
var theme = "random";
var current = null;
var shown = 0;
var token = 0;
var timer = 0;
var widthBucket = 0;
var resizeTimer = 0;
var gesture = null;
var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
var slides = [
  document.getElementById("slide-a"),
  document.getElementById("slide-b")
];
var themeSelect = document.getElementById("theme");
var intervalSelect = document.getElementById("interval");
var speedSelect = document.getElementById("speed");
var speedControl = document.getElementById("speed-control");
intervalSelect.value = interval;
speedSelect.value = speed;

function chosenWidth(photo) {
  var need = neededWidth(
    window.innerWidth,
    window.innerHeight,
    window.devicePixelRatio || 1,
    photo.width,
    photo.height,
    photo.fit
  );
  return pickWidth(need, photo.widths);
}

function fadeMs() {
  return interval === "slideshow" ? 1000 : 1500;
}

function applyFade() {
  document.documentElement.style.setProperty("--fade", fadeMs() + "ms");
}

function dwellMs() {
  if (interval === "slideshow") return Number(speed) * 1000;
  if (interval === "never") return 0;
  return MINUTES[interval] || 0;
}

function syncSpeedControl() {
  speedControl.hidden = interval !== "slideshow";
}

function clearPicture(picture) {
  var sources = picture.querySelectorAll("source");
  for (var i = 0; i < sources.length; i++) sources[i].removeAttribute("srcset");
  picture.querySelector("img").removeAttribute("src");
}

function loadPhoto(picture, photo) {
  var w = chosenWidth(photo);
  var formats = manifest.formats || [];
  var avifUrl = formats.indexOf("avif") !== -1 ? imageUrl(manifest.base, photo.theme, photo.id, w, "avif") : "";
  var webpUrl = formats.indexOf("webp") !== -1 ? imageUrl(manifest.base, photo.theme, photo.id, w, "webp") : "";
  var imgUrl = webpUrl || avifUrl;
  var avif = picture.querySelector('source[type="image/avif"]');
  var webp = picture.querySelector('source[type="image/webp"]');
  var img = picture.querySelector("img");
  img.alt = photo.alt || "";
  img.style.objectFit = photo.fit === "contain" ? "contain" : "cover";
  img.style.objectPosition = photo.objectPosition || "50% 50%";
  function ready() {
    return img.getAttribute("src") === imgUrl && img.complete && img.naturalWidth > 0;
  }
  if (ready() && avif.getAttribute("srcset") === (avifUrl || null) && webp.getAttribute("srcset") === (webpUrl || null)) {
    return Promise.resolve();
  }
  return new Promise(function (resolve, reject) {
    function ok() {
      if (!ready()) return;
      cleanup();
      resolve();
    }
    function bad() { cleanup(); reject(new Error("image")); }
    function cleanup() {
      img.removeEventListener("load", ok);
      img.removeEventListener("error", bad);
    }
    img.addEventListener("load", ok);
    img.addEventListener("error", bad);
    if (avifUrl) avif.srcset = avifUrl;
    else avif.removeAttribute("srcset");
    if (webpUrl) webp.srcset = webpUrl;
    else webp.removeAttribute("srcset");
    if (img.getAttribute("src") !== imgUrl) img.src = imgUrl;
    if (ready()) ok();
  });
}

function clearTimer() {
  clearTimeout(timer);
  timer = 0;
}

function schedule(currentToken) {
  clearTimer();
  if (document.hidden) return;
  var ms = dwellMs();
  if (!ms) return;
  timer = setTimeout(function () {
    if (currentToken !== token) return;
    go(takeForward(), true, 0);
  }, ms);
}

function hideOutgoing(outgoing) {
  outgoing.classList.add("instant");
  outgoing.classList.remove("is-on");
  outgoing.style.zIndex = "0";
  void outgoing.offsetWidth;
  outgoing.classList.remove("instant");
}

function fadeIn(incoming, outgoing, animate, currentToken) {
  if (!animate) {
    incoming.classList.add("instant");
    incoming.classList.add("is-on");
    incoming.style.zIndex = "1";
    if (currentToken === token) hideOutgoing(outgoing);
    void incoming.offsetWidth;
    incoming.classList.remove("instant");
    return Promise.resolve();
  }
  incoming.classList.add("instant");
  incoming.classList.remove("is-on");
  void incoming.offsetWidth;
  incoming.classList.remove("instant");
  incoming.style.zIndex = "2";
  void incoming.offsetWidth;
  incoming.classList.add("is-on");
  return new Promise(function (resolve) {
    var settled = false;
    function finish() {
      if (settled) return;
      settled = true;
      incoming.removeEventListener("transitionend", onEnd);
      if (currentToken !== token) {
        resolve();
        return;
      }
      incoming.style.zIndex = "1";
      hideOutgoing(outgoing);
      resolve();
    }
    function onEnd(event) {
      if (event.propertyName !== "opacity") return;
      finish();
    }
    incoming.addEventListener("transitionend", onEnd);
    setTimeout(finish, fadeMs() + 250);
  });
}

function preloadAhead() {
  var photo = peekForward();
  if (!photo) return;
  loadPhoto(slides[1 - shown], photo).catch(function () {});
}

function go(photo, animate, attempt) {
  if (!photo || attempt >= 20) return;
  var currentToken = ++token;
  clearTimer();
  applyFade();
  var incoming = slides[1 - shown];
  var outgoing = slides[shown];
  loadPhoto(incoming, photo).then(function () {
    if (currentToken !== token) return;
    shown = 1 - shown;
    current = copyPhoto(photo);
    remember(current);
    return fadeIn(incoming, outgoing, animate && !motion.matches, currentToken);
  }).then(function () {
    if (currentToken !== token) return;
    widthBucket = chosenWidth(current);
    preloadAhead();
    schedule(currentToken);
  }).catch(function () {
    if (currentToken !== token) return;
    clearPicture(incoming);
    if (cursor >= 0 && cursor < history.length - 1 && samePhoto(history[cursor + 1], photo)) cursor++;
    if (queued && samePhoto(queued, photo)) queued = null;
    go(takeForward(), animate, attempt + 1);
  });
}

function manual(direction) {
  if (direction < 0) {
    if (cursor <= 0) return;
    go(history[cursor - 1], true, 0);
    return;
  }
  go(takeForward(), true, 0);
}

function buildThemes() {
  var names = ["random"];
  themeSelect.replaceChildren();
  var random = document.createElement("option");
  random.value = "random";
  random.textContent = "Random";
  themeSelect.appendChild(random);
  for (var i = 0; i < manifest.themes.length; i++) {
    var themeInfo = manifest.themes[i];
    names.push(themeInfo.id);
    var option = document.createElement("option");
    option.value = themeInfo.id;
    option.textContent = themeInfo.name;
    themeSelect.appendChild(option);
  }
  theme = readSetting(THEME_KEY, names, "random");
  themeSelect.value = theme;
}

function firstOf(themeId) {
  var images = photosIn(themeId);
  return images.length ? copyPhoto(images[0]) : null;
}

function reloadSize() {
  if (!current || !manifest) return;
  var next = chosenWidth(current);
  if (!next || next === widthBucket) return;
  var photo = copyPhoto(current);
  var tokenAt = token;
  var incoming = slides[1 - shown];
  var outgoing = slides[shown];
  loadPhoto(incoming, photo).then(function () {
    if (tokenAt !== token || !samePhoto(current, photo)) return;
    shown = 1 - shown;
    widthBucket = next;
    fadeIn(incoming, outgoing, false, tokenAt);
    preloadAhead();
  }).catch(function () {});
}

function scheduleResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(reloadSize, RESIZE_MS);
}

themeSelect.addEventListener("change", function () {
  var value = themeSelect.value;
  if (!manifest || value === theme) return;
  var known = value === "random";
  for (var i = 0; i < manifest.themes.length; i++) {
    if (manifest.themes[i].id === value) known = true;
  }
  if (!known) return;
  theme = value;
  save(THEME_KEY, value);
  var photo = value === "random" ? beginRandom(current) : firstOf(value);
  go(photo, true, 0);
});

intervalSelect.addEventListener("change", function () {
  var value = intervalSelect.value;
  if (INTERVAL_VALUES.indexOf(value) === -1 || value === interval) return;
  interval = value;
  save(INTERVAL_KEY, value);
  applyFade();
  syncSpeedControl();
  schedule(token);
});

speedSelect.addEventListener("change", function () {
  var value = speedSelect.value;
  if (SPEED_VALUES.indexOf(value) === -1 || value === speed) return;
  speed = value;
  save(SPEED_KEY, value);
  if (interval === "slideshow") schedule(token);
});

document.addEventListener("keydown", function (event) {
  if (event.repeat) return;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  var active = document.activeElement;
  if (active && active.tagName === "SELECT") return;
  event.preventDefault();
  manual(event.key === "ArrowLeft" ? -1 : 1);
});

document.addEventListener("pointerdown", function (event) {
  if (event.pointerType === "mouse" || event.isPrimary === false || gesture) return;
  if (event.target.closest && event.target.closest(".controls")) return;
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
});

document.addEventListener("pointerup", function (event) {
  if (!gesture || event.pointerId !== gesture.id) return;
  var dx = event.clientX - gesture.x;
  var dy = event.clientY - gesture.y;
  gesture = null;
  if (Math.abs(dx) < SWIPE_PX) return;
  if (Math.abs(dx) < Math.abs(dy) * 1.25) return;
  manual(dx < 0 ? 1 : -1);
});

document.addEventListener("pointercancel", function (event) {
  if (gesture && event.pointerId === gesture.id) gesture = null;
});

document.addEventListener("visibilitychange", function () {
  if (document.hidden) clearTimer();
  else schedule(token);
});

window.addEventListener("resize", scheduleResize);
window.addEventListener("orientationchange", scheduleResize);

applyFade();
syncSpeedControl();

fetch(MANIFEST_URL).then(function (response) {
  if (!response.ok) throw new Error("manifest");
  return response.json();
}).then(function (data) {
  var parsed = parseManifest(data);
  if (!parsed || !allPhotosFrom(parsed).length) throw new Error("manifest");
  manifest = parsed;
  buildThemes();
  go(theme === "random" ? beginRandom(null) : firstOf(theme), false, 0);
}).catch(function () {
  manifest = null;
});

function allPhotosFrom(parsed) {
  var count = 0;
  for (var i = 0; i < parsed.themes.length; i++) count += parsed.themes[i].images.length;
  return count ? parsed.themes : [];
}
