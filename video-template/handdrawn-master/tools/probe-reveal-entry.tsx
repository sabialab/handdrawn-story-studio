// 拆层揭示方案的探针入口 —— **故意放 tools/ 不放 src/**：
// Root.tsx「只注册一个 Composition」是宪法条款（契约测试④盯着 Story9x16 唯一性），
// 探针不许碰它。tsconfig 的 include 也只有 src——本文件由 Remotion 打包器自行处理。
//
// 用法（在母版目录）：
//   npx remotion still tools/probe-reveal-entry.tsx ProbeReveal out/probe/reveal-f45.png --frame=45
//
// 探针只回答一个问题：拆层 PNG 经 RevealSweep 扫出，**像不像有人在画**。
// 判定只能读图（probe.sh 卷首：--quick 全绿 ≠ 画面是对的）。
import {Composition, registerRoot, staticFile} from "remotion";
import {RevealSweep} from "../src/Draw";
import {TOKENS} from "../src/theme";

// 节奏参照 MOTION.drawOutlineFrames 的量级放大到整图：
// 线稿 66 帧（2.2s）扫完，上色在线稿近尾时（54 帧）接入、60 帧扫完——
// 与 STROKES 场景「轮廓画完 6 帧后上色」的先后律一致。
const INK_START = 0;
const INK_DUR = 66;
const COLOR_START = 54;
const COLOR_DUR = 60;
const TAIL = 30;

const ProbeReveal = () => (
  <div style={{position: "absolute", inset: 0, background: TOKENS.colors.paper}}>
    {/* 线稿：自上而下略带右行（165°），像先起形。fromPct/toPct＝主体纵向包围盒
        （probe-scene 主体约占 33%–92%——扫全画布的教训见 RevealSweep 注释） */}
    <RevealSweep
      src={staticFile("probe-scene-ink.png")}
      startFrame={INK_START}
      durationFrames={INK_DUR}
      angleDeg={165}
      fromPct={28}
      toPct={92}
    />
    {/* 上色：横扫（90°），斜排线一根根冒出来。横向包围盒约 15%–85% */}
    <RevealSweep
      src={staticFile("probe-scene-color.png")}
      startFrame={COLOR_START}
      durationFrames={COLOR_DUR}
      angleDeg={90}
      fromPct={12}
      toPct={88}
    />
  </div>
);

registerRoot(() => (
  <Composition
    id="ProbeReveal"
    component={ProbeReveal}
    width={1080}
    height={1080}
    fps={30}
    durationInFrames={COLOR_START + COLOR_DUR + TAIL}
  />
));
