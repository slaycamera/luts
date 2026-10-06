#!/usr/bin/env bash
# Builds "original · graded" preview images for every LUT.
#
#   tools/build-previews.sh path/to/photo.webp [outdir]
#
# Requires ffmpeg. The source photo is not stored in the repo; any photo works.

set -euo pipefail

SRC="${1:?usage: build-previews.sh <photo> [outdir]}"
OUT="${2:-previews}"

if ! command -v ffmpeg >/dev/null; then
  echo "ffmpeg is required" >&2
  exit 1
fi

mkdir -p "$OUT"

for lut in luts/*.cube; do
  name="$(basename "$lut" .cube)"
  ffmpeg -hide_banner -loglevel error -y -i "$SRC" -filter_complex \
    "[0:v]format=rgb24,scale=760:-2,split[a][b];\
[b]lut3d=file=$lut:interp=trilinear,format=rgb24[graded];\
[a]pad=iw+16:ih:0:0:color=0x111111[a1];\
[a1][graded]hstack=inputs=2[out]" \
    -map "[out]" -frames:v 1 -q:v 3 "$OUT/$name.jpg"
  echo "wrote $OUT/$name.jpg"
done
