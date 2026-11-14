# churncapital.com

## How it works — summary

**Last updated:** November 14, 2026

**Standing rule.** On every feature change, reread this file and `docs/DESIGN.md` and rewrite them so they describe the code as it is, including this summary. Do that in the same pull request. Do not leave a trail of notes at the bottom in place of updating the summary. Update this summary in the same change whenever anything about how the system works changes.

The homepage is a full-screen slideshow and nothing else. The photographs are not in this repo. They live in the public R2 bucket `churncapital-assets` (location ENAM), on the custom domain `https://assets.churncapital.com`. That domain is a proxied CNAME, `r2.dev` is off, and it serves every key in the public bucket. When the page opens it fetches `https://assets.churncapital.com/home/manifest.json` and builds the slides from that file, so a new photograph shows up without a site deploy. The browser asks for the smallest AVIF that actually covers the screen, and uses WebP if it cannot use AVIF. Each photograph is cropped with `object-fit` and the focal point stored on that image. `cover` fills the screen. `contain` letterboxes on the black page.

To add a photograph, put the original in the private bucket `churncapital-masters` at `incoming/<theme>/<filename>`. A cron on the Worker `churncapital-com` encodes one size per run, writes the public files, updates the manifest, and moves the original to `masters/` in that same private bucket. The private bucket has no custom domain and no public URL. Do not put originals in `churncapital-assets`, because its custom domain would publish them.

The site files are still static HTML, CSS, and JS on `churncapital-com`. Icons are the three files under `icons/` on the public bucket. This change does not deploy. Rolling the Worker back to the previous version restores the previous homepage, including the photographs that were bundled in that version. Rolling back one photograph is a manifest edit, which visitors see within about a minute. Replacing the bytes at an existing image URL needs a cache purge, because those URLs are cached for a year.

## Architecture

| Piece | What it is |
| --- | --- |
| `churncapital.com` | The homepage. Worker `churncapital-com`, static assets from `public/`. |
| `www.churncapital.com` | Dashboard redirect to the apex. Not in this repo. |
| `assets.churncapital.com` | Proxied custom domain on the public bucket `churncapital-assets`. Serves the whole bucket. |
| `churncapital-assets` | Public R2 bucket, location ENAM. Photographs, icons, and the manifest. |
| `churncapital-masters` | Private R2 bucket. Not created yet. Originals, incoming files, and job state. No custom domain, `r2.dev` off. |
| Cron `* * * * *` | On `churncapital-com`. Encodes drop-ins. Installed on the next deploy, which this PR does not do. |

`wrangler.jsonc` binds `PUBLIC_BUCKET` to `churncapital-assets` and `MASTERS_BUCKET` to `churncapital-masters`. It does not declare routes or custom domains. Domains stay attached in the dashboard. Observability is on: logs at a head sampling rate of 1, traces at 0.01. `compatibility_date` is `2026-11-14`.

There is no framework. Wrangler bundles the Worker. The homepage itself is not built.

The public custom domain cannot hide a prefix. Originals stay out of it by living in the other bucket. An optional WAF rule is listed at the bottom in case a private prefix is ever uploaded to the public bucket by mistake.

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
| `incoming/<theme>/<filename>` | private | the Worker only |
| `masters/<theme>/<id>-<filename>` | private | the Worker only |
| `jobs/active.json`, `jobs/rgba.bin`, `jobs/lock.json`, `jobs/skipped.json` | private | the Worker only |
| `rejected/<theme>/<filename>` | private | the Worker only |

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

Encoding for a drop-in, in the Worker, with jSquash:

- Resize: Lanczos3 (`lanczos3`), stretched to the exact target pixels. The resize step does not crop.
- WebP: quality 75.
- AVIF: quality 43, speed 8. This is jSquash's AVIF encoder, not SVT-AV1. Quality 43 is the setting used in place of the old CRF 36.
- JPEG originals are decoded with EXIF orientation applied.

The twenty photographs already on the public bucket were encoded earlier. Their AVIF files were SVT-AV1 CRF 36, preset 8, and their WebP files were quality 75, at the same ladder. `CREDITS.md` records those masters.

## Fit and crop

The default, and the only value used for a new drop-in, is `fit: "cover"` and `objectPosition: "50% 50%"`. The image fills the viewport and is cropped evenly around the center. The page never sets `object-fit` to `fill` or anything that stretches the photograph. A manifest value other than `contain` is treated as `cover`. An `objectPosition` that is not two percentages from 0 to 100 becomes `50% 50%`.

