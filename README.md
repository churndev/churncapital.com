# churncapital.com

## How it works — summary

**Last updated:** November 14, 2026

**Standing rule.** On every feature change, reread this file and `docs/DESIGN.md` and rewrite them so they describe the code as it is, including this summary. Do that in the same pull request. Do not leave a trail of notes at the bottom in place of updating the summary. Update this summary in the same change whenever anything about how the system works changes.

The homepage is a full-screen slideshow and nothing else. The photographs are not in this repo. They live in the public R2 bucket `churncapital-assets` (location ENAM), on the custom domain `https://assets.churncapital.com`. That domain is a proxied CNAME, `r2.dev` is off, and it serves every key in the public bucket. When the page opens it fetches `https://assets.churncapital.com/home/manifest.json` and builds the slides from that file, so a new photograph shows up without a site deploy. The browser asks for the smallest AVIF that actually covers the screen, and uses WebP if it cannot use AVIF. Each photograph is cropped with `object-fit` and the focal point stored on that image. `cover` fills the screen. `contain` letterboxes on the black page.

What is deployed today is the assets-only Worker `churncapital-com`: HTML, CSS, and JS, with no script, no cron, and no R2 binding. It stays on Workers Free. Icons are the three files under `icons/` on the public bucket.

Adding a photograph today is manual. On your machine, `scripts/add-photo.js` encodes the width ladder to AVIF and WebP. You upload those files to `images/<theme>/` on `churncapital-assets` and edit `home/manifest.json`. Do not upload the original into that bucket. The public custom domain would publish it.

The automatic drop-in is disabled — requires Workers Paid. Its code is `workers/dropin/`, a separate Worker named `churncapital-dropin` that is not deployed. Enabling it later means creating the private bucket `churncapital-masters`, moving the account to Workers Paid, and deploying that config only. Rolling the homepage back is a Worker version rollback. Rolling one photograph back is a manifest edit, which visitors see within about a minute. Replacing the bytes at an existing image URL needs a cache purge, because those URLs are cached for a year.

## Architecture

| Piece | What it is |
| --- | --- |
| `churncapital.com` | The homepage. Worker `churncapital-com`, static assets from `public/`. |
| `www.churncapital.com` | Dashboard redirect to the apex. Not in this repo. |
| `assets.churncapital.com` | Proxied custom domain on the public bucket `churncapital-assets`. Serves the whole bucket. |
| `churncapital-assets` | Public R2 bucket, location ENAM. Photographs, icons, and the manifest. |
| `churncapital-masters` | Private R2 bucket. Not created. Used only by the disabled drop-in. |
| `workers/dropin/` | Drop-in encoder. Disabled — requires Workers Paid. Not part of the `churncapital-com` deploy. |

The root `wrangler.jsonc` is the production Worker. It has `assets.directory` `./public` and nothing else: no `main`, no cron, no R2 binding. It does not declare routes or custom domains. Domains stay attached in the dashboard. Observability is on: logs at a head sampling rate of 1, traces at 0.01. `compatibility_date` is `2026-11-14`.

There is no framework and no homepage build. `npx wrangler deploy` from the repo root publishes the static files only.

The public custom domain cannot hide a prefix. Originals stay off `churncapital-assets`. An optional WAF rule is listed under the drop-in section in case a private prefix is ever uploaded to the public bucket by mistake.

## Manifest

`GET https://assets.churncapital.com/home/manifest.json`

The page accepts the file only when `base` is exactly `https://assets.churncapital.com`. Any other base is treated as a failed load: the screen stays black and no image URL is set. That keeps a bad manifest from sending the browser somewhere else.

`version` is the schema version, currently `1`. It is not a counter.

```json
{
  "version": 1,
  "base": "https://assets.churncapital.com",
  "widths": [480, 960, 1280, 1600, 1920, 2560, 3840],
  "formats": ["avif", "webp"],
  "themes": [
    {
      "id": "florida",
      "name": "Florida",
      "images": [
        {
          "id": "01",
          "width": 3840,
          "height": 2560,
          "fit": "cover",
          "objectPosition": "50% 50%",
          "alt": "East Beach on Garden Key, Dry Tortugas National Park, Florida",
          "credit": "U.S. National Park Service / D. Diaz",
          "widths": [480, 960, 1280, 1600, 1920, 2560, 3840]
        }
      ]
    }
  ]
}
```

