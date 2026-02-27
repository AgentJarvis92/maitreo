#!/bin/bash

# Create a simple PNG logo using ImageMagick or fallback
# For now, create the base64 of a simple SVG that's more compatible

# Create SVG
cat > /tmp/maitreo-logo.svg << 'SVG'
<svg viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg">
  <path fill="#000000" d="M500,999.94C224.3,999.94,0,775.65,0,499.95S224.3-.05,500-.05s500,224.3,500,500-224.3,500-500,500ZM500,71.92c-236.01,0-428.02,192.01-428.02,428.02s192.01,428.02,428.02,428.02,428.02-192.01,428.02-428.02S736.02,71.92,500,71.92Z"/>
  <rect fill="#000000" x="679.07" y="244.75" width="71.98" height="510.39"/>
  <rect fill="#000000" x="175.33" y="463.96" width="649.33" height="71.98"/>
  <rect fill="#000000" x="472.05" y="293.72" width="71.97" height="349.04"/>
  <rect fill="#000000" x="265.02" y="244.75" width="71.98" height="510.39"/>
</svg>
SVG

# Try with sips (macOS native)
if command -v sips &> /dev/null; then
  sips -z 32 32 /tmp/maitreo-logo.svg --out /tmp/maitreo-logo.png
  echo "✅ Logo created with sips"
  file /tmp/maitreo-logo.png
else
  echo "sips not available"
fi
