#!/usr/bin/env node
// MiniMax 旁白合成：按说话人成段合成 → 三重守门 → 失败自动重抽 → 拼装母带 + 帧表 T。
// 凭证按三层链找（环境变量 → 项目根 .env → 包根 .env，见下方 apiKey()），绝不打印。
//
// 用法：
//   node $SKILL_DIR/scripts/minimax-tts.js --check <script.json>          # 读法体检，免费不调 API
//   node $SKILL_DIR/scripts/minimax-tts.js <script.json> -o <工程>/public # 合成 → public/voice/
//   node $SKILL_DIR/scripts/minimax-tts.js <script.json> -o … --only R3   # 只重抽某一段（其余复用磁盘上的）
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔑 为什么「按说话人成段」，不是逐句，也不是整条合成
//
//   整条：一次请求出整条几十秒。噪声概率随时长上升，**一句念坏＝整条重来**，
//     帧表全废、分镜重排 → 这就是「定稿即冻结 WAV、永不重新合成」那条铁律的由来。
//     那不是美德，是投降。
//   逐句：模型看不见上下文 → 情感连贯性掉（实测对比过，效果明显更差）。
//   **成段**：一个说话人连续的话＝一个请求。模型看得见整段（情感连贯的来源），
//     而段与段之间独立 → **坏哪段补哪段**（`--only R3`），其余字节不动，重抽一段的成本很低。
//
// 🔑 停顿的两层，分开控制（这是本管线最重要的设计）
//   · 段内停顿 → `<#x#>` 标记。实测**斜率 1.00、噪声 ±2%**，是精确仪器。
//   · 段间停顿 → **拼接静音，误差为零**，模型说了不算（每段先剪掉首尾静音）。
//
//   ⚠️ **`<#x#>` 是「在自然停顿之上叠加」，不是「设定为」**。实测阶梯（n=3/档）：
//        无标记 ~430ms │ <#0.5#> ~930ms │ <#1.0#> ~1443ms │ <#2.0#> ~2477ms
//      即 gap ≈ 430 + 1000×p。**要 550ms 的段内停顿，写的是 `<#0.12#>` 不是 `<#0.55#>`。**
//      这是 MiniMax 这个模型的实测行为，不是本脚本的行为——换模型/换供应商要重新实测标定。
//
// 🔴 别拿「语速」去解「停顿」——两者是独立维度，语速调快慢并不能补偿停顿标记的偏差。
//    MiniMax 的 `speed` 是 **per-request＝per-角色** 的确定旋钮
//    （实测 0.8/0.9/1.0/1.1 四档分布零重叠，实测倍率 vs 理论差 3–7%），
//    按角色单独调速，不会牵连其它说话人。
//
// 🔴 音色必须是常量 ID，不许抽卡。假 voice_id 会报 `2054 voice id not exist`（已反向验证，
//    **不会静默回落**）——所以拼错音色是会当场炸的，不会悄悄给你另一个人的声音。
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EP = 'https://api.minimaxi.com/v1/t2a_v2';
const FPS_DEFAULT = 30;
const SIL_DB = -45;      // 静音判据（dBFS）：低于它算静音。首尾剪裁与三重守门判据③ 共用这一个门槛
const FRAME_MS = 10;     // 分析帧长
// 字幕可读下限：读 studio.config.json 的 captions.minLineSeconds，缺省 2.5s
// （见文件下方 loadStudioConfig 之后的重新赋值；这里的初始值只是「没有配置文件时」的兜底，
// 与随包演示数据的契约测试断言①保持一致——那份数据就是按 2.5s/1.2s 这两个缺省值冻结的）。
let MIN_SUB_S = 2.5;
// 🔴 短应答例外。≤4 汉字的字幕行只需 ≥1.2s。**这不是给规则开后门，是修一个把尾巴摇成狗的规则。**
//
// **典型场景**：像「怕啊。」这种一两个字的独立卡，如果也卡 2.5s 下限，字幕行为了凑够时长，
// 就得靠拉长这句话前后的停顿标记去「喂饱」它——**那是为了满足「字幕」规则去改「声音」**，
// 尾巴摇狗。正确的解法是给短句单独开一个更低的下限。
//
// **依据**（先定依据再看数，不是反过来）：
//   · 2.5s 的立法意图是「让观众读得完」。一两个字没什么好读的 —— 它约束的是**感知**，不是阅读。
//   · 行业下限：Netflix 5/6 秒（0.833s）｜BBC / EBU ≈1 秒。取 **1.2s**，比 BBC 高 20%。
//   · **≤4 字**：按 2.5s ÷ 12 字 ≈ 0.21 秒/字 反推，4 字只需 0.84s，1.2s 仍有余量 —— 两个常数自洽。
// ⚠️ **「短应答」＝字少 + 话说完了，两个条件缺一不可**（只判字数会误伤）：
//    模型可能在逗号处切句，产出「写了…，」这类**从句片段**也只有 3–4 字，
//    被误判成短应答 → 拿到偏短的卡、还会把剩下的半句推去跟别人并卡——
//    **判据是「这是不是一句完整的话」，不是「字够不够少」** → 必须收口于 。！？
let MIN_SHORT_S = 1.2; // 短应答的最短停留（读 studio.config.json 的 captions.shortReplySeconds，缺省 1.2s）
const SHORT_CHARS = 4;   // 「短应答」的字数上限
const isShortReply = (t) => cn(t).length <= SHORT_CHARS && /[。！？]\s*$/.test((t || '').trim());