`contain` scales the whole photograph inside the viewport and leaves the rest black. The page background and each slide are `#000`. Earth and Saturn in the live manifest are `contain`. A few photographs use a focal point other than the center, such as `70% 50%` or `50% 35%`, so the subject stays in frame. Those values are used as written.

`alt` comes from the manifest. The page does not show `credit`.

## How to add a photograph

1. Confirm the file is public domain, or otherwise a license this site is allowed to use. Add it to `CREDITS.md` in the same change as the decision to publish it. The cron cannot know the license and writes `credit` as an empty string.
2. Export it at no more than 10,000,000 pixels and 15 MiB. A 3840×2560 frame is 9,830,400 pixels and is the intended top of the ladder. A 6000×4000 frame is 24 megapixels and will be rejected. See Limits.
3. Put it in the private bucket. The theme folder is a lowercase slug. A new folder becomes a new theme, named by title-casing the slug (`dry-tortugas` becomes `Dry Tortugas`). An existing theme keeps the name already in the manifest.

```sh
npx wrangler r2 object put churncapital-masters/incoming/florida/east-beach.jpg \
  --file=./east-beach.jpg \
  --remote
```

The dashboard upload to that key works too. The filename may use letters, numbers, spaces, dots, hyphens, and underscores. The extension must be `jpg`, `jpeg`, `png`, `webp`, or `avif`.

4. Wait. The cron runs every minute and does one thing: the next missing AVIF or WebP for the oldest incoming file, then a last run that appends the manifest entry and moves the original. Seven widths are fourteen files plus the publish run, about fifteen minutes. The new slide appears within about a minute after the manifest is written, because the manifest is cached for 60 seconds.
5. The original is then at `masters/<theme>/<id>-<filename>` and is not on the public host. `id` is the next number in that theme, padded to two digits through `09`.

A new theme lands at the end of the theme menu. Photographs land at the end of that theme. `Random` includes them on the next shuffle.

## Change the crop, the order, or remove one

Edit `home/manifest.json` on `churncapital-assets`. Download it, change it, upload it back. The page reads the public file. No site deploy.

- Crop: set `fit` to `cover` or `contain`, and `objectPosition` to `"x% y%"`.
- Order: reorder `themes` or a theme's `images`. Forward playback follows that order.
- Remove: delete that object from `images`, and delete its `images/<theme>/<id>-<width>.avif` and `.webp` keys if you do not want them fetched anymore. The page stops requesting an id that is gone from the manifest. The master on the private bucket can stay.
- Replace the pixels of an id that is already public: the URL is cached as immutable for a year, so upload a new id instead, or purge those exact URLs after overwriting the objects.

The drop-in always writes `cover` and `50% 50%`. Change the crop afterward in the manifest.

## Caching

Checked against the live host on November 14, 2026:

| Response | Cache-Control |
| --- | --- |
| `home/manifest.json` | `public, max-age=60` |
| `images/…` and `icons/…` | `public, max-age=31536000, immutable` |

Those headers are applied by zone rulesets on `assets.churncapital.com`. REST uploads of the current objects did not store `Cache-Control` on the objects themselves. The drop-in job still sets `httpMetadata.cacheControl` when it writes through the binding: the same one-year immutable policy on derivatives, and `public, max-age=60` on the manifest. Private keys are written with `private, no-store`.

CORS on the asset host allows `GET` and `HEAD` from `https://churncapital.com` and `https://www.churncapital.com`. The page's manifest fetch needs that. Image tags do not. A local preview origin is not on the allow list, which is why the browser tests serve the manifest themselves.

## Binaries stay out of the repo

`public/` is the asset directory and contains only `index.html`, `styles.css`, `app.js`, and `plan.js`. Photographs, `favicon.ico`, `apple-touch-icon.png`, and `favicon.svg` are gitignored. The SVG is on R2 with the other icons, so the page does not keep a copy for visitors without JavaScript. The icon links are absolute R2 URLs and work without the script.

`CREDITS.md` stays in the repo. It is not served.

## Licensing

Only public-domain photographs are used. CC BY, CC BY-SA, Unsplash, and Pexels are not used. The homepage does not show a credit line. `CREDITS.md` is the license record for the twenty photographs that are live now.

Do not add photographs from `github.com/dharmx/walls` (no license) or `github.com/lordofhunger/wallpapers` (personal non-commercial only).

