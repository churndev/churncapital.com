# Design

**Standing rule:** Every bot must read this file before working on this repo, and must update it in the same change as any work that affects these decisions.

## Purpose

This repo is the churncapital.com homepage. It shows a full-screen wallpaper and nothing else. The photographs are public domain, stored in the repo, and they rotate on a timer. Two small dropdowns are the only controls: one for the theme, one for how often the photograph changes.

## Layout

The page is a black viewport with two stacked photographs. The visible one uses `object-fit: cover` and `object-position: center`, so portrait phones, tablets, ultrawide monitors, and 4K screens all crop the same image instead of letterboxing it.

The browser tab title is `Churn Capital`. There is no visible heading, logo, body text, favicon, stylesheet beyond the wallpaper and the controls, script from a third party, or tracker.

The controls sit together at the bottom-right, left to right: theme, then interval. Each is a native `<select>` at 38% opacity that becomes fully opaque on its own hover or focus. Both are keyboard accessible. A closed control shows its current option text. That text is the control, not a page headline.

### Wallpaper theme

Visually hidden label: `Wallpaper theme`. Options, in order, are exactly:

1. `Random`
2. `Tropical Florida beaches`
3. `Ocean`
4. `Mountains`
5. `Space`
6. `City`

### How often the wallpaper changes

Visually hidden label: `How often the wallpaper changes`. Options, in order, are exactly:

1. `1 minute`
2. `3 minutes`
3. `5 minutes`
4. `10 minutes`
5. `30 minutes`
6. `1 hour`
7. `Never`

## Themes and the default

The saved value is the `<select>` value, not the label. The key is `wallpaper-theme`. It is written only when the visitor changes the dropdown.

| Value | Label | Photographs |
| --- | --- | --- |
| `random` | Random | All twenty photographs, from every theme below |
| `florida` | Tropical Florida beaches | Florida Keys, Miami Beach, and the Florida Gulf coast |
| `ocean` | Ocean | Pacific coast, Olympic National Park |
| `mountains` | Mountains | Grand Teton, Glacier, and Yosemite |
| `space` | Space | Hubble nebulae, Earth, and Saturn |
| `city` | City | Boston, Denver, Houston, and Philadelphia |

`random` is the first-visit default when `localStorage` has no usable value. A missing or unknown value falls back to `random`. A value saved from an earlier visit, including `florida`, is kept.

Each named theme has four photographs, `01` through `04`. They play in that order and then loop. Choosing a named theme crossfades to photograph `01` of that theme.

Random shuffles all twenty photographs. The deck plays through once. When it is empty it is shuffled again, and the first photograph of the new deck is not the one that just played. Entering Random also starts a new shuffle and does not repeat the photograph already on screen. The closed theme control stays on `Random` while those photographs play.

## Rotation

The interval `<select>` value is saved under `wallpaper-interval`, and only when the visitor changes that dropdown.

| Value | Label | Time the photograph stays fully in place |
| --- | --- | --- |
| `1` | 1 minute | 1 minute |
| `3` | 3 minutes | 3 minutes |
| `5` | 5 minutes | 5 minutes |
| `10` | 10 minutes | 10 minutes |
| `30` | 30 minutes | 30 minutes |
| `60` | 1 hour | 1 hour |
| `never` | Never | Does not change by itself |

`3` is the first-visit default. A missing or unknown value falls back to `3`.

After that wait, the next photograph crossfades in over 1.5 seconds (CSS opacity). The wait starts again after the fade finishes. Changing the interval does not swap the photograph. It restarts the wait with the new duration. `Never` clears the wait.

`Never` leaves the current photograph in place. Choosing another theme still crossfades to the new theme's first photograph, or to a new shuffle when the theme is Random. Automatic rotation stays off until the visitor picks a duration again. Picking a duration then starts the wait from the photograph already on screen.

`prefers-reduced-motion: reduce` turns the fade off. The photograph still changes on the selected interval, instantly. The controls' opacity fade is also turned off. `Never` still does not rotate.

If the tab is hidden, the timer stops. When the tab is visible again, the full wait starts over. `Never` has no timer to restart.

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

Do not add photographs from `github.com/dharmx/walls` (no license) or `github.com/lordofhunger/wallpapers` (personal non-commercial only).

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
- Do not deploy, attach domains, or change DNS in this change. The www redirect already lives in the Cloudflare dashboard, not in this repo.

## Hosting

Production is live at `https://churncapital.com` on the Worker `churncapital-com`.

- Cloudflare static assets. `assets.directory` is `./public`.
- `compatibility_date` `2026-11-14`.
- No Worker script, no `main`, and no assets binding.
- No `routes` and no custom domains in `wrangler.jsonc`. Domains are attached in the Cloudflare dashboard.
- Observability is on: logs at a head sampling rate of 1, traces at 0.01.
- The apex (`churncapital.com`) is production.
- `www.churncapital.com` 301-redirects to `https://churncapital.com`. The Cloudflare Single Redirect rule is named `www to apex`. It keeps the path and query.
- A dev preview host, separate from prod, is not part of this change.

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
| Nov 14 2026 | Default theme changed to Random | Owner changed the first-visit default from Tropical Florida beaches to Random. Random shuffles every theme's photographs and does not repeat the same photograph back to back. |
| Nov 14 2026 | Interval dropdown, 3 minute default | Owner added a control for how often the wallpaper changes. The first-visit default is 3 minutes. |
| Nov 14 2026 | Never stops automatic rotation | Owner added Never as the last interval option. The current photograph stays until the visitor changes the theme. |
| Nov 14 2026 | www redirects to the apex | A Cloudflare Single Redirect rule named "www to apex" 301s www.churncapital.com to https://churncapital.com and keeps the path and query. Production is the Worker churncapital-com. |
| Nov 14 2026 | Rejected unlicensed wallpaper repos | github.com/dharmx/walls has no license, and github.com/lordofhunger/wallpapers is personal non-commercial only. Neither is an image source. |
