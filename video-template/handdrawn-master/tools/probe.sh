#!/usr/bin/env bash
# 母版视觉探针 —— 让**还没有本片素材的母版**也能渲出静帧来读图。
#
# 母版缺的只有音频（旁白 / BGM / 音效）：场景图走随包的那对占位
# （theme.ts 的 SCENE_ART 缺省指向 public/probe-scene-{ink,color}.png），
# 音频由本脚本临时造静音占位、渲完即删。所以「开箱能渲」指的是这条路径，不是「零素材」。
#
# 用法：tools/probe.sh            # 渲一组关键帧到 out/probe/，然后清掉自己造的占位
#      tools/probe.sh --keep     # 保留静音占位素材（连续调试时省得每次重造）
#
# ─────────────────────────── 为什么需要它 ───────────────────────────
# `verify.sh --quick`（契约测试 + tsc + 版本门禁）**证明不了画面是对的**。
# 2026-07-15 移植当天，--quick 全绿的同时画面里有三个缺陷，全都只有读图才能发现：
#   1. CrayonFill 用裸 div 裁剪 → 盒子高度算出来是 0 → **整个场景被擦掉**
#   2. 场景大字按 height*0.62 摆 → 正落在舞台里 → **压在椅子腿上**
#   3. DrawPath 默认 strokeWidth=4 在归一化 viewBox 下 → **上屏 39px，是马克笔不是铅笔**
# 三个都是类型正确、无硬编码、测试全绿的代码。**机器判不了的，就得让人看见。**
#
# ─────────────────────────── 占位纪律（2026-07-16 事故后重写） ───────────────────────────
# 🔴 本脚本第一版在这里埋过雷，被 Codex 首次出片时踩响：
#   ① cleanup 无条件 `rm -f public/voice/*.wav; rm -rf public/audio`——注释写着「只删自己造的」，
#     实现删的是全部。写它时 public/ 里只有占位；旁白/BGM 冻结入库后，它删的就是冻结资产
#     （narration.wav、R1–R5、bgm.mp3 靠 git 找回；page/tap 当时不在 git，靠母版原位补回）。
#   ② 占位造的是逐句 L1.wav…（MiMo 时代模型），且**用 3 秒静音覆盖了真 bgm.mp3**——
#     `<Audio startFrom={6s}>` 超出 3s 占位时长，渲染当场炸。
#   ③ 渲染报错被 >/dev/null 吞掉，执行方想贴报错都提不出来。
# 现规则：**占位只造缺的（真资产在位一个字节不碰）；清理只删本次造出来的清单；报错落日志、失败即打印。**
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

PROBE_DIR="out/probe"
TIMELINE="public/voice/timeline.json"

command -v ffmpeg >/dev/null || { echo "✗ 需要 ffmpeg" >&2; exit 1; }

CREATED_FILES=""   # 本次真正造出来的占位（换行分隔）。cleanup 只认这份清单。
CREATED_AUDIO_DIR=0

cleanup() {
  if [ "$KEEP" -eq 0 ]; then
    if [ -n "$CREATED_FILES" ]; then
      printf '%s\n' "$CREATED_FILES" | while IFS= read -r f; do [ -n "$f" ] && rm -f "$f"; done
    fi
    # macOS 会往目录里塞 .DS_Store，rmdir 会因此静默失败留下空壳——先清它再删目录
    if [ "$CREATED_AUDIO_DIR" -eq 1 ]; then rm -f public/audio/.DS_Store 2>/dev/null; rmdir public/audio 2>/dev/null || true; fi
    echo "✓ 静音占位已清理——只删了本次造的（out/probe/ 的 PNG 保留）"
  fi
}
trap cleanup EXIT

# make_placeholder <路径> <秒数>：真资产在位就绝不碰；造了就记账。
make_placeholder() {
  local path="$1" secs="$2"
  [ -e "$path" ] && return 0
  case "$path" in
    *.mp3) ffmpeg -nostdin -y -v error -f lavfi -i anullsrc=r=44100:cl=stereo -t "$secs" -c:a libmp3lame "$path" ;;
    *)     ffmpeg -nostdin -y -v error -f lavfi -i anullsrc=r=44100:cl=mono   -t "$secs" "$path" ;;
  esac
  CREATED_FILES="${CREATED_FILES}${path}
