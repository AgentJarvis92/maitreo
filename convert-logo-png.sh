#!/bin/bash

# Convert SVG logo to PNG 32x32
cat > /tmp/logo.svg << 'SVG'
<svg viewBox="0 0 1000 1000" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path fill="#000000" d="M500,999.94C224.3,999.94,0,775.65,0,499.95S224.3-.05,500-.05s500,224.3,500,500-224.3,500-500,500ZM500,71.92c-236.01,0-428.02,192.01-428.02,428.02s192.01,428.02,428.02,428.02,428.02-192.01,428.02-428.02S736.02,71.92,500,71.92Z"></path>
  <rect fill="#000000" x="679.07" y="244.75" width="71.98" height="510.39"></rect>
  <rect fill="#000000" x="175.33" y="463.96" width="649.33" height="71.98"></rect>
  <rect fill="#000000" x="472.05" y="293.72" width="71.97" height="349.04"></rect>
  <rect fill="#000000" x="265.02" y="244.75" width="71.98" height="510.39"></rect>
</svg>
SVG

# Try to convert using ImageMagick
if command -v convert &> /dev/null; then
  convert -density 96 -background white /tmp/logo.svg -resize 32x32 /tmp/logo.png
  base64 -i /tmp/logo.png | tr -d '\n'
else
  echo "ImageMagick not installed"
fi
