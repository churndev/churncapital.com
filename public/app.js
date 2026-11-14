(function () {
  "use strict";

  var WIDTHS = [1280, 1920, 2560, 3840];
  var DWELL_MS = 45000;
  var FADE_MS = 1500;
  var STORAGE_KEY = "wallpaper-theme";
  var THEMES = ["florida", "ocean", "mountains", "space", "city"];
  var COUNT = 4;

  function preferredTheme() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (THEMES.indexOf(saved) !== -1) return saved;
    } catch (err) {}
    return "florida";
  }

  function idOf(n) {
    return n < 10 ? "0" + n : String(n);
  }

  var theme = preferredTheme();
  var index = 0;
  var shown = 0;
  var token = 0;
  var timer = 0;
  var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var slides = [
    document.getElementById("slide-a"),
    document.getElementById("slide-b")
  ];
  var select = document.getElementById("theme");
  select.value = theme;

  function srcset(themeName, n, ext) {
    var id = idOf(n);
    var parts = [];
    for (var i = 0; i < WIDTHS.length; i++) {
      var w = WIDTHS[i];
      parts.push("images/" + themeName + "/" + id + "-" + w + "." + ext + " " + w + "w");
    }
    return parts.join(", ");
  }

  function assign(picture, themeName, n) {
    var avif = picture.querySelector('source[type="image/avif"]');
    var webp = picture.querySelector('source[type="image/webp"]');
    var img = picture.querySelector("img");
    avif.sizes = "100vw";
    webp.sizes = "100vw";
    img.sizes = "100vw";
    avif.srcset = srcset(themeName, n, "avif");
    webp.srcset = srcset(themeName, n, "webp");
    img.src = "images/" + themeName + "/" + idOf(n) + "-1920.webp";
    return img;
  }

  function whenReady(img) {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      function ok() { cleanup(); resolve(); }
      function bad() { cleanup(); reject(new Error("image")); }
      function cleanup() {
        img.removeEventListener("load", ok);
        img.removeEventListener("error", bad);
      }
      img.addEventListener("load", ok);
      img.addEventListener("error", bad);
    });
  }

  function clearTimer() {
    clearTimeout(timer);
    timer = 0;
  }

  function schedule(currentToken) {
    clearTimer();
    if (document.hidden) return;
    timer = setTimeout(function () {
      if (currentToken !== token) return;
      go((index + 1) % COUNT, true, 0);
    }, DWELL_MS);
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
      setTimeout(finish, FADE_MS + 250);
    });
  }

  function go(nextIndex, animate, attempt) {
    if (attempt >= COUNT) return;
    var currentToken = ++token;
    clearTimer();
    var incoming = slides[1 - shown];
    var outgoing = slides[shown];
    var img = assign(incoming, theme, nextIndex + 1);
    whenReady(img).then(function () {
      if (currentToken !== token) return;
      shown = 1 - shown;
      index = nextIndex;
      return fadeIn(incoming, outgoing, animate && !motion.matches, currentToken);
    }).then(function () {
      if (currentToken !== token) return;
      schedule(currentToken);
    }).catch(function () {
      if (currentToken !== token) return;
      go((nextIndex + 1) % COUNT, animate, attempt + 1);
    });
  }

  select.addEventListener("change", function () {
    var value = select.value;
    if (THEMES.indexOf(value) === -1 || value === theme) return;
    theme = value;
    try { localStorage.setItem(STORAGE_KEY, value); } catch (err) {}
    go(0, true, 0);
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) clearTimer();
    else schedule(token);
  });

  go(0, false, 0);
})();
