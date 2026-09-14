#!/usr/bin/env bash
# 一键发布：白名单打包 → Netlify 生产发布 → 线上验收
# 用法：tools/deploy.sh [--site <netlify-site-name>]
set -euo pipefail
cd "$(dirname "$0")/.."

SITE_ARG=()
[[ "${1:-}" == "--site" && -n "${2:-}" ]] && SITE_ARG=(--site "$2")

echo "▶ 1/4  白名单打包 dist/"
node tools/build-dist.mjs

echo "▶ 2/4  检查未脱敏原件未混入发布目录"
if grep -rl . dist/ --include='*' -e 'img-original' >/dev/null 2>&1; then
  echo "❌ dist 中出现 img-original 引用，已中止"; exit 1
fi
echo "   ✅ 干净"

echo "▶ 3/4  Netlify 生产发布"
if [[ -z "${NETLIFY_AUTH_TOKEN:-}" ]]; then
  netlify status >/dev/null 2>&1 || { echo "❌ 未登录 Netlify。先 netlify login，或 export NETLIFY_AUTH_TOKEN=xxx"; exit 1; }
fi
netlify deploy --prod --dir=dist "${SITE_ARG[@]}"

echo "▶ 4/4  线上验收"
URL="$(netlify status --json 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("siteData",{}).get("ssl_url") or d.get("siteData",{}).get("url",""))' 2>/dev/null || true)"
if [[ -n "$URL" ]]; then
  CODE="$(curl -sS -o /dev/null -w '%{http_code}' "$URL/")"
  TITLE="$(curl -sS "$URL/" | grep -o '<title>[^<]*' | head -1 | sed 's/<title>//')"
  ROBO="$(curl -sSI "$URL/" | grep -i '^x-robots-tag' | tr -d '\r' || echo '（无）')"
  echo "   HTTP $CODE | 标题：$TITLE"
  echo "   $ROBO"
  [[ "$CODE" == "200" ]] && echo "✅ 已上线：$URL" || { echo "❌ 线上返回 $CODE"; exit 1; }
else
  echo "   （未取到站点 URL，请到 Netlify 后台确认）"
fi
