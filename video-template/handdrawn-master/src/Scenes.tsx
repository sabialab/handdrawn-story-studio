// 分镜 —— **唯一按片重写的组件文件**（写新片时，只改这一个组件；其余组件与 theme.ts
// 的永不换常量块保持不动，见本包 references/production.md「二、常量换在哪」）。
//
// 本版是随包示例片（奶奶叠塑料袋）：三个拆层场景 + 钩子 + 尾牌，对应三段旁白（三个说话人切换点）。
// 写自己的新片时，场景数量跟着你自己旁白稿的说话人切换点走，不是固定三个或四个；
// 人物是否出镜、用什么叙事物件，也都按自己故事的分镜表来定。
// 本示例故意全程无脸、只用物件（塑料袋、抽屉、书），降低第一次上手的难度。
//
// 场景表（分镜锚＝说话人切换点，theme.FRAMES）：
//   S1 L1   叙述者开场（+钩子+演绎标识——虚构片红线，开场 3 秒内）
//   S2 L2   奶奶的道理（一块钱三十个，真要用的时候手边一个都没有）
//   S3 L3   搬家那天挑出最厚的袋子递过来（情绪落点，画面不加花活，克制是力量）
//
// 只许用现有原语拼装：Draw.tsx → RevealSweep（本示例主力，拆层揭示方案）；
// Fx.tsx → ScenePush / Paper。动效参数一律引 MOTION/ART_TIMING，帧号一律引 FRAMES（T 表达式）。

import type {ReactNode} from "react";
import {Easing, interpolate, staticFile, useCurrentFrame} from "remotion";
import {ScenePush, useStoryLayout} from "./Fx";
import {RevealSweep} from "./Draw";
import {
  ART_TIMING,
  CLAMP,
  COPY,
  FRAMES,
  MOTION,
  SCENE_ART,
  STORY_SOURCE,
  TOKENS,
  type Layout,
} from "./theme";

// 文字入场：缩放+位移+模糊 8px→0 的复合运动。
// **禁纯淡入**（动效签名见 theme.ts 的 MOTION）——纯淡入是「静态图+淡入」的语法，
// 那正是手绘风要划清界限的东西。
const TextEnter = ({
  children,
  x,
  y,
  width,
  start,
  fontSize,
  fontFamily,
  color = TOKENS.colors.ink,
  rotation = 0,
}: {
  children: ReactNode;
  x: number;
  y: number;
  width: number;
  start: number;
  fontSize: number;
  fontFamily: string;
  color?: string;
  rotation?: number;
}) => {
  const frame = useCurrentFrame();
  const ease = {...CLAMP, easing: Easing.bezier(0.16, 1, 0.3, 1)};
  const y0 = interpolate(frame, [start, start + MOTION.enterFrames], MOTION.enterY, ease);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        zIndex: TOKENS.layers.copy,
        // 一次性事件门控：不加这行，clamp 会把值钉在触发前，元素会在起始帧之前
        // 就以「入场完成态」可见。
        visibility: frame >= start ? "visible" : "hidden",
        translate: "-50% -50%",
        scale: interpolate(frame, [start, start + MOTION.enterFrames], MOTION.enterScale, ease),
        transform: `translateY(${y0}px) rotate(${rotation}deg)`,
        filter: `blur(${interpolate(frame, [start, start + MOTION.enterFrames], MOTION.enterBlur, ease)}px)`,
        color,
        fontFamily,
        fontSize,
        fontWeight: TOKENS.weights.medium,
        lineHeight: 1.15,
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
};

// 舞台：拆层场景画在这里（拆层揭示方案）。
//
// 两层，**渲染顺序不能反**：蜡笔排线在下，铅笔轮廓在上——
// 真人上色也是这个顺序（先线后色、色不盖线）；反了就是色块糊住线稿。
// 时间顺序则相反于图层顺序：线稿先扫（起形），上色在线稿近尾接入（ART_TIMING）。
type SceneArt = (typeof SCENE_ART)[keyof typeof SCENE_ART];

const Stage = ({
  art,
  startFrame,
  layout,
}: {
  art: SceneArt;
  startFrame: number;
  layout: Layout;
}) => (
  <div
    style={{
      position: "absolute",
      left: layout.stage.x,
      top: layout.stage.y,
      width: layout.stage.width,
      height: layout.stage.height,
      translate: "-50% -50%",
      zIndex: TOKENS.layers.lead,
    }}
  >
    <RevealSweep
      src={staticFile(art.color)}
      startFrame={startFrame + ART_TIMING.colorDelay}
      durationFrames={ART_TIMING.colorDur}
      {...art.colorSweep}
    />
    <RevealSweep
      src={staticFile(art.ink)}
      startFrame={startFrame}
      durationFrames={ART_TIMING.inkDur}
      {...art.inkSweep}
    />
  </div>
);

