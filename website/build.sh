#!/bin/bash
# Assembles the course website from parts.
# Run from the website directory: bash build.sh
#
# Expected structure:
#   website/
#     _base.html      (customized template shell)
#     _footer.html    (closing tags)
#     build.sh        (this script)
#     styles.css      (pre-built CSS)
#     main.js         (pre-built JS)
#     manifest.json   (PWA manifest)
#     sw.js           (service worker)
#     modules/        (day/module content files)
#       01-topic.html
#       02-topic.html
#       ...
#     icons/          (PWA icons)
#     diagrams/       (exported SVGs)

set -e

if [ ! -d "modules" ] || [ -z "$(ls modules/*.html 2>/dev/null)" ]; then
  echo "Error: No module files found in modules/"
  exit 1
fi

cat _base.html modules/*.html _footer.html > index.html

MODULE_COUNT=$(ls modules/*.html | wc -l | tr -d ' ')
echo "✅ Built index.html — $MODULE_COUNT modules assembled."
echo "   Open in browser to preview."