A drop-in does not check the license. The person uploading the file updates `CREDITS.md` and may later set `credit` in the manifest. `credit` is still not rendered.

## Limits

Workers memory is 128 MB on Free and Paid. The cron refuses a file before decoding it when the header says more than 10,000,000 pixels, or when the object is larger than 15 MiB (15,728,640 bytes). Decoded RGBA for 10 megapixels is about 40 MB, which leaves room for one resized copy and the encoder.

| Case | What happens |
| --- | --- |
| Larger than 15 MiB | Not downloaded. The key stays in `incoming/`. `jobs/skipped.json` records it. The cron logs `incoming_rejected` / `too_large_bytes` and will not try that key again until the skipped entry is removed. |
| More than 10,000,000 pixels, unknown size, a bad name, or a decode error | Moved to `rejected/` on the private bucket and logged. |
| One encode that never finishes inside the CPU limit | The finished files stay. The next run retries the missing variant. A variant that always exceeds the CPU limit will retry every minute. |

Workers Free allows 10 ms of CPU per cron run. That is not enough to decode a photograph. Workers Paid allows 30 seconds of CPU for a cron whose interval is under an hour, which is this one-minute schedule. The encoder is written so that one variant is the unit of work, and the job resumes from the variants already stored. The account needs Workers Paid before drop-ins will finish. This PR does not change the plan and does not deploy.

A run holds `jobs/lock.json` for up to three minutes so a second cron tick does not start another file. The lock is released when the run finishes.

## Rollback

- Homepage code: deploy the previous Worker version. That version's asset bundle still has the photographs that were in the repo at that deploy. R2 is left as it is. This PR has not been deployed.
- A bad manifest: put the previous `home/manifest.json` back. Visitors see it within 60 seconds.
- A bad new photograph: remove its manifest entry. The derivatives can be deleted. The master remains available on the private bucket.
- A bad overwrite of an existing image URL: purge those URLs. Immutable cache will keep the old bytes until then.

Do not touch the apex mail DNS: MX, SPF TXT, apple-domain TXT, and `sig1._domainkey`.

## Infra to create before the first deploy

This PR does not create these and does not deploy.

1. Create R2 bucket `churncapital-masters` in the same account as `churncapital-assets`, location ENAM.
2. Leave it private. No custom domain. Leave the public development URL (`r2.dev`) disabled.
3. Do not upload `incoming/`, `masters/`, `jobs/`, or `rejected/` into `churncapital-assets`. Anything in that bucket is world-readable at `assets.churncapital.com`.
4. Use Workers Paid for the cron, or accept that Free's 10 ms CPU limit will not finish a decode. Raising `limits.cpu_ms` is a Paid-plan setting and is not set here, so a Free deploy is not asked for a limit it cannot grant. On Paid the one-minute cron gets 30 seconds of CPU by default.
5. Deploy `churncapital-com` only after the private bucket exists. The config in this repo adds the cron and both R2 bindings. The public custom domain stays on the bucket, not on the Worker.

### Optional WAF rule

Not required when originals stay in the private bucket. If a private prefix is ever uploaded to the public bucket, a custom WAF rule on the zone that owns `assets.churncapital.com` can block it.

Expression:

```
(http.host eq "assets.churncapital.com" and (
  starts_with(http.request.uri.path, "/incoming") or
  starts_with(http.request.uri.path, "/masters") or
  starts_with(http.request.uri.path, "/jobs") or
  starts_with(http.request.uri.path, "/rejected")
))
```

Action: Block.

## Tests

`npm test` runs the picker, the header parser, the drop-in job against an in-memory bucket, and one real jSquash encode of a tiny image. `npm run test:browser` serves `public/` and checks the live manifest shape at phone, tablet, and desktop sizes. Browser tests do not need the production CORS allow list because they answer the manifest request themselves. Image bytes for the photographic screenshots come from the live asset host.

## Files

Served from `public/`:

- `index.html`
- `styles.css`
- `app.js`
- `plan.js` (shared width and manifest logic; the Worker bundles the same file)

Worker:

- `src/index.js` fetches static assets for anything that is not a file, and runs the cron
- `src/process.js` the drop-in job
- `src/codecs.js` jSquash
- `src/dimensions.js` reads width and height from the file header before decoding
- `src/encode-settings.js`

Not served: this file, `docs/DESIGN.md`, `CREDITS.md`, `wrangler.jsonc`, tests.
