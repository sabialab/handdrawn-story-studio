// 手绘故事风 · 单一事实源。
//
// 全部逐字文案、色值、字号、帧锚、布局常量集中在本文件——防错字、防漂移。
// 规范上位法：本包 references/production.md（出片流程与视觉 token 说明）。
// 换片手册：本包 references/production.md「二、常量换在哪」一节。
//
// 铁律：
//   - 场景帧表 T 是唯一时间锚点，所有帧号写成 T 表达式，禁魔法数字
//   - 色值/字号是绑定标准，逐字照抄禁近似值（近似=样式漂移=可审出的缺陷）
//   - 组件里不许出现中文文案、色值、rgba、外链（契约测试断言③把守）

import {interpolate} from "remotion";
import {fontFamily, hookFontFamily} from "./fonts";
import timeline from "../public/voice/timeline.json";
import studioConfig from "../public/studio.config.json";

export const T = timeline;

export const CLAMP = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

export const TOKENS = {
  colors: {
    // 纸底：速写本白，比常见的做旧牛皮纸色更白——手绘要的是速写本纸感，不是牛皮纸。
    paper: "#FFFDF8",
    // 铅笔线
    ink: "#2B2B28",
    inkSoft: "#9A9A92",
    // 蜡笔填充族：局部上色不满铺——只有一两处入色，其余大片留白（这就是风格签名）
    crayonRed: "#D94F3D",
    crayonGreen: "#5B8C3E",
    crayonBlue: "#4A7FB5",
    crayonYellow: "#D9A441",
    crayonBrown: "#8B5A3C",
    // 情绪高光
    highlight: "rgba(255,213,74,.45)",
    // 手绘阴影要浅——重投影破坏纸感
    shadow: "rgba(0,0,0,.10)",
    white: "#FFFFFF",
    captionPaper: "rgba(255,255,255,.94)",
    vignette: "rgba(43,43,40,.06)",
    transparent: "rgba(255,255,255,0)",
  },
  fonts: {
    // 字幕轨：霞鹜文楷 GB（SIL OFL 1.1，46809 字形，GB2312/GBK 汉字 100%）
    // **字幕轨必须用它**——字幕里会出现人名，实测站酷快乐体缺「堃喆玥昇頔婳珺芃」
    // 等 8/10 人名常用字、繁体全灭。观众叫「张玥」「李喆」就爆字。
    subtitle: fontFamily,
    // 钩子轨：站酷快乐体 OFL 版（SIL OFL 1.1，7055 字形，GB2312 100%）
    // 钩子短、自己写、可控——写钩子文案时留意别用生僻字，缺字会直接在画面上开天窗。
    hook: hookFontFamily,
  },
  weights: {regular: 400, medium: 500},
  // 字号：画布 1080×1920，整体偏大是有意的——手机上滑动观看，字号小了读起来费劲。
  // **绝对下限 40px**（对应访谈产出 studio.config.json 里 captions.minFontPx 的缺省值）——
  // 任何文字 <40px 即 bug，尾帧小字也不例外；契约测试断言②硬卡这条下限，这个常量本身不读配置，
  // 换字号是改风格族的动作，不是改单集内容。
  type: {
    hook: 170,
    hookSmall: 130,
    scene: 100,
    sceneSmall: 80,
    subtitle: 56,
    label: 40,
    min: 40,
  },
  shadow: "drop-shadow(0 6px 10px rgba(0,0,0,.10))",
  layers: {background: 0, extra: 2, lead: 5, annotation: 7, foreground: 9, copy: 12},
} as const;

