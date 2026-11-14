(function () {
  "use strict";

  var WIDTHS = [1280, 1920, 2560, 3840];
  var FADE_MS = 1500;
  var THEME_KEY = "wallpaper-theme";
  var INTERVAL_KEY = "wallpaper-interval";
  var THEME_NAMES = ["florida", "ocean", "mountains", "space", "city"];
  var THEMES = ["random"].concat(THEME_NAMES);
  var COUNT = 4;
  var INTERVALS = {
    "1": 60000,
    "3": 180000,
    "5": 300000,
    "10": 600000,
    "30": 1800000,
    "60": 3600000,
    "never": 0
  };

  function stored(key, allowed, fallback) {
    try {
      var saved = localStorage.getItem(key);
      if (allowed.indexOf(saved) !== -1) return saved;
    } catch (err) {}
    return fallback;
  }

  function idOf(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function samePhoto(a, b) {
    return !!(a && b && a.theme === b.theme && a.n === b.n);
  }

  function allPhotos() {
    var list = [];
    for (var t = 0; t < THEME_NAMES.length; t++) {
      for (var n = 1; n <= COUNT; n++) list.push({ theme: THEME_NAMES[t], n: n });
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

  var deck = [];
  var deckAt = 0;

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

  function takeRandom(avoid) {
    if (deckAt >= deck.length) refillDeck(avoid);
    return deck[deckAt++];
  }

  function beginRandom(avoid) {
    refillDeck(avoid);
    return deck[deckAt++];
  }

  var theme = stored(THEME_KEY, THEMES, "random");
  var interval = stored(INTERVAL_KEY, Object.keys(INTERVALS), "3");
  var current = null;
  var shown = 0;
  var token = 0;
  var timer = 0;
  var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var slides = [
    document.getElementById("slide-a"),
    document.getElementById("slide-b")
  ];
  var themeSelect = document.getElementById("theme");
  var intervalSelect = document.getElementById("interval");
  themeSelect.value = theme;
  intervalSelect.value = interval;

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

  function nextPhoto() {
    if (theme === "random") return takeRandom(current);
    var n = current.n >= COUNT ? 1 : current.n + 1;
    return { theme: theme, n: n };
  }

  function nextAfter(photo) {
    if (theme === "random") return takeRandom(photo);
    var n = photo.n >= COUNT ? 1 : photo.n + 1;
    return { theme: theme, n: n };
  }

  function schedule(currentToken) {
    clearTimer();
    if (document.hidden) return;
    var ms = INTERVALS[interval];
    if (!ms) return;
    timer = setTimeout(function () {
      if (currentToken !== token) return;
      go(nextPhoto(), true, 0);
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
      setTimeout(finish, FADE_MS + 250);
    });
  }

  function go(photo, animate, attempt) {
    if (attempt >= 20) return;
    var currentToken = ++token;
    clearTimer();
    var incoming = slides[1 - shown];
    var outgoing = slides[shown];
    var img = assign(incoming, photo.theme, photo.n);
    whenReady(img).then(function () {
      if (currentToken !== token) return;
      shown = 1 - shown;
      current = photo;
      return fadeIn(incoming, outgoing, animate && !motion.matches, currentToken);
    }).then(function () {
      if (currentToken !== token) return;
      schedule(currentToken);
    }).catch(function () {
      if (currentToken !== token) return;
      go(nextAfter(photo), animate, attempt + 1);
    });
  }

  themeSelect.addEventListener("change", function () {
    var value = themeSelect.value;
    if (THEMES.indexOf(value) === -1 || value === theme) return;
    theme = value;
    try { localStorage.setItem(THEME_KEY, value); } catch (err) {}
    var photo = value === "random" ? beginRandom(current) : { theme: value, n: 1 };
    go(photo, true, 0);
  });

  intervalSelect.addEventListener("change", function () {
    var value = intervalSelect.value;
    if (!Object.prototype.hasOwnProperty.call(INTERVALS, value) || value === interval) return;
    interval = value;
    try { localStorage.setItem(INTERVAL_KEY, value); } catch (err) {}
    schedule(token);
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) clearTimer();
    else schedule(token);
  });

  go(theme === "random" ? beginRandom(null) : { theme: theme, n: 1 }, false, 0);
})();
