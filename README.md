# 内镜麻醉无线监护文书系统 · 操作流程现场培训页面

把原课件（`内镜麻醉无线监护文书系统操作流程.pptx`，21 页）重做成**可点、可练、可考**的单页培训应用。
零依赖、无 CDN、无构建，双击 `index.html` 即用，适合培训室断网环境。

## 页面结构（一屏一事）

| 层 | 模块 | 作用 |
|---|---|---|
| L0 | 首屏 + 01 先认设备 + 02 全流程地图 | 30 秒建立整体感：六件设备、十四步一条线 |
| L1 | 03 角色分步实训（14 步） | **图上一一步步走**：聚光灯落在该点的按钮/字段上，文字默认只显示当前这一步 |
| L2 | 04 扫码模拟器 + 05 排序挑战 + 06 结业考核（14 题） | 动手练 + 检验 |
| 带走物 | 07 一页速查卡 | A4 打印，贴检查间 / 复苏室 / 门诊工位 |

## 本地使用

```bash
open index.html                    # 直接打开（file:// 即可，无需服务器）
```

生成便于分发的单文件版（CSS/JS/图片全内联，约 17 MB）：

```bash
node tools/build-single.mjs        # → 京东方内镜培训-单文件版.html
```

## 内容维护

**所有文案集中在 `assets/data.js`**，改内容不必动渲染逻辑：

| 想改什么 | 数组 |
|---|---|
| 系统名称 / 版本 / 首屏文案 / 数字 | `META` |
| 设备热区图（含图中坐标 x/y 百分比） | `DEVICES` |
| 四环节名称 / 地点 / 本环节最易错 | `ROLES` |
| 14 步操作卡 | `STEPS` |
| **分步演示的热点坐标**（每步打在图上哪个位置） | `HOT` |
| 模拟器设备台与 11 个动作 | `SIM_TOOLS` / `SIM_STEPS` |
| 排序题 / 考核题 | `SORT_ITEMS` / `QUIZ` |

热点坐标由 `tools/detect-annotations.py`（OpenCV 检出截图里厂商画的红色标注）+ 10% 网格标尺人工校准，不是估的。

## 发布

```bash
node tools/build-dist.mjs          # 生成白名单发布目录 dist/（只含 index.html + assets）
netlify deploy --prod --dir=dist   # 部署到 Netlify
```

> ⚠️ **发布目录必须是 `dist/`**。`assets/img-original/` 存放含患者信息的未脱敏原件（姓名 / 患者ID /
> 电话 / 证件号 / 二维码 / 腕带条码），已在 `.gitignore` 中排除，且 `build-dist.mjs` 有白名单自检。
> 对外版本用 `tools/mask-pii.py` 脱敏后的 `assets/img/`。

## 自查

```bash
/Users/sean/.agents/skills/cad-viewer/scripts/viewer/.venv/bin/python tools/verify.py
```

Playwright 实机跑两种产物，断言 30 项：渲染数量、14 个分步演示 / 61 步热点、操作项折叠、
时间轴进度、模拟器 11 节点、灯箱、讲师模式、考核满分、首屏动效、无 JS 错误、无断图、无横向溢出。

## 素材与合规

- 截图素材来自厂商课件；对外版本已用 `tools/mask-pii.py` 对患者身份信息做像素化 / 实心遮盖。
- 截图界面左上方显示的是**兄弟医院**（首都医科大学附属北京佑安医院）的部署实例，功能与本系统一致。
- 站点带 `X-Robots-Tag: noindex` 与 `robots.txt`，不参与搜索引擎收录。
