// 中文字体本地化入口。
//
// 用 @remotion/fonts 从 public/fonts/ 加载「完整 TTF」（全字库、无子集化、无缺字风险），
// 禁用 @remotion/google-fonts——实测每次渲染会拉 ~294 个网络字体分片请求，又慢又不离线可用。
// 字体由 tools/fetch_fonts.sh 拉取（gitignore，不入库）；首拉后离线可渲染。
// loadFont 内部走 delayRender/continueRender，字体就绪前不会出帧 → 出片不掉字。
//
// ─────────────────────────── 授权（2026-07-15 实测核验）───────────────────────────
// 两款字库均为 SIL Open Font License 1.1，**授权声明刻在字体二进制的 name table**
// （nameID 13），不是"听说可商用"：
//
//   LXGWWenKaiGB-Medium.ttf
//     nameID  0: Copyright 2022-2026 LXGW / Copyright 2020 The Klee Project Authors
//     nameID 13: This Font Software is licensed under the SIL Open Font License, Version 1.1
//     字形数 46809 · GB2312 6763/6763 100% · GBK 汉字 20902/20902 100%
//     授权链：Fontworks 的 Klee One（OFL）→ 霞鹜文楷衍生（OFL），上游无断点
//
//   ZCOOLKuaiLe-Regular.ttf
//     nameID  0: Copyright 2018 The ZCOOL KuaiLe Project Authors
//     nameID 13: This Font Software is licensed under the SIL Open Font License, Version 1.1
//     字形数 7055 · GB2312 6763/6763 100%
//
// OFL 允许商用/嵌入/修改/随产品分发；唯一限制是不得单独把字体文件当商品卖、
// 衍生字体不得用保留名。渲染进 MP4 两条都不沾。
//
// ⚠️ 三个授权坑（与 tools/fetch_fonts.sh 头部同源，两处一起改）：
//   1. 站酷快乐体有两个版本。站酷官网包里的「2016修订版」是站酷声明授权（理论上可撤回），
//      **只用 googlefonts/zcool-kuaile 的 OFL 版**——OFL 对已发布版本不可撤回，
//      这是法律确定性的差别。
//   2. **剪映/抖音的字体不能发视频号**：方正与抖音的授权仅限「在剪映编辑并发布到抖音」。
//   3. **微软雅黑/苹方不能用**：微软雅黑版权属方正，微软只买了系统内嵌显示+个人打印，
//      商业发布权方正仍保留；苹方版权属威锋数位。
//
// ─────────────────────────── 分轨（实测逼出来的）───────────────────────────
// **字幕轨必须用霞鹜文楷，不许换成站酷快乐体。** 2026-07-15 逐字实测：
//   人名常见字 堃喆玥昇頔甯婳珺芃骁 → 站酷快乐体缺 8/10（堃喆玥昇頔婳珺芃）
//   繁体/古文 們兒學覺龍嬛        → 站酷快乐体缺 6/6（全灭）
//   霞鹜文楷 两组全覆盖
// 字幕里会出现人名——观众叫「张玥」「李喆」就爆字。钩子短、自己写、可控，
// 但**钩子字号大（130–170px），缺一个字就是画面正中一个天窗**：本包没有自动降级兜底，
// 钩子文案定稿、上字之前人工抽查一遍缺字（可疑的生僻字/繁体先在预览里看一眼）。

import {loadFont} from "@remotion/fonts";
import {staticFile} from "remotion";

/** 字幕轨（56px）——霞鹜文楷 GB Medium。全字库，人名/繁体不掉字。 */
export const fontFamily = "LXGW WenKai GB";

/** 钩子轨（130–170px）——站酷快乐体。马克笔手写感，够粗有性格。 */
export const hookFontFamily = "ZCOOL KuaiLe";

loadFont({
  family: fontFamily,
  url: staticFile("fonts/LXGWWenKaiGB-Medium.ttf"),
  weight: "500",
});

loadFont({
  family: hookFontFamily,
  url: staticFile("fonts/ZCOOLKuaiLe-Regular.ttf"),
  weight: "400",
});
