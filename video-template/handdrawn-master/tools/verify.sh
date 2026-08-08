#!/usr/bin/env bash
# 手绘故事风工程 · 单命令验收。
#
# 用法：
#   tools/verify.sh --quick   # 契约测试 + 类型检查 + 版本门禁（秒级）
#   tools/verify.sh           # 全量：上面三项 → 渲染 → 母带链
#                             #       → ffprobe/volumedetect 判定 → SPEC 关键帧抽帧
#
# ⚠️ **母版本身只能跑 --quick，这是预期的，不是坏了。**
# 全量要渲染，而渲染需要 public/voice/narration.wav（旁白）与 public/audio/*（BGM/音效）——
# 母版两样都没有，也不该有：旁白是每片自己 TTS 出来的；BGM/音效如果有版权限制，
# 要先确认授权范围再用。母版是骨架，不是成片。
# **复制成新片、跑完 TTS 与素材后，全量才有意义。**
#
# 全部产物写 out/verify/，绝不触碰 out/ 根下已交付的成片。
# 换片时要改的只有下方「换片区」三块：COMPS 表、TAIL_FRAMES、QC 帧表达式（node 段）。
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"
VERIFY_DIR="out/verify"
TIMELINE="public/voice/timeline.json"

# ───────────────────────── 换片区 ─────────────────────────
# Composition id | 宽 | 高 | 输出文件名前缀
# **单画幅**：只有一个 9:16 竖版。如果你要同时发多个画幅（比如再加一个 16:9），
# 在这里加一行，但先想清楚是不是真的需要——每加一行就要多养一条母带分流。
COMPS=(
  "Story9x16 1080 1920 handdrawn-9x16"
)
# 尾牌帧数（与 theme.ts 的 MOTION.tailFrames / FRAMES.duration 一致）
TAIL_FRAMES=75
# SPEC 验收抽帧表达式（名字 帧号），一律由帧表 T 推导，禁手写魔法帧数。
# 通用公式：抽帧帧号 ≥ 触发帧 + 入场帧数(12) + 2 帧余量。
# 手绘特化：拆层场景要等**画完**再抽，否则抽到扫一半的层，读图会误判成「缺了一块」。
# 画完 ≈ 场景起点 + ART_TIMING(colorDelay 54 + colorDur 60 = 114) → 给 120 帧。
#
# 下表是随包演示故事（三行帧表、三个场景）的样例——写自己的新片时，行数与场景数
# 跟着你自己的 timeline.json 走，这个函数体要跟着换（有几个场景就抽几个 sceneNdrawn）。
qc_frames() {
  node -e '
    const T = require("./public/voice/timeline.json");
    const L = (n) => T.lines[n - 1];
    const rows = [
      // 开场：钩子 + 演绎标识必须同屏可见（虚构片红线，3 秒内）
      ["hook",          L(1).start_frame + 50],
      ["sourceMark3s",  L(1).start_frame + 90],
      // 三个拆层场景：各自画完之后（锚＝说话人切换点；scene1 与钩子同场）
      ["scene1drawn",   L(1).start_frame + 120],
      ["scene2drawn",   L(2).start_frame + 120],
      ["scene3drawn",   L(3).start_frame + 120],
      // 字幕：末句读得完不（可读下限，见 studio.config.json 的 captions.minLineSeconds）
      ["lastCaption",   L(3).start_frame + 40],
      // 尾牌
      ["tail",          T.total_frames + 40],
    ];
    for (const [name, frame] of rows) console.log(name, frame);
  '
}
# ──────────────────────────────────────────────────────────

MASTER_AF='loudnorm=I=-11:TP=-2:LRA=9,alimiter=limit=0.85:level=false'
MAX_VOLUME_CEILING=-1.0
DURATION_TOLERANCE=0.5

FAIL_COUNT=0
ok()   { echo "  ✓ $1"; }
bad()  { echo "  ✗ $1" >&2; FAIL_COUNT=$((FAIL_COUNT + 1)); }
step() { echo; echo "── $1"; }

# ① 契约测试
step "npm test（契约测试）"
npm test
ok "契约测试通过"

# ② 类型检查
step "npx tsc --noEmit（类型检查）"
npx tsc --noEmit
ok "类型检查通过"

# ③ 版本门禁
step "npx remotion versions（锁版门禁）"
versions_output="$(npx remotion versions 2>&1)" || {
  printf '%s\n' "$versions_output" >&2
  echo "  ✗ remotion versions 失败" >&2
  exit 1
}
if printf '%s' "$versions_output" | grep -q "All packages have the correct version"; then
  ok "全家桶版本一致"