// ─────────────────────── 故事来源（脊椎红线，必填） ───────────────────────
// 本包 SKILL.md 第六节红线 1 与 references/interview.md 第三组：**每条故事必须落进三类之一，不许含糊。**
//
// 为什么它是代码常量而不只是 SPEC 里的一行字：标注动作（开场标识 / 尾帧标识 / 无）
// 由它**机械派生**。写成文档里的一句话，就得靠人记得在 Scenes 里加对组件——
// 而「机器能判的错，绝不留给用户审」。现在漏标是 tsc/契约测试的事，不是审稿人的事。
//
//   firsthand 亲历     → 无需特别标注；`#真实故事` 可用
//   adapted   转述改编 → **尾帧**必带「改编自真实经历」；`#真实故事` 可用
//   fiction   虚构     → **开场 3 秒内**画面标识「本故事为演绎」（≥40px）+ 尾牌 + 封面小字；
//                        **禁用 `#真实故事`**
//                        🔴 实测：不少平台的「剧情演绎」与「AI 制作」是同一下拉框的互斥选项，
//                        真碰上二选一时选「AI 制作」→ **片内标识就是显著标识的唯一路径，不可省**
//                        （逐条判据见本包 references/publish-check.md C 节）
//
// 尾帧小字对虚构片不够——标识义务的立法意图是「避免对其他用户造成误导」，
// 标识须在观众可能产生误解的时点**之前或同时**出现。
export type StorySource = "firsthand" | "adapted" | "fiction";

// 本示例片（奶奶叠塑料袋）＝虚构——fiction 坐实：开场 3 秒内演绎标识 ≥40px、
// 尾牌 + 封面小字、禁 #真实故事。写自己的新片时，先把故事来源判清楚（亲历/转述改编/虚构），
// 再照下表把这行改成对应的值——这是脊椎红线，不许含糊。
export const STORY_SOURCE: StorySource = "fiction";

export const COPY = {
  // 示例片定稿文案。写自己的新片时逐字换成你自己故事的文案。
  // 钩子给处境不给结论（不拿冲突画面当钩子），与 L1 旁白措辞错开半步。
  hook: {line1: "塑料袋叠成三角", line2: "攒了满满一抽屉"},
  // 故事来源标识（脊椎红线）：
  //   亲历      → 无需特别标注
  //   转述改编  → 尾帧「改编自真实经历」
  //   虚构      → **开场 3 秒内画面标识**（≥40px）+ 尾牌 + 封面小字
  //               （不少平台的「剧情演绎」与「AI 制作」声明互斥、只能二选一时，
  //               优先选能覆盖虚构声明的那个——片内三处标识独立满足平台要求，不依赖那个勾选框）
  // 尾帧小字不够——立法意图是「避免对其他用户造成误导」，
  // 标识须在观众可能产生误解的时点之前或同时出现。
  sourceMark: {
    fiction: "本故事为演绎",
    adapted: "改编自真实经历",
  },
  // 尾牌＝选择题引导评论（给了讨论理由，不索赞不索关注）。
  // 场景大字已撤掉：顶部字幕承载全部旁白文本，中部再压大字＝抢注意力。
  // 三行结构：单行字数控制在约 7 字以内（sceneSmall(80) 下超宽会折出孤行）。
  tail: {line1: "攒了一抽屉", line2: "你家老人也这样吗？", line3: "A 是　B 不是"},
  // 品牌角标：账号昵称，画家签名式，全片常驻。文案从 public/studio.config.json 的
  // accountName 字段读——首跑访谈（若走本包 SKILL.md 流程）会把它写进去；没配置时兜底占位。
  brandMark: (studioConfig as {accountName?: string}).accountName || "你的账号名",
} as const;

// ─────────────────────────── 字幕 ───────────────────────────
// **字幕文本不在 COPY 里，故意的。**
//
// 字幕逐句照抄旁白，而旁白已经逐字冻结在帧表 T 的 lines[].text 里
// （由 scripts/minimax-tts.js 从 script.json 生成）。若在 COPY 里再手写一份文案，
// 就有了两个事实源——它们迟早会漂移，而漂移出来的字幕**和耳朵听到的不一样**，
// 这种缺陷抽帧还未必看得出（画面字是对的，只是和旁白对不上）。
// 所以字幕 = T.lines[].text，唯一事实源就是帧表，不在 COPY 里另开一份。
//
// 逐块入场（块间隔 3 帧依次弹入）需要把整句切块。
// 切点＝中文标点后。标点保留在前一块尾部（读起来才是一句话）。
// 不做逐字卡拉OK：这是审美选择（逐字跳字反而更难读），不是技术限制——
// MiniMax 的 subtitle_type 是能取到词级时间戳的，只是这里选择不用。
export const CAPTION_BLOCK_SPLIT = /(?<=[、。，！？；：])/;

