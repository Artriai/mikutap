# Mikutap

复刻 https://aidn.jp/mikutap/ 的全屏画布、32 种几何动画、随机背景变色、背景节拍与点击反馈，使用原站脚本和对应版本的 PIXI 3.0.11、TweenMax 1.19.1，依赖全部本地打包。

## 点击演奏

点击 START 后完全沿用原版的 32 区、点击／拖动／多点触摸／键盘输入、节拍吸附、几何动画、FEEDBACK 与 BACKTRACK；不显示音节或网格。自定义 46 区覆盖层已删除。

初音直接使用原版 32 个 MP3 与原版逐音量参数，不额外变调、裁切、EQ 或归一化。洛天依手动模式使用 TianyiTap 对应的 32 个片段，每个槽位对应同一个初音音节选取，数量与位置一致。两者都以原始速度播放，32 个片段只用于 START 模式。

程序仍可调用初音完整 150 项、洛天依完整 409 项；手动声库不覆盖洛天依程序用的独立音节。两位歌手的手动片段按整份文件预取、并行解码并缓存；重复切换不重新下载。原版提示、FEEDBACK、BACKTRACK 与歌手开关在演奏后自动隐藏。

Esc／返回箭头回到首页，方框按钮全屏。歌单只在首页显示。

## 播放列表与完整演唱

主站首页直接展开播放列表，START 始终用于手动点击演奏。点击列表中的「千本樱」播放完整演唱，包含主歌、第二段、全部副歌、间奏和结尾；用播放／暂停、停止和进度条控制。歌单播放时保持在首页，原版画布动画按音节时间触发；点击 START 会停止歌曲并进入独立的原版手动演奏界面，列表不进入该界面。没有单独测试站点或试听链接。

播放列表逐音读取完整 C4 扩展声库的 AudioBuffer（初音 `assets/miku-full/*.wav`、洛天依 `assets/tianyi-full/*.wav`），默认通过 `natural` 音高同步叠加（PSOLA）独立控制目标音高与发音时长，保留元音共振峰并接入轻量人声空间混响总线。人声不使用整曲录音；曲谱单独指定歌曲专用的纯器乐伴奏，与实时人声用同一个 AudioContext 时钟排程。主唱包含完整 main／sub 人声轨及独立应答轨的 657 个事件（其中 125 个 VSQ `-` 延音合并为连贯元音组，共 532 个发声组、66 个不同音节），并展开 VSQ 颤音与滑音曲线；去掉无歌词的前奏和尾奏后约 3 分 02 秒，保留歌曲内部休止。歌单不会开启原版背景节拍，也不会改写手动模式的 BACKTRACK 偏好。

自动分析并跳过素材的多余前导空白，按声母／稳态元音核／韵尾三段映射发声：长延音在开放元音核内平滑巡航，避免鼻韵尾提早闭合或尾音塌陷。千本樱与雨爱按分轨声部独立塑形连贯发音：辅音最多提前 45 毫秒，相邻短空隙由元音衔接并重叠淡出，保留真正的句间停顿。歌词事件和伴奏时间不变。手动 START 原版采样直接通过原版 1.0x 速度与逐音量直连输出，不经过歌单混响或变调；歌曲仍由单音节采样实时合成，不能等同商业连续歌声引擎。
曲／词：黒うさP / WhiteFlame（官方音乐页提供伴奏与歌词，以及非商业歌唱使用说明：<https://whiteflame.jp/music/>）。人声曲谱来源：Kate 上传的「千本桜 VSQ」，<https://vocaloader.app/sequences/3548>。未发布原始 VSQ、原始歌词文本或原始伴奏 WAV。合成与播放细节见 `docs/senbonzakura-sources.md`。

## 洛天依强制演唱

在首页切换歌手会实际更换歌单人声。千本樱保留全部 657 个音符、旋律、时序、ICBM 应答和原伴奏，用普通话音节近似日语发音，未翻译歌词，也不保证日语咬字质量。列表会显示“洛天依 · 日语近似发音”。

首次播放后静默预热另一位歌手的歌曲音节及演奏计划；同一页面内重播、切换直接复用已准备的计划，不重复遍历 657 个音符或显示准备提示。只有尚未加载完成时才等待。播放中切换保留位置，暂停中切换保持暂停和进度。快速连续切换只保留最后一次选择。切回初音重新使用原始初音曲谱，不做累计音节转换。

`dist/songs/senbonzakura-tianyi.json` 是独立可用的完整转换谱，`tools/build-tianyi-song.mjs` 可重新生成。只有首页播放列表响应此切换，显式指定 voice 的程序乐谱不被改写。

## 程序演奏

在页面点击 START 解锁声音后，可以通过浏览器控制台调用全局 `Mikutap`。程序不受手动点击基础音节映射的限制，可调用初音全部 150 项、洛天依全部 409 项。音节可用假名、片假名、罗马音／拼音；普通话去除声调标记，保留 ü（也接受 v 和 u:）。本版本不自动将中文歌词解析为带多音字消歧的拼音。

```js
// 单音：声音与原版动画一起触发。时长用秒，MIDI 60 = C4。
await Mikutap.note({voice:'miku', syllable:'キャ', midi:'E4', duration:.6, visual:12});

// 乐谱：默认以秒为时间单位；unit:'beats' 时按 bpm 换算。
await Mikutap.play({
  voice:'tianyi', unit:'beats', bpm:120,
  lyrics:['ni','hao','a'],
  notes:[
    {time:0, duration:1, midi:'C4'},
    {time:1, duration:1, midi:'E4'},
    {time:2, duration:1, midi:'G4'},
    {time:3, duration:1, midi:'C5', tie:true}
  ]
});
Mikutap.pause();
await Mikutap.resume();
Mikutap.seek(1.5); // 秒，无论原乐谱是否用 beats。
Mikutap.stop();
```

