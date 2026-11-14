import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { createNodeCodecs } from "./node-codecs.js";

const manifest = JSON.parse(readFileSync(new URL("./fixtures/manifest.json", import.meta.url), "utf8"));
const shots = "/opt/cursor/artifacts";

const viewports = [
  { name: "phone-portrait-390x844", width: 390, height: 844, dpr: 3, expectWidth: 3840 },
  { name: "phone-landscape-844x390", width: 844, height: 390, dpr: 3, expectWidth: 2560 },
  { name: "tablet-768x1024", width: 768, height: 1024, dpr: 2, expectWidth: 3840 },
  { name: "tablet-1024x768", width: 1024, height: 768, dpr: 2, expectWidth: 2560 },
  { name: "desktop-1920x1080", width: 1920, height: 1080, dpr: 1, expectWidth: 1920 },
  { name: "desktop-2560x1440", width: 2560, height: 1440, dpr: 1, expectWidth: 2560 },
];

async function openPage(browser, viewport, theme, body = manifest) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.dpr,
  });
  const page = await context.newPage();
  const hosts = new Set();
  page.on("request", (request) => hosts.add(new URL(request.url()).hostname));
  await page.addInitScript((saved) => {
    localStorage.setItem("wallpaper-theme", saved);
    localStorage.setItem("wallpaper-interval", "never");
    localStorage.setItem("wallpaper-speed", "5");
  }, theme);
  await page.route("https://assets.churncapital.com/home/manifest.json", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "http://127.0.0.1:4173", "cache-control": "public, max-age=60" },
      body: JSON.stringify(body),
    });
  });
  await page.goto("http://127.0.0.1:4173/");
  return { context, page, hosts };
}

async function topSlide(page) {
  return page.evaluate(() => {
    const slides = Array.from(document.querySelectorAll(".slide.is-on"));
    slides.sort((a, b) => Number(getComputedStyle(a).zIndex) - Number(getComputedStyle(b).zIndex));
    const slide = slides[slides.length - 1];
    const img = slide ? slide.querySelector("img") : null;
    if (!img) return { src: "", fit: "", position: "", width: 0, height: 0, naturalWidth: 0 };
    const style = getComputedStyle(img);
    const box = img.getBoundingClientRect();
    return {
      src: img.currentSrc || "",
      fit: style.objectFit,
      position: style.objectPosition,
      width: box.width,
      height: box.height,
      naturalWidth: img.naturalWidth,
    };
  });
}

test("manifest failure leaves a dark page and no image request", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const page = await context.newPage();
  await page.route("https://assets.churncapital.com/home/manifest.json", (route) => route.abort());
  await page.goto("http://127.0.0.1:4173/");
  await page.waitForTimeout(400);
  await expect(page.locator("img[src]")).toHaveCount(0);
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe("rgb(0, 0, 0)");
  await page.screenshot({ path: `${shots}/manifest-failure.png` });
  await context.close();
});

for (const viewport of viewports) {
  test(`${viewport.name} covers the screen with the width the picker chose`, async ({ browser }) => {
    const { context, page, hosts } = await openPage(browser, viewport, "florida");
    await expect.poll(async () => (await topSlide(page)).src).toContain(`/florida/01-${viewport.expectWidth}.`);
    await expect.poll(async () => (await topSlide(page)).naturalWidth).toBeGreaterThan(0);
    const shown = await topSlide(page);
    expect(shown.fit).toBe("cover");
    expect(shown.position).toContain("50%");
    expect(shown.width).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(shown.height).toBeGreaterThanOrEqual(viewport.height - 1);
    const labels = await page.locator("#theme option").allTextContents();
    expect(labels).toEqual(["Random", "Florida", "Ocean", "Mountains", "Space", "City"]);
    for (const host of hosts) {
      expect(["127.0.0.1", "localhost", "assets.churncapital.com"]).toContain(host);
    }
    await page.screenshot({ path: `${shots}/${viewport.name}.png` });
    await context.close();
  });
}

