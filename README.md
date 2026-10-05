# el-site

A personal site with two pages, built with [Vite](https://vite.dev/):

- `/` is a terminal (xterm.js). It types out a different rainbow ASCII quote on every load, shows a now-listening bar in the top-middle, and has a widget sidebar. Type `help` for the commands (calc, hash, qr, uuid, json, cal, weather, moon, art, figlet, cowsay and more).
- `/media` is a masonry scroll of public-domain art from the [Art Institute of Chicago](https://www.artic.edu/), [The Met](https://www.metmuseum.org/) and the [Cleveland Museum of Art](https://www.clevelandart.org/). Titles, source badges and `#tags` are clickable. Keys: `/` search, `r` shuffle, `s` saved.

It is a static site: `npm run build` writes plain HTML/JS/CSS to `dist/`, and any static host can serve that folder. The pages call public APIs from the visitor's browser, so there is no server and no secret key in the code.

## Project map

| Path | What it is |
|---|---|
| `index.html`, `src/landing.js`, `src/landing.css` | Terminal page |
| `media.html`, `src/media.js`, `src/media.css` | Art scroll page |
| `src/config.js` | **The file you edit**: name, about text, links, now-playing, weather location |
| `src/data/quotes.json` | Quote pool for the typing banner |
| `src/lib/` | Terminal commands, art API loaders, weather, ANSI helpers, now-playing |
| `src/style.css` | Shared theme variables (warm palette, dark/light) |
| `public/` | Copied as-is into `dist/` (favicon, `_headers`, `ship.json`) |
| `vite.config.js` | Builds both pages |

## Run locally
Needs Node 20.19+ or 22.12+ (Vite 8). `npm install`, then `npm run dev`. Build with `npm run build`; preview the build with `npm run preview`.

## Edit the site
- **Links and about text:** `src/config.js`. The links were written from memory and were never verified. Check each one.
- **Now listening:** set `nowPlaying.user` to a ListenBrainz username (no key needed), or set `provider` to `lastfm` and add `lastfmApiKey`. Until one is set the bar says "not configured". A Last.fm key sits in public JS, so use a throwaway key.
- **Weather:** the widget asks for the visitor's location only when clicked and keeps it in their browser. To pin a fixed location instead, set `location` in `src/config.js`.
- **Quotes:** `src/data/quotes.json`. Check wording and attribution before trusting them.
- **Colors:** variables at the top of `src/style.css`.

## Deploy: Cloudflare Pages (current plan)
No workflow file and no terminal needed. Every push to the repo rebuilds and publishes.

1. Put the project in a GitHub repo (upload the unzipped folder in the GitHub web UI; commit `package-lock.json`).
2. [Cloudflare dashboard](https://dash.cloudflare.com/) > Workers & Pages > Create application > Pages > Connect to Git. Pick the repo. ([guide](https://developers.cloudflare.com/pages/get-started/git-integration/))
3. Build command `npm run build`, build output directory `dist`, then Save and Deploy.
4. It goes live at `<project-name>.pages.dev`.
5. Custom domain (such as `el.nya.je`): in the Pages project, Custom domains > add the domain **first**, then create a CNAME at your DNS provider pointing to `<project-name>.pages.dev`. A CNAME created first gives a 522 error. ([guide](https://developers.cloudflare.com/pages/configuration/custom-domains/))

Pages behavior this site relies on:
- `media.html` is served at `/media` automatically ([route matching](https://developers.cloudflare.com/pages/configuration/serving-pages/)).
- `public/_headers` sets one-year caching for `/assets/*` ([headers](https://developers.cloudflare.com/pages/configuration/headers/)).
- Cloudflare has been steering new projects toward Workers. If the Pages option is missing, check the current docs.

## Other hosts
- **Netlify, Vercel:** connect the repo, build command `npm run build`, output `dist`.
- **Shipstatic** ([docs](https://docs.shipstatic.com/web)): upload `dist/` at https://my.shipstatic.com, or use the [GitHub Action](https://docs.shipstatic.com/action). `public/ship.json` turns on clean URLs and caching there. The free plan caps deployments, so avoid deploying on every push. Public deploys made without an account expire after 3 days unless claimed.
- **Surge:** needs a terminal once to create a CI token ([docs](https://surge.sh/docs/cli/automation)). GitHub Codespaces' terminal works.
- Files `public/_headers` (Cloudflare Pages/Netlify style) and `public/ship.json` (Shipstatic) are ignored by hosts that don't use them. Delete the one you don't need.

## Troubleshooting
- **Art grid empty or one source shows "error":** that museum API is down, rate-limited (the Art Institute allows about 60 requests a minute) or blocking the browser (CORS). Toggle sources in the top bar. The live APIs were never tested from the build environment.
- **The Met:** the code uses `/v1.1/search` because `/v1/search` was announced to retire on 2026-10-01. If it breaks, see https://metmuseum.github.io/.
- **`/media` is a 404:** check that `dist/media.html` exists after building. On Shipstatic, `ship.json` needs `cleanUrls: true`.
- **Domain shows 522 on Cloudflare:** the CNAME was added before the domain was attached in the Pages dashboard.
- **Build fails on Cloudflare:** set the environment variable `NODE_VERSION` to `22`.
- **`npm ci` fails:** the lockfile is out of sync. Run `npm install` and commit `package-lock.json`.
- **Terminal banner looks plain on a small screen:** by design; it falls back to wrapped text when the ASCII art won't fit.

## Packages and APIs
npm: vite, @xterm/xterm (+ addon-fit, addon-web-links), figlet, dayjs, expr-eval, qrcode, canvas-confetti, masonry-layout, imagesloaded, @fontsource/victor-mono.
APIs: [Open-Meteo](https://open-meteo.com/) (no key), [ListenBrainz](https://listenbrainz.org/) (no key), the three museum APIs above.

## What was and wasn't tested when this was built
Tested: the build, the terminal command logic in Node, and that `qr` output decodes to the right URL. Not tested: rendering in a real browser, live API responses, an actual deploy.
