import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// 字体本地化配套：每个渲染页要从本地静态服务加载两个全字库 TTF——
// 霞鹜文楷 GB Medium ≈24.5MB + 站酷快乐体 ≈1.4MB（见 src/fonts.ts 的分轨理由）。
// 多 tab 并发冷启动时 FontFace.load() 可能超过默认 30s delayRender 预算〔上游实测撞过一次〕，
// 放宽到 120s。**字幕轨那个 24.5MB 比上游任一权重都大**，这条只会更需要，别调回去。
Config.setDelayRenderTimeoutInMilliseconds(120000);
