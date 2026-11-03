#!/bin/sh
# Contact sheet of a finished video, for checking it without watching it:
#   sh sheet.sh set-up-your-club [seconds between frames]
ffmpeg -y -v error -i "../public/guides/$1.mp4" -vf "fps=1/${2:-3},scale=640:-1,tile=3x4" -frames:v 1 ".work/sheet-$1.png"