The live file has five themes, in this order: Florida, Ocean, Mountains, Space, City. Four photographs each. `credit` is not shown on the page. `test/fixtures/manifest.json` is a snapshot of the live file for tests.

The theme menu is `Random`, then each theme's `name` in manifest order. `Random` is not a theme in the file. It shuffles every photograph. A saved theme that is no longer in the file falls back to `Random`.

## URLs and keys

Image URL, which is also the public object key under the asset host:

`${base}/images/${theme}/${id}-${width}.${format}`

Example: `https://assets.churncapital.com/images/florida/01-1280.avif` is the key `images/florida/01-1280.avif`.

Icons, linked from `public/index.html` and not stored in the repo:

- `https://assets.churncapital.com/icons/favicon.svg`
- `https://assets.churncapital.com/icons/favicon.ico`
- `https://assets.churncapital.com/icons/apple-touch-icon.png`

| Key | Bucket | Who can read it |
| --- | --- | --- |
| `images/<theme>/<id>-<width>.avif` and `.webp` | public | anyone |
| `icons/favicon.svg`, `favicon.ico`, `apple-touch-icon.png` | public | anyone |
| `home/manifest.json` | public | anyone |

These keys exist only after the drop-in is enabled, and only in the private bucket. They are not used by the manual workflow:

| Key | Bucket | Who can read it |
| --- | --- | --- |
| `incoming/<theme>/<filename>` | private | the drop-in Worker only |
| `masters/<theme>/<id>-<filename>` | private | the drop-in Worker only |
| `jobs/active.json`, `jobs/rgba.bin`, `jobs/lock.json`, `jobs/skipped.json` | private | the drop-in Worker only |
| `rejected/<theme>/<filename>` | private | the drop-in Worker only |

## Sizes, formats, and the device picker

Ladder, smallest first: `480`, `960`, `1280`, `1600`, `1920`, `2560`, `3840`.

The encoder writes a width only when it does not exceed the source. A 2000-pixel-wide original gets `480` through `1920`. An original narrower than 480 gets one rendition at its own width, so nothing is upscaled. The height is the source height times `targetWidth / sourceWidth`, rounded. At the source width the height is unchanged.

Formats are AVIF, then WebP. The page uses a `<picture>`: an `image/avif` source, an `image/webp` source, and the WebP URL on the `<img>` for browsers that ignore the sources.

For a viewport of `vw` by `vh` CSS pixels and device pixel ratio `dpr` (at least 1), with image aspect `width / height`:

- `cover`: needed width = `max(vw * dpr, vh * dpr * aspect)`
- `contain`: needed width = `min(vw * dpr, vh * dpr * aspect)`

The page picks the smallest listed width that is at least that big, or the largest listed width if none is. It uses that photograph's `widths` array when present.

The old picker used `max(innerWidth, innerHeight) * dpr`. On a 390×844 phone at dpr 3 and a 3:2 photograph, that asks for 2532 pixels and downloads the 2560 file. The photograph is wider than the screen once it is scaled to the screen's height, so the file that actually covers is `max(1170, 3798) = 3798`, which is the 3840 file. `cover` uses the max formula. `contain` uses the min formula.

Resize and orientation changes are debounced by 200ms. If the chosen width changes, the current photograph is loaded again at that width. The wait until the next automatic change is left alone.

`scripts/add-photo.js` encodes a new photograph on your machine with jSquash. The disabled drop-in uses the same settings:

- Resize: Lanczos3 (`lanczos3`), stretched to the exact target pixels. The resize step does not crop.
- WebP: quality 75.
- AVIF: quality 43, speed 8. This is jSquash's AVIF encoder, not SVT-AV1. Quality 43 is the setting used in place of the old CRF 36.
- JPEG originals are decoded with EXIF orientation applied.

The twenty photographs already on the public bucket were encoded earlier. The copies that used to be in this repo were SVT-AV1 CRF 36, preset 8, and WebP quality 75. `CREDITS.md` records those masters. The public bucket now has the ladder through 480.

## Fit and crop

The default, and the only value used for a new drop-in, is `fit: "cover"` and `objectPosition: "50% 50%"`. The image fills the viewport and is cropped evenly around the center. The page never sets `object-fit` to `fill` or anything that stretches the photograph. A manifest value other than `contain` is treated as `cover`. An `objectPosition` that is not two percentages from 0 to 100 becomes `50% 50%`.

`contain` scales the whole photograph inside the viewport and leaves the rest black. The page background and each slide are `#000`. Earth and Saturn in the live manifest are `contain`. A few photographs use a focal point other than the center, such as `70% 50%` or `50% 35%`, so the subject stays in frame. Those values are used as written.

