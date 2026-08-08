#!/usr/bin/env python3
"""弱元素可见度体检 —— 「画了但淡到看不见」从肉眼判据变成机器判据。

为什么有这个脚本（一次真实的出片事故逼出来的）：
  SPEC 要某一场景的门外有「两个看不清脸的身影」，执行体画了、白底读图报了绿、拆层占比全绿、
  art_scale_check 全绿——但线条淡到 **成片正常观看下读不出来**，而后面有一场是拿它当对照的，
  那处设计支点因此缺了参照的一半。

  为什么全套既有判据都测不到它：
    · split_layers 只管「线稿/上色分不分得开」，一个淡身影撼动不了全图 2.58% 的线稿占比；
    · art_scale_check 只管「主体够不够大」，管的是 bbox 不是深浅；
    · 白底读图靠人眼，而读图的人就是画图的人（自己验自己，同型的老坑）。
  → 「可见度」这一格是三者共同的盲区，本脚本补上。

  🔴 根因不是工单写错：那两场的措辞逐字相同（都写 "vague outlines seen through
  glass"），一个抽到 81 一个抽到 134。**「vague」这类形容词把可见度交给了抽卡**——
  所以工单点名弱元素时必须同时给一个可量的下限，别只给形容词。

判据（一手，同一条片子十二张实测）：
  主体线条（人物/主要道具）  最暗 2% 均值 ≈ 60–70
  合格的背景弱元素          最暗 2% 均值 ≈ 81
  失败的背景弱元素          最暗 2% 均值 ≈ 134  ← 成片里等于不存在
  → 阈值取 ERROR >120（淡到读不出）／WARN >95（进入需要人眼复核的区间）。
  取「最暗 2% 均值」而不是均值或最小值：均值被大片留白稀释，最小值一个杂点就能骗过去。

用法（示例里的 scene1-ink.png 是**每片自己的拆层产物**，随包母版没有这个文件——
换成你本片的 ink 图路径再跑）：
  python3 tools/ink_visibility.py public/scene1-ink.png --box 700,380,920,650
  python3 tools/ink_visibility.py public/scene1-ink.png --box 700,380,920,650 --json
  --box 是该弱元素在【原图像素坐标】里的 x0,y0,x1,y1（框松一点没关系，只取最暗那 2%）
  多个元素就跑多次。读 ink 层（拆层后的线稿）最准；读 raw 原图也可以，只是会混进上色。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("需要 Pillow：python3 -m pip install pillow")

ERROR_ABOVE = 120.0
WARN_ABOVE = 95.0
DARKEST_FRACTION = 0.02


def measure(path: Path, box: tuple[int, int, int, int]) -> dict:
    im = Image.open(path).convert("L")
    w, h = im.size
    x0, y0, x1, y1 = box
    if not (0 <= x0 < x1 <= w and 0 <= y0 < y1 <= h):
        sys.exit(f"--box {box} 超出图像范围 {w}×{h}")
    crop = im.crop(box)
    px = sorted(crop.tobytes())  # "L" 模式下 tobytes 就是逐像素灰度值
    n = max(1, int(len(px) * DARKEST_FRACTION))
    darkest = px[:n]
    score = sum(darkest) / len(darkest)
    verdict = "ERROR" if score > ERROR_ABOVE else "WARN" if score > WARN_ABOVE else "OK"
    return {
        "file": str(path),
        "box": list(box),
        "darkest_2pct_mean": round(score, 1),
        "min": px[0],
        "median": px[len(px) // 2],
        "verdict": verdict,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="弱元素可见度体检（最暗 2% 均值）")
    ap.add_argument("image", type=Path)
    ap.add_argument("--box", required=True, help="x0,y0,x1,y1（原图像素坐标）")
    ap.add_argument("--label", default="", help="元素名，只用于回报可读性")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    try:
        box = tuple(int(v) for v in args.box.split(","))
    except ValueError:
        sys.exit("--box 格式：x0,y0,x1,y1")
    if len(box) != 4:
        sys.exit("--box 格式：x0,y0,x1,y1")

    r = measure(args.image, box)  # type: ignore[arg-type]
    if args.label:
        r["label"] = args.label

    if args.json:
        print(json.dumps(r, ensure_ascii=False))
    else:
        mark = {"OK": "✓", "WARN": "⚠", "ERROR": "✗"}[r["verdict"]]
        name = f"{args.label} " if args.label else ""
        print(
            f"{mark} {name}{Path(r['file']).name} box={args.box}  "
            f"最暗2%均值={r['darkest_2pct_mean']}（OK ≤{WARN_ABOVE} / WARN ≤{ERROR_ABOVE} / 超过即 ERROR）"
        )
        if r["verdict"] == "ERROR":
            print("  → 这个元素在成片正常观看下读不出来，加深线条重出，别放行。")
        elif r["verdict"] == "WARN":
            print("  → 偏淡，读图确认它在成片里还认得出来。")

    return 1 if r["verdict"] == "ERROR" else 0


if __name__ == "__main__":
    raise SystemExit(main())
