// 手绘故事风 · 通用视觉原语。
//
// 这套原语是从一个更通用的「实测类」视频引擎精简出来的：那类引擎面向的是"讲一个工具好不好用"
// 这种题材，会带证据窗、批注笔迹、品牌角标这类元素。手绘故事片讲的是虚构/转述的生活故事，
// 用不上那些，本文件特意不带这些部件，免得下一个人「看它少了就补回来」：
//
//   ✗ 品牌角标常驻组件 —— 品牌角标文案已经在 Main.tsx 的 BrandMark 里按 theme 配置渲染了，
//     不需要在 Fx.tsx 再放一个通用组件；画面上不放公众号名/其它平台名（会被判定为导流）。
//   ✗ 吉祥物 —— 那是「实测类」引擎的人格化载体。手绘故事片的人格是「一个画故事的人」，
//     靠画风和旁白立，不靠吉祥物。
//   ✗ 证据窗（截图/录屏证据框）—— **明确弃用，别复活**。它的前提是「有真实操作可截图」；
//     手绘故事片是演绎，画面不是证据，硬搬证据窗会变成**用真实感包装虚构**，比不用更糟。
//   ✗ 图章 / 荧光笔 / 手绘红圈这类「批注」语法 —— 配的是证据窗，手绘故事片没有要批注的对象。
//   ✗ 白卡片信息载体 —— 那是文字/图表类内容的信息载体。这个风格族的信息载体是
//     **被画出来的线**（见 Draw.tsx）。
//
//   ✓ Paper / ScenePush / EnteringImage 留下（见各自注释）。
//
// 手绘风的动效签名在 Draw.tsx（DrawPath/DrawSequence/CrayonFill），不在本文件。

import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  random,
  staticFile,
  useCurrentFrame,
} from "remotion";
import {CLAMP, LAYOUT, MOTION, SCENE_RANGES, TOKENS, type Layout} from "./theme";

// 单画幅：只有 Story9x16 一个 Composition，没有按平台分叉的双画幅逻辑。
//
// **但 LAYOUT 保留 portrait 键名**——将来若扩画幅（比如同时要发一个 3:4 或 16:9 版本），
// 按「双画幅同组件分支」机制加 landscape 键，让组件内部按 useVideoConfig() 判分支，
// **绝不写两套场景**。这个函数就是那道将来的接缝，别为了「现在只有一个画幅」把它内联掉。
export const useStoryLayout = (): Layout => LAYOUT.portrait;

const activeRange = (frame: number) =>
  SCENE_RANGES.find((range) => frame >= range.start && frame < range.end) ?? SCENE_RANGES.at(-1)!;

// ─────────────────────────────────────────────────────────────
// Paper —— 纸感质感层，常驻背景
//
// **程序化，不用背景图**：纸感要的是「feTurbulence 纸纹，seed 按帧派生」——
// 一张静态 PNG 给不了逐帧变化的纸纹，铺开就是一层死纹理，反而更假。
// 顺带也让背景层不依赖任何素材文件。母版整体要渲起来还需要两样：SCENE_ART 指的那对
// 随包占位图（在 public/ 里，随包带），和音频（旁白/BGM/音效，由 tools/probe.sh 临时造静音占位）。
// ─────────────────────────────────────────────────────────────