`alt` comes from the manifest. The page does not show `credit`.

## How to add a photograph

This is the manual path. It is what works on Workers Free. The script encodes locally. You upload only the derivatives and the manifest. Keep the original on your machine. Do not put it in `churncapital-assets`.

1. Confirm the file is public domain, or otherwise a license this site is allowed to use. Add it to `CREDITS.md`. The script writes `credit` as an empty string unless you pass `--credit`.
2. Keep the file at or under 10,000,000 pixels and 15 MiB. A 3840×2560 frame is 9,830,400 pixels and is the intended top of the ladder. A 6000×4000 frame is 24 megapixels; the script refuses it. The extension must be `jpg`, `jpeg`, `png`, `webp`, or `avif`. The theme id is a lowercase slug. A new slug is added at the end of the theme list, titled from the slug (`dry-tortugas` becomes `Dry Tortugas`) unless you pass `--name`. An existing theme keeps its name.
3. Download the live manifest and encode. `--id` is optional. When it is omitted, the script uses the next number in that theme.

```sh
npx wrangler r2 object get churncapital-assets/home/manifest.json --file=./manifest.json --remote

node scripts/add-photo.js \
  --file ./east-beach.jpg \
  --theme florida \
  --alt "East Beach, Garden Key" \
  --manifest ./manifest.json \
  --out ./out
```

That writes `out/images/florida/<id>-<width>.avif` and `.webp` for every ladder width that does not exceed the source, updates `./manifest.json` and `out/home/manifest.json`, and writes `out/upload.sh`.

4. Upload. From the repo root:

```sh
sh ./out/upload.sh
```

The script's commands are `wrangler r2 object put` against `churncapital-assets` only. Derivatives use `--content-type` `image/avif` or `image/webp` and `--cache-control 'public, max-age=31536000, immutable'`. The manifest uses `application/json` and `--cache-control 'public, max-age=60'`. Each command passes `--remote`. The zone ruleset also sets those cache headers on the way out.

5. The new slide appears within about a minute, because the manifest is cached for 60 seconds. No homepage deploy. Photographs land at the end of that theme. `Random` includes them on the next shuffle.

Fit defaults to `cover` and `50% 50%`. Pass `--fit contain` or `--position '70% 50%'` when you encode. You can also change those fields in the manifest afterward.

## Change the crop, the order, or remove one

Edit `home/manifest.json` on `churncapital-assets`. Download it, change it, upload it back. The page reads the public file. No site deploy.

- Crop: set `fit` to `cover` or `contain`, and `objectPosition` to `"x% y%"`.
- Order: reorder `themes` or a theme's `images`. Forward playback follows that order.
- Remove: delete that object from `images`, and delete its `images/<theme>/<id>-<width>.avif` and `.webp` keys if you do not want them fetched anymore. The page stops requesting an id that is gone from the manifest.
- Replace the pixels of an id that is already public: the URL is cached as immutable for a year, so upload a new id instead, or purge those exact URLs after overwriting the objects.

## Caching

Checked against the live host on November 14, 2026:

| Response | Cache-Control |
| --- | --- |
| `home/manifest.json` | `public, max-age=60` |
| `images/…` and `icons/…` | `public, max-age=31536000, immutable` |

Those headers are applied by zone rulesets on `assets.churncapital.com`. REST uploads of the original objects did not store `Cache-Control` on the objects themselves. `scripts/add-photo.js` still passes `--cache-control` on each `wrangler r2 object put`. The disabled drop-in sets the same values as `httpMetadata.cacheControl` when it writes through the binding. Private keys, once that job is enabled, are written with `private, no-store`.

CORS on the asset host allows `GET` and `HEAD` from `https://churncapital.com` and `https://www.churncapital.com`. The page's manifest fetch needs that. Image tags do not. A local preview origin is not on the allow list, which is why the browser tests serve the manifest themselves.

## Binaries stay out of the repo

`public/` is the asset directory and contains only `index.html`, `styles.css`, `app.js`, and `plan.js`. Photographs, `favicon.ico`, `apple-touch-icon.png`, and `favicon.svg` are gitignored. The SVG is on R2 with the other icons, so the page does not keep a copy for visitors without JavaScript. The icon links are absolute R2 URLs and work without the script.

`CREDITS.md` stays in the repo. It is not served.

## Licensing

