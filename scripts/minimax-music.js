#!/usr/bin/env node
// MiniMax 音乐生成(music_generation):BGM 定制产线。凭证按三层链找(见下方 apiKey()),绝不打印。
// 与 minimax-tts.js 共用同一把 key、同一套凭证读取逻辑(两边改一处就要改另一处)。
// 建议的使用节奏:生成几版候选 → 自己试听拍板 → 冻结下来跨集复用,不必每集重新生成。
//
// 定位是 BGM——缺省纯音乐(is_instrumental: true),不写歌词只给风格描述;要带唱的加 --lyrics <文件>。
// 模型:music-3.0 实测已可用,但截至写这份脚本时公开文档只写到 music-2.6——缺省先试 music-3.0,
//   遇 2013 参数异常自动回落 music-2.6 并在输出里说明实际用了哪个。
//
// 用法:
//   node $SKILL_DIR/scripts/minimax-music.js "<风格描述 prompt>" -o <输出.mp3> [--model music-3.0] [--format mp3]
//                                  [--lyrics <歌词.txt>]   # 给了歌词即非纯音乐模式
// 输出旁附 <输出>.meta.json(prompt/模型/时长/trace_id),对听与台账登记都用它。
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://api.minimaxi.com/v1/music_generation';
const DEFAULT_MODEL = 'music-3.0';
const FALLBACK_MODEL = 'music-2.6';

// ── 凭证三层链(从高到低),与 minimax-tts.js 逐字同源 ─────────────────────────
// 🔑 三层是**两种安装布局**逼出来的,不是冗余:本包既可能装在用户项目的
//    `.claude/skills/handdrawn-story-studio/` 下(这时包目录不该、也不会有用户的 .env),
//    也可能被 clone 下来直接当项目根用(这时包根就是项目根)。
//   1. `process.env.MINIMAX_API_KEY` —— 最显式,一次性覆盖 / CI 走这层,永远优先。
//   2. `<当前工作目录>/.env` —— 用户项目根的 .env。key 是用户自己的资产,归他的项目管,
//      所以这一层排在包根之前:装成 Skill 时它是唯一正确的那一份。
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
  if (!key) throw new Error('缺少 MINIMAX_API_KEY(环境变量 / 项目根 .env / 包根 .env 三层都没找到)');
  return key.trim();
}

async function generate(key, { prompt, lyrics, model, format }) {
  const body = {
    model,
    prompt,
    is_instrumental: !lyrics,
    output_format: 'hex',
    stream: false,
    aigc_watermark: false, // 平台侧 AI 声明照勾(法规),音频里不埋可听水印
    audio_setting: { sample_rate: 44100, bitrate: 256000, format },
  };
  if (lyrics) body.lyrics = lyrics;
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  const code = d.base_resp?.status_code;
  if (code !== 0) {
    const err = new Error(`MiniMax ${code ?? res.status}: ${d.base_resp?.status_msg || '响应异常'}`);
    err.code = code;
    throw err;
  }
  if (d.data?.status !== 2 || !d.data?.audio) throw new Error(`合成未完成(status=${d.data?.status}, msg=${d.base_resp?.status_msg})`);
  return { buf: Buffer.from(d.data.audio, 'hex'), extra: d.extra_info || {}, trace_id: d.trace_id };
}

const argv = process.argv.slice(2);
const FLAGS_WITH_VALUE = ['-o', '--model', '--format', '--lyrics'];
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (FLAGS_WITH_VALUE.includes(argv[i])) { i++; continue; }
  if (argv[i].startsWith('-')) continue;
  positional.push(argv[i]);
}
const prompt = positional[0];
if (!prompt) { console.error('用法: node $SKILL_DIR/scripts/minimax-music.js "<prompt>" -o <输出.mp3> [--model music-3.0] [--lyrics 歌词.txt]'); process.exit(1); }
const out = resolve(argv.includes('-o') ? argv[argv.indexOf('-o') + 1] : 'bgm-out.mp3');
let model = argv.includes('--model') ? argv[argv.indexOf('--model') + 1] : DEFAULT_MODEL;
const format = argv.includes('--format') ? argv[argv.indexOf('--format') + 1] : 'mp3';
const lyrics = argv.includes('--lyrics') ? await readFile(resolve(argv[argv.indexOf('--lyrics') + 1]), 'utf8') : null;

const key = await apiKey();
console.log(`合成中… 模型 ${model} / ${lyrics ? '带唱' : '纯音乐'} / ${format}`);
let r;
try {
  r = await generate(key, { prompt, lyrics, model, format });
} catch (e) {
  // 2013 参数异常最常见原因是模型名不存在(3.0 未开或拼法不同)——自动回落文档模型
  if (model !== FALLBACK_MODEL && (e.code === 2013 || /model/i.test(String(e.message)))) {
    console.log(`(模型 ${model} 不被接受: ${e.message} → 回落 ${FALLBACK_MODEL})`);
    model = FALLBACK_MODEL;
    r = await generate(key, { prompt, lyrics, model, format });
  } else throw e;
}
await writeFile(out, r.buf);
const meta = { model, prompt, is_instrumental: !lyrics, trace_id: r.trace_id, ...r.extra, generated_note: '时间戳见文件 mtime' };
await writeFile(`${out}.meta.json`, JSON.stringify(meta, null, 2));
console.log(`✓ ${out}  时长 ${(r.extra.music_duration ?? 0) / 1000}s  ${(r.buf.length / 1048576).toFixed(1)}MB  (实际模型 ${model})`);
console.log(`  meta → ${out}.meta.json`);
