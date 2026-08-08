// 字幕带 —— 一层，**顶部固定**。
//
// 三处设计决定（都不是审美选择，逐条有依据）：
//   1. **位置：顶部，不是底部**。不少竖屏平台底部是标题浮层、右侧是按钮列（「安全区」惯例：
//      上下各留一截不放关键内容）。如果你的目标平台底部没有遮挡，放底部也可以，改
//      LAYOUT.portrait.captionTop 即可。
//   2. **字号 56px，绝对下限 40px**。字号是设计输入，不是审美偏好——受众用手机小屏看，
//      字小了读起来费劲；如果你的受众阅读速度更快，可以往下调，但不建议低于 40px 这个下限。
//   3. **文本源：T.lines[].text，不是另抄一份文案**。理由见 theme.ts 的「字幕」一节——
//      旁白已经冻结在帧表里，再抄一份就有两个事实源，漂移出来的字幕和耳朵对不上。
//
// 逐块入场：块间隔 3 帧依次弹入。**不做逐字卡拉OK**——这是审美选择（逐字跳字反而更难读），
// 不是技术限制：MiniMax 的 subtitle_type 是能取到 'word' 级时间戳的，只是这里选择不用。

import {Sequence, interpolate, useCurrentFrame} from "remotion";
import {CLAMP, LAYOUT, MOTION, T, TOKENS, toCaptionBlocks} from "./theme";

const CaptionLine = ({text}: {text: string}) => {
  const frame = useCurrentFrame();
  const layout = LAYOUT.portrait;
  const blocks = toCaptionBlocks(text);

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        // 顶部：安全区之下。不是 bottom。
        top: layout.captionTop,
        // width: max-content 是**必须的**〔2026-07-16 抽帧实测〕：absolute + left:50% 的
        // 收缩适应宽度＝容器宽−left＝540px，maxWidth:960 从未生效 → 10 字的块在 8 字处
        // 被硬折成「两万/块，」。max-content 让卡先按整句量宽、再由 maxWidth 封顶，
        // 于是换行只发生在块边界（标点处），块内不再折字。
        width: "max-content",
        maxWidth: layout.captionMaxWidth,
        translate: "-50% 0",
        zIndex: TOKENS.layers.copy,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        // 块之间不留 gap：块是按标点切的，拼起来必须读成原句
        padding: `${layout.captionPadding}px ${layout.captionPadding * 1.4}px`,
        borderRadius: layout.captionRadius,
        backgroundColor: TOKENS.colors.captionPaper,
        color: TOKENS.colors.ink,
        fontFamily: TOKENS.fonts.subtitle,
        fontSize: TOKENS.type.subtitle,
        fontWeight: TOKENS.weights.medium,
        lineHeight: 1.35,
        textAlign: "center",
        filter: TOKENS.shadow,
      }}
    >
      {blocks.map((block, blockIndex) => {
        // 帧号相对本 Sequence 起点（Sequence 内 useCurrentFrame() 已归零）
        const start = blockIndex * MOTION.captionBlockGapFrames;
        const end = start + MOTION.captionBlockEnterFrames;
        return (
          <span
            key={`${blockIndex}-${block}`}
            style={{
              opacity: interpolate(frame, [start, end], [0, 1], CLAMP),
              transform: `translateY(${interpolate(frame, [start, end], MOTION.captionBlockY, CLAMP)}px)`,
              whiteSpace: "pre-wrap",
            }}
          >
            {block}
          </span>
        );
      })}
    </div>
  );
};

export const Captions = () => (
  <>
    {T.lines.map((line) => (
      // layout="none" 上没有 premountFor（Sequence.d.ts 的判别联合类型），
      // 硬加会 TS2322——不是 bug，别「修」（本包 references/production.md 第三节第 4 条）。
      <Sequence
        key={line.id}
        from={line.start_frame}
        durationInFrames={line.dur_frames}
        layout="none"
      >
        <CaptionLine text={line.text} />
      </Sequence>
    ))}
  </>
);