// ── WAV（PCM s16le）最小读写。不引三方库：确定性渲染的资产不该依赖 npm 生态。 ──
function wavRead(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE')
    throw new Error('不是 RIFF/WAVE');
  let off = 12, fmt = null, data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const sz = buf.readUInt32LE(off + 4);
    const body = buf.subarray(off + 8, off + 8 + sz);
    if (id === 'fmt ') fmt = { channels: body.readUInt16LE(2), rate: body.readUInt32LE(4), bits: body.readUInt16LE(14) };
    if (id === 'data') data = body;
    off += 8 + sz + (sz & 1);
  }
  if (!fmt || !data) throw new Error('缺 fmt/data 块');
  if (fmt.bits !== 16) throw new Error(`只支持 16bit，收到 ${fmt.bits}`);
  const n = Math.floor(data.length / 2);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) pcm[i] = data.readInt16LE(i * 2);
  return { ...fmt, pcm };
}
function wavWrite({ channels, rate, pcm }) {
  const bytes = pcm.length * 2;
  const b = Buffer.alloc(44 + bytes);
  b.write('RIFF', 0); b.writeUInt32LE(36 + bytes, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(channels, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * channels * 2, 28); b.writeUInt16LE(channels * 2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(bytes, 40);
  for (let i = 0; i < pcm.length; i++) b.writeInt16LE(pcm[i], 44 + i * 2);
  return b;
}
// 单声道 float 视图，仅用于分析。🔴 输出一律用原始 pcm——降混会改动已验收的音频。
function monoOf({ channels, pcm }) {
  const n = Math.floor(pcm.length / channels);
  const m = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < channels; c++) s += pcm[i * channels + c];
    m[i] = s / channels / 32768;
  }
  return m;
}
function frameDb(mono, rate) {
  const w = Math.round(rate * FRAME_MS / 1000), n = Math.floor(mono.length / w), db = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * w; j < (i + 1) * w; j++) s += mono[j] * mono[j];
    db[i] = 20 * Math.log10(Math.sqrt(s / w) + 1e-12);
  }
  return db;
}
// 剪掉首尾静音 → 段间留白完全由拼接决定
function trimSilence(wav) {
  const mono = monoOf(wav), db = frameDb(mono, wav.rate);
  const w = Math.round(wav.rate * FRAME_MS / 1000);
  let a = 0, b = db.length;
  while (a < db.length && db[a] < SIL_DB) a++;
  while (b > a && db[b - 1] < SIL_DB) b--;
  if (a >= b) return { pcm: wav.pcm, leadMs: 0, lenMs: (wav.pcm.length / wav.channels) / wav.rate * 1000 };
  const s = a * w * wav.channels, e = b * w * wav.channels;
  return { pcm: wav.pcm.subarray(s, e), leadMs: a * FRAME_MS, lenMs: (b - a) * FRAME_MS };
}

