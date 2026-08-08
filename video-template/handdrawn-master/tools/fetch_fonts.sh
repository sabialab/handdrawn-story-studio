#!/usr/bin/env bash
# 拉取本仓库的两款中文字库「完整 TTF」到共享目录，并软链进本工程 public/fonts/。
#
# ⚠️ 这个脚本必须拉取本仓库实际用到的字体（src/fonts.ts 加载的是霞鹜文楷 + 站酷快乐体）——
# 如果你换了别的字体，记得同步改这里的下载列表，别让脚本和 fonts.ts 各说各话。
#
# 为什么不用 @remotion/google-fonts：实测每次渲染要拉 ~294 个网络字体分片，又慢又不离线可用。
# 本脚本一次性下载全字库 TTF（无子集化、无缺字风险），
# 之后由 src/fonts.ts 用 @remotion/fonts 的 loadFont 从 staticFile 加载，首拉后离线可渲染。
#
# ─────────────────────────── 两款字体与授权 ───────────────────────────
# 均为 SIL OFL 1.1，**授权声明刻在字体二进制的 name table（nameID 13）**，不是"听说可商用"。
#
#   霞鹜文楷 GB Medium —— 字幕轨（56px）
#     github.com/lxgw/LxgwWenkaiGB · 46809 字形 · GB2312/GBK 汉字 100%
#     **字幕轨必须用它**：实测站酷快乐体缺「堃喆玥昇頔婳珺芃」8/10 人名常用字、繁体全灭。
#     字幕里会出现人名——观众叫「张玥」就爆字。
#
#   站酷快乐体 —— 钩子轨（130–170px）
#     github.com/googlefonts/zcool-kuaile · 7055 字形 · GB2312 100%
#     ⚠️ **只用 googlefonts 这个 OFL 版**。站酷官网包里的「2016修订版」是站酷自行声明的授权，
#     理论上可撤回；OFL 对已发布版本**不可撤回**——这是法律确定性的差别，不是洁癖。
#
# 另两个常见的字体授权坑，写视频文案时留意：
#   · 剪映/抖音内置的字体**不能直接拿去发别的平台**：不少内置字体的授权仅限「在那款
#     软件里编辑并发布到对应平台」，换平台发布可能超出授权范围
#   · 微软雅黑/苹方**不可商用**：版权分属方正/威锋，操作系统只买了系统内嵌显示+个人打印
#
# 用法：tools/fetch_fonts.sh   （幂等：已存在且尺寸合法的文件跳过下载，只重建软链）
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SHARED_DIR="$(cd "$PROJECT_DIR/.." && pwd)/assets/fonts"

# 字体名 | 下载地址 | 体积下限（bytes）
# 下限是防「拿到 HTML 错误页/LFS 指针/子集化文件」还当成功——那会在渲染时才炸，且症状是缺字。
FONTS=(
  "LXGWWenKaiGB-Medium.ttf|https://github.com/lxgw/LxgwWenkaiGB/releases/download/v1.522/LXGWWenKaiGB-Medium.ttf|20000000"
  "ZCOOLKuaiLe-Regular.ttf|https://raw.githubusercontent.com/googlefonts/zcool-kuaile/main/fonts/ttf/ZCOOLKuaiLe-Regular.ttf|1000000"
)

mkdir -p "$SHARED_DIR"

file_size() { stat -f%z "$1" 2>/dev/null || stat -c%s "$1"; }

for entry in "${FONTS[@]}"; do
  IFS='|' read -r name url min_bytes <<<"$entry"
  target="$SHARED_DIR/$name"

  if [ -s "$target" ] && [ "$(file_size "$target")" -ge "$min_bytes" ]; then
    echo "✓ 已存在 ${name}（$(file_size "$target") bytes），跳过下载"
    continue
  fi

  echo "→ 下载 ${name}"
  curl -fsSL "$url" -o "$target.tmp"
  size="$(file_size "$target.tmp")"
  if [ "$size" -lt "$min_bytes" ]; then
    echo "✗ ${name} 只有 ${size} bytes（<${min_bytes}），疑似子集化/错误页，拒收" >&2
    rm -f "$target.tmp"
    exit 1
  fi
  # 核 TTF 魔数：0x00010000（TrueType）。防把 HTML 错误页当字体存下来。
  magic="$(head -c 4 "$target.tmp" | od -An -tx1 | tr -d ' \n')"
  if [ "$magic" != "00010000" ]; then
    echo "✗ ${name} 魔数 ${magic} 不是 TTF（期望 00010000），拒收" >&2
    rm -f "$target.tmp"
    exit 1
  fi
  mv "$target.tmp" "$target"
  echo "✓ ${target}（${size} bytes）"
done

# 接进本工程 public/fonts。
#
# ⚠️ **软链必须建在目录级**（public/fonts -> ../../assets/fonts），别逐文件建。
# 〔2026-07-15 事故：有人逐文件建了软链、且照抄了目录级的相对路径 ../../assets/fonts/X，
# 于是从 public/fonts/ 解析出来是 handdrawn-master/assets/…（少跳一级、不存在）。
# 症状：tsc 和契约测试全绿，**一渲染就字体 404**——因为它们都不碰文件系统。〕
PUB="$PROJECT_DIR/public/fonts"
if [ -L "$PUB" ] || [ -d "$PUB" ]; then
  rm -rf "$PUB"
fi
ln -s ../../assets/fonts "$PUB"
echo "✓ public/fonts -> ../../assets/fonts 软链就绪"

# 验收：**必须读到真实字节**，不能只看软链在不在（断链的软链 test -L 也是真）
for entry in "${FONTS[@]}"; do
  IFS='|' read -r name url min_bytes <<<"$entry"
  if [ ! -s "$PUB/$name" ]; then
    echo "✗ ${PUB}/${name} 不可读，软链断了" >&2
    exit 1
  fi
done
echo "✓ 字体本地化完成：渲染不再需要网络字体"
