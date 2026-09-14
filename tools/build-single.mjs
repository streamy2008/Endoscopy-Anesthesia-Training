#!/usr/bin/env node
/**
 * 把多文件版本打包成「单文件版 HTML」：
 *   index.html + assets/app.css + assets/data.js + assets/app.js + assets/img/*.png(base64)
 *   → 京东方内镜培训-单文件版.html
 *
 * 用法： node tools/build-single.mjs
 * 产物可直接双击打开（离线可用、无任何外部依赖），便于拷 U 盘 / 微信发送。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFile(resolve(root, p), 'utf8');

const [html, css, data, app] = await Promise.all([
  read('index.html'),
  read('assets/app.css'),
  read('assets/data.js'),
  read('assets/app.js')
]);

/* 图片 → data URI。
   注意：图片路径分散在 index.html（当前 0 处）、data.js（步骤截图）与 app.js（硬件台）里，
   必须三处一起扫；只扫 index.html 会「一张都没内联」 */
const imgNames = [...new Set(
  [...(html + data + app).matchAll(/assets\/img\/[\w.-]+\.png/g)].map((m) => m[0])
)];
const imgMap = new Map();
for (const rel of imgNames) {
  const buf = await readFile(resolve(root, rel));
  imgMap.set(rel, 'data:image/png;base64,' + buf.toString('base64'));
}

/* 关键：替换内容一律用「函数形式」的 replacer。
   若直接传字符串，JS 会解析其中的 $ 模式 —— app.js 里满是 $$(...) 选择器，
   $$ 会被还原成单个 $、$\` 会插回匹配点之前的整段文档，代码当场被改写坏掉
   （典型症状：Uncaught SyntaxError: Identifier '$' has already been declared）。 */
let out = html
  .replace(/<link rel="stylesheet" href="assets\/app\.css">/, () => `<style>\n${css}\n</style>`)
  .replace(/<script src="assets\/data\.js"><\/script>/, () => `<script>\n${data}\n</script>`)
  .replace(/<script src="assets\/app\.js"><\/script>/, () => `<script>\n${app}\n</script>`);

for (const [rel, uri] of imgMap) out = out.split(rel).join(uri);

/* 打包后不应再有任何相对资源引用 */
const leftover = out.match(/assets\/(img|app\.(css|js)|data\.js)[\w./-]*/g);
if (leftover) {
  console.error('❌ 仍有未内联的资源引用：', [...new Set(leftover)].join(', '));
  process.exit(1);
}

const target = resolve(root, '京东方内镜培训-单文件版.html');
await writeFile(target, out, 'utf8');
const mb = (Buffer.byteLength(out, 'utf8') / 1024 / 1024).toFixed(1);
console.log(`✅ 已生成单文件版：${target}`);
console.log(`   内联：CSS 1 份 · JS 2 份 · 图片 ${imgMap.size} 张 · 体积 ${mb} MB`);