`play()` 预处理素材完成并开始演奏时返回 `{duration,notes}`，并不等待整首结束。`state` 为 loading／playing／paused／stopped／ended，`position`／`duration` 为秒。`mikutap:transport` 事件在状态变化时报告上述值。暂停、跳转后使用同一音频时钟重建调度；切到后台暂停歌曲，回前台后显式 resume。

每个音符支持：`time`、`duration`、`syllable`、`midi`（24–96 或 C1–C7 名称）、`voice`、`velocity`（0–1）和 `visual`（0–31）。也可不提供 lyrics，直接为每个音符写 syllable。

`tie:true` 延续紧接的同一音节，可改变音高，不重新播放辅音；它不消耗 lyrics 项。多声部可使用重叠的普通音符；连音须紧邻前一个音符。歌词数组须与非连音、未指定 syllable 的音符一一对应。

程序使用 AudioContext 的绝对时间调度声音，渲染帧按同一个时钟触发动画。原版固定节拍吸附不介入程序演奏。播放列表独立于 START，只在自身播放期间临时锁定原版节拍，不修改手动模式的开关状态。历史版本误存的关闭状态进行一次性修复；之后尊重手动开关。自定义程序演奏可传入 `{engine:'sampler',muteBacktrack:true}` 使用相同行为。单次 note 不改背景节拍。

### MIDI

```js
// MIDI 由调用方提供 ArrayBuffer 或 Uint8Array。
// 选择旋律音轨，给每个音符分配音节；单个音节可重复使用。
const score=Mikutap.fromMidi(midiBytes,{
  track:1, voice:'miku', syllables:['あ']
});
await Mikutap.play(score);
```

支持标准 MIDI 格式 0／1、PPQ 计时和速度变化，保留音符力度。默认选择首个有非鼓声音符的音轨；可显式指定从 0 开始的 track／channel。不会自动从多声部伴奏里识别人声主旋律，不处理踏板或自动编配。乐谱、歌词对齐和伴奏由调用方提供；本站附带千本樱的本站音源事件表。

## 声音处理与限制

已导入初音 763 项日语 VCV、洛天依 192 项中文 VC，过渡音频共约 6.9 MB；洛天依全部 409 个程序单字已用绮萱 DiffSinger C4 歌唱干声经洛天依歌唱 RVC 模型重制。歌单按需使用过渡，缺项沿用原有连音。具体下载、自动渲染、切分命令和验证见 [docs/cvvc-pipeline.md](docs/cvvc-pipeline.md) 与 [验证记录](docs/cvvc-validation.json)。START 原始 32 音独立保留。

- 手动 START 模式初音直接使用 daniwell 的原始 32 个 Mikutap 片段；歌单 `natural` 演唱模式统一读取 HHS_kt 的 44.1 kHz C4 VCV 切片与社区 Miku RVC 补充音（`assets/miku-full/*.wav`），消除同一句中高低音原版短采样与扩展干声混用造成的音色跳变。
- 洛天依全部 409 项程序音节由绮萱 DiffSinger C4 歌唱干声经 kouylty 的社区歌唱模型转换，统一保留原生拍前声母；中文 VC 库来自同一管线的双字连唱。
- 歌单默认采用自适应基音周期追踪的 PSOLA（`engine: 'natural'`）重建有声部分，时长与音高独立，长音驻留开放元音核并稳定声压，连音与 VSQ `-` 延音不重复辅音；同时保留 `engine: 'sampler'` 原始采样实时变速路径供程序调用。高低音跨度过大、长延音和音节连接仍可能产生人工痕迹，不能等同于专业连续歌声引擎。
- 默认采用单音节采样与短交叉淡化；导入可选过渡库后，同声部相邻音符可使用录制的 VCV / VC 过渡。扩展素材与原版的制作、调教不同，即使调整音高和高频也不能完全还原原版音色。中文歌曲优先使用洛天依；初音音节集主要覆盖日语，不会自动把中文强制近似为日语。
- 来源、方法、基准音高见 `dist/catalog.json`，详情见 `docs/expanded-sources.md`。`docs/audio-validation.json` 保存原素材音频验证。

## 运行和验证

```sh
python3 -m http.server 8000 --directory dist
npm run check
```

无需安装依赖或构建。测试覆盖完整目录、日语／拼音归一化、标准音高与独立时长、连音、乐谱合法性、MIDI 速度变化，以及时间轴的调度／暂停／跳转／取消和动画同步。

## 署名

原作、动画与背景音乐：daniwell / aidn.jp。镜像参考：HFIProgramming/mikutap、cyjin-yl/tianyitap。扩展素材：HHS_kt / Hatsune Miku VCV v1.1；音色模型：NoCrypt/miku_RVC、kouylty/RVC-luotianyi-speech-and-song；推理参考 RVC、ContentVec／HuBERT。

修改日期：2026-10-31。新增代码沿用 GPL-2.0；原站作品、声音、角色、商标及第三方依赖仍归相应权利人。扩展声音供当前所有者个人非商业体验，不分发商业歌声引擎及原始完整 VCV 声库。软件按现状提供。

### 《雨爱》

主页播放列表增加《雨爱》完整版，默认洛天依。由完整 MP3 分离伴奏并提取逐字时间和连续音高，结合平行段落共识与句级八度连续性修复消除伴奏低频泄漏造成的掉八度及字内滑音裂变，实时驱动现有采样音源。点击新歌会选择其默认歌手，演唱中仍可切换近似版本。音源与演奏计划继续使用页面内缓存。构建来源与方法见 [docs/rain-love-sources.md](docs/rain-love-sources.md)。
