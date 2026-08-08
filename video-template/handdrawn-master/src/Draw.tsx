// 手绘故事风的动效签名：「线条被画出来」。
//
// 为什么单独成文件：其它偏「产品实测」类风格的视频引擎通常不需要这组原语——那类内容
// 画的是截图/道具，用的是入场复合运动就够了。手绘风的分界线就在这里：
//   **静态图 + 淡入 ≠ 手绘视频。** 观众要看到「有人在画」。
//
// 工程铁律（逐条遵守）：
//   - 所有动画只用 useCurrentFrame() 驱动
//   - 每个 interpolate 双向 clamp
//   - 随机一律 random(seed)，禁 Math.random() / Date.now()
//   - 禁 CSS transitions/animations（Remotion 官方硬约束，seek 不安全）
//   - 一次性事件加 frame >= 触发帧 门控

import type {CSSProperties, ReactNode} from "react";
import {Img, interpolate, random, useCurrentFrame} from "remotion";
import {CLAMP} from "./theme";

// ─────────────────────────────────────────────────────────────
// DrawPath —— SVG 路径「被画出来」
//
// 原理：stroke-dasharray = 路径总长，stroke-dashoffset 从总长走到 0。
// dashoffset 由 useCurrentFrame() 驱动 → 天然 seek-safe（任意帧可独立求值，
// 无累积状态）。这正是 Remotion 官方禁 CSS animation 的理由：CSS 动画有内部
// 时钟，seek 到任意帧不保证同一画面，渲染出来会抖。
//
// pathLength={1} 是关键技巧：SVG 规范允许把路径长度归一化为 1，
// 于是 dasharray/dashoffset 直接用 0–1 的进度值，**不必测量真实路径长度**
// （getTotalLength() 要访问 DOM，在 Remotion 的确定性渲染里是雷）。
// ─────────────────────────────────────────────────────────────

export type DrawPathProps = {
  /** SVG path 的 d 属性 */
  d: string;
  /** 起画帧（绝对帧号；一律写 T 表达式，禁魔法数字） */
  startFrame: number;
  /** 画完需要多少帧。主体轮廓 18–24，细节 8–12（值取自 theme.ts 的 MOTION） */
  durationFrames: number;
  stroke: string;
  strokeWidth?: number;
  /**
   * 手绘抖动幅度，单位**同 d 的坐标系（viewBox 单位），不是屏幕像素**。
   * 〔2026-07-15 订正：原注释写的「px」是错的。CSS translate 作用在 SVG 子元素上时
   * 走的是局部用户坐标系——归一化 viewBox 下 1 单位 ≈ 10 屏幕像素，
   * 于是 jitter=1.5 出来是 15px 错位，抽帧读图上是「椅子腿没接上座面」，
   * 读起来是画歪了，不是手绘感。〕0 = 关闭。
   */
  jitter?: number;
  /** 抖动种子——同一条线必须给稳定 seed，否则每帧重掷 = 线在抖 */
  seed?: string;
  style?: CSSProperties;
};

export const DrawPath = ({
  d,
  startFrame,
  durationFrames,
  stroke,
  strokeWidth = 4,
  jitter = 0,
  seed = "draw",
  style,
}: DrawPathProps) => {
  const frame = useCurrentFrame();

  // 进度 0→1。双向 clamp：起画前恒 0，画完后恒 1。
  const progress = interpolate(frame, [startFrame, startFrame + durationFrames], [0, 1], {
    ...CLAMP,
  });

  // 手绘抖动：用 random(seed) 派生一个稳定的亚像素偏移。
  // seed 里**不含 frame**——含了就是每帧重掷，线会自己抖成筛子。
  // 要「活着的线」应该靠笔触本身的不规则，不是靠逐帧抖动。
  const dx = jitter ? (random(`${seed}-x`) - 0.5) * jitter : 0;
  const dy = jitter ? (random(`${seed}-y`) - 0.5) * jitter : 0;

  return (
    <path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      // pathLength=1 → dasharray/dashoffset 用归一化进度，免测真实长度
      pathLength={1}
      strokeDasharray={1}
      strokeDashoffset={1 - progress}
      style={{translate: `${dx}px ${dy}px`, ...style}}
    />
  );
};

