#!/usr/bin/env python3
"""
截图脱敏 —— 课件截图里含有真实患者信息（姓名 / 患者ID / 电话 / 证件号码 / 二维码 / 腕带条码）。
本地留存原件，对外发布一律用脱敏版：先像素化这些区域，再交给 GitHub / Netlify。

区域来源与 HOT（交互热点）同一套网格标尺人工校准；本文件是唯一事实源。

用法：
  PY=/Users/sean/.agents/skills/yingzao/.venv/bin/python
  $PY tools/mask-pii.py --check      # 只报告将处理哪些图与区域，不改文件
  $PY tools/mask-pii.py              # 备份原件到 assets/img-original/ 后原地脱敏
"""
import argparse
import pathlib
import shutil
import sys

import cv2
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
IMG = ROOT / "assets" / "img"
BACKUP = ROOT / "assets" / "img-original"

# 每张图要打码的矩形（归一化 x, y, w, h）+ 该区域是什么
MASKS = {
    "03-new-patient.png": [
        (0.235, 0.046, 0.650, 0.082, "身份信息带：患者ID / 姓名 / 电话 / 出生日期 / 年龄"),
        (0.355, 0.650, 0.390, 0.070, "证件号码行"),
    ],
    "04-complete-info.png": [
        (0.235, 0.018, 0.650, 0.078, "身份信息带：患者ID / 姓名 / 电话 / 出生日期 / 年龄"),
        (0.225, 0.665, 0.520, 0.070, "证件类型 / 证件号码行"),
    ],
    "05-consent-doctor-sign.png": [
        (0.130, 0.025, 0.130, 0.080, "患者页签（姓名 / 性别）"),
        (0.215, 0.420, 0.390, 0.105, "患者手写签名区", "px18"),
    ],
    "06-start-patient-sign.png": [
        (0.130, 0.025, 0.130, 0.080, "患者页签（姓名 / 性别）"),
        (0.285, 0.495, 0.470, 0.105, "弹窗·患者基本信息（姓名 / 性别 / 年龄 / 证件）"),
        (0.285, 0.670, 0.470, 0.140, "弹窗·本人身份信息（姓名 / 证件类型 / 证件号码）"),
    ],
    "07-patient-signed.png": [
        (0.130, 0.020, 0.130, 0.080, "患者页签（姓名 / 性别）"),
        (0.205, 0.415, 0.400, 0.110, "患者手写签名区", "px18"),
    ],
    "08-id-qr.png": [
        (0.130, 0.020, 0.130, 0.080, "患者页签（姓名 / 性别）"),
        (0.385, 0.085, 0.265, 0.300, "弹窗·姓名 / 患者ID / 检查ID / 性别 / 年龄 / 证件号码"),
        (0.415, 0.350, 0.215, 0.315, "患者二维码（编码身份信息）", "fill"),
    ],
    "09-devices-pda.png": [
        (0.650, 0.160, 0.280, 0.125, "PDA 屏·患者ID / 姓名"),
        (0.390, 0.885, 0.300, 0.115, "腕带条码标签", "fill"),
    ],
    "10-bedside-scan.png": [
        (0.080, 0.030, 0.330, 0.105, "床旁屏·患者ID / 姓名 / 年龄"),
    ],
    "11-bedside-record-entry.png": [
        (0.110, 0.025, 0.360, 0.110, "床旁屏·患者ID / 出生日期"),
    ],
    "12-patient-detail-flags.png": [
        (0.045, 0.185, 0.155, 0.090, "患者姓名 / 性别 / 年龄"),
    ],
    "14-anes-confirm.png": [
        (0.080, 0.755, 0.230, 0.085, "麻醉医生手写签名", "px18"),
    ],
    "15-out-pacu-confirm.png": [
        (0.115, 0.005, 0.150, 0.058, "患者姓名 / 性别"),
    ],
    "16-record-aldrete.png": [
        (0.120, 0.002, 0.155, 0.058, "患者姓名 / 性别"),
        (0.100, 0.740, 0.125, 0.075, "麻醉医生手写签名", "px18"),
    ],
}

# 遮盖模式：
#   "px9"  普通文字字段（9px 像素块，读不出字，但看得出"这里有个字段"）
#   "px18" 手写签名（块更大，笔画形状不可辨）
#   "fill" 二维码 / 条码（实心遮盖 —— 像素化对高对比二值图案无效：
#                        9px 块 ≈ 二维码模块尺寸，图案会原样存活）
MODE_BLOCK = {"px9": 9, "px18": 18}


def pixelate(img, x, y, w, h, mode="px9"):
    H, W = img.shape[:2]
    x0, y0 = max(0, int(x * W)), max(0, int(y * H))
    x1, y1 = min(W, int((x + w) * W)), min(H, int((y + h) * H))
    if x1 - x0 < 2 or y1 - y0 < 2:
        return
    if mode == "fill":
        patch = img[max(0, y0 - 2):y0, max(0, x0 - 2):x1]
        tone = int(patch.mean()) if patch.size else 220
        img[y0:y1, x0:x1] = np.clip(tone, 190, 240)
        return
    blk = MODE_BLOCK.get(mode, 9)
    roi = img[y0:y1, x0:x1]
    small = cv2.resize(roi, (max(2, (x1 - x0) // blk), max(2, (y1 - y0) // blk)),
                       interpolation=cv2.INTER_AREA)
    img[y0:y1, x0:x1] = cv2.resize(small, (x1 - x0, y1 - y0), interpolation=cv2.INTER_NEAREST)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只报告，不改文件")
    args = ap.parse_args()

    if args.check:
        total = 0
        for name, rects in MASKS.items():
            p = IMG / name
            flag = "✓" if p.exists() else "✗ 缺图"
            total += len(rects)
            print(f"{flag} {name:34s} {len(rects)} 处：" + "、".join(r[4] for r in rects))
        print(f"\n共 {len(MASKS)} 张图 / {total} 个区域待脱敏")
        return

    BACKUP.mkdir(parents=True, exist_ok=True)
    done = 0
    for name, rects in MASKS.items():
        src = IMG / name
        if not src.exists():
            print(f"  ⚠️  跳过（缺图）：{name}")
            continue
        bak = BACKUP / name
        if not bak.exists():                      # 原件只备份一次
            shutil.copy2(src, bak)
        img = cv2.imread(str(bak))                # 始终从原件生成，可反复执行
        if img is None:
            print(f"  ⚠️  读不到：{name}")
            continue
        for r in rects:
            x, y, w, h = r[0], r[1], r[2], r[3]
            pixelate(img, x, y, w, h, r[5] if len(r) > 5 else "px9")
        cv2.imwrite(str(src), img, [cv2.IMWRITE_PNG_COMPRESSION, 6])
        done += 1
        print(f"  ✅ {name:34s} 打了 {len(rects)} 处")
    print(f"\n完成：{done} 张已脱敏；原件备份在 {BACKUP.relative_to(ROOT)}/（已加入 .gitignore，不会发布）")


if __name__ == "__main__":
    sys.exit(main())
