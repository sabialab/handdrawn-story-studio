// 混音 —— 全部在 Remotion 多轨 <Audio> 内完成。
//
// **禁事后 ffmpeg 手拼卡点**：拼出来的卡点在改帧表时不会跟着走。
// 音量一律回调 + clamp 包络，帧号一律 T 表达式。
//
// 三条轨：
//   BGM（基础音量缺省 0.10，见 theme.bgmVolume 注释；人耳终验判据「旁白清清楚楚、
//       BGM 若有若无」）
//   旁白（**一条母带**，volume 1，它是主角）
//   点事件音效（翻页/轻击）
// 铅笔沙沙声已撤（全片周期性沙沙响的死因与复活条件见 theme.ts「已撤」节）。

import {Audio, Sequence, staticFile} from "remotion";
import {ASSETS, BGM_START_FROM, SFX_EVENTS, T, bgmVolume} from "./theme";

export const AudioMix = () => (
  <>
    {/* startFrom 跳过曲头，从最平段起播（theme.BGM_START_FROM，用响度分析工具挑的选段起点） */}
    <Audio src={staticFile(ASSETS.audio.bgm)} volume={bgmVolume} startFrom={BGM_START_FROM} loop />

    {/* 旁白 = 一条母带（T.audio），不是逐句 WAV。**别改成逐句 Sequence 摆放**：
        · 合成单位是**说话人成段**，不是句 → 逐句 WAV 压根不存在了（见 scripts/minimax-tts.js）；
        · **段间留白是拼接出来的，误差为零**。若在这里逐句摆 Sequence，等于让 Remotion 用帧号
          重新决定留白 → 30fps 网格会把本来精确的间隔量化出 ±16ms 抖动，还可能在句界切出爆音；
        · **字幕行 ≠ 音频句**（T.lines 是合并到可读时长的**阅读**单位）
          → 拿 T.lines 去摆音频从定义上就错了。
        母带自己带着全部时间信息，从 0 帧铺到底就是对的。 */}
    <Audio src={staticFile(`${ASSETS.voiceDirectory}/${T.audio}`)} volume={1} />

    {SFX_EVENTS.map((event, index) => (
      <Sequence key={`${event.kind}-${event.frame}-${index}`} from={event.frame} layout="none">
        <Audio src={staticFile(ASSETS.audio[event.kind])} volume={event.gain} />
      </Sequence>
    ))}
  </>
);
