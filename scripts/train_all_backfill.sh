#!/bin/bash
# train_all_backfill.sh — bù đắp toàn bộ giao thức: roster 2 game lớn (chain tuần tự)
cd "D:/Ni-Oh" || exit 1
echo "=== [1/2] GENSHIN IMPACT ==="
node tools/agy/coverage_roster.js genshin-impact --lists "Genshin Impact" && \
node tools/agy/coverage_roster.js genshin-impact --concepts && \
node tools/agy/coverage_roster.js genshin-impact --sits && \
node tools/agy/direct_importer.js genshin-impact
echo "=== [2/2] VALORANT ==="
node tools/agy/coverage_roster.js valorant --lists "VALORANT" && \
node tools/agy/coverage_roster.js valorant --concepts && \
node tools/agy/coverage_roster.js valorant --sits && \
node tools/agy/direct_importer.js valorant
echo "=== BACKFILL CHAIN DONE ==="
