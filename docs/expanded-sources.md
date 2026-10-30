# 扩展音节的音频来源

此版本为当前所有者的个人非商业演奏体验。没有打包商业歌声合成引擎、解密商业数据库或分发原始完整声库。

## 初音未来

当前运行时首先使用原版 Mikutap 的 32 个 MP3，保留全部原始字节与原版逐音量参数；对应 21 个已映射音节。片段来自 HFIProgramming/mikutap 的原始 main.json，与首版存储的 MP3 逐字节核对；2026-10-30 再从 aidn.jp 原站 main.json 核对，32/32 的解码前 MP3 字节完全相同。目录 `originalBank` 保存每个片段的 SHA-256。基础映射沿用上游 list.txt 的日语规范化，原版片段的实际基准音高重新分析，不能套用天依的音高表。

原版手动播放绕过扩展音的变调、EQ、前导裁切、响度归一化和压缩器。原版脚本第三个逐音参数是音量，不是变速比。歌曲使用同一批原采样，按乐谱目标音高与发音时长调度；这时不承诺输出波形与原版点击一致。下面的扩展素材只补原版未覆盖的发音；旧扩展 WAV 仍保留，`expandedPath` 记录被原版覆盖前的路径。

- 基础素材：HHS_kt 的 [Hatsune Miku VCV v1.1](https://github.com/hhskt/Hatsune-Miku/releases/tag/utau_v1.1)，选取 C4 层。发布者描述为从 Hatsune Miku VOCALOID2 渲染的 VCV 采样。
- 根据其 `oto.ini` 的初始音别名和下一片段边界切成独立音节，保留淡入淡出。覆盖 128 个字典条目。
- `ぢゃ`／`ぢゅ`／`ぢょ` 按现代标准日语的同音关系分别映射到 `じゃ`／`じゅ`／`じょ`，因此上述素材覆盖 131 个目录条目。
- 其余 19 个外来音由日语发音经 `NoCrypt/miku_RVC` 社区音色模型转换，标为 `AI voice conversion`，不是来自原厂逐音节录音。
- 作者要求署名 HHS_kt，禁止商业用途、禁止重新配布原始声库，允许个人修改。本项目保留来源，未复制配布 ZIP、原始多音高 VCV 文件或 OTO 数据库到站点。

## 洛天依

- START 手动模式固定使用 TianyiTap 的原始 32 个采样，与 Miku 的 32 槽位一一对应；`canonicalSyllable` 记录对应的日语音节。此声库只用于手动模式，不覆盖程序的 409 项字典。
- 完整目录采用 [kouylty/RVC-luotianyi-speech-and-song](https://huggingface.co/kouylty/RVC-luotianyi-speech-and-song) 中 `luotianyi_song_v1.pth` 社区模型。模型卡标注 MIT，角色、原音色及其他权利归相应权利人。
- 逐音节发音经 RVC 转换为对应音色，并以 C4／261.63 Hz 为目标基准音高；不是从 32 段采样复制改名。
- 使用公开的 ContentVec／HuBERT 内容编码器。原型曾通过 John6666/mikuTTS 测试；批量离线推理借鉴其公开实现。
- 每个成品的具体方法、生成用字、文件路径、基准音高写入 `dist/catalog.json`。发音的细节仍会受 TTS 前端和音色转换模型影响。

## 区分不同类型

`VCV sample` 是配布素材切片；`VCV homophone` 是日语同音拼写；`AI voice conversion` 是新增音色合成；`phoneme concatenation` 是同一音色的声母、韵母片段拼接。它们不会被标成同一来源。演奏时直接播放本站已保存的 WAV，不调用外部推理接口。