// ─────────────────────────────────────────────────────────────
// DrawSequence —— 多条线依次画出
//
// 多条线要**错开起始帧**——同时画完像贴图，依次画出才像有人在画。
// 这是手绘风最容易做错的地方（错开帧数取自 theme.ts 的 MOTION.drawStagger）。
// ─────────────────────────────────────────────────────────────

export type DrawStroke = {
  d: string;
  /** 相对本组起画帧的偏移 */
  delay?: number;
  durationFrames?: number;
  strokeWidth?: number;
  stroke?: string;
};

export const DrawSequence = ({
  strokes,
  startFrame,
  stroke,
  defaultDuration = 20,
  /** 未显式给 delay 时，相邻两条线的自动错开帧数 */
  stagger = 6,
  /**
   * 笔画粗细，单位是 **viewBox 单位，不是像素**——这是最容易搞错的地方。
   * 归一化 viewBox "0 0 100 100" 贴到 984px 宽的舞台上，缩放系数≈9.84：
   * strokeWidth=4 出来是 **39px**，那是马克笔不是铅笔。
   * 〔2026-07-15 抽帧实测踩到：线粗得像记号笔，tsc 当然不会报。〕
   * 铅笔感要 5–6px 上屏 → 0.5–0.6 viewBox 单位。默认值按此定。
   */
  strokeWidth = 0.55,
  jitter = 0,
  seed = "seq",
}: {
  strokes: readonly DrawStroke[];
  startFrame: number;
  stroke: string;
  defaultDuration?: number;
  stagger?: number;
  strokeWidth?: number;
  jitter?: number;
  seed?: string;
}) => (
  <>
    {strokes.map((s, i) => (
      <DrawPath
        key={`${seed}-${i}`}
        d={s.d}
        startFrame={startFrame + (s.delay ?? i * stagger)}
        durationFrames={s.durationFrames ?? defaultDuration}
        stroke={s.stroke ?? stroke}
        strokeWidth={s.strokeWidth ?? strokeWidth}
        jitter={jitter}
        seed={`${seed}-${i}`}
      />
    ))}
  </>
);

// ─────────────────────────────────────────────────────────────
// CrayonFill —— 蜡笔填充，轮廓画完后由内向外扩散
//
// 蜡笔填充在轮廓画完后 6 帧起，用 clip-path 或 mask 由内向外扩散，8–10 帧完成
// （帧数取自 theme.ts 的 MOTION.fillDelayFrames / fillFrames）。
// **局部上色不满铺**是手绘风的签名：只有一两处入色，其余大片留白。
// ─────────────────────────────────────────────────────────────

