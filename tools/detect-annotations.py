#!/usr/bin/env python3
"""
从课件截图里自动提取「红色标注」的矩形区域 —— 原厂商已经在图上画了红框/红字/红箭头，
这些正是每一步操作要指向的界面元素。把它们检测出来当交互热点，比我肉眼估坐标准得多。

输出：tools/annotations.json  { "01-login.png": [ {x,y,w,h,area}, ... ], ... }（坐标为 0..1 归一化）

用法：
  CAP_PYTHON=$HOME/.agents/skills/yingzao/.venv/bin/python tools/detect-annotations.py
"""
import json
import pathlib

import cv2
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
IMG_DIR = ROOT / "assets" / "img"
OUT = ROOT / "tools" / "annotations.json"

# 红色标注判定：R 明显高于 G/B，且足够饱和；覆盖红字、红框、红箭头
def red_mask(bgr):
    b, g, r = bgr[:, :, 0].astype(int), bgr[:, :, 1].astype(int), bgr[:, :, 2].astype(int)
    m = (r > 110) & (r - np.maximum(g, b) > 45) & (g < 140) & (b < 140)
    return (m.astype(np.uint8)) * 255


def clusters(mask, k_open=3, k_dilate=13):
    """闭运算把红字笔画连成块，再轻度膨胀让「箭头+文字+目标框」聚成一组"""
    k1 = cv2.getStructuringElement(cv2.MORPH_RECT, (k_open, k_open))
    k2 = cv2.getStructuringElement(cv2.MORPH_RECT, (k_dilate, k_dilate))
    m = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k1, iterations=2)
    m = cv2.dilate(m, k2, iterations=2)
    n, _, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    boxes = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        boxes.append((int(x), int(y), int(w), int(h), int(area)))
    return boxes


def main():
    result = {}
    for p in sorted(IMG_DIR.glob("*.png")):
        img = cv2.imread(str(p))
        if img is None:
            continue
        H, W = img.shape[:2]
        mask = red_mask(img)
        ratio = float((mask > 0).sum()) / (W * H)
        raw = clusters(mask)
        # 过滤：太小的（噪点/图标红点）与太大的（整幅误判）都丢掉
        boxes = []
        for x, y, w, h, area in raw:
            if w * h < (W * H) * 0.0004:      # < 0.04% 画面
                continue
            if w * h > (W * H) * 0.55:        # > 55% 画面
                continue
            # 去掉膨胀带来的外扩（每边约 k_dilate*2 px）
            pad = 26
            x, y = x + pad, y + pad
            w, h = max(4, w - 2 * pad), max(4, h - 2 * pad)
            x, y = max(0, x), max(0, y)
            w, h = min(w, W - x), min(h, H - y)
            boxes.append({
                "x": round(x / W, 4), "y": round(y / H, 4),
                "w": round(w / W, 4), "h": round(h / H, 4),
                "px": [x, y, w, h], "area": area,
            })
        boxes.sort(key=lambda b: -b["area"])
        result[p.name] = {"size": [W, H], "red_ratio": round(ratio, 5), "boxes": boxes}
        print(f"{p.name:34s} {W}x{H}  红像素 {ratio:6.2%}  簇 {len(boxes):2d}  "
              + " | ".join(f"({b['x']:.2f},{b['y']:.2f},{b['w']:.2f},{b['h']:.2f})" for b in boxes[:5]))

    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n→ 写出 {OUT.relative_to(ROOT)}（{len(result)} 张图）")


if __name__ == "__main__":
    main()
