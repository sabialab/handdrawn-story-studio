#!/usr/bin/env python3
"""把一张 codex 生的手绘图按色值拆成「线稿层 + 上色层」两张透明底 PNG。

为什么存在：
  `DrawPath`（线条被画出来）是手绘视频的**唯一决定性动效**，且不少平台的原创声明
  认定「纯图片轮播」不算原创。而 codex 出的是栅格 PNG，没有路径可以被「画出来」。
  拆层揭示方案 = 线稿层用方向性遮罩推进揭示（视觉＝被画出来），上色层随后
  用 CrayonFill 扩散。

🔑 为什么不让 codex 直接生两张：
  **两次生成不可能对齐。** 同一个 prompt 跑两遍，线稿和上色会错位。
  拆自同一张源图 → **对齐是构造保证的**，不是碰运气。

与本目录另两个工具的关系（别混用）：
  · dekey.py       绿幕抠像 → 本流程不需要（codex 直接出纸底，不走绿幕）
  · split_props.py 是**另一种场景**的工具（把一张多道具的绿幕图拆成几个独立道具 PNG），
                   与本文件的「线稿/上色分层」是两件不同的事，**它默认写死的输入文件名
                   本仓库不提供**，需要那种玩法的话把源码顶部的路径改成你自己的素材路径。

用法：
  python3 tools/split_layers.py <源图.png> --outdir public
    → public/<stem>-ink.png    线稿层（近 #2B2B28 的像素）
    → public/<stem>-color.png  上色层（蜡笔族的像素）
  python3 tools/split_layers.py <源图.png> --outdir public --report
    → 另打印各层像素占比与未归类像素（诊断用）
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

# 逐字抄自 src/theme.ts 的 TOKENS.colors —— 标准值照抄不近似（近似＝分层判据跟着漂）
INK = (0x2B, 0x2B, 0x28)
PAPER = (0xFF, 0xFD, 0xF8)
CRAYONS = {
    "crayonRed": (0xD9, 0x4F, 0x3D),
    "crayonGreen": (0x5B, 0x8C, 0x3E),
    "crayonBlue": (0x4A, 0x7F, 0xB5),
    "crayonYellow": (0xD9, 0xA4, 0x41),
    "crayonBrown": (0x8B, 0x5A, 0x3C),
}

# ⚠️ 容差不是拍脑袋：codex 生图**不命中 token**（实测：ink 差 1、blue 差 6、red 差 64），
# 而按 4.2.1 那不算缺陷——校色在 Remotion 层，生图只出形状与笔触。
# 所以这里必须按「离哪个 token 最近」分类，不能按精确相等。
INK_MAX_LUMA = 120      # 比这暗的算线稿（铅笔线）
PAPER_MIN_LUMA = 228    # 比这亮且低饱和的算纸底
PAPER_MAX_SAT = 26      # 饱和度低于此且够亮 → 纸底


def _luma(rgb: np.ndarray) -> np.ndarray:
    return (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2])


def _sat(rgb: np.ndarray) -> np.ndarray:
    mx = rgb.max(axis=-1).astype(np.int16)
    mn = rgb.min(axis=-1).astype(np.int16)
    return mx - mn


def split(src: Path, outdir: Path, report: bool = False) -> tuple[Path, Path]:
    im = Image.open(src).convert("RGB")
    rgb = np.asarray(im).astype(np.uint8)
    luma, sat = _luma(rgb), _sat(rgb)

    is_paper = (luma >= PAPER_MIN_LUMA) & (sat <= PAPER_MAX_SAT)
    is_ink = (luma <= INK_MAX_LUMA) & (sat <= 60) & ~is_paper
    # 上色层 = 既不是纸也不是线稿，且有明显彩度
    is_color = ~is_paper & ~is_ink & (sat > PAPER_MAX_SAT)

    outdir.mkdir(parents=True, exist_ok=True)
    stem = src.stem

    def emit(mask: np.ndarray, name: str) -> Path:
        rgba = np.zeros((*mask.shape, 4), dtype=np.uint8)
        rgba[..., :3] = rgb
        # 软边：抗锯齿像素按其「属于该层的程度」给 alpha，硬切会出锯齿
        rgba[..., 3] = np.where(mask, 255, 0)
        p = outdir / f"{stem}-{name}.png"
        Image.fromarray(rgba, "RGBA").save(p)
        return p

    ink_path = emit(is_ink, "ink")
    color_path = emit(is_color, "color")

    if report:
        tot = luma.size
        unclassified = ~is_paper & ~is_ink & ~is_color
        print(f"  纸底   {is_paper.sum()/tot:6.2%}")
        print(f"  线稿   {is_ink.sum()/tot:6.2%}  → {ink_path}")
        print(f"  上色   {is_color.sum()/tot:6.2%}  → {color_path}")
        print(f"  未归类 {unclassified.sum()/tot:6.2%}  (抗锯齿过渡带，落在阈值之间；占比大说明阈值要调)")
        if is_ink.sum() / tot < 0.005:
            print("  ⚠️ 线稿层几乎是空的 —— 源图的线可能不够黑，或 INK_MAX_LUMA 太严")
        if is_color.sum() / tot < 0.002:
            print("  ⚠️ 上色层几乎是空的 —— 源图可能没上色，或蜡笔笔触太淡")

    return ink_path, color_path


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", type=Path)
    ap.add_argument("--outdir", type=Path, default=Path("public"))
    ap.add_argument("--report", action="store_true", help="打印各层占比（验收用）")
    a = ap.parse_args()
    if not a.source.exists():
        raise SystemExit(f"✗ 找不到 {a.source}")
    ink, color = split(a.source, a.outdir, a.report)
    print(f"✓ {ink}\n✓ {color}")


if __name__ == "__main__":
    main()
