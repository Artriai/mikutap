# 《雨爱》实时采样演唱

原唱杨丞琳，作曲金大洲，作词 Wonderful。原曲信息与官方 MV 可在索尼音乐及杨丞琳官方频道核查：

- https://www.sonymusic.com.tw/album/rainie-love-%E9%9B%A8%E6%84%9B-%E6%A5%8A%E4%B8%9E%E7%90%B3-rainie-yang-88697643132/
- https://www.youtube.com/watch?v=oec9R5ypf-o

本次从完整 MP3 重新提取演奏数据，未使用他人洛天依翻唱录音。用于离线分析的 320 kbps MP3 来源：https://2110-rainie-yang.mp3.pm/song/128260436-yu-ai/ 。校对所用的时间歌词来源：https://www.gequbao.com/music/31398030 。原曲录音和完整文本歌词不放入网站。

处理过程：Demucs htdemucs 本地分离伴奏与人声；Whisper small 生成宽松字级时间；使用 Mandarin wav2vec2 CTC 与拼音同音类约束逐字校准；pYIN 提取连续基频；修正伴奏泄漏引起的低八度误判，并避免将 CTC 在长音末尾的识别峰当成起音。运行时由现有洛天依音节 AudioBuffer 按提取的音高与时间演唱。播放前使用音高同步叠加拉伸元音，独立控制音高与时长，保留原音节的频谱包络；不再用变速播放和八周期短循环维持长音。

- 原曲时长 258.84737 秒；播放版裁去开头 12.835 秒，保留 3 秒前奏，时长 246.01237 秒。全部歌词、间奏、尾奏保留；伴奏使用相同偏移，跳转也保持同步。
- 43 个歌词句段，371 个发音事件，80 个普通话音节，2,225 个音高控制点。
- “Rainie Love”以普通话音节近似，其余为中文原词发音。
- `rain-love-instrumental.mp3` 为原曲分离出的无主唱伴奏，160 kbps。分离可能存在轻微原唱或混响残留，不等同于官方分轨伴奏。
- `rain-love.json` 默认洛天依；`rain-love-miku.json` 是选切初音时的日语音节近似版，不翻译歌词。
- 音高控制点间连续插值，单个音节不重复触发辅音或图形动画。同句短间隙衔接，保留换句呼吸。
- 仍由单音节采样构成，不等同于专业歌声模型或重新训练的洛天依音源；改善目标为变调音色、长音循环和字间断口。

复现脚本：`tools/build-rain-love.py <工作目录> [transcribe|align|ctc|pitch|export|all]`。准备 `source.mp3`、`source.lrc`、Demucs 输出 `separated/htdemucs/source/{vocals,no_vocals}.wav`；模型下载至 `models/whisper-small` 与 `models/aligner`。模型为 `Systran/faster-whisper-small`、`jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn`。语音模型仅在离线构建时使用，部署无 Python 或模型依赖，不上传录音用于云端推理。

本次验证：完整句段覆盖、音节目录覆盖、音高曲线合法性、伴奏时长、洛天依和初音版本时间一致、播放列表与 START 分离。演唱仍受单音节采样的限制，并非专业歌声合成器。
