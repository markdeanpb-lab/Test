#!/bin/sh
# Build a contact sheet (3 per row) from output/review stills: scripts/sheet.sh out.png t1 t2 ...
out=$1; shift
FF=node_modules/ffmpeg-static/ffmpeg
args=""; n=0
for t in "$@"; do f=$(printf "output/review/t_%07.2f.png" "$t"); args="$args -i $f"; n=$((n+1)); done
rows=$(( (n+2)/3 )); filt=""; k=0; rowl=""
r=0
while [ $r -lt $rows ]; do
  ins=""; c=0
  while [ $c -lt 3 ]; do
    if [ $k -lt $n ]; then ins="$ins[$k:v]"; else ins="$ins[pad$r$c]"; filt="$filt color=black:960x540:d=1[pad$r$c];"; fi
    k=$((k+1)); c=$((c+1))
  done
  filt="$filt${ins}hstack=3[r$r];"; rowl="$rowl[r$r]"; r=$((r+1))
done
if [ $rows -gt 1 ]; then filt="$filt${rowl}vstack=$rows,scale=iw/2:ih/2[o]"; else filt="$filt${rowl}scale=iw/2:ih/2[o]"; fi
$FF -y -loglevel error $args -filter_complex "$filt" -map "[o]" -frames:v 1 "$out"
