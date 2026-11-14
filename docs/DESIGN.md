# Design

**Standing rule.** Every change starts by reading this file and `README.md`. On every feature change, rewrite both so they describe the code as it is. Rewrite the How it works summary at the top of `README.md` in the same pull request whenever anything about how the system works changes. Do not append a note instead of editing the parts that are now wrong.

The summary of the buckets, the manual upload, the disabled drop-in, caching, and rollback is in `README.md`. This file is the page.

## Purpose

The page is a full-screen photograph and nothing else. The photographs are public domain and are served from R2, not from this repo. They can advance on their own, or the visitor can move to the previous or next photograph. The only on-page controls are the dropdowns for theme, interval, and, during a slide show, speed.

If the manifest cannot be loaded, or it has no photographs, or its `base` is not `https://assets.churncapital.com`, the screen stays black. No image address is set, so there is no broken-image icon.

## Layout

The page is a black viewport with two stacked photographs. The black is also the letterbox color.

`cover` fills the viewport and crops. `contain` fits the whole photograph and leaves black around it. Neither stretches the photograph. The focal point is the manifest's `objectPosition`, or `50% 50%` when that value is missing or not two percentages. A `fit` other than `contain` is `cover`.

The browser tab title is `Churn Capital`. There is no visible heading, body text, logo on the page, stylesheet beyond the wallpaper and the controls, script from a third party, or tracker. The site icon is only the browser and home-screen icon, loaded from R2.

The controls sit together at the bottom-right, left to right: theme, interval, then slide speed when it is shown. Each is a native `<select>` at 38% opacity that becomes fully opaque on its own hover or focus. They are keyboard accessible. A closed control shows its current option text. That text is the control, not a page headline.

### Wallpaper theme

Visually hidden label: `Wallpaper theme`. The options are built from the manifest when it loads. The first option is always `Random`. Each following option is that theme's `name`, in manifest order. The saved value is the theme `id`, not the label.

The live manifest, in order, is:

1. `Random` (`random`)
2. `Florida` (`florida`)
3. `Ocean` (`ocean`)
4. `Mountains` (`mountains`)
5. `Space` (`space`)
6. `City` (`city`)

A theme added in the manifest appears at the end, with the folder slug as its id and a title-cased name, unless that id already exists.

### How often the wallpaper changes

Visually hidden label: `How often the wallpaper changes`. Options, in order, are exactly:

1. `Slide Show`
2. `1 minute`
3. `3 minutes`
4. `5 minutes`
5. `10 minutes`
6. `30 minutes`
7. `1 hour`
8. `Never`

### Slide speed

Visually hidden label: `Slide speed`. The control is shown only while the interval is `Slide Show`. Options, in order, are exactly:

1. `3 seconds`
2. `5 seconds`
3. `8 seconds`
4. `10 seconds`
5. `15 seconds`

## Themes and the default

The saved value is the `<select>` value, not the label.

`random` is the out-of-the-box theme when `wallpaper-theme` is missing or unknown, including when a saved id is no longer in the manifest. A saved value that is still in the manifest is kept.

Forward motion plays the photographs of a named theme in manifest order and then loops. Choosing a named theme crossfades to the first photograph of that theme.

Random shuffles every photograph in the manifest. The deck plays through once. When it is empty it is shuffled again, and the first photograph of the new deck is not the one that just played. Entering Random also starts a new shuffle and does not repeat the photograph already on screen. The closed theme control stays on `Random` while those photographs play.

## Rotation

Three keys are saved in `localStorage`: `wallpaper-theme`, `wallpaper-interval`, and `wallpaper-speed`. A missing or unknown value is replaced with the out-of-the-box default and saved. A saved value that is still valid is kept, including an older interval such as `3` (3 minutes).

| Value | Label | Time the photograph stays fully in place |
| --- | --- | --- |
| `slideshow` | Slide Show | The selected slide speed |
| `1` | 1 minute | 1 minute |
| `3` | 3 minutes | 3 minutes |
| `5` | 5 minutes | 5 minutes |
| `10` | 10 minutes | 10 minutes |
| `30` | 30 minutes | 30 minutes |
| `60` | 1 hour | 1 hour |
| `never` | Never | Does not change by itself |

Out of the box, with nothing saved: theme `random`, interval `slideshow`, speed `5`.

`Slide Show` uses `wallpaper-speed`. The speed values are `3`, `5`, `8`, `10`, and `15` (seconds). The out-of-the-box speed is `5`.

After the wait, the next photograph crossfades. The crossfade is 1 second during `Slide Show` and 1.5 seconds otherwise. The wait starts again after the fade finishes. Changing the interval or the speed does not swap the photograph. It restarts the wait. `Never` clears the wait. A resize that only changes which file width is loaded does not restart the wait.

`Never` leaves the current photograph in place. Choosing another theme, or moving previous or next, still changes the photograph. Automatic rotation stays off until the visitor picks a duration again. Picking a duration then starts the wait from the photograph already on screen.

`prefers-reduced-motion: reduce` turns the fade off. The photograph still changes on the selected interval, instantly. The controls' opacity fade is also turned off. `Never` still does not rotate on its own.

If the tab is hidden, the timer stops. When the tab is visible again, the full wait starts over. `Never` has no timer to restart.