const cn = (s) => (s || '').replace(/[^一-鿿]/g, '');
const stripMarks = (s) => s.replace(/<#[\d.]+#>/g, '');

// 读法体检（移植自 mimo-tts.mjs，实测「第 2 次」会被读成「第两次」）
function lintText(text) {
  const warn = [];
  const ord = stripMarks(text).match(/第\s*\d+/g);
  if (ord) warn.push(`序数词用了阿拉伯数字 ${ord.join('、')} — 实测会读错（「第2次」→「第两次」），改汉字`);
  const meas = stripMarks(text).match(/\d+\s*(次|遍|个|条|张|层|帧|步|天|周|年|分钟|秒)/g);
  if (meas) {
    const risky = meas.filter((m) => Number(m.match(/\d+/)[0]) <= 10);
    if (risky.length) warn.push(`小数值量词 ${risky.join('、')} — 建议改汉字（如「三次」），大数值可留阿拉伯数字`);
  }
  return warn;
}

// ── 凭证三层链（从高到低）────────────────────────────────────────────────────
// 🔑 三层是**两种安装布局**逼出来的，不是冗余：本包既可能装在用户项目的
//    `.claude/skills/handdrawn-story-studio/` 下（这时包目录不该、也不会有用户的 .env），
//    也可能被 clone 下来直接当项目根用（这时包根就是项目根）。
//   1. `process.env.MINIMAX_API_KEY` —— 最显式，一次性覆盖 / CI 走这层，永远优先。
//   2. `<当前工作目录>/.env` —— 用户项目根的 .env。key 是用户自己的资产，归他的项目管，
//      所以这一层排在包根之前：装成 Skill 时它是唯一正确的那一份。
//   3. `<包根>/.env` —— 只为「clone 下来当项目根用」这种布局兜底。
async function readEnvKey(dir) {
  try {
    const txt = await readFile(resolve(dir, '.env'), 'utf8');
    return (txt.match(/^MINIMAX_API_KEY=(.*)$/m) || [])[1];
  } catch { return undefined; }
}

async function apiKey() {
  const key =
    process.env.MINIMAX_API_KEY ||
    (await readEnvKey(process.cwd())) ||
    (await readEnvKey(REPO));
  if (!key) throw new Error('缺少 MINIMAX_API_KEY（环境变量 / 项目根 .env / 包根 .env 三层都没找到）');
  return key.trim();
}

// ── 音色 / 语速 / 字幕下限配置解析：写死改成读配置 ─────────────────────────────
// 优先级（从高到低）：
//   1. script.json 本集显式声明（doc.voices[who] / doc.speed）——最具体，永远优先。
//   2. 环境变量：MINIMAX_VOICE_<说话人名> / MINIMAX_VOICE_DEFAULT
//              （语速对应 MINIMAX_SPEED_<说话人名> / MINIMAX_SPEED_DEFAULT）。
//   3. 项目 studio.config.json（与访谈产出物 handdrawn-studio/editorial.md 同目录，
//      即 `handdrawn-studio/studio.config.json`，相对当前工作目录解析）——
//      **schema 以 references/interview.md 落盘的为唯一正本**，键名逐字对应：
//      `tts.voices[who]` / `tts.speed` / `tts.defaultGapMs` / `tts.model`，
//      字幕下限对应 `captions.minLineSeconds` / `captions.shortReplySeconds`。
//   4. 脚本内置的系统缺省值——**只用 MiniMax 公共预置音色，不是复刻音色**：
//      复刻音色（clone voice）挂在具体账号的 API key 下，天然不可跨账号复现；
//      如果你有自己的复刻音色槽，写进 studio.config.json 的 tts.voices，不要写死进这个脚本文件。
const DEFAULT_VOICE = 'Chinese (Mandarin)_Radio_Host'; // MiniMax 公共预置音色，任何账号可直接用
const DEFAULT_SPEED = 1.0;
const DEFAULT_GAP_MS = 700;

async function loadStudioConfig() {
  const path = resolve(process.cwd(), 'handdrawn-studio/studio.config.json');
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    // 静默兜底会让「配置没生效」长得跟「配置生效了」一模一样——说一声，行为不变。
    console.error(
      e?.code === 'ENOENT'
        ? '未找到 handdrawn-studio/studio.config.json，使用内置缺省值'
        : `handdrawn-studio/studio.config.json 读取失败（${e?.message}），使用内置缺省值`,
    );
    return {};
  }
}

function resolveVoice(who, doc, studioConfig) {
  if (doc.voices?.[who]) return doc.voices[who];
  if (process.env[`MINIMAX_VOICE_${who}`]) return process.env[`MINIMAX_VOICE_${who}`];
  if (process.env.MINIMAX_VOICE_DEFAULT) return process.env.MINIMAX_VOICE_DEFAULT;
  if (studioConfig.tts?.voices?.[who]) return studioConfig.tts.voices[who];
  return DEFAULT_VOICE;
}

