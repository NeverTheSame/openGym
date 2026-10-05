#!/usr/bin/env bash
# Turns the six exercise-card PDFs into public/physio/<n>.webp and writes their manifest to
# src/lib/physio-cards.json. Each card renders at 200 dpi (1200×800) and keeps its top 93%:
# the footer line naming the patient and therapist starts at row 758, the lowest picture ends
# at row 741. cwebp does the crop: sips centres a 0,0 --cropOffset, and it cannot write WebP.
# Needs pdftoppm (poppler), cwebp (libwebp) and sips (macOS). Usage: scripts/physio-cards.sh <pdf-dir>
set -euo pipefail
src=${1:?pdf dir}
command -v cwebp >/dev/null || { echo 'physio-cards: needs cwebp (brew install webp)' >&2; exit 1; }
here=$(cd "$(dirname "$0")/.." && pwd)
out="$here/public/physio"
manifest="$here/src/lib/physio-cards.json"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$out"
cards=(Double_Leg_Lift Bilateral_Hip_IR_AROM Thoracic_Extension_Opener Archer Chin_Tuck Supine_Lying_Foam_Roller)
echo '[' > "$tmp/manifest.json"
for i in "${!cards[@]}"; do
  n=$((i + 1))
  png="$tmp/$n.png"
  webp="$out/$n.webp"
  pdftoppm -r 200 -png -singlefile "$src/${n}_${cards[$i]}.pdf" "$tmp/$n"
  w=$(sips -g pixelWidth "$png" | awk '/pixelWidth/ {print $2}')
  h=$(sips -g pixelHeight "$png" | awk '/pixelHeight/ {print $2}')
  cwebp -quiet -q 82 -crop 0 0 "$w" $((h * 93 / 100)) "$png" -o "$webp"
  hash=$(shasum -a 256 "$webp" | cut -d ' ' -f 1)
  size=$(wc -c < "$webp" | tr -d ' ')
  w=$(sips -g pixelWidth "$webp" | awk '/pixelWidth/ {print $2}')
  h=$(sips -g pixelHeight "$webp" | awk '/pixelHeight/ {print $2}')
  if [ "$n" -lt "${#cards[@]}" ]; then sep=,; else sep=; fi
  printf '  { "n": %d, "file": "physio/%d.webp", "hash": "%s", "size": %d, "width": %d, "height": %d }%s\n' \
    "$n" "$n" "$hash" "$size" "$w" "$h" "$sep" >> "$tmp/manifest.json"
done
echo ']' >> "$tmp/manifest.json"
mv "$tmp/manifest.json" "$manifest"
echo "${#cards[@]} cards written to $out and $manifest"
