# Design

**Standing rule:** Every bot must read this file before working on this repo, and must update it in the same change as any work that affects these decisions.

## Purpose

This repo is the churncapital.com homepage. It shows a full-screen wallpaper and nothing else. The photographs are public domain, stored in the repo, and they rotate on a timer. A small theme dropdown is the only control.

## Layout

The page is a black viewport with two stacked photographs. The visible one uses `object-fit: cover` and `object-position: center`, so portrait phones, tablets, ultrawide monitors, and 4K screens all crop the same image instead of letterboxing it.

The browser tab title is `Churn Capital`. There is no visible heading, logo, body text, favicon, stylesheet beyond the wallpaper and the control, script from a third party, or tracker.

The only control is a native `<select>` fixed to the bottom-right. It sits at 38% opacity and becomes fully opaque on hover or focus. It is keyboard accessible. Its visually hidden label is `Wallpaper theme`. The options, in order, are exactly:

1. `Tropical Florida beaches`
2. `Ocean`
3. `Mountains`
4. `Space`
5. `City`

The closed control shows the current option text. That text is the theme control, not a page headline.

## Themes and the default

The saved value is the `<select>` value, not the label.

| Value | Label | Photographs |
| --- | --- | --- |
| `florida` | Tropical Florida beaches | Florida Keys, Miami Beach, and the Florida Gulf coast |
| `ocean` | Ocean | Pacific coast, Olympic National Park |
| `mountains` | Mountains | Grand Teton, Glacier, and Yosemite |
| `space` | Space | Hubble nebulae, Earth, and Saturn |
| `city` | City | Boston, Denver, Houston, and Philadelphia |

`florida` is the first-visit default when `localStorage` has no usable value. The key is `wallpaper-theme`. A missing or unknown value falls back to `florida`. The key is written only when the visitor changes the dropdown.

Each theme has four photographs, `01` through `04`. They play in that order and then loop.

## Rotation

Each photograph stays fully in place for 45 seconds. The next one then crossfades in over 1.5 seconds (CSS opacity). The 45-second wait starts again after the fade finishes.

`prefers-reduced-motion: reduce` turns the fade off. The photograph still changes on the same 45-second interval, instantly. The dropdown's opacity fade is also turned off.

If the tab is hidden, the timer stops. When the tab is visible again, the 45-second wait starts over. Changing the theme crossfades (or cuts, under reduced motion) to photograph `01` of the new theme and restarts the wait.

The next photograph is loaded into the hidden layer before it is shown. A file that fails to load is skipped.

## Images

Runtime requests stay on this site. There is no hotlinking and no analytics.

The browser chooses a file with a `<picture>` element: AVIF, then WebP. Each type has a `srcset` of 1280, 1920, 2560, and 3840 pixel widths and `sizes="100vw"`, so the browser can account for viewport width and device pixel ratio. The `<img>` fallback is the 1920 WebP. `alt` is empty because the photographs are decorative.

Every master used for encoding is at least 3840 pixels wide, so none of those widths is an upscale. Scaling is Lanczos. AVIF is SVT-AV1 CRF 36, preset 8. WebP is quality 75. Nothing is cropped, recolored, or overlaid. Square frames (Earth, the Bubble Nebula) are left square and cropped by `object-fit`.

Files:

`public/images/<theme>/<id>-<width>.avif`
`public/images/<theme>/<id>-<width>.webp`

`<theme>` is `florida`, `ocean`, `mountains`, `space`, or `city`. `<id>` is `01`–`04`. `<width>` is `1280`, `1920`, `2560`, or `3840`.

## Licensing

Only public-domain photographs are used. CC BY, CC BY-SA, Unsplash, and Pexels are not used. Public domain does not require on-page attribution, so the homepage does not show a credit line or a credits link.

`CREDITS.md` at the repo root lists every photograph: source URL, author, license, and what was changed. It is not in the served directory.

## Files

Served from `public/` (the Worker assets directory):

- `public/index.html`
- `public/styles.css`
- `public/app.js`
- `public/images/` as named above (160 files: 5 themes, 4 photographs, 4 widths, AVIF and WebP)

Not served:

- `README.md` — unchanged, the single line `# churncapital.com`
- `docs/DESIGN.md` — this file
- `CREDITS.md`
- `wrangler.jsonc`
- `.gitignore`

There is no framework and no build step. The page is plain HTML, CSS, and a small script.

## Non-goals

- Do not mention or link the trading app, and do not name any of its hosts.
- No analytics, trackers, third-party requests, visible marketing text, logo, or favicon.
- Do not deploy, attach domains, or change DNS in the change that introduced this page.

## Planned hosting

Not deployed in this change. `wrangler.jsonc` is only the config for a later deploy:

- Worker name `churncapital-com`.
- `compatibility_date` `2026-11-14`.
- `assets.directory` is `./public`.
- No Worker script, no `main`, and no assets binding.
- No `routes` and no custom domains in the file. Domains are attached in the Cloudflare dashboard.
- Observability is on: logs at a head sampling rate of 1, traces at 0.01.

When someone does deploy:

- Serve the site as Cloudflare static assets on zone `churncapital.com`.
- The apex (`churncapital.com`) is production.
- `www` redirects to the apex.
- Keep a dev preview host, separate from prod.

Do not touch the apex's iCloud+ mail DNS records: MX, SPF TXT, apple-domain TXT, and `sig1._domainkey` CNAME.

## Decision log

| Date | Decision | Reason |
| --- | --- | --- |
| Nov 14 2026 | Clean and minimal | Owner chose a clean and minimal look for the homepage. |
| Nov 14 2026 | Don't mention the trading app | Owner asked that the public site not mention or link the trading app. |
| Nov 14 2026 | Start with a literally blank page | Owner paused a fuller landing-page design and asked to start from a blank page with nothing on it. |
| Nov 14 2026 | Rotating free HD wallpaper with a theme dropdown | Owner asked for a wallpaper that changes every so often, free high-definition images, and a subtle dropdown to change the theme. |
| Nov 14 2026 | Default theme is Tropical Florida beaches | Owner set the first-visit default, when nothing is saved in localStorage, to Tropical Florida beaches, using real Florida beach photographs. |
| Nov 14 2026 | Workers static assets config, not a deploy | Owner approved a minimal Cloudflare Workers static-assets config for a later production deploy. This change does not deploy and does not attach routes or custom domains. |
