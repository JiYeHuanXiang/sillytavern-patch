# 上游开放中 PR 整理（中文）

- 上游仓库: `SillyTavern/SillyTavern`
- 抓取时间: 2026-08-29 14:31:24 UTC
- 开放 PR 总数: 159
- 翻译模型: `deepseek-ai/DeepSeek-V3.2` (SiliconFlow)

## 分类统计

| 类别 | 说明 | 数量 |
| --- | --- | --- |
| 功能 | 新特性 / 新增能力 | 82 |
| 修复 | Bug 修复 | 46 |
| 优化 | 性能 / 体验 / 可访问性改进 | 21 |
| 安全 | 安全加固 / 鉴权 / 凭据 | 1 |
| 重构 | 代码重构 / 结构调整 | 2 |
| 文档 | 文档 / 说明 | 2 |
| 其他 | 杂项 / 构建 / CI / 依赖 | 5 |

## 功能

> 新特性 / 新增能力（共 82 个）

| # | 中文标题 | 原标题 | 作者 | 草稿 | 链接 |
| --- | --- | --- | --- | --- | --- |
| 5993 | 添加 Gandr TTS 提供商 | Add Gandr TTS provider | AALG123 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5993) |
| 5992 | 添加 WaveSpeedAI 作为图像生成源 | Add WaveSpeedAI as an image generation source | chengzeyi |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5992) |
| 5989 | 添加 glm-5.3 和 glm-5.3-flash | Added glm-5.3 and glm-5.3-flash | eduard93 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5989) |
| 5985 | 添加 OAI_PRESET_SAVED 事件 | feat: Adding OAI_PRESET_SAVED event | qvink |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5985) |
| 5973 | 导出 setGroupAutoMode() 用于编程式群组自动模式控制 | Export setGroupAutoMode() for programmatic group auto-mode control | bal-spec |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5973) |
| 5971 | 添加 deepseek-v4-vision-exp 图像嵌入支持 (#5964) | Add deepseek-v4-vision-exp embed image support (#5964) | fishBone000 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5971) |
| 5968 | Fireworks: 支持优先级层级 | Fireworks: Support priority tier | Christoph-D |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5968) |
| 5967 | 添加 NovelAI GLM-4.6 和 Xialong 文本模型支持 | Add NovelAI GLM-4.6 and Xialong text model support | contrataco |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5967) |
| 5953 | 功能：添加 Concentrate 作为聊天补全提供商 | feat: Add Concentrate as a Chat Completions provider | AjayK47 | 是 | [PR](https://github.com/SillyTavern/SillyTavern/pull/5953) |
| 5946 | 功能(TTS)：为 MateEngine 口型同步集成添加全局钩子 | feat(tts): Add global hooks for MateEngine lip sync integration | ibrahim4433 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5946) |
| 5939 | 功能：添加 OpenCode Go 作为聊天补全提供商 | feat: add OpenCode Go as a chat completion provider | MicroHEROX |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5939) |
| 5925 | 功能：后台工具调用 | feat: Background Tool Calls | qvink | 是 | [PR](https://github.com/SillyTavern/SillyTavern/pull/5925) |
| 5914 | 功能：添加 OpenAI 兼容的自定义 STT 转录端点 | feat: add OpenAI-compatible custom STT transcription endpoint | bbastex |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5914) |
| 5907 | feat: 添加 Infersia 作为 Chat Completion 源 | feat: add Infersia as a Chat Completion source | infersia |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5907) |
| 5899 | 实现大小写转换宏（大写/小写/标题格式） | Implement case conversion macros (uppercase/lowercase/titlecase) | notzgok |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5899) |
| 5895 | Feat: 添加 Fish Audio 作为云端 TTS 提供商 | Feat: Add Fish Audio as a Cloud TTS Provider | JarodMica |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5895) |
| 5889 | Feat: 为 OpenRouter 添加粘性路由键（session_id / prompt_cache_key） | Feat: Add OpenRouter sticky routing key (session_id / prompt_cache_key) | 0cyris |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5889) |
| 5881 | 文件 API /list 端点 | File API /list endpoint | qvink |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5881) |
| 5869 | 添加一些额外的 AI Horde 采样器设置 | Added some additional AI Horde sampler settings | Teashrock |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5869) |
| 5866 | 添加巴斯克语（Euskara）区域设置 | Add Basque (Euskara) locale | planetryan |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5866) |
| 5865 | 多窗口支持：会话、RW 租约和原子连接配置文件（可选） | Multi-window support: sessions, RW leases, and atomic connection profiles (opt-in) | peer-cat | 是 | [PR](https://github.com/SillyTavern/SillyTavern/pull/5865) |
| 5860 | 在 OpenAI 兼容的 TTS 中支持 WAV 响应 | Support WAV responses in OpenAI-compatible TTS | ivan-digital |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5860) |
| 5859 | 扩展：ConnectionManagerRequestService 的自定义配置文件/预设 + 聊天内 StreamingProcessor 访问 | Extensions: custom profile/preset on ConnectionManagerRequestService + in-chat StreamingProcessor access | Samueras |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5859) |
| 5858 | 为自定义（OpenAI兼容）端点添加提示缓存开关 | Feat: Add prompt caching toggle for Custom (OpenAI-compatible) endpoints | crsp6447 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5858) |
| 5853 | 支持导入Janitor聊天历史 | Janitor Chat History Import Support | uGuardian |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5853) |
| 5846 | 为响应提示处理添加‘关闭’选项 | feat(sd): add 'Off' option for response prompt processing | Endebert |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5846) |
| 5840 | 为头像上传添加JXL图像格式支持 | feat: Add JXL image format support for avatar uploads | btaskel |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5840) |
| 5834 | 功能：允许配置会话 Cookie 的 SameSite 和 Secure 属性 | feat: Allow configuring SameSite and Secure session cookie attributes | awaae001 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5834) |
| 5822 | 将 OpenRouter 图像生成迁移到专用的 /api/v1/images 端点 | Migrate OpenRouter image generation to dedicated /api/v1/images endpoint | Robinnnnn |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5822) |
| 5816 | 为 Gemma 4、ChatML 思考变体和 Mistral 回退添加聊天模板自动检测 | Add chat template auto-detection for Gemma 4, ChatML thinking variants, and Mistral fallbacks | Tom-Neverwinter |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5816) |
| 5810 | 添加自定义（OpenAI 兼容）图像生成源 | Add Custom (OpenAI-compatible) image generation source | tkabala |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5810) |
| 5799 | 新增 Requesty 作为聊天完成源 | feat: add Requesty as a chat completion source | Thibaultjaigu |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5799) |
| 5795 | 添加对 Featherless 聊天完成的支持 | Add support for Featherless chat completion | ArEnSc |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5795) |
| 5774 | 新增 AnyAPI 作为聊天完成提供商 | feat: add AnyAPI as a Chat Completion provider | es697 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5774) |
| 5753 | 功能(sd)：新增 MiniMax 图像生成源 | feat(sd): add MiniMax image generation source | rightgenius |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5753) |
| 5744 | feat: 新增 /api/files/patch-json 用于部分更新 JSON 文件 | feat: add /api/files/patch-json for partial JSON file updates | ZapoVerde |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5744) |
| 5741 | feat: 在 /api/vector/query 响应中公开余弦相似度分数 | feat: expose cosine similarity scores in /api/vector/query responses | kings9527 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5741) |
| 5740 | feat: 添加 Voyage AI 作为嵌入提供者 | feat: add Voyage AI as an embedding provider | ZapoVerde |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5740) |
| 5737 | feat(tts): 从 API 获取 MiniMax 语音列表 | feat(tts): Fetch MiniMax voice list from API | yetio |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5737) |
| 5733 | 功能：为 Bedrock 添加“用户首尾”提示词后处理 | feat: add "user first and last" prompt post-processing for Bedrock | aiark032025 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5733) |
| 5732 | 为 Chatterbox TTS 添加流式支持 | Enhance Chatterbox TTS with streaming support | aiark032025 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5732) |
| 5720 | 功能：将 MiniMax 默认模型升级至 M3 | feat: upgrade MiniMax default model to M3 | octo-patch |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5720) |
| 5714 | 添加 `ignoreChecks` 标志以绕过世界扫描期间的激活检查 | Add `ignoreChecks` flag to bypass activation checks during world scans | Enerccio |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5714) |
| 5713 | 为世界信息生成实现动态扩展触发器处理 | Dynamic extension trigger handling for world info generation | Enerccio |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5713) |
| 5693 | Feat/通过 SSO 自动创建用户 | Feat/auto create user via sso | finalparanoia |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5693) |
| 5685 | 添加 MLX-LM 文本补全后端 | Add MLX-LM Text Completion Backend | realyxl |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5685) |
| 5678 | 添加可自定义的工具角色设置及 API 支持 | Add customizable tools role setting and support in API. | Enerccio |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5678) |
| 5670 | PR/Cohere 动态模型 | Pr/cohere dynamic models | aikohanasaki |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5670) |
| 5666 | 增强世界信息角色过滤器: 三态逻辑(OR/AND/NOT)、角色支持与统一数据模型 | Enhance World Info character filter: three-state logic (OR/AND/NOT), persona support, and unified data model | Wolfsblvt |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5666) |
| 5648 | 功能：将分词器设置拆分为计数和编码分词器 | feat: split tokenizer settings into counting and encoding tokenizers | Illustar0 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5648) |
| 5629 | 添加 DeepSeek 提示词缓存诊断（断点检测与命中/未命中显示） | Add DeepSeek prompt cache diagnostics (breakpoint detection + hit/miss display) | waddles831 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5629) |
| 5620 | 功能（扩展）：添加精简聊天提示词构建器 | feat(extensions): add lean chat prompt builder | koshisan |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5620) |
| 5587 | feat(stable-diffusion): 支持使用连接配置文件进行提示词生成 | feat(stable-diffusion): support Connection Profile for prompt generation | koshisan | 是 | [PR](https://github.com/SillyTavern/SillyTavern/pull/5587) |
| 5586 | feat(expressions): 添加连接配置文件作为分类器 API 选项 | feat(expressions): add Connection Profile as a classifier API option | koshisan | 是 | [PR](https://github.com/SillyTavern/SillyTavern/pull/5586) |
| 5585 | feat(memory): 添加连接配置文件作为摘要来源 | feat(memory): add Connection Profile as a summary source | koshisan | 是 | [PR](https://github.com/SillyTavern/SillyTavern/pull/5585) |
| 5542 | Chat Completion: 在消息气泡中显示 API 报告的完成令牌用量 | Chat Completion: display API-reported completion token usage in message bubbles | deshark42 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5542) |
| 5417 | 添加支持 API 密钥认证的 AWS Bedrock 集成 | Add AWS Bedrock integration with API Keys authentication | ailec0623 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5417) |
| 5409 | 添加 EUrouter 作为聊天完成提供商 | feat: add EUrouter as chat completion provider | DavidLoDico |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5409) |
| 5397 | 为群聊添加响应控制和队列按钮 | Add response control and queue button for group chats | MemeticGitHubUser |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5397) |
| 5375 | feat(ui): 高级定义中的 charRefImages 编辑器 | feat(ui): editor for charRefImages in advanced definitions | mlegls |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5375) |
| 5374 | feat: charRefImages 提示块 — 角色的多模态参考媒体 | feat: charRefImages prompt block — multimodal reference media for characters | mlegls |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5374) |
| 5299 | 添加 Claude 原生压缩支持 | Add Claude native compaction support | LeenHawk |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5299) |
| 5283 | 添加分支导航 UI、可视化图表并持久化分支元数据 | Add branch navigation UI, visual graph, and persist branch metadata | Fristender |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5283) |
| 5272 | 添加 Player2 Chat Completion 源 UI（前端） | Add Player2 Chat Completion source UI (frontend) | CarlosNahuelcoy |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5272) |
| 5271 | 添加 Player2 作为 Chat Completion 源（后端） | Add Player2 as a Chat Completion source (backend) | CarlosNahuelcoy |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5271) |
| 5257 | 支持 isomorphic-git 作为替代 git 后端，第 2 部分 | Support for isomorphic-git as an alternative git backend, part 2 | Sanitised |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5257) |
| 5256 | 添加 CAMB AI 作为 TTS 提供商 | Add CAMB AI as a TTS provider | neilruaro-camb |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5256) |
| 5228 | 功能：添加 Avian 作为聊天补全提供商 | feat: Add Avian as Chat Completion provider | avianion |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5228) |
| 5198 | 功能：添加 ModelsLab 作为 TTS 提供商 | feat: Add ModelsLab TTS provider | adhikjoshi |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5198) |
| 5184 | 添加 MegaNova AI 作为聊天补全源 | Add MegaNova AI as a Chat Completion Source | bq1024 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5184) |
| 5157 | 添加用于填充两个连续助手消息之间内容的提示 | add a prompt to fill in between two consecutives assistant messages | EugeoSynthesisThirtyTwo |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5157) |
| 5099 | 功能：为聊天补全预设添加提示文件夹 | feat: prompt folder for chat completion presets | StageDog | 是 | [PR](https://github.com/SillyTavern/SillyTavern/pull/5099) |
| 5057 | 从 `feat/chat-tree` 反向移植 `pickFirstObjectFromJsonFile` | Backported `pickFirstObjectFromJsonFile` from `feat/chat-tree` | DeclineThyself | 是 | [PR](https://github.com/SillyTavern/SillyTavern/pull/5057) |
| 5054 | 翻译：添加 OpenAI 兼容端点 | Translate: add OpenAI Compatible endpoint | Myp3a |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5054) |
| 5007 | 添加群组成员拖放功能 | Add drag+drop group members | paradox460 | 是 | [PR](https://github.com/SillyTavern/SillyTavern/pull/5007) |
| 4937 | feat(tts): 添加支持语音克隆与语音设计的 DashScope TTS 提供商 | feat(tts): add DashScope TTS provider with Voice Clone and Voice Design support | bu-bu-xxx |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/4937) |
| 4905 | 在状态端点中添加 Zai | Add Zai to status endpoint | Rukongai |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/4905) |
| 4573 | 为议题 #1731 提交 PR: [每条 AI 消息的滑动操作] | PR for issue #1731: [Swipes on every AI message] | DeclineThyself | 是 | [PR](https://github.com/SillyTavern/SillyTavern/pull/4573) |
| 4344 | 添加本地标签 (<local>CONTENT</local>) 以允许在消息中包含不发送给 LLM 的内容 | Add Local Tags (<local>CONTENT</local>) to allow for in message content that isn't sent to the LLM | route-404-gh |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/4344) |
| 3704 | feat: 提议新增扩展以将所有数据银行条目插入聊天 | feat: Proposing a new extension to insert all data bank entries into chat | BrianKim2000-code |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/3704) |
| 3534 | 为 SD Refine 模式添加正则表达式处理 | Add regular expression processing for SD Refine mode. | Lisanjin |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/3534) |
| 3018 | feat: 添加 PromV3 规范支持 | feat: add PromV3 spec support | Bronya-Rand |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/3018) |

