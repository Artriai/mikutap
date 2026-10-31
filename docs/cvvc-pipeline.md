# VCV / CVVC 离线制库与前端接入

已导入初音 763 个 VCV 条目（6 包）、洛天依 192 个 VC 条目（8 包），并使用中文歌唱底模 + 洛天依 RVC 重制全部 409 个程序用单字。14 个过渡包共 6,913,096 字节，缺失的初音条目仍回退原有 legato。输入文件校验值、原生音素检查、转换时长及全部单字的响度/基频验证见 [cvvc-validation.json](cvvc-validation.json)。数值检查不能替代最终听感判断。

## 下载到 D:\Temp\Miku

- 初音：HHS_kt [VCV v1.1 发布页](https://github.com/hhskt/Hatsune-Miku/releases/tag/utau_v1.1) 的 `Hatsune.Miku.VCV.zip`，解压后使用带 `oto.ini` 与 WAV 的 C4 目录。
- 编辑器：[OpenUTAU 官方下载](https://openutau.com/)，Windows x64 Beta。DiffSinger 配置见[官方说明](https://openutau.com/DiffSinger-support/)。
- 中文歌唱源：[Qixuan_v2.7.0_DiffSinger_OpenUtau.zip](https://github.com/yqzhishen/qixuan-diffsinger/releases/download/v2.7.0/Qixuan_v2.7.0_DiffSinger_OpenUtau.zip)，以及 [pc_nsf_hifigan_44.1k_hop512_128bin_2025.02.oudep](https://github.com/openvpi/vocoders/releases/download/pc-nsf-hifigan-44.1k-hop512-128bin-2025.02/pc_nsf_hifigan_44.1k_hop512_128bin_2025.02.oudep)。
- 洛天依歌唱音色：[kouylty 模型文件](https://huggingface.co/kouylty/RVC-luotianyi-speech-and-song/tree/main) 中的 `luotianyi_song_v1.pth` 和 `added_IVF2063_Flat_nprobe_1_luotianyi_song_v1_v2.index`。RVC 推理环境和 HuBERT / RMVPE 依赖另行配置；脚本不假装这两个模型文件就足以完成推理。

源声库、模型和推理环境留在本机。站点只导入处理后的片段，来源与使用条件继续参见 [expanded-sources.md](expanded-sources.md)。

## 1. 生成中文工程（无需额外 Python 包）

在仓库根目录运行：

```powershell
python tools/prepare-tianyi-cvvc.py --out D:\Temp\Miku\tianyi-render --singer Qixuan_v2.7.0_DiffSinger_OpenUtau
```

输出两套 `.mid`、`.ustx`、`.lyrics.txt` 和对应 `*-plan.json`：

- `tianyi-base-409`：409 字，MIDI 60，单字 0.85 秒，字间 0.25 秒，总发声网格到 449.65 秒。
- `tianyi-vc-192`：8 × 24 组，每组两个 0.45 秒相邻音符，组间 0.3 秒，最后一组到 230.1 秒。

USTX 使用[官方 0.6 格式](https://github.com/openutau/OpenUtau/wiki/USTX-file-format)，以 YAML 1.2 兼容的 JSON 写入；默认中文 DiffSinger phonemizer，无指定声库。打开后选择已安装的中文歌唱声库，核对拼音、固定 C4 音高与无颤音设置，导出单声道干声。支持 `--singer` 和 `--phonemizer` 指定本机的声库 ID / 插件类名。

RVC 使用歌唱模型，`f0_up_key=0`、RMVPE，保持整份导出时长和休止。不要裁掉前导休止、拼接压缩空白或添加混响。若导出器增加前导空白，用切分脚本的 `--offset 秒数` 显式校准；不能假设音符网格自动等于 WAV 起点。

### 本次使用的全自动本机渲染

`tools/render-openutau.py` 使用已解压 OpenUTAU 的公开 .NET API，配套 `tools/openutau-render` 小工具生成干声及 `.alignment.json`，无需控制编辑器界面。需要 .NET 10 SDK；单独安装运行时不能编译此工具。针对本脚本生成的固定 120 BPM 工程，`--max-consonant-lead` 通过原生音素偏移覆盖来约束声母时长，不移动音符或元音拍点。本次基础字设 100 ms、VC 连唱设 75 ms，避免长擦音跨进前一个字，以及超出 180 ms 过渡片的容量。

```powershell
python tools/render-openutau.py D:\Temp\Miku\tianyi-render\tianyi-base-409.ustx --app D:\Temp\Miku\OpenUtau --singers D:\Temp\Miku\singers --dotnet D:\Temp\Miku\dotnet\dotnet.exe --max-consonant-lead .10 --out D:\Temp\Miku\renders\base-capped.wav
python tools/render-openutau.py D:\Temp\Miku\tianyi-render\tianyi-vc-192.ustx --app D:\Temp\Miku\OpenUtau --singers D:\Temp\Miku\singers --dotnet D:\Temp\Miku\dotnet\dotnet.exe --max-consonant-lead .075 --out D:\Temp\Miku\renders\vc-capped.wav
```

声库目录应位于 `singers\Qixuan_v2.7.0_DiffSinger_OpenUtau`；声码器 `.oudep` 内容位于 `OpenUtau\Dependencies\pc_nsf_hifigan_44.1k_hop512_128bin_2025.02`。导出文件名会追加音轨名。直接运行 `--alignment-only` 可只检查音素，不重复运行声学模型。

`tools/convert-bank-rvc.py` 对本机 RVC-Project 的 Transformers HuBERT 版本做分块调用。使用已配置 Torch / Torchaudio、Transformers 4.49、NumPy 1.26、Librosa 0.10、Faiss、SoundFile、PyAV 等依赖的 Python，RVC 源码目录还需本地 `assets/hubert_base` 与 `assets/rmvpe/rmvpe.pt`。本次精确源码提交见验证报告。模型均留在本机，转换时不联网。

```powershell
& D:\Temp\Miku\rvc-env312\Scripts\python.exe tools/convert-bank-rvc.py D:\Temp\Miku\renders\base-capped_tianyi-base-409.wav --out D:\Temp\Miku\renders\tianyi-base-sung-rvc.wav --rvc D:\Temp\Miku\rvc-source --model D:\Temp\Miku\luotianyi_song_v1.pth --index D:\Temp\Miku\added_IVF2063_Flat_nprobe_1_luotianyi_song_v1_v2.index --step 1.1 --boundary-lead .175 --report D:\Temp\Miku\renders\base-rvc-report.json
& D:\Temp\Miku\rvc-env312\Scripts\python.exe tools/convert-bank-rvc.py D:\Temp\Miku\renders\vc-capped_tianyi-vc-192.wav --out D:\Temp\Miku\renders\tianyi-vc-sung-rvc.wav --rvc D:\Temp\Miku\rvc-source --model D:\Temp\Miku\luotianyi_song_v1.pth --index D:\Temp\Miku\added_IVF2063_Flat_nprobe_1_luotianyi_song_v1_v2.index --step 1.2 --boundary-lead .15 --report D:\Temp\Miku\renders\vc-rvc-report.json
```

每块 8 个网格项目，切点落在休止中，保留左右上下文；对每块的采样长度误差做检查并按原网格位置放回，避免误差累计。本次 GPU 转换使用索引率 .65、清辅音保护 .4，关闭多形状 CUDA Graph 缓存，全部保持 C4、0 半音偏移。

## 2. 导入歌唱底模与中文 VC

```powershell
python tools/slice-tianyi-cvvc.py D:\Temp\Miku\tianyi-render\tianyi-base-plan.json D:\Temp\Miku\renders\tianyi-base-sung-rvc.wav --alignment D:\Temp\Miku\renders\base-capped.wav.alignment.json --report D:\Temp\Miku\base-report.json
python tools/slice-tianyi-cvvc.py D:\Temp\Miku\tianyi-render\tianyi-vc-plan.json D:\Temp\Miku\renders\tianyi-vc-sung-rvc.wav --grid-only --report D:\Temp\Miku\vc-report.json
```

基础字写入 `assets/tianyi-full/*.wav`，并更新程序音节的 `expandedPath`。原生对齐文件保留拍点之前的完整声母，单字文件包含 0.85 秒音符及其声母前导段。START 的 `originalBank`、32 槽及原始 MP3 不改。

VC 以网格为先验，通过局部能量与过零率在 ±30 ms 内做保守微调，每段长 180 ms（分界前 95 ms、后 85 ms）。这不是音素强制对齐器，必须试听与查看报告；自动估计不能保证每个声母的真实边界。`--grid-only` 关闭微调，`--boundaries overrides.json` 指定 `{ "a_b": 0.45 }` 格式的原网格秒数覆盖，`--offset` 另加到这些时间上。

本次已取得 OpenUTAU 原生音素标记，确认全部 384 个连唱音符无音素错误，元音起点位于原网格拍点，因此采用 `--grid-only`，避免启发式微调把已知的元音拍点移走。

## 3. 导入初音 VCV

```powershell
python tools/build-miku-vcv.py D:\Temp\Miku\Hatsune-Miku\C4
```

路径按实际解压目录替换。支持直接传 `oto.ini`，默认自动选单个 C4 目录；多音高目录不会混装。自动尝试 UTF-8 / CP932，必要时加 `--encoding cp932`。原 ZIP 文件名使用 CP932，解压工具需保留日文文件名。OTO 毫秒转换成秒，正 cutoff 从文件末尾裁去，负 cutoff 表示 offset 之后的固定长度；按六类前接元音输出实际存在的条目。没有足够元音的异常 OTO 单项告警并跳过。同音的 ぢゃ／ぢゅ／ぢょ 可复用 じゃ／じゅ／じょ，其余缺项不造假。

两种工具都支持 `--dist 其他目录`、`--bitrate 128k`。MP3 包使用内容哈希文件名，使重制素材不命中旧缓存；`transitions.json` 合并保留另一位歌手。元数据以解码 PCM 时间为准，编码后复核延迟/填充与片段范围。目录引用的全部过渡包合计限 8 MiB，超限时不替换生效目录。重制留下的旧哈希文件可在确认不再被任何目录引用后清理。

## 前端行为

仅 `natural + articulation: 'legato'` 按需加载过渡目录，START 不请求目录。按 `voice:sourceTrack` 隔离相邻音符，只为同句、间隙 ≤160 ms 的音符查找过渡；只预热谱中实际使用的键，每个 Sprite 共享下载和解码。

成功解码后才调整起音、裁前字韵尾和跳过中文后字字头。缺目录、缺键、错误元数据、网络/解码失败均保留原有单音节连音。时长过短而放不下完整 VC 后半段时也回退。过渡头过长时裁去前端，避免吞掉前一个短音符。

日语使用 VCV 录音的原速前导段，并对后续元音做 PSOLA；中文将保留原速清辅音的 VC 与跳过字头的后字元音用 28 ms 等功率窗融合，先相关匹配元音相位以减少能量抵消。每个音符仍只产生一个预渲染 AudioBuffer，沿用现有时钟、缓存、暂停与 seek。

分类先处理 ng/n，再处理舌尖元音 ir、ü 类，再按实际收尾元音分类。`ju/qu/xu/yu` 归 v，`jue/que/xue/yue` 收尾为 e；原计划同时将 yue 写到两类的矛盾已消除。`ao/ou/wo/bo` 合并到 u 是八类过渡库的近似，不能保证所有同类韵尾听感相同。

## 验证

```powershell
npm run check
npm run test:tools
python -m http.server 8000 --directory dist
```

JavaScript 回归覆盖全部 409 字分类、声部/乐句隔离、缺资源回退、Sprite 共享与失败重试、清辅音原速、后字不重复字头、相反相位元音交接，以及融合后暂停与跳转。Python 测试使用真实 FFmpeg 编解码，验证 C4 工程网格、OTO 两种 cutoff、Sprite 偏移、导出长度和不覆盖手动声库。真实声库入库后仍需试听短音符、句尾、不同音高和《千本樱》《雨爱》；合成测试不能证明真人声过渡的最终音质。