// who 传进来是为了支持按说话人分别覆写语速（env 这一层支持，studio.config.json 的
// tts.speed 是整个账号的缺省语速，不分说话人）；doc.speed（script.json 顶层）是
// 整份稿子的缺省语速，per-run 的 r.speed 优先级更高，在调用处（下方 synth() 的入参）
// 单独处理，不在这个函数里。
// ⚠️ **doc.speed 这一层仍然认，但随包的模板与母版 script.json 都故意不写它**：它压在
//    MINIMAX_SPEED_<说话人> 之上，一写死就再也按角色调不动语速了（对戏片最需要的正是这个）。
//    要全局改语速，改 studio.config.json 的 tts.speed；要单独放慢某个人，用那个环境变量。
function resolveSpeed(who, doc, studioConfig) {
  if (typeof doc.speed === 'number') return doc.speed;
  if (process.env[`MINIMAX_SPEED_${who}`]) return Number(process.env[`MINIMAX_SPEED_${who}`]);
  if (process.env.MINIMAX_SPEED_DEFAULT) return Number(process.env.MINIMAX_SPEED_DEFAULT);
  if (typeof studioConfig.tts?.speed === 'number') return studioConfig.tts.speed;
  return DEFAULT_SPEED;
}

function resolveDefaultGapMs(doc, studioConfig) {
  if (typeof doc.default_gap === 'number') return doc.default_gap;
  if (typeof studioConfig.tts?.defaultGapMs === 'number') return studioConfig.tts.defaultGapMs;
  return DEFAULT_GAP_MS;
}

async function synth(key, { text, voice, model, speed = 1.0, emotion = null, pron = null }) {
  const body = {
    model, text, stream: false,
    voice_setting: { voice_id: voice, speed, vol: 1.0, pitch: 0, ...(emotion ? { emotion } : {}) },
    audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'wav', channel: 1 },
    // 多音字钉读音（MiniMax pronunciation_dict）：["还回来/(huan2)(hui2)(lai2)", …]。
    // 典型坑：「一分不差还回来了」的「还」本该读 huán（归还），模型容易读成 hái（仍然）。
    // 字典按**词**匹配，只钉出错的词（如「还回来」「还钱」），别钉单字——「还是」的 hái 是对的。
    ...(pron?.length ? { pronunciation_dict: { tone: pron } } : {}),
    subtitle_enable: true, output_format: 'hex',
  };
  const res = await fetch(EP, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await res.json();
  if (d?.base_resp?.status_code !== 0)
    throw new Error(`MiniMax ${d?.base_resp?.status_code}: ${d?.base_resp?.status_msg}`);
  if (!d.data?.audio) throw new Error('响应无 audio');
  const subs = await (await fetch(d.data.subtitle_file)).json();
  return { wav: Buffer.from(d.data.audio, 'hex'), subs };
}

// ── 三重守门（单段版）：每段合成完当场判，不过就重抽。 ──
// ⚠️ 本包**没有拼装之后的机器终检**——母带拼出来之后只剩人耳终验，所以这三条是唯一的机器面。
// ⚠️ 判据① 必须**双向**：只验「说少了」的比对器结构上永远发现不了「说多了」，
//    而它还会一路报绿（实录教训：用户的耳朵补了机器的洞，方向反了）。
function gateRun(runSpec, wav, subs) {
  const bad = [];
  const said = cn(subs.map((s) => s.text).join(''));
  const want = cn(runSpec.show);
  if (said !== want) bad.push(`① 文本不符：稿子 ${want.length} 字 → 实说 ${said.length} 字`);
  for (const s of subs) {
    const n = cn(s.text).length;
    if (n && ((s.time_end - s.time_begin) / 1000) / n < 0.12)
      bad.push(`② 时间戳压缩：「${s.text.slice(0, 14)}」${(((s.time_end - s.time_begin) / 1000) / n).toFixed(3)} 秒/字`);
  }
  // ③ 空隙人声：subtitle 没记录的声音 = 模型多说了。
  // 🔴 **必须在线性域算 RMS，不能对 dB 求平均**（2026-07-16 第六会话踩到）：
  //    dB 是对数，`mean(20log10(x))` ≠ `20log10(sqrt(mean(x²)))`。安静帧的极负值（−240dB）
  //    会把对数均值狠狠拽下去 → **判据静默失灵**。实测：v7 的 17.35–17.75s 真值 −33.1dB，
  //    对数域实现直接漏判。**而回测当时是「绿」的**——因为 v7 同时被 ② 抓到了，
  //    clean/bad 的结论碰巧一致。**这正是第 18 条换实现不验等价的复发。**
  //    → 回测因此改成**比对「哪些判据开火」，不只比 clean/bad**。
  const mono = monoOf(wav);
  for (let i = 0; i + 1 < subs.length; i++) {
    const a = subs[i].time_end / 1000, b = subs[i + 1].time_begin / 1000;
    if (b - a < 0.10) continue;
    const s = Math.max(0, Math.floor(a * wav.rate)), e = Math.min(mono.length, Math.floor(b * wav.rate));
    if (e - s < 10) continue;
    let sum = 0;
    for (let k = s; k < e; k++) sum += mono[k] * mono[k];
    const rms = 20 * Math.log10(Math.sqrt(sum / (e - s)) + 1e-12);
    if (rms > SIL_DB) bad.push(`③ 空隙有人声：${a.toFixed(2)}–${b.toFixed(2)}s ${rms.toFixed(1)}dB（subtitle 未记录 → 疑似重复）`);
  }
  return bad;
}

