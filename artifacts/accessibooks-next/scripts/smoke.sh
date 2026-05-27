#!/usr/bin/env bash
# Smoke-test a deployed AccessiBooks (Next.js) instance.
#
# Usage:
#   ./scripts/smoke.sh https://accessibooks-next.vercel.app
#   pnpm --filter @workspace/accessibooks-next smoke https://...
#
# Exits 0 if every endpoint returns 2xx/3xx, 1 otherwise. Each line is
# printed as `<method> <path> -> <status> <OK|FAIL>`.

set -u

if [ $# -lt 1 ]; then
  echo "usage: $0 <base-url>" >&2
  exit 2
fi

BASE="${1%/}"
FAIL=0

endpoints=(
  "GET /"
  "GET /api/auth/providers"
  "GET /api/books"
  "GET /api/books/trending"
)

for ep in "${endpoints[@]}"; do
  method="${ep%% *}"
  path="${ep#* }"
  url="${BASE}${path}"
  status=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" \
    -H "accept: application/json" \
    --max-time 20 \
    "$url" || echo "000")
  if [[ "$status" =~ ^[23][0-9][0-9]$ ]]; then
    printf "%-6s %-32s -> %s OK\n" "$method" "$path" "$status"
  else
    printf "%-6s %-32s -> %s FAIL\n" "$method" "$path" "$status"
    FAIL=1
  fi
done

if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "Smoke test FAILED — one or more endpoints returned non-2xx/3xx." >&2
  exit 1
fi

echo ""
echo "All endpoints OK."
