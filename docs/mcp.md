# InkQuest 只读 MCP

公开故事目录的远程 MCP 服务，传输为 Streamable HTTP，地址是 `https://inkquest.dev/api/mcp`。无登录、不生成故事、不改计费。只返回内置免费目录：故事卡片、免费开场、以及 `https://inkquest.dev/stories/{id}` 链接。付费节点和用户生成的故事不会从这个接口出去。

工具：

| 工具 | 作用 |
| --- | --- |
| `list_stories` | 按 `target_language`（`zh`/`en`）、`hsk_level`、`genre` 列出公开故事 |
| `get_story_opening` | 返回某个公开故事的免费开场正文、拼音或读音、释义和选项 |
| `recommend_story` | 按 HSK 和题材从公开目录里挑最多 3 个，并给出理由和链接 |

注册表元数据在仓库根目录的 `server.json`。命名空间是 `dev.inkquest/inkquest`（`inkquest.dev` 的反向域名）。

## 本地测试

只启动网站，不必启动生成 Worker：

```bash
pnpm install
pnpm dev:web
```

另一个终端：

```bash
pnpm check:mcp
```

脚本会请求 `http://127.0.0.1:3000/api/mcp`，依次检查 `initialize`、`notifications/initialized`、`ping`、`tools/list` 和三次 `tools/call`。可用 `MCP_BASE_URL` 改地址。

用 curl 看开场（`Accept` 必须同时包含 `application/json` 和 `text/event-stream`）：

```bash
curl -sS http://127.0.0.1:3000/api/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"1.0.0"}}}'

curl -sS http://127.0.0.1:3000/api/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'mcp-protocol-version: 2025-11-25' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_stories","arguments":{"target_language":"zh","hsk_level":3}}}'
```

MCP Inspector：

```bash
npx @modelcontextprotocol/inspector
```

传输选 Streamable HTTP，URL 填 `http://127.0.0.1:3000/api/mcp`。本服务是无状态的：不要依赖 `Mcp-Session-Id`，GET 会返回 405（不提供单独的 SSE 流）。

要顺手验证域名证明文件，启动前加上公开记录（这不是私钥）：

```bash
MCP_REGISTRY_AUTH='v=MCPv1; k=ed25519; p=你的公钥base64' pnpm dev:web
EXPECT_REGISTRY_AUTH=1 pnpm check:mcp
```

未设置时 `GET /.well-known/mcp-registry-auth` 返回 404。

## 部署

和现在的网站一起部署，不要单独发 MCP 进程。合并到 `main` 后，现有的 Cloudflare / OpenNext 流程会带上 `/api/mcp`。确认生产环境已经能回答再去注册表发布：

```bash
curl -sS https://inkquest.dev/api/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"1.0.0"}}}'
```

本仓库不会在这里替你部署或发布。

## 发布到官方 MCP Registry

Registry 还在 preview。schema 使用 `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`。`description` 最长 100 个字符。远程地址必须已经是公网可访问的 `https://inkquest.dev/api/mcp`。

### 1. 安装 mcp-publisher

```bash
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher
sudo mv mcp-publisher /usr/local/bin/
mcp-publisher --help
```

macOS 也可用 `brew install mcp-publisher`。

### 2. 域名 HTTP 验证（推荐，命名空间 `dev.inkquest/inkquest`）

在自己的机器上生成密钥。**不要把私钥提交到 git。** `*.pem` 和仓库根目录的 `mcp-registry-auth` 已被忽略。Ed25519 需要 OpenSSL 3；macOS 自带的 LibreSSL 不行，请用 Homebrew 的 `openssl@3`。

```bash
openssl genpkey -algorithm Ed25519 -out key.pem

PUBLIC_KEY="$(openssl pkey -in key.pem -pubout -outform DER | tail -c 32 | base64)"
echo "v=MCPv1; k=ed25519; p=${PUBLIC_KEY}"
```

把这一整行（只有公钥）设到 Cloudflare Worker，不要设进 `NEXT_PUBLIC_` 变量，也不要把 `key.pem` 放进仓库或 CI 日志：

```bash
npx wrangler secret put MCP_REGISTRY_AUTH
```

提示时粘贴 `v=MCPv1; k=ed25519; p=...`。路由 `/.well-known/mcp-registry-auth` 在请求时读取这个变量。确认：

```bash
curl -sS https://inkquest.dev/.well-known/mcp-registry-auth
```

输出应与上面那一行一致（末尾可以有一个换行）。然后在仓库根目录登录并发布。`--domain` 是 `inkquest.dev`，不是反向域名：

```bash
PRIVATE_KEY="$(openssl pkey -in key.pem -noout -text | grep -A3 "priv:" | tail -n +2 | tr -d ' :\n')"
mcp-publisher login http --domain inkquest.dev --private-key "${PRIVATE_KEY}"
mcp-publisher validate
mcp-publisher publish
```

`login` 成功后私钥只留在本机。发布完成后可以删掉 shell 历史里的 `PRIVATE_KEY`。校验发布结果：

```bash
curl -sS "https://registry.modelcontextprotocol.io/v0.1/servers?search=dev.inkquest/inkquest"
```

更新已发布的版本时，先改 `server.json` 的 `version`（注册表不接受重复版本），再执行 `mcp-publisher publish`。

### 3. 备用：GitHub 登录

如果暂时不做域名验证，把 `server.json` 的 `name` 改成 `io.github.serendipityApe/inkquest`，然后：

```bash
mcp-publisher login github
mcp-publisher validate
mcp-publisher publish
```

浏览器设备码登录的 GitHub 账号必须是 `serendipityApe`。组织命名空间还要求该账号是组织 Owner。域名验证就绪后，可以改回 `dev.inkquest/inkquest` 并用 HTTP 登录再发一版。

## 接到 Claude Desktop / Cursor

生产地址（本地把 URL 换成 `http://127.0.0.1:3000/api/mcp`）：

Claude Desktop 的 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "inkquest": {
      "url": "https://inkquest.dev/api/mcp"
    }
  }
}
```

Cursor 的 MCP 配置（Settings → MCP，或 `~/.cursor/mcp.json`）：

```json
{
  "mcpServers": {
    "inkquest": {
      "url": "https://inkquest.dev/api/mcp"
    }
  }
}
```

不需要 API key。客户端应使用 Streamable HTTP。调用 `get_story_opening` 之后，用返回的 `url` 打开网站继续读，不要指望这里给出后续付费场景。

## 限制

- 请求体上限 16KB，工具参数嵌套元素上限 32。超限返回 413 或工具错误。
- 每个 IP 在单个 Worker isolate 内大约每分钟 90 次。这只是廉价的隔离层，真正的边缘限流仍应在 Cloudflare 上配置。
- `Host` 只接受 `inkquest.dev`、`www.inkquest.dev` 和本机地址。
- 开场结果按故事 id 缓存在内存里。目录本身就是进程内数据，没有额外的远程缓存。