// ── 字幕行：与音频层解耦 ──────────────────────────────────────────────────────
// 🔴 对戏必然产生短句（实测常见：一半左右的句子天然 <2.5s，比如单字/两字的应答）。
// 帧表若直接拿句子时长当字幕时长 → 契约测试断言①（每句 ≥可读下限）必红。
// 解法：**句子是音频的单位，字幕行是阅读的单位，两者不是一回事**。
// 相邻句合并成一行，行的显示时长 = 下一行起点 − 本行起点（**把段间静音也算进阅读时间**，
// 这对阅读速度较慢的受众是加分不是浪费）。短促应答的音频本身不用拉长——它的力量就在短促，
// 动的是字幕停留时长，不是声音本身。
function packLines(sents, totalMs) {
  const groups = [];
  let cur = null;
  for (let i = 0; i < sents.length; i++) {
    const s = sents[i];
    const nextStart = i + 1 < sents.length ? sents[i + 1].start_time : totalMs;
    if (!cur) cur = { start: s.start_time, texts: [s.text], who: s.who };
    else { cur.texts.push(s.text); }
    const span = nextStart - cur.start;
    // 本组若已够长，收口；否则继续吸下一句。短应答走低门槛（见文件头「短应答例外」）。
    if (span >= MIN_SUB_S * 1000 || (isShortReply(cur.texts.join('')) && span >= MIN_SHORT_S * 1000)) {
      cur.end = nextStart; groups.push(cur); cur = null;
    }
  }
  if (cur) {
    // 收尾不够长 → 并进上一组（宁可上一组长，也不留一个读不完的短行）
    if (groups.length) { groups.at(-1).texts.push(...cur.texts); groups.at(-1).end = totalMs; }
    else groups.push({ ...cur, end: totalMs });
  } else if (groups.length) groups.at(-1).end = totalMs;
  return groups.map((g, i) => ({ id: `L${i + 1}`, text: g.texts.join(''), start_ms: g.start, end_ms: g.end }));
}

// ── 闸的反向验证 ─────────────────────────────────────────────────────────────
// 🔴 **本函数存在的理由**：换判据实现（比如把波形 RMS 换成 ffmpeg volumedetect）时，
//    如果不先验证新旧实现在同一批真实语料上给出一致的判定，很容易在换实现的当天
//    把所有已通过验收的成品全部错判成不合格——这类回归只有拿真实语料跑一遍才拦得住，
//    光看代码逻辑「看起来对」是不够的。
//    本项目**不随包带真实语料**（旁白是每个用户自己账号下的合成产物，不该跨账号分发）；
//    要用这个反向验证，把你自己积累的语料放进 `public/voice/backtest-corpus/`，
//    格式见下方 TRUTH 表用到的三个文件（`<tag>.wav` / `<tag>.subtitle.json` / `<tag>.roles.json`）。
// ⚠️ 语料格式是 `{sentences:[{start_time,end_time,…}]}`，MiniMax 原始返回是
//    `[{time_begin,time_end,…}]` —— 回测时转一道。**判据不能因为格式不同就绕过去。**
async function backtest() {
  const dir = resolve(REPO, 'video-template/handdrawn-master/public/voice/backtest-corpus');
  // 🔴 真值＝**哪些判据该开火**，不是「clean/bad」。
  //    只比 clean/bad 会漏掉「判据③ 坏了但②替它兜住了」这种情况——两个判据独立失灵时
  //    结论可能碰巧一致，必须比对「哪些判据开火」而不只是最终结论。
  //    下表**空的**（没有随包语料）：先把你自己的语料放进上面那个目录，
  //    再照 `{tag: ['②','③']}` 这种格式把每组语料「该开火」的判据填进来。
  const TRUTH = {};
  const cases = Object.entries(TRUTH);
  // 🔴 **零语料不许长成全绿**：一个跑了零个用例的验证器，和一个全部通过的验证器，
  //    输出必须一眼分得开——否则「没验过」会被读成「验过了」。
  if (!cases.length) {
    console.log('\n  ⚠ 无回测语料，本命令未验证任何读法（填充方法见本文件注释）');
    // 退出码 2＝「没验过」，与 0（验过且全过）/ 1（验过有挂）三态分开——
    // 脚本化消费时「未验证」不许长得像「验证通过」（与 tools/art_scale_check.py 零输入同口径）。
    process.exit(2);
  }
  let allOk = true;
  for (const [tag, want] of cases) {
    const wav = wavRead(await readFile(resolve(dir, `${tag}.wav`)));
    const sub = JSON.parse(await readFile(resolve(dir, `${tag}.subtitle.json`), 'utf8'));
    const roles = JSON.parse(await readFile(resolve(dir, `${tag}.roles.json`), 'utf8'));
    const subs = sub.sentences.map((s) => ({ text: s.text, time_begin: s.start_time, time_end: s.end_time }));
    const issues = gateRun({ show: roles.map((r) => r.text).join('') }, wav, subs);
    const fired = [...new Set(issues.map((i) => i[0]))].sort();
    const ok = fired.join('') === [...want].sort().join('');
    allOk &&= ok;
    const w = want.length ? want.join('') : '（全清）';
    const g = fired.length ? fired.join('') : '（全清）';
    console.log(`  ${ok ? '✓' : '✗'} ${tag.padEnd(22)} 该开火=${w.padEnd(8)} 实开火=${g.padEnd(8)}${ok ? '' : '  ← 闸与参考实现不一致'}`);
    for (const i of issues) console.log(`        ${i}`);
  }
  console.log('\n  ' + (allOk ? '✓ JS 守门通过反向验证，可用' : '🔴 JS 守门未通过反向验证，不可用'));
  return allOk;
}

