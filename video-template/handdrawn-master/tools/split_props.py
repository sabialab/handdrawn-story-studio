#!/usr/bin/env python3
"""Split the four largest alpha components from the generated prop sheet."""

from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


# ── 换常量区（每片按素材工单改这两个值再跑；下面的算法不用动）──
# SOURCE  ＝ 多道具绿幕图抠完后的 RGBA 大图
# OUTPUTS ＝ 按 alpha 连通域面积从大到小对应的输出文件名
SOURCE = Path("public/raw/props-rgba.png")
OUTPUTS = {
    "a": Path("public/prop-a.png"),
    "b": Path("public/prop-b.png"),
    "c": Path("public/prop-c.png"),
    "d": Path("public/prop-d.png"),
}
MIN_COMPONENT_RATIO = 0.005
PADDING = 12


def components(mask: np.ndarray) -> list[np.ndarray]:
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    found: list[np.ndarray] = []
    for y, x in zip(*np.nonzero(mask & ~seen), strict=True):
        if seen[y, x]:
            continue
        queue = deque([(int(y), int(x))])
        seen[y, x] = True
        pixels: list[tuple[int, int]] = []
        while queue:
            py, px = queue.popleft()
            pixels.append((py, px))
            for ny, nx in ((py - 1, px), (py + 1, px), (py, px - 1), (py, px + 1)):
                if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    queue.append((ny, nx))
        found.append(np.asarray(pixels, dtype=np.int32))
    return found


def metrics(image: np.ndarray) -> tuple[float, float, int]:
    alpha = image[..., 3]
    transparent = float(np.mean(alpha == 0) * 100)
    semitransparent = float(np.mean((alpha > 0) & (alpha < 255)) * 100)
    visible = image[alpha > 0, :3].astype(np.int16)
    residual = int(np.max(visible[:, 1] - np.maximum(visible[:, 0], visible[:, 2])))
    return transparent, semitransparent, residual


def main() -> None:
    rgba = np.asarray(Image.open(SOURCE).convert("RGBA"))
    alpha_mask = rgba[..., 3] > 8
    minimum = int(alpha_mask.size * MIN_COMPONENT_RATIO)
    found = [item for item in components(alpha_mask) if len(item) >= minimum]
    if len(found) != 4:
        raise RuntimeError(f"期望 4 个主体连通域，实际 {len(found)} 个")

    records = []
    for item in found:
        ys, xs = item[:, 0], item[:, 1]
        records.append(
            {
                "pixels": item,
                "area": len(item),
                "cx": float(xs.mean()),
                "cy": float(ys.mean()),
                "x0": int(xs.min()),
                "x1": int(xs.max()) + 1,
                "y0": int(ys.min()),
                "y1": int(ys.max()) + 1,
            }
        )

    coin = min(records, key=lambda item: item["area"])
    bills = sorted((item for item in records if item is not coin), key=lambda item: (item["cy"], item["cx"]))
    named = list(zip(("a", "b", "c"), bills, strict=True)) + [("coin", coin)]

    height, width = alpha_mask.shape
    for name, record in named:
        x0 = max(0, record["x0"] - PADDING)
        x1 = min(width, record["x1"] + PADDING)
        y0 = max(0, record["y0"] - PADDING)
        y1 = min(height, record["y1"] + PADDING)
        isolated = np.zeros_like(rgba)
        pixels = record["pixels"]
        isolated[pixels[:, 0], pixels[:, 1]] = rgba[pixels[:, 0], pixels[:, 1]]
        cropped = isolated[y0:y1, x0:x1]
        Image.fromarray(cropped, "RGBA").save(OUTPUTS[name])
        transparent, semitransparent, residual = metrics(cropped)
        print(
            f"{OUTPUTS[name].name}: {cropped.shape[1]}x{cropped.shape[0]}, "
            f"透明 {transparent:.2f}%, 半透明 {semitransparent:.2f}%, "
            f"绿色残差最大差 {residual}"
        )


if __name__ == "__main__":
    main()
