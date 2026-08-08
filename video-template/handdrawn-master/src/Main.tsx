// 层序：背景(0) / 配角(2) / 主角(5) / 前景(9) / 字幕(12)。
//
// BrandMark＝品牌角标，每片必带，文案是你自己账号的昵称——不是「导流」（导流指的是引导观众
// 离开当前平台去别处，比如放公众号名/其它平台名；自己账号在本平台内的昵称不算）。
// 画家签名式：静态、无动效（天然 seek-safe），位置/文案全在 theme（契约测试③盯着组件里不许有中文）。

import {AbsoluteFill} from "remotion";
import {AudioMix} from "./AudioMix";
import {Captions} from "./Captions";
import {Paper, useStoryLayout} from "./Fx";
import {Scenes} from "./Scenes";
import {COPY, TOKENS} from "./theme";

const BrandMark = () => {
  const layout = useStoryLayout();
  return (
    <div
      style={{
        position: "absolute",
        left: layout.brandMark.x,
        top: layout.brandMark.y,
        translate: "-50% -50%",
        transform: `rotate(${layout.brandMark.rotation}deg)`,
        zIndex: TOKENS.layers.annotation,
        color: TOKENS.colors.inkSoft,
        fontFamily: TOKENS.fonts.hook,
        // label = 40px，压在绝对下限上。**不许再降**（第五节）。
        fontSize: TOKENS.type.label,
        fontWeight: TOKENS.weights.medium,
        whiteSpace: "nowrap",
      }}
    >
      {COPY.brandMark}
    </div>
  );
};

export const HanddrawnStory = () => (
  <AbsoluteFill style={{backgroundColor: TOKENS.colors.paper, overflow: "hidden"}}>
    <Paper />
    <Scenes />
    <BrandMark />
    <Captions />
    <AudioMix />
  </AbsoluteFill>
);