// ── 主流程 ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--backtest')) process.exit((await backtest()) ? 0 : 1);
const checkOnly = argv.includes('--check');
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
// --assemble：一段都不合成，全部复用磁盘上的 take，只重跑拼装/帧表。
// 🔴 存在的理由：**已验收的 take 是抽卡产物，重抽一次就是另一条片子**。改停顿、改字幕合并、
//    改 fps 都不该碰音频 —— 这个开关保证「改帧表 ≠ 换片子」。
const assembleOnly = argv.includes('--assemble');
const fps = Number(argv.includes('--fps') ? argv[argv.indexOf('--fps') + 1] : FPS_DEFAULT);
const retries = Number(argv.includes('--retries') ? argv[argv.indexOf('--retries') + 1] : 3);
const src = argv.find((a) => !a.startsWith('-') && a.endsWith('.json'));
if (!src) {
  console.error('用法: node $SKILL_DIR/scripts/minimax-tts.js <script.json> [-o 目录] [--only R3] [--fps 30] [--retries 3]');
  process.exit(1);
}
const outDir = resolve(argv.includes('-o') ? argv[argv.indexOf('-o') + 1] : dirname(resolve(src)), 'voice');
const doc = JSON.parse(await readFile(resolve(src), 'utf8'));
const runs = doc.runs || [];
if (!runs.length) { console.error('✗ script.json 里没有 runs[]'); process.exit(1); }

let bad = 0;
for (const r of runs) for (const w of lintText(r.tts)) { console.log(`⚠ ${r.id}: ${w}`); bad++; }
// 多音字预警（FYI，不计入 bad，不拦路）：机器判不了读音对错，这张表只负责「提醒抽听」。
// 已被 pronunciation 钉住的词标〔已钉〕。别扩到「地/得/中/发」这类高频字——预警一刷屏就没人看了。
{
  const HET = /[还重长背倒教差便血薄弹调铺塞省露落扎缝圈熟]/g;
  const pinned = doc.pronunciation || [];
  for (const r of runs) {
    const text = stripMarks(r.tts);
    for (const m of text.matchAll(HET)) {
      const ctx = text.slice(Math.max(0, m.index - 2), m.index + 3);
      // 〔已钉〕必须按**位置**判：这个字恰好落在某个已钉词的出现区间里才算。
      // 只看「文中有已钉词」会把「还是」也标成已钉（钉的明明是「还回来」）——首跑就犯了。
      const hit = pinned.find((p) => {
        const w = p.split('/')[0];
        for (let i = text.indexOf(w); i !== -1; i = text.indexOf(w, i + 1))
          if (m.index >= i && m.index < i + w.length) return true;
        return false;
      });
      console.log(`ℹ ${r.id} 多音字「${m[0]}」（…${ctx}…）${hit ? `〔已钉 ${hit}〕` : '—— 合成后抽听这个字；读错就在 script.json 顶层 pronunciation 里按词钉死'}`);
    }
  }
}
// 稿子与朗读文本必须是同一段话（去掉标记与标点后逐字相同）——防「改了 tts 忘了改 show」
for (const r of runs) {
  if (cn(stripMarks(r.tts)) !== cn(r.show)) {
    console.log(`🔴 ${r.id}: tts 与 show 汉字不一致（tts ${cn(stripMarks(r.tts)).length} 字 / show ${cn(r.show).length} 字）— 字幕会与声音对不上`);
    bad++;
  }
}
if (checkOnly) { console.log(bad ? `\n体检完成：${bad} 处待改` : '\n✓ 读法体检通过'); process.exit(bad ? 1 : 0); }
if (bad) console.log(`\n(以上 ${bad} 处告警，继续合成；数字读法务必抽听核对)\n`);

