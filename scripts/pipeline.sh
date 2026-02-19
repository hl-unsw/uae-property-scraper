#!/bin/bash
# UAE Property Scraper - Data Pipeline
# 流程：增量爬取 -> 房源评分 -> 导出 JSON -> Git Push

set -e # 遇到错误立即停止

echo "🚀 [1/4] Starting incremental scrapes..."
npm run scrape:incremental
npm run scrape:dubizzle:incremental
npm run scrape:bayut:incremental

echo "🎯 [2/4] Running targeted scoring..."
npm run search:targeted

echo "📦 [3/4] Exporting to static JSON..."
npm run export:json

echo "📤 [4/4] Pushing to GitHub for Vercel deployment..."
git add data/static/*.json
# 检查是否有数据变化，防止空提交
if git diff --staged --quiet; then
    echo "✅ No data changes detected. Skipping push."
else
    git commit -m "data: automatic update $(date +'%Y-%m-%d %H:%M')"
    git push origin main
    echo "🚀 Data pushed! Vercel will redeploy shortly."
fi

echo "✨ All done!"
