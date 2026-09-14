#!/usr/bin/env node
/**
 * 生成「只用于发布」的 dist/ 目录。
 *
 * 为什么必须单独打包：项目目录里同时存在
 *   assets/img-original/   ← 含患者信息的未脱敏原件（仅本地留存）
 *   *.pptx                 ← 厂商原始课件
 *   tools/、*.md           ← 内部文件
 * 如果直接把项目根当发布目录，这些都会被上传到公网。
 * 本脚本用白名单复制，发布目录里只可能出现 index.html 与 assets/{app.css,data.js,app.js,img/}。
 *
 * 用法：node tools/build-dist.mjs
 */
import { cp, mkdir, rm, writeFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const ALLOW = ['index.html', 'assets/app.css', 'assets/data.js', 'assets/app.js'];
const IMG_DIR = 'assets/img';

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, 'assets'), { recursive: true });

for (const rel of ALLOW) {
  await cp(join(root, rel), join(dist, rel));
}

const imgs = (await readdir(join(root, IMG_DIR))).filter((f) => f.endsWith('.png'));
await mkdir(join(dist, IMG_DIR), { recursive: true });
for (const f of imgs) await cp(join(root, IMG_DIR, f), join(dist, IMG_DIR, f));

/* 不索引：内网培训页，不需要被搜索引擎收录 */
await writeFile(join(dist, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');

/* 发布目录白名单自检 —— 出现任何非预期文件就地失败 */
const found = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else found.push(p.slice(dist.length + 1));
  }
}
await walk(dist);
const illegal = found.filter(
  (f) => !(f === 'index.html' || f === 'robots.txt' ||
           f === 'assets/app.css' || f === 'assets/data.js' || f === 'assets/app.js' ||
           f.startsWith(IMG_DIR + '/'))
);
if (illegal.length) {
  console.error('❌ 发布目录出现非白名单文件，已中止：');
  illegal.forEach((f) => console.error('   ' + f));
  process.exit(1);
}
if (found.some((f) => f.includes('original'))) {
  console.error('❌ 发布目录疑似含未脱敏原件，已中止');
  process.exit(1);
}

const size = (await Promise.all(found.map(async (f) => (await stat(join(dist, f))).size)))
  .reduce((a, b) => a + b, 0);
console.log(`✅ dist/ 就绪：${found.length} 个文件 · ${(size / 1024 / 1024).toFixed(1)} MB`);
console.log(`   含 index.html + ${imgs.length} 张脱敏截图 + robots.txt(noindex)`);