await mkdir(outDir, { recursive: true });
const key = assembleOnly ? null : await apiKey();
const studioConfig = await loadStudioConfig();
const model = doc.model || studioConfig.tts?.model || 'speech-2.8-hd';
// 字幕可读下限：本集 script.json 不提供这两个值的覆盖入口（它们是账号层面的阅读习惯设置，
// 不是单集内容），只有 studio.config.json 能覆盖缺省值。
if (typeof studioConfig.captions?.minLineSeconds === 'number') MIN_SUB_S = studioConfig.captions.minLineSeconds;
if (typeof studioConfig.captions?.shortReplySeconds === 'number') MIN_SHORT_S = studioConfig.captions.shortReplySeconds;
// 实际会用到的音色，按说话人去重解析一遍——既用于合成，也用于写进 timeline.json 的
// voices 字段（帧表要如实记录「这次到底用了哪个音色」，不能只回显 script.json 里写了什么，
// 那样兜底解析出来的音色就丢了痕迹）。
const resolvedVoices = Object.fromEntries(
  [...new Set(runs.map((r) => r.who))].map((who) => [who, resolveVoice(who, doc, studioConfig)]),
);

// 1) 逐段合成（带守门 + 自动重抽）。--only 时其余段复用磁盘上的；--assemble 时一段都不抽。
for (const r of runs) {
  const wavPath = resolve(outDir, `${r.id}.wav`);
  const subPath = resolve(outDir, `${r.id}.subtitle.json`);
  if (assembleOnly) {
    if (!existsSync(wavPath)) { console.error(`🔴 --assemble 但 ${r.id}.wav 不在 ${outDir}`); process.exit(1); }
    console.log(`  ${r.id} ${r.who}  （--assemble：复用磁盘上的 take）`); continue;
  }
  if (only && r.id !== only && existsSync(wavPath)) { console.log(`  ${r.id} ${r.who}  （复用磁盘上的，未重抽）`); continue; }
  let ok = false;
  for (let t = 1; t <= retries && !ok; t++) {
    const { wav, subs } = await synth(key, {
      text: r.tts, voice: resolvedVoices[r.who], model,
      speed: r.speed ?? resolveSpeed(r.who, doc, studioConfig), emotion: r.emotion ?? null,
      pron: r.pronunciation ?? doc.pronunciation ?? null,
    });
    const parsed = wavRead(wav);
    const issues = gateRun(r, parsed, subs);
    if (issues.length) {
      console.log(`  ${r.id} 第 ${t} 抽 ✗ ${issues[0]}`);
      if (t === retries) { console.error(`\n🔴 ${r.id} 连抽 ${retries} 次都没过守门 —— 多半是稿子或提示词的问题，不是运气。别加重试次数，去看稿子。`); process.exit(1); }
      continue;
    }
    await writeFile(wavPath, wav);
    await writeFile(subPath, JSON.stringify(subs));
    const secs = (parsed.pcm.length / parsed.channels / parsed.rate).toFixed(2);
    console.log(`  ${r.id} ${r.who}  ${secs}s  ${subs.length}句  ${t > 1 ? `（第 ${t} 抽）` : ''}`);
    ok = true;
  }
}

