#!/usr/bin/env bash
#
# Puts a build of the web app (Flutter web, from the zoovo-app repository:
# ./scripts/build-web.sh there) under app/, served at
# https://zoovo-app.github.io/app/:
#
#   ./scripts/deploy-app.sh ../zoovo-app/build/web
#
# It replaces app/ with the build, adds app/restore-path.js (the way back from
# the 404 page: a reload or a deep link such as /app/s/<id>, see
# assets/site/app-redirect.js) and the page's Content-Security-Policy. The
# CSP allows the app's own files, its Supabase project (read from the build's
# .env), Google Fonts, the Photon city search, Google sign-in, Google Maps
# and Stripe.

set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"

BUILD="${1:?usage: scripts/deploy-app.sh <path to build/web>}"
[ -f "$BUILD/index.html" ] && [ -f "$BUILD/main.dart.js" ] || {
  echo "deploy-app: $BUILD is not a Flutter web build" >&2; exit 1; }
grep -q '<base href="/app/">' "$BUILD/index.html" || {
  echo "deploy-app: the build is not for /app/ (build with --base-href /app/)" >&2; exit 1; }

SUPABASE=$(sed -n 's#^SUPABASE_URL=https://\([a-z0-9]*\.supabase\.co\)/*$#\1#p' "$BUILD/assets/.env")
[ -n "$SUPABASE" ] || { echo "deploy-app: no Supabase project URL in the build's .env" >&2; exit 1; }

rm -rf app
cp -R "$BUILD" app
rm -f app/.last_build_id
cp scripts/app-restore-path.js app/restore-path.js

CSP="default-src 'self'; \
script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com https://maps.googleapis.com https://cdn.jsdelivr.net https://js.stripe.com; \
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; \
font-src 'self' data: https://fonts.gstatic.com; \
img-src 'self' data: blob: https://$SUPABASE https://*.googleusercontent.com https://maps.gstatic.com https://*.googleapis.com https://*.ggpht.com; \
connect-src 'self' data: blob: https://$SUPABASE wss://$SUPABASE https://*.googleusercontent.com https://fonts.gstatic.com https://photon.komoot.io https://maps.googleapis.com https://api.stripe.com https://accounts.google.com; \
frame-src https://accounts.google.com https://js.stripe.com https://hooks.stripe.com; \
worker-src 'self' blob:; \
object-src 'none'; base-uri 'self'; form-action 'self'"

python3 - "$CSP" <<'PY'
import sys
csp = sys.argv[1]
p = 'app/index.html'
s = open(p, encoding='utf-8').read()
charset = '  <meta charset="UTF-8">\n'
boot = '  <script src="flutter_bootstrap.js" async></script>'
assert s.count(charset) == 1 and s.count(boot) == 1, 'unexpected index.html'
s = s.replace(charset, charset + f'  <meta http-equiv="Content-Security-Policy" content="{csp}">\n')
s = s.replace(boot, '  <script src="restore-path.js"></script>\n' + boot)
open(p, 'w', encoding='utf-8').write(s)
PY

echo "deploy-app: app/ updated (Supabase: $SUPABASE)"
