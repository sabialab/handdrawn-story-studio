// 契约测试 —— **四类断言的结构不许删不许绕，写自己的新片时只换数据**（见本包
// references/production.md「二、常量换在哪」）。
//
//   ① 冻结帧表：连续无缝 + 可读下限
//   ② theme 单一事实源：文案/色值/T 表达式都在 theme.ts
//   ③ 组件零硬编码：不出现中文文案、色值、rgba、外链
//   ④ 红线：禁专名 + 单画幅 + 故事来源三分类落地
//
// 随包的示例数据是虚构的演示故事（奶奶把塑料袋叠成小三角攒了一抽屉，与本包
// examples/demo-run.md 走的是同一个故事），四类断言的**结构**不随片改变——
// 换自己的片子时，改的是下面这些断言里的具体值（帧数/文案/token），不是断言本身。

import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const timeline = JSON.parse(read("public/voice/timeline.json"));

// 剥注释后再查中文——2026-07-15 移植修正。
//
// 上游断言③直接对原始源码查 /[㐀-鿿]/，因为它的组件里一个中文注释都没有，
// 这条边界从未暴露。本仓库的组件用中文注释记录事故谱系（为什么 pathLength=1 /
// 为什么 seed 里不能含 frame / 门控为哪次事故立的）——那是要保下来的东西：
// 一条注释记着一次事故，比一句「注意这里」有用得多。
//
// **这不是绕过断言，是让它测它真正想测的**：断言的立法意图是「单一事实源——
// 组件不硬编码中文**文案**，防止文案与 theme.ts 漂移」。注释不是文案，不会漂移。
// 剥掉注释后，「组件里出现中文文案」这条仍然一寸不让。
const stripComments = (source) => {
  let out = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    const next = source[i + 1];
    // 字符串/模板串：原样保留（中文文案就藏在这里，绝不能剥）
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        if (source[i] === "\\") {
          out += source[i] + (source[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += source[i];
        if (source[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
};

// ───────────────────────── ① 冻结帧表 ─────────────────────────

test("冻结帧表连续无缝，且每句停留不低于可读下限", () => {
  assert.equal(timeline.fps, 30);
  // 冻结值的职责是把「旁白变了」变成显式事件：你自己合成一遍新旁白后，这两个数字
  // 会自然改变（时长/句数都由 scripts/minimax-tts.js 从合成结果算出来），
  // 到时候把这里的期望值同步改掉即可——**它就该红**，红了才提醒你数据没同步。
  assert.equal(timeline.total_frames, 1020);
  // 🔑 **行数 ≠ 句数**。lines 是**字幕行**（阅读单位），由更细的音频句合并而来——
  //    对戏容易产生短句（比如「一块钱三十个。」这种独立的一句回应）。
  //    **动的是字幕，不是声音**：句子本身的语音不用改，字幕停留时长才是调节对象。
  assert.equal(timeline.lines.length, 3);
  // 母带是单一事实源：帧表不再带 per-line wav，音频只有 T.audio 这一个。
  assert.equal(timeline.audio, "narration.wav");

  for (let index = 1; index < timeline.lines.length; index++) {
    const previous = timeline.lines[index - 1];
    assert.equal(
      timeline.lines[index].start_frame,
      previous.start_frame + previous.dur_frames,
      `L${index + 1} 与前一句不连续`,
    );
  }

  const last = timeline.lines.at(-1);
  assert.equal(last.start_frame + last.dur_frames, timeline.total_frames);

  // 可读下限：字幕行停留 ≥2.5s，是给你自己受众留的余量——如果你的受众阅读速度更快，
  // 这个下限可以按 references/production.md 里说的改，但改了要连带把下面的短应答阈值一起重算。
  //
  // 🔴 **短应答例外 ≥1.2s**：像「怕啊。」这种一两个字的回应，如果也卡 2.5s 下限，
  //    会逼你去拉长那句话的停顿去「喂饱」它——**那是为了满足字幕规则去改声音，尾巴摇狗**。
  //    正确的解法是给短句单独开一个更低的下限。
  //    → 2.5s 的立法意图是「让观众读得完」；一两个字没什么好读的，它约束的是感知不是阅读。
  //    1.2s 的依据：参考主流平台字幕最短停留经验值（Netflix/BBC 一档在 0.8–1 秒左右），
  //    留了一点余量（先定依据再看数，不要反过来凑数字）。
  // ⚠️ **短应答＝字少 + 话说完了，缺一不可**：模型可能在逗号处切句，产出的从句片段
  //    也可能只有几个字，只判字数会误判、还会把剩下半句推去跟别人并卡（因此判据里要求
  //    必须收口于句末标点）。
  const isShortReply = (t) =>
    (t || "").replace(/[^一-鿿]/g, "").length <= 4 && /[。！？]\s*$/.test((t || "").trim());
  for (const line of timeline.lines) {
    const floorS = isShortReply(line.text) ? 1.2 : 2.5;
    const minFrames = Math.ceil(floorS * timeline.fps);
    assert.ok(
      line.dur_frames >= minFrames,
      `${line.id}「${line.text.slice(0, 12)}」停留 ${line.dur_frames} 帧 < 下限 ${minFrames} 帧（${floorS}s）`,
    );
  }
  // 例外不许滥用：短应答是对话轮次，不该遍地都是。超过 1/4 就是稿子出了问题。
  const shorts = timeline.lines.filter((l) => isShortReply(l.text));
  assert.ok(
    shorts.length <= timeline.lines.length / 4,
    `短应答 ${shorts.length}/${timeline.lines.length} 行——例外被当常态用了`,
  );
});

// ───────────────────────── ② theme 单一事实源 ─────────────────────────

test("theme 集中保存全部对外文案、token 和 T 派生帧表达式", () => {
  const theme = read("src/theme.ts");

  // 示例片逐字文案。写自己的新片时这批断言必须跟着换成你自己故事的逐字文案——
  // 换漏了这里会红，那正是它存在的理由。
  // 场景大字已撤掉（顶部字幕承载旁白，中部不再压字），故无 scenes 项。
  const requiredCopy = [
    "塑料袋叠成三角",
    "攒了满满一抽屉",
    "攒了一抽屉",
    "你家老人也这样吗？",
    "A 是　B 不是",
    "本故事为演绎",
    "改编自真实经历",
  ];
  for (const copy of requiredCopy) assert.match(theme, new RegExp(copy), `theme 缺文案「${copy}」`);

  // 手绘故事风视觉 token。**逐字照抄禁近似值**——
  // 近似 = 样式漂移 = 可审出的缺陷。这批值改了就是改风格族，不是改单集内容。
  const tokens = [
    "#FFFDF8", // 纸底：速写本白（不是上游的奶油 #FBF1E0）
    "#2B2B28", // 铅笔线
    "#9A9A92", // 淡线
    "#D94F3D", // 蜡笔暖红
    "#5B8C3E", // 蜡笔草绿
    "#4A7FB5", // 蜡笔天蓝
    "#D9A441", // 蜡笔土黄
    "#8B5A3C", // 蜡笔砖褐
  ];
  for (const token of tokens) assert.match(theme, new RegExp(token), `theme 缺 token ${token}`);

  // 帧锚一律 T 表达式，禁魔法数字。改帧表 → 帧锚自动跟着走。
  // 锚＝说话人切换点，本例是 L1/L2/L3（三个场景对应三段说话人轮次：叙述者→奶奶→叙述者）。
  for (const expression of [
    "L(1).start_frame",
    "L(1).start_frame + 6",
    "L(2).start_frame",
    "L(3).start_frame",
    "T.total_frames + 75",
  ]) {
    assert.ok(theme.includes(expression), `theme 缺帧表达式 ${expression}`);
  }

  // 字号下限 40px。任何文字 <40px 即 bug，尾帧小字也不例外——这是本仓库的缺省值，
  // 如果你的受众阅读需求不同，可以按 references/production.md 里说的调整，但不能低于这个绝对下限。
  const typeBlock = theme.match(/type:\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.ok(typeBlock.length > 0, "theme 找不到 TOKENS.type 块");
  const sizes = [...typeBlock.matchAll(/:\s*(\d+)/g)].map((m) => Number(m[1]));
  assert.ok(sizes.length >= 5, "TOKENS.type 字号条目异常");
  for (const size of sizes) assert.ok(size >= 40, `字号 ${size}px 击穿 40px 绝对下限`);
});

test("SCENE_ART 引用的场景素材在 public/ 里真实存在（母版开箱能渲）", () => {
  // 🔴 这条断言的由来：常量指着一批**包里根本没有的** PNG 时，tsc 全绿、上面三条断言也全绿，
  //    直到真去渲染才当场炸——「渲不渲得起来」以前完全没有机器面。
  //    音频不在这条断言的管辖内：旁白是每片自己合成的，BGM/音效由用户自备，
  //    读图走 tools/probe.sh 造的静音占位。
  const themeCode = stripComments(read("src/theme.ts"));
  const referenced = new Set([...themeCode.matchAll(/"([^"\n]+\.png)"/g)].map((m) => m[1]));
  assert.ok(referenced.size > 0, "theme.ts 里一张场景图都没引用");
  const present = new Set(readdirSync(new URL("public/", root)));
  for (const name of referenced) {
    assert.ok(present.has(name), `theme.ts 引用了 public/${name}，但这个文件不存在——渲染会当场炸`);
  }
});

// ───────────────────────── ③ 组件零硬编码 ─────────────────────────

test("除 theme 外的组件不硬编码中文文案、色值或外链", () => {
  const componentFiles = readdirSync(new URL("src/", root)).filter((file) => file.endsWith(".tsx"));
  assert.ok(componentFiles.length >= 4);
  for (const file of componentFiles) {
    const source = read(`src/${file}`);
    // 中文文案：剥注释后查（注释是知识沉淀，不是文案——见文件头 stripComments 的说明）
    assert.doesNotMatch(stripComments(source), /[㐀-鿿]/, `${file} 硬编码中文文案`);
    // 色值/外链：仍对原始源码查，一寸不让。
    // 色值必须逐字来自 theme.ts 的 TOKENS（「标准值照抄不近似」是绑定标准，
    // 近似值 = 样式漂移 = 可审出的缺陷）；连注释里都不许出现，免得被人照抄。
    assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i, `${file} 硬编码色值`);
    assert.doesNotMatch(source, /rgba?\(/i, `${file} 硬编码 rgba`);
    assert.doesNotMatch(source, /https?:\/\//i, `${file} 含外链`);
  }
});

// ───────────────────────── ④ 红线 ─────────────────────────

test("禁专名、单画幅、故事来源三分类在代码里落地", () => {
  const files = readdirSync(new URL("src/", root)).filter((file) => /\.(ts|tsx)$/.test(file));
  const allSource = files.map((file) => read(`src/${file}`)).join("\n");

  // 画面不出现别的产品/账号专名——写自己的新片时把这份清单换成你自己要避开的词。
  // **这条对整份原始源码（含注释）生效，不剥注释**：这份清单里的词本身就不该出现在
  // 这个开源包的任何位置，哪怕是写在注释里当历史记录——那样也是残留，不是知识沉淀。
  // 断言②③剥注释是因为要保留「事故谱系」这类正当的知识沉淀，这条不一样。
  assert.doesNotMatch(allSource, /WorkBuddy|Skillabs|阿木|amuMama/i, "代码里残留品牌专名（含注释）");

  // 单画幅：只注册一个 Composition。多画幅（比如同时做竖版+横版）会把一整套版面/帧锚
  // 逻辑翻倍，除非你真的要做多平台矩阵，否则不要为「以防万一」多注册一个。
  const root_ = read("src/Root.tsx");
  const compositions = [...root_.matchAll(/<Composition/g)];
  assert.equal(compositions.length, 1, "只许注册一个 Composition（单画幅）");
  assert.ok(root_.includes('id="Story9x16"'), "Composition id 必须是 Story9x16");

  // 故事来源三分类（脊椎红线，见本包 references/interview.md）：
  // 必须在 theme.ts 里落成常量，且三类都有对应分支——
  // 标注动作由它机械派生，写成文档里的一句话就会漏。
  const theme = read("src/theme.ts");
  assert.match(theme, /StorySource\s*=\s*"firsthand"\s*\|\s*"adapted"\s*\|\s*"fiction"/, "缺故事来源三分类");
  assert.match(theme, /STORY_SOURCE:\s*StorySource/, "缺 STORY_SOURCE 常量");

  const scenes = read("src/Scenes.tsx");
  // 虚构 → 开场标识；转述 → 尾帧标识。两条分支都必须在。
  assert.ok(scenes.includes('STORY_SOURCE === "fiction"'), "虚构片缺开场演绎标识分支");
  assert.ok(scenes.includes('STORY_SOURCE === "adapted"'), "转述改编片缺尾帧标识分支");

  // 证据窗明确弃用（第一节第 1 条）：本赛道无「实测」前提，
  // 硬搬会变成用真实感包装虚构，比不用更糟。看着它别被复活。
  assert.doesNotMatch(stripComments(allSource), /EvidenceFrame/, "证据窗在本仓库已弃用，不许复活");
});
