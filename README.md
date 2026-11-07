# zoovo-app.github.io

The Zoovo website, served by GitHub Pages at https://zoovo-app.github.io/.

It's all static files. There's no framework, build step or dependencies: whatever is on `main` is what's live.

## What's here

| Path | What | Built with |
| --- | --- | --- |
| `/`, `/pros/`, `/booking/`, `/safety/`, `/faq/`, `/privacy/`, `/terms/`, `404.html` | Public site | Hand-written HTML + [`assets/site/`](assets/site/) |
| `/app/` | Web app | Flutter web build from the `zoovo-app` repo (don't edit by hand) |
| `/review/`, `/bugs/` | Team admin tools | ES modules + Supabase |
| `/report-bug/` | Public bug form | ES module + Supabase |
| `/stripe/return/`, `/stripe/refresh/` | Send people back to the iOS app after Stripe onboarding | Static HTML |

## Public site

- Each page is `<name>/index.html`. Shared styles are in `assets/site/site.css`.
- **Languages:** English is written in the HTML. Elements to translate carry `data-t`, `data-t-alt` or `data-t-aria` keys, and the Dutch text for each key is in `assets/site/nl.js`. `lang.js` picks the language and `site.js` swaps the text and runs the toggle.
- **Adding a page:** copy an existing one and change `data-page`, then add its Dutch keys to `nl.js` and the page to `sitemap.xml` and the `pages` list in `site.test.mjs`.
- **CSP:** each page sets a strict `<meta>` CSP that only allows the site's own files, so don't add inline scripts or styles.

## Web app (`/app/`)

Build the app in the `zoovo-app` repo with `--base-href /app/`, then:

```bash
./scripts/deploy-app.sh ../zoovo-app/build/web
```

The script replaces `app/` and adds the app's CSP and `restore-path.js`. Deep links like `/app/s/<id>` reach the app through `404.html`.

## Admin tools and Supabase

- [`assets/supabase.js`](assets/supabase.js) sets up the client. The anon key is public, and row-level security controls what it can do.
- supabase-js is vendored in `assets/vendor/` and loaded with an integrity hash. To update it, follow the steps in `supabase.js`.
- Pages that keep a login load `assets/frame-guard.js` first, which stops them from running inside a frame.

## Tests

The tests need Node only:

```bash
node --test assets/site/site.test.mjs review/*.test.mjs
```