export const Paper = () => {
  const frame = useCurrentFrame();
  const layout = useStoryLayout();
  const range = activeRange(frame);
  const decor = layout.decor;

  return (
    <AbsoluteFill
      style={{
        zIndex: TOKENS.layers.background,
        overflow: "hidden",
        backgroundColor: TOKENS.colors.paper,
      }}
    >
      {/* 背景慢推 1.0→1.01（背景仅 1% 慢推，比主体的 5% 弱得多，
          差速才有纵深；等速推等于整张图放大，白推） */}
      <AbsoluteFill
        style={{
          scale: interpolate(frame, [range.start, range.end - 1], MOTION.backgroundPush, CLAMP),
        }}
      >
        {/* 纸屑粒子。只在这一层——放前景会飘到人物上被读成脏点（试过，不好看） */}
        {decor.particleSize.map((size, index) => {
          // 相位用 random(seed) 派生，seed 不含 frame（含了就是每帧重掷 = 粒子乱跳）
          const phase = random(`paper-particle-${index}`) * Math.PI * 2;
          const drift =
            Math.sin((frame / MOTION.floatPeriod) * Math.PI * 2 + phase) * decor.particleDrift;
          return (
            <div
              key={`particle-${index}`}
              style={{
                position: "absolute",
                left: `${decor.particleX[index]}%`,
                top: `${decor.particleY[index]}%`,
                width: size,
                height: size * 0.58,
                translate: `${drift}px ${drift * 0.6}px`,
                rotate: `${decor.particleRotation[index]}deg`,
                backgroundColor: TOKENS.colors.inkSoft,
                opacity: 0.28,
                clipPath: "polygon(8% 0, 100% 12%, 92% 100%, 0 82%)",
              }}
            />
          );
        })}
      </AbsoluteFill>

      {/* 纸纹：seed 按帧派生 → 每帧的纹理不同 = 纸在「活着」。
          除以 2 是让它两帧一换（30fps 下每帧一换太躁）；% 31 + 1 把 seed 关在小整数域里循环。 */}
      <svg
        width={layout.width}
        height={layout.height}
        style={{position: "absolute", inset: 0, opacity: decor.noiseOpacity}}
      >
        <filter id="paper-noise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.7"
            numOctaves="3"
            seed={(Math.floor(frame / 2) % 31) + 1}
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#paper-noise)" />
      </svg>

      {/* 极轻暗角 */}
      <AbsoluteFill
        style={{
          opacity: decor.vignetteOpacity,
          background: `radial-gradient(circle at center, ${TOKENS.colors.transparent} 66%, ${TOKENS.colors.vignette} 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────
// ScenePush —— 每个场景全程缓慢推近 1.0→1.05
//
// 手绘风只用推近。**不用镜头震动、不用金属光扫**这类更适合科技感/发布会风格的语法，
// 混用即破风格——挑一种镜头语言坚持到底，比每样都用一点更像「一种风格」。
// ─────────────────────────────────────────────────────────────

export const ScenePush = ({
  children,
  start,
  end,
}: {
  children: React.ReactNode;
  start: number;
  end: number;
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        scale: interpolate(frame, [start, end - 1], MOTION.scenePush, CLAMP),
        transformOrigin: "center center",
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────
// EnteringImage —— 生图素材（人物/道具 PNG）入场
//
// 分层纪律：每个镜头至少四层，**人物必须是独立 PNG**
// （背景 z0 / 配角 2 / 主角 5 / 前景 9 / 字幕 12 → TOKENS.layers）。
// 人物和背景粘在一起就不能独立控制，整条流水线的意义就没了。
//
// **禁纯淡入**（动效签名见 theme.ts 的 MOTION）：入场是缩放+位移+模糊 8px→0 的复合运动。
// 手绘线条走 Draw.tsx 的 DrawPath「被画出来」，那条路更正；本组件是给
// 抠好的 PNG 用的。
// ─────────────────────────────────────────────────────────────

export const EnteringImage = ({
  asset,
  left,
  top,
  height,
  rotation,
  zIndex,
  start,
  float = false,
}: {
  asset: string;
  left: number;
  top: number;
  height: number;
  rotation: number;
  zIndex: number;
  start: number;
  /** 入场后保留极轻微漂浮，避免画面完全静止（第八节） */
  float?: boolean;
}) => {
  const frame = useCurrentFrame();
  const ease = {...CLAMP, easing: Easing.bezier(0.16, 1, 0.3, 1)};
  const enterY = interpolate(frame, [start, start + MOTION.enterFrames], MOTION.enterY, ease);

  // 相位以 start 为锚，不含 random——同一素材每次渲染必须同一条轨迹
  const phase = ((frame - start) / MOTION.floatPeriod) * Math.PI * 2;
  const floatY = float ? Math.sin(phase) * MOTION.floatAmplitude : 0;
  const floatRotate = float ? Math.sin(phase * 0.7) * MOTION.floatRotate : 0;

  return (
    <Img
      src={staticFile(asset)}
      style={{
        position: "absolute",
        left,
        top,
        height,
        zIndex,
        // 一次性事件必须加门控：clamp 的 extrapolateLeft 会把值钉在触发帧之前的那个值，
        // 不加门控则素材在起始帧之前就已经以「入场完成态」可见（踩过这个坑：一片本该
        // 逐渐显现的素材，从头到尾一直是完全不透明的，因为没人在它「该出现」之前把它藏起来）。
        visibility: frame >= start ? "visible" : "hidden",
        scale: interpolate(frame, [start, start + MOTION.enterFrames], MOTION.enterScale, ease),
        transform: `translateY(${enterY + floatY}px) rotate(${rotation + floatRotate}deg)`,
        transformOrigin: "center bottom",
        filter: `blur(${interpolate(frame, [start, start + MOTION.enterFrames], MOTION.enterBlur, ease)}px) ${TOKENS.shadow}`,
      }}
    />
  );
};
