#!/bin/bash

# Navigate to the UI components directory
cd /home/jorge/projects/geonet-bot/src/components/ui

# Find all .tsx files and remove @latest or similar version specifiers from imports
for file in *.tsx; do
  if [ -f "$file" ]; then
    # Remove @latest, @^version, @~version, @version patterns from imports
    sed -i -E 's/(from ["\047][^"\047]+)@[^"\047\/]+(\/[^"\047]+)?(["\047])/\1\2\3/g' "$file"
    echo "Processed: $file"
  fi
done

echo "Done! All version specifiers removed from imports."
