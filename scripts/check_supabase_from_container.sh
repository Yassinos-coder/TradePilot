#!/bin/sh
set -eu

docker exec tradepilot-backend sh -lc '
  wget -S -O - \
    --header="apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    --header="Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    --header="Accept-Profile: $SUPABASE_SCHEMA" \
    "$SUPABASE_URL/rest/v1/users?select=id" 2>&1 | sed -n "1,60p"
'