export const toCaptionBlocks = (text: string): string[] =>
  text.split(CAPTION_BLOCK_SPLIT).filter((block) => block.length > 0);

// ─────────────────────────── 场景分层图（拆层揭示方案） ───────────────────────────
// 执行体生单张 PNG → tools/split_layers.py 按色拆「线稿层/上色层」（落 public/ 根）→
// Scenes 用 RevealSweep 依次扫出（线稿先、上色后，同真人作画顺序）。
// 生图提示词的骨架在本包 references/production.md 第 4.5 节；生成用的原图放 public/raw/
//（gitignore，只有拆出来的层入库）。
//
// fromPct/toPct = 沿扫掠方向的主体包围盒（像素级 alpha bbox ±4 余量，**别目测**）——
// 默认扫全画布会先扫 1/3 空白纸（RevealSweep 注释里的探针教训）。
// 线稿 165°（自上而下略带右行，像先起形）用 y 轴 bbox；上色 90°（横扫，斜排线一根根冒出）用 x 轴 bbox。
//
// ⚠️ SVG 线稿路（DrawPath/DrawSequence/CrayonFill）**没有退役**——混合片里关键的一两条
// 手写线仍走它（拆层揭示只负责整张位图）。本示例片全部走拆层，故不带 STROKES 常量。
export const ART_TIMING = {
  // 线稿 66 帧（2.2s）扫完；上色在线稿近尾（54 帧）接入、60 帧扫完——
  // 与第四节「轮廓画完后上色」的先后律一致。全部就位 ≈ 场景起点 + 114 帧。
  inkDur: 66,
  colorDelay: 54,
  colorDur: 60,
} as const;

// 🔴 **母版缺省：三个场景共用随包那一对占位图**（`public/probe-scene-ink.png` /
//    `public/probe-scene-color.png`，包里实存的就这两张）。这样母版**开箱就能渲**——
//    `tools/probe.sh` 不必先生一批图就能出静帧读图。
//    母版不带每片自己的场景素材是有意的：素材是每条片子自己的产物，随包分发既没有意义，
//    也会让包里躺着一堆和你的故事无关的画。
//
// 写自己的新片时逐场景换掉：
//   1. `ink` / `color` 换成 `tools/split_layers.py` 拆出来的层文件名（惯例 `sceneN-ink.png` /
//      `sceneN-color.png`，落在 `public/` 根下）；
//   2. **`fromPct` / `toPct` 必须逐场景重算**——它们是沿扫掠方向的主体包围盒（像素级 alpha
//      bbox ±4 余量，**别目测**）。下面这组数是那两张占位图量出来的，换了图就不成立：
//      占位 ink 的 y 轴 bbox 40.5%–81.8%、color 的 x 轴 bbox 19.9%–84.8%。
//   3. 场景数跟着你自己旁白稿的说话人切换点走（示例是三段＝三个场景），
//      加减场景照 Scenes.tsx 末尾那个级联模式续写。
const PROBE_INK = "probe-scene-ink.png";
const PROBE_COLOR = "probe-scene-color.png";
const PROBE_INK_SWEEP = {angleDeg: 165, fromPct: 36, toPct: 86} as const;
const PROBE_COLOR_SWEEP = {angleDeg: 90, fromPct: 16, toPct: 89} as const;

export const SCENE_ART = {
  // L1 奶奶叠塑料袋，攒了一抽屉（钩子场景）
  scene1: {
    ink: PROBE_INK,
    color: PROBE_COLOR,
    inkSweep: PROBE_INK_SWEEP,
    colorSweep: PROBE_COLOR_SWEEP,
  },
  // L2 奶奶的道理（一块钱三十个，可真要用的时候手边一个都没有）
  scene2: {
    ink: PROBE_INK,
    color: PROBE_COLOR,
    inkSweep: PROBE_INK_SWEEP,
    colorSweep: PROBE_COLOR_SWEEP,
  },
  // L3 搬家那天，奶奶挑出最厚的袋子递过来（情绪落点）
  scene3: {
    ink: PROBE_INK,
    color: PROBE_COLOR,
    inkSweep: PROBE_INK_SWEEP,
    colorSweep: PROBE_COLOR_SWEEP,
  },
} as const;

