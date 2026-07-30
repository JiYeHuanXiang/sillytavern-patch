# OneBot 群聊桥接

让兼容 OneBot 11 协议的骰子机器人（海豹 Dice/sealdice、Lagrange.OneBot、go-cqhttp 等）作为群聊成员加入 SillyTavern 群聊，与 AI NPC 同群互动、掷骰、跑团。

## 特点

- **安全不封号**：全程在酒馆内部模拟 OneBot 协议环境，不接触真实 QQ 网络。
- **三种连接方式**：反向 WebSocket、正向 WebSocket、HTTP API，兼容主流骰子软件。
- **可配置 AI 触发**：骰子发言后可选择是否自动触发 AI NPC 反应，或仅匹配特定指令前缀时触发。
- **无缝群聊**：骰子作为普通群成员发言，与 AI NPC 共享同一对话上下文。

## 架构

```
酒馆群聊 (AI NPC + 骰子)  ←→  前端扩展  ←→  服务端插件  ←→  骰子机器人 (OneBot)
```

- **服务端插件** `plugins/onebot-bridge/index.mjs`：模拟 OneBot 11 平台，处理三种连接方式与报文转换。
- **前端扩展** `public/scripts/extensions/third-party/onebot-bridge/`：桥接群聊消息，骰子发言注入，设置面板。

## 安装

本扩展随酒馆一起内置，无需额外下载。需确保 `config.yaml` 中：

```yaml
enableServerPlugins: true
```

> 反向 WebSocket 模式（推荐）依赖服务端插件监听端口，必须启用上面这项。
> 正向 WebSocket / HTTP API 模式仅需酒馆前端扩展，但功能较受限。

## 配置步骤

### 1. 在酒馆中

1. 打开酒馆 → 扩展设置面板（魔棒图标）→ 找到「OneBot 群聊桥接」
2. 选择连接方式（默认反向 WebSocket）
3. 记下面板里显示的接入地址，例如 `ws://<酒馆IP>:8081/onebot/v11/ws`
4. 勾选「启用桥接」
5. 填写「骰子角色名」（建议先在角色卡里建一个同名角色，这样发言有头像）

### 2. 在骰子软件中

根据选择的连接方式，在骰子软件的 OneBot 连接配置里填写：

#### 反向 WebSocket（推荐，最简单）
骰子软件添加一个「反向 WS」连接，地址填酒馆显示的 `ws://<酒馆IP>:8081/onebot/v11/ws`。

#### 正向 WebSocket
骰子软件开一个正向 WS 服务端（如 `ws://127.0.0.1:6700`），酒馆面板里填这个地址。

#### HTTP API
骰子软件开 HTTP API（如 `http://127.0.0.1:5700`），酒馆面板里填；骰子上报 webhook 填酒馆显示的 `<酒馆IP>:<端口>/api/plugins/onebot-bridge/webhook`。

### 3. 创建群聊并使用

1. 在酒馆创建一个群聊，把 AI NPC 角色加入
2. 群里发消息，骰子就能收到并掷骰
3. 骰子的掷骰结果会作为群消息显示在酒馆群里
4. （可选）开启「骰子发言后自动触发 AI 生成」，让 NPC 对掷骰结果即时反应

## AI 触发说明

- **自动触发（默认关）**：开启后，骰子每次发言都会触发 AI NPC 生成一轮回复，沉浸感强但消耗大。
- **指令前缀触发**：在「强制触发前缀」里填指令（如 `/ask,.ask,.gen`），骰子消息以这些前缀开头时无视开关强制触发 AI。默认 `/ask,.ask,.gen`。

## OneBot 协议兼容性

桥接层实现了 OneBot 11 核心子集：

- **事件推送**：`post_type:message` / `message_type:group`，含 `message` 段数组、`raw_message`、`sender`、`user_id`、`group_id`、`self_id`
- **API 响应**：`send_group_msg` / `send_msg`（解析消息文本并推给酒馆群聊）、`get_login_info`、`get_group_list`、`get_group_member_list`、`get_friend_list` 等
- **UIN 伪装**：角色名通过稳定 hash 映射为伪 QQ 号，骰子可正常 @、掷骰，不接触真实 QQ

## 文件清单

| 文件 | 作用 |
|------|------|
| `plugins/onebot-bridge/index.mjs` | 服务端插件：WS 服务端/客户端、HTTP、SSE、OneBot 报文转换 |
| `public/scripts/extensions/third-party/onebot-bridge/manifest.json` | 前端扩展清单 |
| `public/scripts/extensions/third-party/onebot-bridge/index.js` | 前端扩展：消息桥接、群聊注入、设置面板 |
| `public/scripts/extensions/third-party/onebot-bridge/style.css` | 样式 |

## 故障排查

- **服务端插件没加载**：检查 `config.yaml` 的 `enableServerPlugins: true`，重启酒馆，看启动日志是否有「[onebot-bridge] server plugin initialized」。
- **扩展面板没出现**：扩展管理里确认「OneBot 群聊桥接」已启用（不是禁用）。
- **骰子连不上**：确认端口未被占用、防火墙放行；反向 WS 地址路径要完整含 `/onebot/v11/ws`。
- **骰子发言没出现在群里**：确认当前打开的是群聊（不是单聊），桥接只在群聊中注入。
- **无限循环**：防递归已内置，骰子发言不会再回推给骰子；若仍异常请检查骰子角色名是否和某 NPC 重名。
