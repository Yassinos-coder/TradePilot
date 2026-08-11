#!/bin/sh
# Verifies the backend container can reach Supabase with the credentials it was
# actually started with, rather than the ones you think it has.
#
# Usage: ./check_supabase_from_container.sh [container]
#
# The container name defaults to tradepilot-backend; pass another if Berth named
# the service differently. `docker ps --format '{{.Names}}'` will show you.
set -eu

CONTAINER="${1:-tradepilot-backend}"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "No container named '$CONTAINER'. Running containers:" >&2
  docker ps --format '  {{.Names}}' >&2
  exit 1
fi

docker exec "$CONTAINER" sh -lc '
  wget -S -O - \
    --header="apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    --header="Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    --header="Accept-Profile: $SUPABASE_SCHEMA" \
    "$SUPABASE_URL/rest/v1/users?select=id" 2>&1 | sed -n "1,60p"
'
