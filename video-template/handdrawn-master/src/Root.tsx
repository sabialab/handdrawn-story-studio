// 单画幅：**只注册一个 Composition**。
//
// 一个账号可能要发多个平台、多种画幅（9:16/3:4/16:9…），但那套复杂度是多平台矩阵逼出来的，
// 不要为了「以防万一」提前继承——本母版只做 9:16 / 1080×1920 一个画幅，需要的时候再扩。
// 「只做一个画幅」不是资源约束，是刻意的简化：多注册一个画幅就要多养一条母带分流。
//
// LAYOUT 仍保留 portrait 键名，将来若扩画幅，按「双画幅同组件分支」机制
//（useVideoConfig() 判分支）加 landscape，**绝不写两套场景组件**。

import {Composition} from "remotion";
import {HanddrawnStory} from "./Main";
import {FRAMES, LAYOUT, T} from "./theme";

export const RemotionRoot = () => (
  <Composition
    id="Story9x16"
    component={HanddrawnStory}
    width={LAYOUT.portrait.width}
    height={LAYOUT.portrait.height}
    fps={T.fps}
    durationInFrames={FRAMES.duration}
  />
);