// 场景一：钩子 + 演绎标识 + 布袋与钱。前 3 秒抛处境
// （钩子给处境，不给冲突画面本身——见本包 references/narration.md 第 0 步「视频简报」）。
//
// **演绎标识就在这里**，与钩子同屏——不是尾帧小字。
// 只有 fiction 走这条；adapted 走尾帧，firsthand 无标识
// （三分类那张表见本包 references/interview.md 第三组）。
const S1 = () => {
  const layout = useStoryLayout();
  return (
    <ScenePush start={FRAMES.scene1} end={FRAMES.scene2}>
      <Stage art={SCENE_ART.scene1} startFrame={FRAMES.scene1} layout={layout} />
      {STORY_SOURCE === "fiction" ? (
        <TextEnter
          x={layout.sourceMark.x}
          y={layout.sourceMark.y}
          width={layout.hook.width}
          start={FRAMES.sourceMark}
          // label = 40px，正好压在绝对下限上。**不许再降**（下限见 theme.ts 的 TOKENS.type.min）。
          fontSize={TOKENS.type.label}
          fontFamily={TOKENS.fonts.subtitle}
          color={TOKENS.colors.inkSoft}
          rotation={layout.sourceMark.rotation}
        >
          {COPY.sourceMark.fiction}
        </TextEnter>
      ) : null}
      <TextEnter
        x={layout.hook.x}
        y={layout.hook.y}
        width={layout.hook.width}
        start={FRAMES.hook}
        // hookSmall 不是审美退让（LAYOUT.hook 注释）：hook(170) 下 6 字就超行宽，
        // 7 字文案必然折出孤字压在画上——抽帧读图抓的，tsc 与契约测试全绿。
        fontSize={TOKENS.type.hookSmall}
        fontFamily={TOKENS.fonts.hook}
      >
        <div>{COPY.hook.line1}</div>
        <div>{COPY.hook.line2}</div>
      </TextEnter>
    </ScenePush>
  );
};

// 场景二/三/四：拆层图被扫出。
// 场景大字已随本片撤掉——顶部字幕承载全部旁白文本，中部再压大字＝抢注意力（COPY 注释）。
const StoryScene = ({art, start, end}: {art: SceneArt; start: number; end: number}) => {
  const layout = useStoryLayout();
  return (
    <ScenePush start={start} end={end}>
      <Stage art={art} startFrame={start} layout={layout} />
    </ScenePush>
  );
};

// 尾牌：选择题引导评论——给讨论理由，不索赞不索关注
// （界线见本包 references/publish-check.md B 节「互动与诱导」）。
// 转述改编片的「改编自真实经历」标识在这里。
const Tail = () => {
  const layout = useStoryLayout();
  return (
    <ScenePush start={FRAMES.tail} end={FRAMES.duration}>
      <TextEnter
        x={layout.tail.x}
        y={layout.tail.y}
        width={layout.tail.width}
        start={FRAMES.tail}
        fontSize={TOKENS.type.sceneSmall}
        fontFamily={TOKENS.fonts.hook}
      >
        <div>{COPY.tail.line1}</div>
        <div>{COPY.tail.line2}</div>
        <div>{COPY.tail.line3}</div>
      </TextEnter>
      {STORY_SOURCE === "adapted" ? (
        <TextEnter
          x={layout.tail.x}
          // 三行尾牌半高 ≈1.15×80×1.5＝138 → ×2.6 才出块（两行时代的 ×2 会压进第三行）
          y={layout.tail.y + TOKENS.type.sceneSmall * 2.6}
          width={layout.tail.width}
          start={FRAMES.tail}
          fontSize={TOKENS.type.label}
          fontFamily={TOKENS.fonts.subtitle}
          color={TOKENS.colors.inkSoft}
        >
          {COPY.sourceMark.adapted}
        </TextEnter>
      ) : null}
    </ScenePush>
  );
};

// 场景硬切，切点落在旁白句起点（天然停顿）。加/减场景时，级联结构照这个模式续写：
// 每加一个 SCENE_ART.sceneN 就多一个 `if (frame < FRAMES.sceneN+1)` 分支。
export const Scenes = () => {
  const frame = useCurrentFrame();
  if (frame < FRAMES.scene2) return <S1 />;
  if (frame < FRAMES.scene3) {
    return <StoryScene art={SCENE_ART.scene2} start={FRAMES.scene2} end={FRAMES.scene3} />;
  }
  if (frame < FRAMES.tail) {
    return <StoryScene art={SCENE_ART.scene3} start={FRAMES.scene3} end={FRAMES.tail} />;
  }
  return <Tail />;
};