export const ASSETS = {
  // ⚠️ 母版**不带背景图**，这是有意的，别「补」回来。
  // 这个风格族要的纸感是**程序化**的：feTurbulence 纸纹（seed 按帧派生）
  // + 极轻暗角 —— 见 Fx.tsx 的 Paper。一张 bg-9x16.png 满足不了「seed 按帧派生」，
  // 而且会让母版依赖一个仓库里根本没有的文件（移植中间态曾如此，渲染必崩）。
  // 新片若需场景背景图（四层分层：背景/配角/主角/前景），在 SPEC 里加键，
  // **加在 scenes 下按分镜给**，不要复活一个全片通用的 backgrounds.portrait。
  voiceDirectory: "voice",
  audio: {
    bgm: "audio/bgm.mp3",
    // 铅笔沙沙声已撤（用户实听判词：「视频一直有沙沙声」）。
    // 两个病叠着：①ffmpeg 粉噪声兜底样本本来就假（台账明标「可替换」）；
    // ②<Audio loop> 的音量回调按**循环本地帧**求值——样本只有 6s，包络窗口整个失效，
    // 噪声全片周期性响。若将来复活：必须真采样（media-use resolve）+ Sequence 逐窗摆放
    // （别再用 loop+回调），且用户试听点头才算数。
    page: "audio/page.mp3",
    tap: "audio/tap.mp3",
  },
} as const;

// ─────────────────────────── 帧锚 ───────────────────────────
// 全部由帧表 T 派生，禁手写魔法帧数。
// 场景切点落在旁白句起点（天然停顿）。

const L = (n: number) => T.lines[n - 1];

export const FRAMES = {
  // 前 3 秒钩子（不少平台的用户滑动速度很快，3 秒播放率是能否进推荐池的经验阈值）
  hook: L(1).start_frame,
  // 虚构片演绎标识必须在开场 3 秒内出现（≥40px）
  sourceMark: L(1).start_frame + 6,
  // 分镜锚＝说话人切换点（示例片 3 行帧表、3 个场景——这是随包演示故事只有三段对话
  // 决定的，不是固定值；你自己的新片有几个说话人切换点就有几个场景锚，照这个模式加/减）：
  //   scene1 L1   叙述者开场（奶奶叠塑料袋，攒了一抽屉）
  //   scene2 L2   奶奶的道理（一块钱三十个，真要用的时候手边一个都没有）
  //   scene3 L3   搬家那天，奶奶挑出最厚的袋子递过来（情绪落点，别在画面上写「泪目」这类直白提示）
  scene1: L(1).start_frame,
  scene2: L(2).start_frame,
  scene3: L(3).start_frame,
  tail: T.total_frames,
  duration: T.total_frames + 75,
} as const;

export const SCENE_RANGES = [
  {start: FRAMES.scene1, end: FRAMES.scene2},
  {start: FRAMES.scene2, end: FRAMES.scene3},
  {start: FRAMES.scene3, end: FRAMES.tail},
] as const;

// ─────────────────────────── 动效签名 ───────────────────────────
// 这就是「手绘故事风」——改这里等于改风格族。

export const MOTION = {
  // 入场：禁纯淡入。任何元素入场必须「被画出来」或复合运动（缩放+位移+模糊）。
  enterFrames: 12,
  enterScale: [1.12, 1] as const,
  enterY: [48, 0] as const,
  enterBlur: [8, 0] as const,
  floatAmplitude: 5,
  floatRotate: 1.2,
  floatPeriod: T.fps * 2.4,
  // 慢推：手绘风只用推近，不用镜头震动/金属光扫这类更适合科技/发布会风格的语法，混用即破风格。
  scenePush: [1, 1.05] as const,
  backgroundPush: [1, 1.01] as const,
  // 线条绘制（Draw.tsx 的参数源）：主体轮廓 18–24 帧，细节 8–12
  drawOutlineFrames: 21,
  drawDetailFrames: 10,
  // 多条线错开起画——同时画完像贴图，依次画出才像有人在画
  drawStagger: 6,
  // 抖动幅度，单位**同 DrawPath 所在 svg 的 viewBox 单位，不是像素**（归一化 viewBox 下 ≈10 屏幕像素/单位）。
  // 〔2026-07-15 抽帧实测订正：原值 1.5 = 上屏 15px 错位，读图上是「椅子腿没接上座面」，
  // 那是画歪了不是手绘感。0.35 ≈3.5px，刚好是「线活着」而不是「手抖」。〕
  drawJitter: 0.35,
  // 蜡笔填充：轮廓画完后 6 帧起，8–10 帧完成
  fillDelayFrames: 6,
  fillFrames: 9,
  // 字幕逐块入场（不做逐字卡拉OK——中文拿不到词级时间戳）
  captionBlockGapFrames: 3,
  captionBlockEnterFrames: 12,
  captionBlockY: [14, 0] as const,
  tailFrames: 75,
} as const;

