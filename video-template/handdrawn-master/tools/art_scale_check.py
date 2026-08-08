#!/usr/bin/env python3
"""主画面占比体检 —— 「主体过小」从肉眼判据变成机器判据。

为什么有这个脚本（一次真实的出片事故逼出来的）：
  art 是 objectFit:contain 塞进 LAYOUT.stage 的，所以**成图里空掉的地方＝屏幕上空掉的地方**。
  工单里写「右下留空」而没写主体占比下限时，生图模型的省事解法是**把整条边空出来、主体整体缩小**
  ——留空成立、红线全过、拆层阈值全绿，唯独人小得看不清。那一轮某个场景上屏只有 350×352
  ＝ stage 面积的 11.9%，而已验收成片的常态是 45–55%。
  拆层脚本只管「线稿/上色分得开吗」，管不了「画得够不够大」——这一格是它的盲区，本脚本补上。

判据来路（一手，已验收成片实测 20 张主画面，四条片子各五张）：
  逐片区间 35–60% ｜ 31–56% ｜ 39–75% ｜ 38–73%
  → 常态 45–55%，历史最低 31.1%。
  阈值取 ERROR <25%（历史最低的八折，塌了）／WARN <35%（进入需要人眼复核的区间）。

用法：
  python3 tools/art_scale_check.py                  # 全部主画面
  python3 tools/art_scale_check.py --json           # 供上游消费
  python3 tools/art_scale_check.py --scene scene1   # 只看一张
元素批（sceneNb）按 LAYOUT.sceneNb 的固定宽度摆位、不走 stage，故只报数不判定。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from PIL import Image
import numpy as np

ERROR_PCT = 25.0
WARN_PCT = 35.0
ALPHA_THRESHOLD = 10

ROOT = Path(__file__).resolve().parent.parent


def read_stage() -> tuple[int, int]:
    """从 theme.ts 读 stage 尺寸——唯一事实源在那儿，别在这里写死。"""
    theme = (ROOT / "src" / "theme.ts").read_text(encoding="utf-8")
    m = re.search(
        r"stage:\s*\{x:\s*\d+,\s*y:\s*\d+,\s*width:\s*(\d+),\s*height:\s*(\d+)\}", theme
    )
    if not m:
        sys.exit("✗ 在 src/theme.ts 里找不到 LAYOUT.portrait.stage —— 键名改了就改这里")
    return int(m.group(1)), int(m.group(2))


def alpha_bbox(path: Path) -> tuple[int, int, int, int] | None:
    alpha = np.array(Image.open(path).convert("RGBA"))[:, :, 3]
    ys, xs = np.where(alpha > ALPHA_THRESHOLD)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def measure(path: Path, stage_w: int, stage_h: int) -> dict | None:
    with Image.open(path) as im:
        canvas_w, canvas_h = im.size
    box = alpha_bbox(path)
    if box is None:
        return None
    x0, y0, x1, y1 = box
    scale = min(stage_w / canvas_w, stage_h / canvas_h)  # objectFit: contain
    on_w = (x1 - x0) * scale
    on_h = (y1 - y0) * scale
    return {
        "canvas": [canvas_w, canvas_h],
        "bbox": [x0, y0, x1, y1],
        "scale": round(scale, 4),
        "on_screen": [round(on_w), round(on_h)],
        "stage_pct": round(on_w * on_h / (stage_w * stage_h) * 100, 1),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", help="只查一张，如 scene1")
    ap.add_argument("--json", action="store_true")
    ap.add_argument(
        "--root",
        help="换一个工程目录跑（回测用：拿已验收的旧片验判据，报红就是判据坏了）",
    )
    args = ap.parse_args()

    global ROOT
    if args.root:
        ROOT = Path(args.root).resolve()

    stage_w, stage_h = read_stage()
    inks = sorted((ROOT / "public").glob("scene*-ink.png"))
    if args.scene:
        inks = [p for p in inks if p.name == f"{args.scene}-ink.png"]
        if not inks:
            sys.exit(f"✗ 没找到 public/{args.scene}-ink.png")

    # 🔴 **零输入不许长成全绿**：一张图都没匹配到时，下面的循环一轮都不跑，
    #    「✓ 全部主画面占比在常态区间内」照打、退出码照给 0——那句话读起来跟真的检查过一模一样。
    #    没跑过 ≠ 通过，所以这里单独收口：说清「未生效」，退出码 2（既不是 0 也不是 1，
    #    上游一眼能把「没跑」和「跑了但有 ERROR」分开）。
    if not inks:
        print("⚠ 未发现任何 scene 图，本检查未生效", file=sys.stderr)
        if args.json:
            print(
                json.dumps(
                    {"stage": [stage_w, stage_h], "rows": [], "verdict": "NOT_RUN"},
                    ensure_ascii=False,
                    indent=2,
                )
            )
        return 2

    rows, errors, warns = [], [], []
    for path in inks:
        name = path.name.replace("-ink.png", "")
        m = measure(path, stage_w, stage_h)
        if m is None:
            rows.append({"scene": name, "verdict": "EMPTY"})
            errors.append(name)
            continue
        m["square"] = m["canvas"][0] == m["canvas"][1]
        element = bool(re.search(r"\d+b$", name))
        if element:
            verdict = "元素批·不判定"
        elif m["stage_pct"] < ERROR_PCT:
            verdict, _ = "ERROR", errors.append(name)
        elif m["stage_pct"] < WARN_PCT:
            verdict, _ = "WARN", warns.append(name)
        else:
            verdict = "OK"
        rows.append({"scene": name, "verdict": verdict, **m})

    if args.json:
        print(json.dumps({"stage": [stage_w, stage_h], "rows": rows}, ensure_ascii=False, indent=2))
    else:
        print(f"stage {stage_w}×{stage_h}｜基线：已验收成片常态 45–55%，历史最低 31.1%")
        print(f"阈值：ERROR <{ERROR_PCT}%　WARN <{WARN_PCT}%\n")
        print(f"{'场景':<10}{'画布':>12}{'上屏 w×h':>14}{'占 stage':>10}  判定")
        for r in rows:
            if r["verdict"] == "EMPTY":
                print(f"{r['scene']:<10}{'—':>12}{'—':>14}{'—':>10}  EMPTY（拆层图无内容）")
                continue
            cw, ch = r["canvas"]
            ow, oh = r["on_screen"]
            canvas = f"{cw}×{ch}"
            on_screen = f"{ow}×{oh}"
            pct = f"{r['stage_pct']}%"
            print(f"{r['scene']:<10}{canvas:>12}{on_screen:>14}{pct:>10}  {r['verdict']}")
        print()
        if errors:
            print(f"✗ {len(errors)} 张主体过小（低于 {ERROR_PCT}%）：{', '.join(errors)}")
            print("  多半是工单写了「某处留空」而没写占比下限——模型整体缩小就能同时满足留空与红线。")
            print("  改法：把留空写成【具体百分比矩形的角】，并加一句「填满画布、缩小即失败」。")
        if warns:
            print(f"⚠ {len(warns)} 张进入需人眼复核区间（{ERROR_PCT}–{WARN_PCT}%）：{', '.join(warns)}")
        oblong = [r["scene"] for r in rows if r.get("square") is False]
        if oblong:
            print(f"⚠ {len(oblong)} 张非方图：{', '.join(oblong)}")
            print("  基线那批片子全部用 1254×1254 方图（上屏上限 89%）；3:2 横图上限只有 62%，")
            print("  即使画得完美也天然小一号。工单不写画幅时模型会自己挑——所以要逐张写死 square。")
        if not errors and not warns:
            print("✓ 全部主画面占比在常态区间内")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