"
  echo "  + 占位 ${path}（${secs}s，渲完即删）"
}

echo "── 占位检查（只补缺的，真资产不碰）"
if [ ! -d public/audio ]; then mkdir -p public/audio; CREATED_AUDIO_DIR=1; fi
mkdir -p "$PROBE_DIR"
# 旁白＝一条母带（T.audio），不是逐句 WAV（MiMo 遗物，2026-07-16 事故后改）。
# BGM 占位要盖过 startFrom（ebur128 选段 6s）+ 全片时长，短了 <Audio startFrom> 会当场炸。
read -r NARRATION BGM_SECS TOTAL_SECS <<EOF2
$(node -e '
  const T = require("./'"$TIMELINE"'");
  const total = (T.total_frames + 75) / T.fps;
  console.log(`public/voice/${T.audio} ${(total + 15).toFixed(1)} ${total.toFixed(3)}`);
')
EOF2
make_placeholder "$NARRATION" "$TOTAL_SECS"
make_placeholder public/audio/bgm.mp3 "$BGM_SECS"
make_placeholder public/audio/page.mp3 1
make_placeholder public/audio/tap.mp3 1
echo "  ✓ 素材就绪"

# 抽帧锚**与 verify.sh 的 qc_frames 同一份**（帧号一律由帧表 T 推导，禁手写魔法数字）。
# 🔴 改这里必须同步 verify.sh，反之亦然——两处漂移就会「probe 看的和 QC 交的不是一批帧」。
probe_frames() {
  node -e '
    const T = require("./'"$TIMELINE"'");
    const L = (n) => T.lines[n - 1];
    const rows = [
      ["hook",          L(1).start_frame + 50],
      ["sourceMark3s",  L(1).start_frame + 90],
      ["scene1drawn",   L(1).start_frame + 120],
      ["scene2drawn",   L(2).start_frame + 120],
      ["scene3drawn",   L(3).start_frame + 120],
      ["lastCaption",   L(3).start_frame + 40],
      ["tail",          T.total_frames + 40],
    ];
    for (const [name, frame] of rows) console.log(name, frame);
  '
}

echo "── 渲染静帧"
while read -r name frame; do
  png="$PROBE_DIR/$name-f$frame.png"
  log="$PROBE_DIR/$name-render.log"
  # 同名旧帧先清——帧表一变文件名就变，旧帧留着会让读图人读到上一版（Codex 首跑就撞上一堆陈年 PNG）
  rm -f "$PROBE_DIR/${name}"-f*.png
  # </dev/null 是必须的：npx 会把 while 循环的 stdin（那份帧表）一口吃光，
  # 于是循环只跑一轮就以「unbound variable」炸掉。ffmpeg 那边靠 -nostdin 挡的是同一件事。
  # 输出落日志不落 /dev/null——失败必须能看见报错（第一版吞报错，Codex 无法交差）。
  if npx remotion still Story9x16 "$png" --frame="$frame" >"$log" 2>&1 </dev/null && [ -s "$png" ]; then
    # ${name} 的花括号是必须的：macOS 自带 bash 3.2，`$name（` 会把全角括号的
    # 首字节当成变量名的一部分 → 报 `name?: unbound variable`。verify.sh 一直写 ${} 就是为此。
    echo "  ✓ ${name}（#${frame}）→ ${png}"
    rm -f "$log"
  else
    echo "  ✗ ${name}（#${frame}）渲染失败，报错尾部：" >&2
    tail -n 30 "$log" >&2 || true
    echo "  完整日志：$log" >&2
    exit 1
  fi
done < <(probe_frames)

echo
echo "✓ 静帧在 $PROBE_DIR/ —— **必须人工读图**，机器只保证它渲出来了，不保证它对。"
echo "  逐帧核：中文错字（一票否决）｜字号 ≥40px｜安全区（上下各 230px 无关键内容）"
echo "  ｜演绎标识在位｜品牌角标在位｜线条画完没断｜上色没糊住线｜大字没压住画。"