export const CrayonFill = ({
  children,
  startFrame,
  durationFrames = 9,
  /** 扩散原点，默认从中心。格式同 CSS circle() 的圆心 */
  origin = "50% 50%",
}: {
  children: ReactNode;
  startFrame: number;
  durationFrames?: number;
  origin?: string;
}) => {
  const frame = useCurrentFrame();

  // 一次性事件必须加门控：clamp 的 extrapolateLeft 会把值钉在触发前，
  // 不加门控则填充在起画前就可见（一片本该逐渐显色的填充，从头到尾都是满色的）。
  if (frame < startFrame) return null;

  const r = interpolate(frame, [startFrame, startFrame + durationFrames], [0, 75], {...CLAMP});

  // ⚠️ position:absolute + inset:0 是**必须的，别改成裸 div**。
  // 〔2026-07-15 抽帧实测：裸 div 会把整个场景擦掉。〕
  // clip-path 按元素自己的 border box 裁，且**裁的是全部后代，包括绝对定位的**。
  // 裸 div 的子元素若是绝对定位的 svg，div 自身高度算出来是 0 → circle() 的百分比
  // 对着一个 1080×0 的盒子解析、圆心落在盒子顶边 → 画面上什么都不剩。
  // tsc 和契约测试都抓不到这个（类型对、没硬编码），**只有抽帧读图能抓到**。
  return (
    <div style={{position: "absolute", inset: 0, clipPath: `circle(${r}% at ${origin})`}}>
      {children}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// RevealSweep —— 位图层「被画出来」（拆层揭示方案的本体）
//
// DrawPath 只能画 SVG 路径，而生图模型交的是 PNG。拆层揭示方案：按色拆层
// （tools/split_layers.py：线稿层 / 上色层）→ 每层用方向性遮罩扫过揭示。
// 遮罩是 CSS mask 的 linear-gradient，进度纯 useCurrentFrame() 驱动 → seek-safe。
//
// 方向要跟笔触走（angleDeg 用 CSS 渐变角：0=向上 90=向右 180=向下）：
//   上色层沿排线的行进方向横扫（斜排线用 90°，一根根冒出来才像有人在排线）；
//   线稿层顺「下笔顺序」扫（家具自上而下，165° 读起来最顺）。
// softEdgePct 是柔边——硬边扫过去是百叶窗，不是笔。
//
// 色值只用 black/transparent 关键字：mask 只看 alpha 通道，且契约测试③
// 禁 hex 色值与 rgb 函数写法出现在组件里、连注释都查（本注释初版就是这么被
// 自己解释的规则咬了一口的）。色值必须逐字来自 theme TOKENS——遮罩不是色值，
// 但规则一寸不让，关键字刚好两头都干净。
// ─────────────────────────────────────────────────────────────

export type RevealSweepProps = {
  /** 图层地址。调用方自己包 staticFile()（与 DrawPath 收 d 一样，原语不管资源定位） */
  src: string;
  /** 起扫帧（绝对帧号；一律写 T 表达式，禁魔法数字） */
  startFrame: number;
  durationFrames: number;
  /** 揭示行进方向，CSS 渐变角 */
  angleDeg?: number;
  /** 柔边宽度，占行进长度的百分比 */
  softEdgePct?: number;
  /**
   * 揭示带的起点/终点（沿行进方向的百分位）。**对齐主体包围盒，别用默认值扫全画布**——
   * 生图 60–70% 是留白（留白是这个风格族的签名），从 0 扫起意味着前 1/3 时长在扫空白纸，
   * 观众看到的是「卡了」。〔2026-07-16 探针 f24 实测：整帧空白 0.8s。〕
   */
  fromPct?: number;
  toPct?: number;
  style?: CSSProperties;
};

export const RevealSweep = ({
  src,
  startFrame,
  durationFrames,
  angleDeg = 165,
  softEdgePct = 14,
  fromPct = 0,
  toPct = 100,
  style,
}: RevealSweepProps) => {
  const frame = useCurrentFrame();

  // 一次性事件必须加门控（同 CrayonFill 的道理）：
  // 不加门控，clamp 会把遮罩钉在起点——柔边负半段仍可能露出图层的第一缕。
  if (frame < startFrame) return null;

  // head 走到 toPct+softEdgePct 才算「柔边也完全出画」，否则末尾永远差一条淡边。
  const head = interpolate(
    frame,
    [startFrame, startFrame + durationFrames],
    [fromPct, toPct + softEdgePct],
    {...CLAMP},
  );
  const mask = `linear-gradient(${angleDeg}deg, black ${head - softEdgePct}%, transparent ${head}%)`;

  return (
    <Img
      src={src}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "contain",
        WebkitMaskImage: mask,
        maskImage: mask,
        ...style,
      }}
    />
  );
};

// 铅笔沙沙声的音量包络**不在本文件**，在 theme.ts 的 pencilVolume。
//
// 移植中间态曾把它放这里（叫 drawWindowVolume），有两个问题：
//   1. theme.ts 已经有 bgmVolume 了。两条音量包络分居两个文件，改混音要翻两处。
//   2. 真要让 theme.ts 复用它，就得 theme → Draw → theme 循环引用。
// 现在的分工：**Draw.tsx 只管画，theme.ts 管全部常量与包络**（包括从 SCENE_ART
// 时序派生的 DRAW_WINDOWS——改扫掠时序，沙沙声窗口自动跟着走，不用手同步）。