test("contain letterboxes on black and a manual next slide uses the manifest crop", async ({ browser }) => {
  const { context, page } = await openPage(browser, { width: 1920, height: 1080, dpr: 1 }, "space");
  await expect.poll(async () => (await topSlide(page)).src).toContain("/space/01-");
  await expect.poll(async () => (await topSlide(page)).fit).toBe("cover");
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await topSlide(page)).src).toContain("/space/02-1280.");
  await expect.poll(async () => (await topSlide(page)).naturalWidth).toBeGreaterThan(0);
  await expect.poll(async () => (await topSlide(page)).fit).toBe("contain");
  await expect.poll(async () => (await topSlide(page)).position).toContain("50%");
  await expect.poll(async () => page.locator(".slide.is-on").count()).toBe(1);
  await page.screenshot({ path: `${shots}/contain-desktop-1920x1080.png` });
  await context.close();
});

test("contain on a phone and a solid swatch stays centered", async ({ browser }) => {
  const codecs = await createNodeCodecs();
  const pixels = new Uint8ClampedArray(64 * 64 * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 220;
    pixels[i + 3] = 255;
  }
  const redAvif = Buffer.from(await codecs.encode({ data: pixels, width: 64, height: 64 }, "avif"));
  const redWebp = Buffer.from(await codecs.encode({ data: pixels, width: 64, height: 64 }, "webp"));
  const swatch = {
    version: 1,
    base: "https://assets.churncapital.com",
    widths: [64],
    formats: ["avif", "webp"],
    themes: [{
      id: "swatch",
      name: "Swatch",
      images: [{
        id: "01",
        width: 64,
        height: 64,
        fit: "contain",
        objectPosition: "50% 50%",
        alt: "Red swatch",
        credit: "",
        widths: [64],
      }],
    }],
  };
  const context = await browser.newContext({ viewport: { width: 800, height: 400 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("wallpaper-theme", "swatch");
    localStorage.setItem("wallpaper-interval", "never");
  });
  await page.route("https://assets.churncapital.com/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("manifest.json")) {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(swatch) });
      return;
    }
    if (url.endsWith(".avif")) {
      route.fulfill({ status: 200, contentType: "image/avif", body: redAvif });
      return;
    }
    route.fulfill({ status: 200, contentType: "image/webp", body: redWebp });
  });
  await page.goto("http://127.0.0.1:4173/");
  await expect.poll(async () => (await topSlide(page)).src).toContain("/swatch/01-64.");
  await expect.poll(async () => (await topSlide(page)).naturalWidth).toBeGreaterThan(0);
  await expect.poll(async () => (await topSlide(page)).fit).toBe("contain");
  await page.screenshot({ path: `${shots}/contain-swatch.png` });
  const png = PNG.sync.read(readFileSync(`${shots}/contain-swatch.png`));
  const pixel = (x, y) => {
    const i = (y * png.width + x) * 4;
    return [png.data[i], png.data[i + 1], png.data[i + 2]];
  };
  const corner = pixel(2, 2);
  const center = pixel(Math.floor(png.width / 2), Math.floor(png.height / 2));
  expect(corner[0] + corner[1] + corner[2]).toBeLessThan(30);
  expect(center[0]).toBeGreaterThan(150);
  expect(center[1]).toBeLessThan(80);
  await context.close();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const phonePage = await phone.newPage();
  await phonePage.addInitScript(() => {
    localStorage.setItem("wallpaper-theme", "space");
    localStorage.setItem("wallpaper-interval", "never");
  });
  await phonePage.route("https://assets.churncapital.com/home/manifest.json", (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(manifest) });
  });
  await phonePage.goto("http://127.0.0.1:4173/");
  await expect.poll(async () => (await topSlide(phonePage)).src).toContain("/space/01-");
  await phonePage.keyboard.press("ArrowRight");
  await expect.poll(async () => (await topSlide(phonePage)).src).toContain("/space/02-1280.");
  await expect.poll(async () => (await topSlide(phonePage)).naturalWidth).toBeGreaterThan(0);
  await expect.poll(async () => (await topSlide(phonePage)).fit).toBe("contain");
  await expect.poll(async () => phonePage.locator(".slide.is-on").count()).toBe(1);
  await phonePage.screenshot({ path: `${shots}/contain-phone-390x844.png` });
  await phone.close();
});

test("resize picks a new width after the debounce", async ({ browser }) => {
  const { context, page } = await openPage(browser, { width: 800, height: 600, dpr: 1 }, "florida");
  await expect.poll(async () => (await topSlide(page)).src).toContain("/florida/01-960.");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(async () => (await topSlide(page)).src, { timeout: 10000 }).toContain("/florida/01-1920.");
  await context.close();
});