// ─────────────────────────── 布局 ───────────────────────────
// 9:16 / 1080×1920 单画幅。
//
// 安全区 6:7【视频号官方经验值】：底部标题浮层 + 右侧按钮列会遮挡。
// → 上下各留约 12%（230px）不放关键内容。
// → **字幕带放顶部正是为此**（如果你的目标平台是无浮层遮挡的画幅，比如 3:4，
//   放底部也可以，改 captionTop 即可，不必照抄本仓库的顶部位置）。
//
// LAYOUT 保留 portrait 键名：将来若扩画幅，按「双画幅同组件分支」
// 机制加 landscape（组件内 useVideoConfig() 判分支），**绝不写两套场景**。

const SAFE = 230;

export const LAYOUT = {
  portrait: {
    width: 1080,
    height: 1920,
    safeTop: SAFE,
    safeBottom: SAFE,
    contentPadding: 48,
    // 字幕带：顶部固定，位于安全区之下
    captionTop: SAFE + 20,
    captionPadding: 22,
    captionRadius: 10,
    captionMaxWidth: 960,
    // 手绘主画面：中部，占画布 ~55%
    stage: {x: 540, y: 1010, width: 984, height: 1056},
    ground: 1440,
    // 演绎标识：开场与钩子同屏，不是尾帧小字。
    // ⚠️ 2026-07-16 抽帧实测挪到 1600：原 540 在多行字幕卡的伸展区里——
    // L2 的卡有两行（bottom ≈446），三四行卡能压到 ≈600，标识被整卡盖住（红线级）。
    // 1600 在舞台下沿（场景主体 ≤1256）与安全区上沿（1690）之间的空白带，
    // 字幕、钩子、画面三者永远够不到。改舞台尺寸时必须重算这里。
    sourceMark: {x: 540, y: 1600, rotation: -2},
    // 品牌角标：画家签名式，右下角、舞台下沿（1538）与 ground（1440）之间的静区，
    // 场景主体（≤1256）、尾牌（960±250）、演绎标识（y1600 x540）都够不到。
    // 全片常驻、静态（无动效→天然 seek-safe）。改舞台尺寸时与 sourceMark 一起重算。
    brandMark: {x: 880, y: 1500, rotation: -2},
    // 钩子 y 690：上清多行字幕卡（≈446），下清场景主体上沿（≈931）。
    // ⚠️ 字号用 TOKENS.type.hookSmall(130)：hook(170) 下 6 字＝1020 就超 960 宽——
    // 占位钩子只有 4 个字，这条边界在换真文案前从未暴露（2026-07-16 抽帧实测）。
    hook: {x: 540, y: 690, width: 960},
    // 场景大字：舞台**下方**，不是压在舞台上。
    // 〔2026-07-15 抽帧实测：原先按 safeTop + height*0.62 = 1420 算，正落在舞台内
    // （舞台 482–1538），大字直接压在椅子腿上。〕
    // 可用下沿 = height - safeBottom = 1690；大字 100px、行高 1.15 → 半高 58。
    // 1600 → 占 1542–1658，在舞台下沿(1538)与安全区(1690)之间。
    // **改字号或舞台尺寸就要重算这里**——三个数是咬合的。
    sceneCopy: {x: 540, y: 1600, width: 920},
    tail: {x: 540, y: 960, width: 920},
    decor: {
      // 纸屑粒子。**只进背景层**——放前景层会飘到主体上被读成脏点，试过，不好看。
      particleSize: [16, 12, 20] as const,
      particleX: [12, 78, 44] as const,
      particleY: [22, 64, 86] as const,
      particleRotation: [-8, 12, -3] as const,
      particleDrift: 5,
      // 纸感质感层（全片常驻）：
      // feTurbulence 纸纹 seed 按帧派生 + 极轻暗角。两个都要很轻——
      // 纸纹重了像噪点、暗角重了像滤镜，都会把「速写本」读成「做旧特效」。
      noiseOpacity: 0.04,
      vignetteOpacity: 0.5,
    },
  },
} as const;