The next photograph is loaded into the hidden layer as soon as the current one is shown, at one width only, so the change does not flash blank. A file that fails to load is skipped, and its address is cleared so it is not shown broken.

## Manual navigation

The Left arrow and a rightward swipe show the previous photograph. The Right arrow and a leftward swipe show the next photograph. A swipe counts only when the finger, or pen, moves at least 48 pixels horizontally and that movement is greater than the vertical movement. A mostly vertical gesture does nothing. Mouse dragging does not change the photograph. Arrow keys do nothing while a dropdown has focus, and a held key does not repeat.

Next follows the current theme's order, or the Random deck. Previous walks back through the photographs that were actually shown, including under Random and across a theme change. Moving forward again after going back returns those same photographs until the end of that history, and only then continues the order. There is no previous photograph before the first one shown. A move that changes the photograph restarts the auto timer after the fade. Left at the start of the history does not.

## Images

The page fetches `https://assets.churncapital.com/home/manifest.json` and builds the slides from it. Image URL is `${base}/images/${theme}/${id}-${width}.${format}`. The width formula, the ladder, and the caching are in `README.md`.

`alt` is the manifest's `alt`. `credit` is not shown.

The width is chosen again, after a 200ms debounce, on resize and on orientation change.

## Site icon

An original mark drawn for this site: a deep-teal field, a warm-sand sun disc split by a horizon, and a palm-tree silhouette over the disc. It is drawn to stay recognizable at 16 pixels. There is no third-party artwork.

The files are on R2, not in the repo:

- `https://assets.churncapital.com/icons/favicon.svg`
- `https://assets.churncapital.com/icons/favicon.ico` (32×32)
- `https://assets.churncapital.com/icons/apple-touch-icon.png` (180×180)

The icon is not painted on the page. There is no web app manifest.

## Licensing

Only public-domain photographs are used. CC BY, CC BY-SA, Unsplash, and Pexels are not used. Public domain does not require on-page attribution, so the homepage does not show a credit line or a credits link.

Do not add photographs from `github.com/dharmx/walls` (no license) or `github.com/lordofhunger/wallpapers` (personal non-commercial only).

`CREDITS.md` at the repo root lists every photograph that was published with the original set: source URL, author, license, and what was changed. It is not in the served directory. Adding a photograph does not update it. The person who adds a photograph does.

## Files

Served from `public/`:

- `public/index.html`
- `public/styles.css`
- `public/app.js`
- `public/plan.js`

Not served:

- `README.md`
- `docs/DESIGN.md`
- `CREDITS.md`
- `wrangler.jsonc`
- `workers/dropin/` (the encoder Worker; disabled, not deployed)
- `scripts/add-photo.js` (local encode; not served)

Photographs and the icon files are not in the repo. See `README.md`.

## Non-goals

- Do not mention or link the trading app, and do not name any of its hosts.
- No analytics, trackers, third-party requests, visible marketing text, or logo on the page. The only host the page requests, besides itself, is `assets.churncapital.com`.
- Do not deploy, attach domains, or change DNS in this change. The www redirect already lives in the Cloudflare dashboard, not in this repo.

## Hosting

Production is live at `https://churncapital.com` on the assets-only Worker `churncapital-com`. The photograph host is `https://assets.churncapital.com` on the public bucket. New photographs are encoded locally and uploaded to that bucket. The automatic drop-in in `workers/dropin/` is disabled — requires Workers Paid. The steps are in `README.md`.

- `assets.directory` is `./public`.
- `compatibility_date` `2026-11-14`.
- No Worker script, no cron, and no R2 binding on `churncapital-com`.
- No `routes` and no custom domains in `wrangler.jsonc`.
- Observability is on: logs at a head sampling rate of 1, traces at 0.01.
- The apex is production.
- `www.churncapital.com` 301-redirects to `https://churncapital.com`. The Cloudflare Single Redirect rule is named `www to apex`. It keeps the path and query.

Do not touch the apex's iCloud+ mail DNS records: MX, SPF TXT, apple-domain TXT, and `sig1._domainkey` CNAME.

## Decision log

The sections above are the current behavior. This log is history.

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
| Nov 14 2026 | Slide Show is the out-of-box interval | Owner added Slide Show as the first interval option and made it the default when nothing is saved. A previously saved interval, such as 3 minutes, is still used. |
| Nov 14 2026 | Slide speed | Slide Show speed is a third control, shown only during Slide Show. The choices are 3, 5, 8, 10, and 15 seconds. The out-of-box speed is 5 seconds. The crossfade is 1 second during Slide Show and 1.5 seconds otherwise. |
| Nov 14 2026 | Swipe and arrow navigation | A horizontal swipe or the arrow keys move to the previous or next photograph. Left returns to the photograph that was actually shown, including in Random. A manual change restarts the timer. |
| Nov 14 2026 | Site icon | Owner asked for a site icon. An original palm-and-sun mark was chosen. |
| Nov 14 2026 | Photographs move to R2 | The page loads a manifest from assets.churncapital.com and builds the slides from it. Icons move there too. The visible theme names come from the manifest. The Florida label there is Florida. |
| Nov 14 2026 | Drop-in stays undeployed | The account stays on Workers Free. `churncapital-com` is assets-only. New photographs are encoded with `scripts/add-photo.js` and uploaded to the public bucket. The encoder cron lives in `workers/dropin/` and is disabled until Workers Paid. |