else
  printf '%s\n' "$versions_output" >&2
  bad "版本不一致"
  exit 1
fi

if [ "${1:-}" = "--quick" ]; then
  echo
  echo "✓ --quick 三项全部通过（渲染与母带链未跑，全量验收去掉 --quick）"
  exit 0
fi

mkdir -p "$VERIFY_DIR"
expected_duration="$(node -e "
  const T = require('./$TIMELINE');
  console.log(((T.total_frames + $TAIL_FRAMES) / T.fps).toFixed(3));
")"
expected_fps="$(node -e "console.log(require('./$TIMELINE').fps)")"

# ④ 双 Composition 渲染 + ⑤ 母带链 + ⑥ ffprobe/volumedetect + ⑦ 抽帧
for comp in "${COMPS[@]}"; do
  read -r comp_id width height prefix <<<"$comp"
  raw="$VERIFY_DIR/$prefix.mp4"
  master="$VERIFY_DIR/$prefix-master.mp4"

  step "渲染 ${comp_id} → ${raw}"
  npx remotion render "$comp_id" "$raw" --codec h264
  ok "渲染完成"

  step "母带链 ${prefix}（loudnorm，只重编音轨）"
  ffmpeg -nostdin -y -v error -i "$raw" -c:v copy -af "$MASTER_AF" -c:a aac -b:a 192k "$master"
  ok "母带完成 → ${master}"

  step "ffprobe 判定 ${master}"
  video_line="$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=width,height,r_frame_rate -of csv=p=0 "$master")"
  IFS=',' read -r got_w got_h got_rate <<<"$video_line"
  if [ "$got_w" = "$width" ] && [ "$got_h" = "$height" ]; then
    ok "分辨率 ${got_w}x${got_h}"
  else
    bad "分辨率 ${got_w}x${got_h}，期望 ${width}x${height}"
  fi
  if [ "$got_rate" = "${expected_fps}/1" ]; then
    ok "帧率 ${got_rate}"
  else
    bad "帧率 ${got_rate}，期望 ${expected_fps}/1"
  fi
  got_duration="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$master")"
  if node -e "process.exit(Math.abs($got_duration - $expected_duration) <= $DURATION_TOLERANCE ? 0 : 1)"; then
    ok "时长 ${got_duration}s（理论 ${expected_duration}s ± ${DURATION_TOLERANCE}s）"
  else
    bad "时长 ${got_duration}s 超出理论 ${expected_duration}s ± ${DURATION_TOLERANCE}s"
  fi
  audio_codec="$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "$master")"
  if [ "$audio_codec" = "aac" ]; then
    ok "音轨 aac 在位"
  else
    bad "音轨异常：codec=${audio_codec:-无}"
  fi
  max_volume="$(ffmpeg -nostdin -i "$master" -af volumedetect -f null - 2>&1 |
    awk '/max_volume/ {print $(NF-1)}')"
  if [ -z "$max_volume" ]; then
    bad "volumedetect 未取到 max_volume"
  elif node -e "process.exit($max_volume <= $MAX_VOLUME_CEILING ? 0 : 1)"; then
    ok "max_volume ${max_volume} dB ≤ ${MAX_VOLUME_CEILING} dB"
  else
    bad "max_volume ${max_volume} dB 超过 ${MAX_VOLUME_CEILING} dB"
  fi

  step "SPEC 关键帧抽帧 ${prefix}"
  while read -r name frame; do
    png="$VERIFY_DIR/qc-$prefix-$name-f$frame.png"
    ffmpeg -nostdin -y -v error -i "$master" -vf "select=eq(n\,$frame)" -frames:v 1 "$png"
    if [ -s "$png" ]; then
      ok "帧 ${name}（#${frame}）→ ${png}"
    else
      bad "帧 ${name}（#${frame}）抽取失败"
    fi
  done < <(qc_frames)
done

echo
if [ "$FAIL_COUNT" -eq 0 ]; then
  echo "✓ 全量验收通过。抽帧 PNG 在 ${VERIFY_DIR}/，请人工读图核对中文与布局；"
  echo "  人耳终验（BGM/旁白/SFX 相对关系）是用户的人工步骤，不在本脚本范围。"
else
  echo "✗ 验收有 ${FAIL_COUNT} 项未过，见上方 ✗ 行。" >&2
  exit 1
fi