## 修复

> Bug 修复（共 46 个）

| # | 中文标题 | 原标题 | 作者 | 草稿 | 链接 |
| --- | --- | --- | --- | --- | --- |
| 5983 | 修复(聊天)：若 saveChat() 永不完成则释放保存锁 | fix(chat): release the save lock if saveChat() never settles | ryzendigo |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5983) |
| 5980 | 修复(聊天)：在确认覆盖前对先前聊天创建快照 | fix(chat): snapshot previous chat before confirmed overwrite | Lockyer228 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5980) |
| 5979 | 修复(宏)：忽略嵌套后的前导列表分隔符 | fix(macros): ignore leading list separator after nesting | Totoro-qaq |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5979) |
| 5978 | 修复快速发送时可能启动重复生成的竞态窗口 | fix: close race window that lets duplicate generations start on rapid send | jojogladman |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5978) |
| 5975 | 修复 /api/chats/get 在内部错误时的返回 (#5941) | Fix /api/chats/get return on internal errors (#5941) | saitewasreset |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5975) |
| 5965 | 修复: 保留 NovelAI Math1 温度值为零的设置 | fix: preserve zero NovelAI Math1 temperature | tandede |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5965) |
| 5963 | 修复：使用 image.novelai.net 检查用户/订阅状态 | fix: use image.novelai.net for user/subscription status check | contrataco |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5963) |
| 5921 | 修复独立角色书的导入 | Fixed importing characterbooks standalone. | StealthNinja1O1 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5921) |
| 5887 | fix: trimToStartSentence() 仅在第一个句子以句号结尾时才进行修剪 | fix: trimToStartSentence() only trimmed when the first sentence ended with a period | IamPatricKKK |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5887) |
| 5885 | fix: 在 {{if}} 宏中解析裸变量名 #5870 | fix: resolve bare variable names in {{if}} macros #5870 | M1yamoto-Musash1 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5885) |
| 5875 | 为聊天自动加载添加缺失的 await 以防止相关错误 | Add missing await for chat auto loading to prevent any related bugs. | kuroneko1996 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5875) |
| 5868 | 修复：防止群聊回复中的角色不匹配 | fix: prevent character mismatch in group chat replies | Dr-Asimov |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5868) |
| 5851 | 在请求代理绕过列表中支持CIDR和IP通配符模式 | fix: support CIDR and IP wildcard patterns in request proxy bypass list | arnavprabhu |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5851) |
| 5849 | 修复扩展读取推理时可能与ST清除跟踪事件发生竞态的小问题 | Fix to a minor issue where extensions reading reasoning could race ST's event to clear traces. | CoffeeVampir3 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5849) |
| 5839 | 修复NovelAI状态端点URL（api -> text） | Fix NovelAI status endpoint URL (api -> text) | sigmareaver |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5839) |
| 5838 | 修复：当世界书关联被移除时清除嵌入的 character book | fix: clear embedded character book when world book association is rem… | DaDarlian-Warna |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5838) |
| 5801 | 修复 Live2D 模型检测匹配无关 JSON 文件的问题 | Fix Live2D model detection matching unrelated JSON files | ricemaster1 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5801) |
| 5775 | 修复：为自定义端点将 OpenAI 工具格式转换为 Claude 原生格式 | fix: convert OpenAI tool format to Claude native for custom endpoints | 1756141021 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5775) |
| 5772 | 修复溢出文本框上的自动完成和工具提示位置 | Fix auto complete and tooltip location on overflow text box. | Rsslone |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5772) |
| 5762 | 修复：OpenRouter 最新 Claude 模型支持缓存 (#5746) | fix: OpenRouter Latest Claude models work with caching (#5746) | tkarabela |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5762) |
| 5761 | 修复当 `responseContent` 未突变时的 Gemini reasoning 提取 | Fix Gemini reasoning extraction when `responseContent` is not mutated | Supker |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5761) |
| 5760 | 修复 reasoning_effort 对不支持的 API 源泄露 "auto" | Fix reasoning_effort leaking "auto" for unsupported api sources | Supker |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5760) |
| 5750 | 修复/世界信息缺失位置 | Fix/world info missing position | DaDarlian-Warna |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5750) |
| 5745 | 修复：当 display_name 缺失时回退到 manifest.name | fix: fallback to manifest.name when display_name is missing | kings9527 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5745) |
| 5743 | fix: 在连接管理器中从配置文件自身的 API 解析 secret-id | fix: resolve secret-id from profile's own API in connection manager | ZapoVerde |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5743) |
| 5739 | fix: 修复当清单使用 'name' 而非 'display_name' 时扩展名称显示的备用方案 | fix: extension name display fallback when manifest uses 'name' instead of 'display_name' | kings9527 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5739) |
| 5734 | 修复：编辑 OpenRouter 提供商列表时保留被禁用的提供商 | fix: preserve disabled OpenRouter providers when editing provider list | kings9527 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5734) |
| 5717 | 修复：在 CORS 代理响应中保留 Content-Type | fix: Preserve content type in CORS proxy responses | ZhenyaPav |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5717) |
| 5715 | 修复用户消息的 logprobs 窗口重写/继续功能失效问题 | fix logprobs window rewrite/continue feature failing on user's messages | AUTOMATIC1111 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5715) |
| 5704 | 修复并行扩展自动更新导致的线程耗尽崩溃 | Fix thread exhaustion crash from parallel extension auto-updates | hydorsophia |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5704) |
| 5702 | 修复 llama.cpp 的融合令牌概率 | Fix fused token probabilities for llama.cpp | AUTOMATIC1111 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5702) |
| 5683 | 修复: 生成图片时聊天区域强制滚动 | Fix: chat scroll are forced when generate a image | myonmu0 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5683) |
| 5656 | 修复嵌套同分隔符 Markdown 强调渲染(斜体中的斜体、粗体中的粗体) | Fix nested same-delimiter markdown emphasis rendering (italic-in-italic, bold-in-bold) | Wolfsblvt |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5656) |
| 5630 | 修复示例名称忽略设置的问题 | Fix example names ignoring setting | Reithan |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5630) |
| 5617 | OpenRouter：启用自适应思考并为 Claude 4.7 添加 xhigh/max 详细度 | OpenRouter: enable adaptive thinking and add xhigh/max verbosity for Claude 4.7 | chungchandev |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5617) |
| 5611 | 修复（标签）：解决标签合并失败并改进 UI/类型安全 | fix(tags): resolve tag merge failure and improve UI/Type safety | GentleBurr |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5611) |
| 5605 | 修复推理预填充自动解析 | Fix reasoning prefill auto parse | Reithan |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5605) |
| 5545 | fix: 将存储的 reasoning_content 传递给 DeepSeek 工具调用消息 | fix: pass stored reasoning_content to DeepSeek tool call messages | octo-patch |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5545) |
| 5539 | 在角色列表加载时自动清理磁盘上现有角色的文件名 | Auto-sanitize existing character filenames on disk during character list loading | Wolfsblvt |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5539) |
| 5517 | 修复推理中“添加到提示”与工具调用的边界情况 | Fix reasoning "Add to prompts" corner cases with tool calls | Copilot | 是 | [PR](https://github.com/SillyTavern/SillyTavern/pull/5517) |
| 5510 | 修复：在继续预填充中跳过已解析的推理标记 | fix: skip parsed reasoning tokens in continue prefill (fixes #5506) | octo-patch |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5510) |
| 5481 | 修复生成后发送按钮状态的清理 | Fix send button state cleanup after generation | Hhhhenrry-HA |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5481) |
| 5250 | 修复：在 Impersonate 模式中移除 [INST] 后的尾随空格 | Fix: Remove trailing space from [INST] in Impersonate mode | som1tokmynam |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5250) |
| 5040 | 修复：Regex 脚本绕过隐藏消息的深度检查 | Fix: Regex script bypassing depth check on hidden messages | guoql666 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5040) |
| 3663 | fix: 处理 CJK (中文、日文、韩文) 字符的全词匹配 | fix : Handle full-word matching for CJK (Chinese, Japanese, Korean) c… | leoncjgjk |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/3663) |
| 3390 | 修复 确保 TTS 遵循正则表达式扩展 (#3353) | Fix Ensure TTS respects regex extension (#3353) | mayapony |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/3390) |

## 优化

> 性能 / 体验 / 可访问性改进（共 21 个）

| # | 中文标题 | 原标题 | 作者 | 草稿 | 链接 |
| --- | --- | --- | --- | --- | --- |
| 5969 | 当聊天最后一行无法解析时返回降级预览而非丢弃 | Return a degraded preview instead of dropping a chat whose last line is unparseable | shoemoney |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5969) |
| 5954 | Google AI Studio：获取所有模型页面 | Google AI Studio: Fetch all model pages | saitewasreset |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5954) |
| 5872 | 添加自定义源视频内联并减少大型媒体的浏览器内存使用 | Add Custom source video inlining and reduce browser memory use for large media | Reithan |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5872) |
| 5836 | 批量处理无障碍观察者回调并合并规则选择器 | Batch accessibility observer callbacks and combine rule selectors | ransxd |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5836) |
| 5798 | 使 OpenAI 实现使用反向代理或自定义 URL | Make OpenAI implementation use the reverse-proxy or customUrl | maxcarl |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5798) |
| 5788 | 为提示缓存优化添加基于锚点的动态上下文窗口 | Add anchor-based dynamic context window for prompt cache optimization | Chris-behind-door |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5788) |
| 5763 | 将默认启动打开的标签页更改为使用 localhost | Change default launch opened tab to use localhost | thegreatGreenstar |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5763) |
| 5754 | 优化角色列表读取以及角色导入、创建、复制和删除的速度 | Optimized the speed of reading the character list, as well as importing, creating, duplicating, and deleting characters. | zonde306 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5754) |
| 5736 | 防止生成过程中移动端键盘重新打开 | Prevent mobile keyboard from reopening during generation | wilderye |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5736) |
| 5735 | 避免移动端文本输入框意外自动聚焦 | Avoid unwanted mobile text input autofocus | wilderye |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5735) |
| 5722 | 优化空聊天搜索的元数据读取 | Optimize empty chat search metadata reads | baibai-git |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5722) |
| 5716 | 将 /index.html 重定向至 / 以避免混淆 | Redirect `/index.html` to `/` to avoid causing confusion | wtdcode |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5716) |
| 5709 | feat(net): 为出站连接实现 Happy Eyeballs (RFC 8305) | feat(net): implement Happy Eyeballs (RFC 8305) for outgoing connections | peer-cat |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5709) |
| 5699 | perf(extensions): 无需对每个条目执行 statSync 即可列出发现文件夹 | perf(extensions): list discover folders without per-entry statSync | tgies |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5699) |
| 5692 | 性能(plugin-loader): 无需对每个条目调用 statSync 来列出插件入口 | perf(plugin-loader): list plugin entries without per-entry statSync | tgies |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5692) |
| 5671 | 改进 TTS 提供商能力处理 | Improve TTS provider capability handling | TingTung93 | 是 | [PR](https://github.com/SillyTavern/SillyTavern/pull/5671) |
| 5651 | 自动对数字输入强制执行最小/最大约束以防止无效手动输入 | Automatically Enforce min/max Constraints on Number Inputs to Prevent Invalid Manual Entry | Wolfsblvt | 是 | [PR](https://github.com/SillyTavern/SillyTavern/pull/5651) |
| 5567 | 通过最新请求胜出的合并策略改进保存性能 | Improve save performance with latest-wins request coalescing | Roland4396 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5567) |
| 5426 | 改进屏幕阅读器标签和编辑器可访问性 | Improve screen reader labels and composer accessibility | astrope | 是 | [PR](https://github.com/SillyTavern/SillyTavern/pull/5426) |
| 5131 | 功能（性能）：优化插件系统加载和后台响应能力 | feat(perf): Optimize plugin system loading and backend responsiveness | GhostXia | 是 | [PR](https://github.com/SillyTavern/SillyTavern/pull/5131) |
| 4729 | 将 safe-area-inset-bottom 分配给 form-sheld 的 margin-bottom | Assign safe-area-inset-bottom to margin-bottom of form-sheld | Lykr |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/4729) |

## 安全

> 安全加固 / 鉴权 / 凭据（共 1 个）

| # | 中文标题 | 原标题 | 作者 | 草稿 | 链接 |
| --- | --- | --- | --- | --- | --- |
| 5553 | [WIP] 为密钥数据添加可选加密 | [WIP] Add optional encryption for secrets data | Cohee1207 | 是 | [PR](https://github.com/SillyTavern/SillyTavern/pull/5553) |

## 重构

> 代码重构 / 结构调整（共 2 个）

| # | 中文标题 | 原标题 | 作者 | 草稿 | 链接 |
| --- | --- | --- | --- | --- | --- |
| 5994 | 将纯工具函数移至新文件并添加测试（客户端代码） | Move pure utility functions into a new file and add tests (client-side code) | Christoph-D |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5994) |
| 5082 | WorldInfo 重构与 Aho-Corasick 匹配 | WorldInfo Refactor & Aho-Corasick Matching | lunarblazepony |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5082) |

## 文档

> 文档 / 说明（共 2 个）

| # | 中文标题 | 原标题 | 作者 | 草稿 | 链接 |
| --- | --- | --- | --- | --- | --- |
| 5856 | 记录自定义OpenAI兼容网关基础URL（DaoXE） | docs: note Custom OpenAI-compatible gateway base URL (DaoXE) | seven7763 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5856) |
| 5550 | i18n(zh-CN): 为文件夹、主题和近期提供商添加缺失的翻译 | i18n(zh-CN): add missing translations for folder, theme and recent providers | whtis |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5550) |

## 其他

> 杂项 / 构建 / CI / 依赖（共 5 个）

| # | 中文标题 | 原标题 | 作者 | 草稿 | 链接 |
| --- | --- | --- | --- | --- | --- |
| 5892 | chore: 同步 NanoGPT 提供商 | chore: Sync NanoGPT providers | DeathStalker471 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5892) |
| 5833 | 将 MiniMax 默认模型更新为 M3 | Update MiniMax default model to M3 | octo-patch |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5833) |
| 5747 | 更新 package lock 元数据 | Refresh package lock metadata | byungheon-jeong |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5747) |
| 5738 | 删除 package-lock.json | Delete package-lock.json | Spacer24 |  | [PR](https://github.com/SillyTavern/SillyTavern/pull/5738) |
| 5514 | 将 node-fetch 替换为原生 fetch API | fix\|refactor: replace node-fetch with native fetch api | CristianAUnisa | 是 | [PR](https://github.com/SillyTavern/SillyTavern/pull/5514) |

---

生成自 `scripts/upstream-pr-report.mjs`，标题译自上游 PR 原文，分类由模型推断，仅供参考。