#!/bin/bash
# Low-res preview renders of single scenes, each with its own synthesised audio:
#   scripts/dev/reel.sh <scene-id>...  -> output/reel/<id>.mp4 (with sound)
# rm-render --only rewrites output/cues.json (and rm-audio writes output/rm-audio.wav) for that one
# scene, so the film's copies are saved first and restored at the end.
cd "$(dirname "$0")/../.."
F=node_modules/ffmpeg-static/ffmpeg
mkdir -p output/reel
# save the film's copies once (a restarted run must not save a single scene's over them)
[ -f output/reel/film-cues.json ] || cp output/cues.json output/reel/film-cues.json
[ -f output/reel/film-audio.wav ] || { [ -f output/rm-audio.wav ] && cp output/rm-audio.wav output/reel/film-audio.wav; }
for id in "$@"; do
  [ -f output/reel/$id.mp4 ] && continue
  node scripts/rm-render.mjs --workers ${WORKERS:-2} --only $id --noaudio --qs scale=${SCALE:-0.5} --out output/reel/$id-raw.mp4 || continue
  npx tsx scripts/rm-audio.ts >/dev/null
  $F -loglevel error -y -i output/reel/$id-raw.mp4 -i output/rm-audio.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 128k -shortest output/reel/$id.mp4
  echo "reel: $id done"
done
cp output/reel/film-cues.json output/cues.json
[ -f output/reel/film-audio.wav ] && cp output/reel/film-audio.wav output/rm-audio.wav