// 2) 拼装：剪掉每段首尾静音 → 段间插精确静音
const segs = [];
for (const r of runs) {
  const wav = wavRead(await readFile(resolve(outDir, `${r.id}.wav`)));
  const subs = JSON.parse(await readFile(resolve(outDir, `${r.id}.subtitle.json`), 'utf8'));
  segs.push({ r, wav, subs, ...trimSilence(wav) });
}
const rate = segs[0].wav.rate, channels = segs[0].wav.channels;
const chunks = [];
const sents = [];
let offMs = 0;
for (let i = 0; i < segs.length; i++) {
  const s = segs[i];
  chunks.push(s.pcm);
  for (const t of s.subs) {
    // 末句的 time_end 可能越过剪裁后的音频末尾（模型把尾部静音也算进了那一句）→ 钳住，
    // 否则字幕行会悄悄吃掉设计好的段间留白，而三重守门看不出来。
    const b = Math.max(0, t.time_begin - s.leadMs) + offMs;
    const e = Math.min(s.lenMs, t.time_end - s.leadMs) + offMs;
    sents.push({ start_time: b, end_time: e, text: t.text, who: s.r.who });
  }
  offMs += s.lenMs;
  if (i < segs.length - 1) {
    const gap = s.r.gap_after ?? resolveDefaultGapMs(doc, studioConfig);
    chunks.push(new Int16Array(Math.round(gap * rate / 1000) * channels));
    offMs += gap;
  }
}
let total = 0; for (const c of chunks) total += c.length;
const master = new Int16Array(total);
{ let p = 0; for (const c of chunks) { master.set(c, p); p += c.length; } }
const totalS = master.length / channels / rate;

await writeFile(resolve(outDir, 'narration.wav'), wavWrite({ channels, rate, pcm: master }));
await writeFile(resolve(outDir, 'narration.subtitle.json'),
  JSON.stringify({ text: runs.map((r) => r.show).join(''), sentences: sents.map(({ who, ...s }) => ({ ...s, words: [] })) }, null, 0));
await writeFile(resolve(outDir, 'narration.roles.json'),
  JSON.stringify(runs.map((r) => ({ who: r.who, text: r.show })), null, 0));

// 3) 帧表 T。
// 🔴 起始帧是唯一事实源，dur_frames 由**相邻起始帧相减**得出，不是各自独立取整：
//    start/dur 各自独立 round 时 round(a)+round(b) ≠ round(a+b)
//    → 帧表会出现 ±1 帧的缝。**它是数据相关的，会随机咬人，不是每次都犯。**
const packed = packLines(sents, totalS * 1000);
const startFrames = packed.map((l) => Math.round(l.start_ms / 1000 * fps));
startFrames[0] = 0;
const totalFrames = Math.round(totalS * fps);
const lines = packed.map((l, i) => {
  const end = i + 1 < startFrames.length ? startFrames[i + 1] : totalFrames;
  return {
    id: l.id, text: l.text,
    start_s: Number((startFrames[i] / fps).toFixed(3)),
    start_frame: startFrames[i], dur_frames: end - startFrames[i],
  };
});

const T = {
  fps, total_s: Number(totalS.toFixed(3)), total_frames: totalFrames,
  audio: 'narration.wav',
  voices: resolvedVoices, model,
  lines,
};
await writeFile(resolve(outDir, 'timeline.json'), JSON.stringify(T, null, 2));

// 下限＝一般行 MIN_SUB_S；≤SHORT_CHARS 字的短应答走 MIN_SHORT_S（见文件头「短应答例外」）
const floorOf = (l) => Math.ceil((isShortReply(l.text) ? MIN_SHORT_S : MIN_SUB_S) * fps);
for (const l of lines) {
  const f = floorOf(l);
  const tag = isShortReply(l.text) ? ' 〔短应答〕' : '';
  const flag = l.dur_frames < f ? ` 🔴 <${(f / fps).toFixed(1)}s` : '';
  console.log(`✓ ${l.id.padEnd(4)} 帧 ${String(l.start_frame).padStart(4)}–${String(l.start_frame + l.dur_frames).padStart(4)} (${(l.dur_frames / fps).toFixed(2)}s)${flag}  ${l.text.slice(0, 28)}${tag}`);
}
const shorts = lines.filter((l) => l.dur_frames < floorOf(l));
console.log(`\n母带 ${totalS.toFixed(2)}s = ${totalFrames} 帧 @${fps}fps  →  ${resolve(outDir, 'narration.wav')}`);
console.log(`帧表 ${lines.length} 行  →  ${resolve(outDir, 'timeline.json')}`);
if (shorts.length) {
  console.log(`\n🔴 ${shorts.length} 行 <${MIN_SUB_S}s（契约测试断言① 会红）：${shorts.map((l) => l.id).join('、')}`);
  console.log(`   这不是脚本的 bug —— 是稿子在那里的对话轮次太短，合并也够不着。要么改稿，要么改断言（那是改规范，得用户拍板）。`);
  process.exit(1);
}
