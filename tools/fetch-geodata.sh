#!/usr/bin/env bash
# Downloads the raw geographic inputs used by tools/build-map.ts.
#  - OpenStreetMap data (ODbL) for central St Albans via the OSM API 0.6 /map endpoint, in small tiles.
#  - AWS Terrain Tiles (Terrarium PNG encoding; SRTM-derived in this area) for elevation.
# Raw files go to data-raw/ (git-ignored). The processed, bundled extract is public/data/stalbans.json.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=data-raw
mkdir -p "$OUT/osm" "$OUT/terrain"

LON0=-0.372; LON1=-0.312; LAT0=51.737; LAT1=51.769
DLON=0.010; DLAT=0.0064

fetch() { # url file
  local url="$1" file="$2" n=0
  [ -s "$file" ] && return 0
  until curl -sS -f -m 120 -o "$file.part" "$url"; do
    n=$((n+1)); [ $n -ge 5 ] && { echo "failed: $url" >&2; return 1; }
    sleep $((2**n))
  done
  mv "$file.part" "$file"
}

python3 - "$LON0" "$LON1" "$LAT0" "$LAT1" "$DLON" "$DLAT" > "$OUT/osm/tiles.txt" <<'PY'
import sys
lon0,lon1,lat0,lat1,dlon,dlat=map(float,sys.argv[1:])
i=0; lat=lat0
while lat<lat1-1e-9:
  lon=lon0
  while lon<lon1-1e-9:
    print(f"{lon:.4f},{lat:.4f},{min(lon+dlon,lon1):.4f},{min(lat+dlat,lat1):.4f}")
    lon+=dlon
  lat+=dlat
PY
while IFS= read -r bbox; do
  f="$OUT/osm/tile_${bbox//,/_}.osm"
  fetch "https://api.openstreetmap.org/api/0.6/map?bbox=$bbox" "$f"
  echo "osm $bbox $(stat -c %s "$f")"
  sleep 1
done < "$OUT/osm/tiles.txt"

# Terrarium tiles at zoom 15 covering the bbox
python3 - "$LON0" "$LON1" "$LAT0" "$LAT1" > "$OUT/terrain/tiles.txt" <<'PY'
import sys, math
lon0,lon1,lat0,lat1=map(float,sys.argv[1:])
z=15; n=2**z
def tx(lon): return int((lon+180)/360*n)
def ty(lat): return int((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n)
for x in range(tx(lon0), tx(lon1)+1):
  for y in range(ty(lat1), ty(lat0)+1):
    print(z, x, y)
PY
while read -r z x y; do
  fetch "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/$z/$x/$y.png" "$OUT/terrain/${z}_${x}_${y}.png"
done < "$OUT/terrain/tiles.txt"
echo done
