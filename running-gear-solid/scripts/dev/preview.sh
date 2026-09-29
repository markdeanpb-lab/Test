#!/bin/bash
# Per-chapter previews under 28 MiB each (with the film's audio): scripts/dev/preview.sh [first-N-parts]
# -> output/preview/NN-<chapter>.mp4
set -e
cd "$(dirname "$0")/../.."
F=node_modules/ffmpeg-static/ffmpeg
mkdir -p output/preview
N=${1:-99}
t0=0
k=0
for p in $(ls output/parts/*.mp4 | sort); do
  [ $k -ge $N ] && break
  d=$($F -i "$p" 2>&1 | sed -n 's/.*Duration: \([0-9:.]*\).*/\1/p' | awk -F: '{print $1*3600+$2*60+$3}')
  out=output/preview/$(basename "$p")
  # total budget 28 MiB, 128 kbps audio, video rate capped at 3.5 Mbps
  vk=$(awk -v d="$d" 'BEGIN{v=int(28*8388.608/d-128); if(v>3500)v=3500; print v}')
  h=720; [ "$vk" -lt 1400 ] && h=540
  echo "$(basename "$p"): ${d}s from ${t0}s -> ${vk}k video at ${h}p"
  $F -loglevel error -y -i "$p" -ss "$t0" -t "$d" -i output/rm-audio.wav -map 0:v -map 1:a -vf "scale=-2:$h:flags=lanczos" -c:v libx264 -preset slow -b:v ${vk}k -pass 1 -passlogfile output/preview/pass -an -f null /dev/null
  $F -loglevel error -y -i "$p" -ss "$t0" -t "$d" -i output/rm-audio.wav -map 0:v -map 1:a -vf "scale=-2:$h:flags=lanczos" -c:v libx264 -preset slow -b:v ${vk}k -pass 2 -passlogfile output/preview/pass -c:a aac -b:a 128k -movflags +faststart -shortest "$out"
  ls -la "$out"
  t0=$(awk -v a="$t0" -v b="$d" 'BEGIN{print a+b}')
  k=$((k+1))
done
rm -f output/preview/pass*