export type Layout = typeof LAYOUT.portrait;

// ─────────────────────────── 音效 ───────────────────────────
// 手绘风不用 beat-drop 这类适合科技/发布会风格的重击音效语法。
// 铅笔沙沙声已撤（见下方「已撤」节）。

type SfxKind = keyof typeof ASSETS.audio;

// gain = 该音效自己的播放音量；duck = 它把 BGM 压到的深度。**两个不是一回事**，
// 别把音效实现里的 volume 字段当成两用（有些实现只有单一的 volume 字段，那样就没法
// 同时表达「这个音效自己多响」和「它把 BGM 压多低」这两个独立决定）：
// 压 BGM 的深度和音效本身多响是两个独立决定（翻页要轻但仍需压住 BGM 让旁白透出来）。
type SfxEvent = {frame: number; kind: SfxKind; gain: number; duck: number};

// duck 档位：重击 0.4，轻事件 0.7。
// 手绘风没有重击——**不用 beat-drop**，所以这里全是轻档。
export const SFX_EVENTS: readonly SfxEvent[] = [
  {frame: FRAMES.scene1, kind: "page", gain: 0.5, duck: 0.7},
  {frame: FRAMES.scene2, kind: "page", gain: 0.5, duck: 0.7},
  {frame: FRAMES.scene3, kind: "tap", gain: 0.45, duck: 0.7},
];

// ─────────────────────── 铅笔沙沙声：已撤（用户实听判词） ───────────────────────
// 原 DRAW_WINDOWS + pencilVolume 包络整段移除（git 历史可查）。
// 死因复盘：包络函数本身是对的（窗口外恒 0），但 AudioMix 挂在 <Audio loop> 上——
// **loop 下音量回调按每圈循环的本地帧求值**，6s 样本循环到哪都可能落进「窗口」，
// 于是粉噪声全片周期性响，用户听到的正是「一直有沙沙声」。
// 教训：逐帧包络与 loop 不能同挂一条 <Audio>；要窗口就用 Sequence 逐窗摆放。

// BGM 起播点：跳过曲子开头，从最平的段落进（用 ebur128 之类的响度分析工具挑一个响度
// 波动最小的窗口起播——曲子里渐强、渐弱的段落都不该压在旁白下）。
// 曲子本身选定后就是品牌听觉锚，跨集复用，不逐集换曲；换曲是账号层面的决定，不是单集决定。帧号 T 表达式。
export const BGM_START_FROM = T.fps * 6;

// BGM：基础音量缺省 0.10（对应 studio.config.json 的 bgm.volume；这个常量本身不读配置，
// 换音量是改风格族的动作）。缺省值定得比较低，是因为默认假设受众在意「旁白清清楚楚」多过
// 「BGM 有存在感」——如果你的内容更需要 BGM 撑气氛，可以按需调高，人耳终验判据仍然是
// 「旁白清清楚楚、BGM 若有若无」，具体拍板权在你自己的耳朵。
// 末 24 帧淡出，每个事件 sidechain 闪避（前 2 帧压、保持 6 帧、12 帧弹回）。
export const bgmVolume = (frame: number): number => {
  const duck = SFX_EVENTS.reduce((current, event) => {
    const depth = interpolate(
      frame,
      [event.frame - 2, event.frame, event.frame + 6, event.frame + 18],
      [1, event.duck, event.duck, 1],
      {...CLAMP},
    );
    return Math.min(current, depth);
  }, 1);

  const fadeOut = interpolate(
    frame,
    [FRAMES.duration - 24, FRAMES.duration - 1],
    [1, 0],
    {...CLAMP},
  );

  return 0.10 * duck * fadeOut;
};