Only public-domain photographs are used. CC BY, CC BY-SA, Unsplash, and Pexels are not used. The homepage does not show a credit line. `CREDITS.md` is the license record for the twenty photographs that are live now.

Do not add photographs from `github.com/dharmx/walls` (no license) or `github.com/lordofhunger/wallpapers` (personal non-commercial only).

Neither the manual script nor the disabled drop-in checks the license. The person who adds a photograph updates `CREDITS.md` and may set `credit` in the manifest. `credit` is still not rendered.

## Limits

The manual script and the drop-in both refuse a file over 15 MiB (15,728,640 bytes) or 10,000,000 pixels. Decoded RGBA for 10 megapixels is about 40 MB. That fits a Worker with 128 MB of memory, which is the limit on Free and Paid, and it is also a comfortable size for the local script.

The production Worker does not run this code. Workers Free allows 10 ms of CPU per cron run, which cannot decode a photograph. That is why the drop-in is not deployed. Workers Paid allows 30 seconds of CPU for a cron whose interval is under an hour.

When the drop-in is enabled, one cron run encodes one variant and resumes from the files already stored. A file over 15 MiB stays in `incoming/` and is recorded in `jobs/skipped.json` without being downloaded. A file with too many pixels, a bad name, or a decode error is moved to `rejected/` and logged. A run holds `jobs/lock.json` for up to three minutes.

## Rollback

- Homepage code: deploy the previous Worker version. The version from before photographs moved to R2 still has those files in its asset bundle. R2 is left as it is.
- A bad manifest: put the previous `home/manifest.json` back. Visitors see it within 60 seconds.
- A bad new photograph: remove its manifest entry and delete its `images/<theme>/<id>-*` objects.
- A bad overwrite of an existing image URL: purge those URLs. Immutable cache will keep the old bytes until then.

Do not touch the apex mail DNS: MX, SPF TXT, apple-domain TXT, and `sig1._domainkey`.

## Drop-in, disabled — requires Workers Paid

`workers/dropin/wrangler.jsonc` is a separate Worker named `churncapital-dropin`. It is not deployed. `npx wrangler deploy` from the repo root does not read it. The production config does not contain the encoder, the cron, or `MASTERS_BUCKET`.

The job watches `incoming/<theme>/<filename>` on the private bucket, encodes one AVIF or WebP per minute, writes `images/<theme>/<id>-<width>.<format>` on the public bucket, appends `home/manifest.json` with `cover` and `50% 50%`, and moves the original to `masters/`. A new theme folder creates a theme. Same ladder, same codecs, and same size limits as the manual script.

To enable it later:

1. Create R2 bucket `churncapital-masters` in the same account as `churncapital-assets`, location ENAM.
2. Leave it private. No custom domain. Leave the public development URL (`r2.dev`) disabled.
3. Move the account to Workers Paid so the one-minute cron gets 30 seconds of CPU. Do not set `limits.cpu_ms` above what the plan allows.
4. Deploy only that config: `npx wrangler deploy --config workers/dropin/wrangler.jsonc`. Leave `churncapital-com` assets-only. Leave `assets.churncapital.com` on the public bucket.
5. Do not upload `incoming/`, `masters/`, `jobs/`, or `rejected/` into `churncapital-assets`. Anything in that bucket is world-readable.

Optional WAF rule if a private prefix is ever uploaded to the public bucket. Custom rule on the zone that owns `assets.churncapital.com`, action Block:

```
(http.host eq "assets.churncapital.com" and (
  starts_with(http.request.uri.path, "/incoming") or
  starts_with(http.request.uri.path, "/masters") or
  starts_with(http.request.uri.path, "/jobs") or
  starts_with(http.request.uri.path, "/rejected")
))
```

## Tests

`npm test` runs the picker, the header parser, the production Wrangler shape, the manual encode helper, the drop-in job against an in-memory bucket, and one real jSquash encode of a tiny image. `npm run test:browser` serves `public/` and checks the live manifest shape at phone, tablet, and desktop sizes. Browser tests do not need the production CORS allow list because they answer the manifest request themselves. Image bytes for the photographic screenshots come from the live asset host.

## Files

Served from `public/` by `churncapital-com`:

- `index.html`
- `styles.css`
- `app.js`
- `plan.js`

Not deployed:

- `workers/dropin/` — disabled encoder Worker and its `wrangler.jsonc`
- `scripts/add-photo.js` — local encode and upload commands
- this file, `docs/DESIGN.md`, `CREDITS.md`, tests
