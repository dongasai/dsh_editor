# 工作区文件编辑器（`@local/dsh-plugin-workspace-editor`）

DSH Web GUI 里，右侧栏的文件预览一直只能**看**：官方 `@deepseek-ai/dsh-client-ui-sidebar-documentpreview`
注册的 Markdown / 代码 / 图片 / PDF / Office / 表格渲染器全部只读，读文件的 Remote
命名空间 `@deepseek-ai/dsh-api-workspace-files` 也明确写着
*"The service exposes no mutation operation."*。这个插件补上**写**的那一半：
在同一个预览面板里给出可编辑的正文、保存按钮、未保存状态与冲突处理。


## 怎么用

1. 在右侧栏打开「文件」页（`Mod+P`），点开任意一个文本文件。
2. **默认就以编辑器打开的文件**：`.txt .text .log .json .jsonc .json5 .jsonl .ndjson
   .yaml .yml .toml .ini .cfg .conf .config .env .properties .lock`
   —— 官方对这些文件本来也只有只读纯文本/代码预览，所以直接给编辑器当默认视图。
3. **其它文本/代码文件**（`.md .ts .py .sh .html .css .sql .csv` …）：默认仍是官方的排版/
   高亮预览。要编辑，**点预览工具栏上的「✎ 编辑」按钮** —— 它会对当前文件在同一个面板里
   开一个编辑器页签（同一个文件只有一个，再点就是聚焦它）。也可以走**「打开方式」下拉**
   选「编辑器」，那是就地换渲染器，选择按标签页记住。
4. 改完点**「保存」**，或按 **Ctrl/Cmd+S**。

状态条会显示「已与磁盘同步 / 未保存的修改 / 保存中… / 已保存」；标题栏右侧是
「重新加载」（丢弃本地修改、重读磁盘）与「保存」。编辑器页签里多一个「换行：开/关」
（页签窄，默认开）。

> 「✎ 编辑」按钮开的是**页签**而不是就地切换渲染器：预览用哪个渲染器由文档预览自己的
> store 决定（`state.rendererId`），外部插件没有公开的写入入口；右侧栏的页签类型是公开的，
> 所以按钮走 `ctx.sidebarRight.openResource(address, { kind: 'workspace-editor' })`。
> 编辑器页签类型刻意声明了一个**命中不了任何真实地址**的 pattern，因此它永远不会参与
> 自动排名 —— 普通打开文件仍旧是官方预览，编辑器只在按钮/显式打开时出现。

### 数据不会悄悄丢

- **磁盘变了**（模型或别的工具改了同一个文件）：不会覆盖你正在编辑的内容，改为顶部横幅
  提示，让你选「加载磁盘版本」还是「继续编辑」。
- **保存时磁盘变过**：Host 的版本闸会拒绝，横幅里让你选「覆盖保存」或「加载磁盘版本」。
- **切到别的标签页、或关掉编辑器页签再打开**：未保存的草稿还在（草稿按
  `会话 + 路径` 缓存在浏览器内存里）。

## 结构

| 文件 | 作用 |
|---|---|
| `index.js` | **Host 半边**：注册 `POST /workspace-editor/write`，做信任围栏、路径围栏、沙箱策略、版本闸与原子写。只 import `node:` 内置模块。 |
| `client.js` | **浏览器半边**：两档文档渲染器 + 编辑器页签类型 + 预览头部的「编辑」按钮，共用同一份可编辑正文 `EditorSurface`。 |
| `cordis.patch.yml` | 只插入一行插件；浏览器半边由 `package.json` 的 `dsh.client` 声明，由 dsh-client-modules 扫出来。 |
| `package.json` | bundle 清单：`dsh.bundle.patch` + `dsh.client`。 |
| `locale/{zh,en}.json` | 插件卡片上的显示名与说明。 |
| `icon.svg` | 插件卡片图标。 |

浏览器半边占用的扩展点：

| 扩展点 | 注册物 |
|---|---|
| `ctx.documentPreviews.register` | `…/text`（`extension` 档，默认视图）、`…/text-option`（`builtin` 档，下拉备选） |
| `sidebar.right.tab.document` | 上面两个 id 的正文 |
| `ctx.sidebarRightTabs.register` | kind `workspace-editor`，id `…/tab`，pattern 命中不了真实地址 |
| `sidebar.right.pane.tab` | 该 id 的页签正文（编辑器） |
| `sidebar.right.tab.document.actions` | id `workspace-editor` 的「✎ 编辑」按钮 |


## 线上协议

请求：

```http
POST /workspace-editor/write
content-type: application/json

{
  "sessionId": "session-3",          // 用来定位会话工作区根与沙箱策略
  "path": "src/main.ts",             // 相对工作区根，或绝对路径
  "content": "…完整文件内容…",
  "expectedVersion": "…",            // 读到的版本；省略 = 无条件覆盖（用户点过「覆盖保存」）
  "mode": "replace"                  // 或 "create"（要求文件不存在）
}
```

成功（200）：`{ "ok": true, "path": "/abs/path", "operation": "create" | "update", "version": "…", "bytes": 123 }`

失败：`{ "code": "…", "message": "…", "fsCode": "…" }`，HTTP 状态按码给出：

| code | HTTP | 含义 |
|---|---|---|
| `bad-request` | 400 | 请求体不是 JSON 对象、字段类型不对 |
| `outside-workspace` | 403 | 目标不在该会话的工作区内（含符号链接绕行） |
| `denied` | 403 | 会话沙箱策略拒绝（`read-only` 会话、部署默认 `workspace-write` 之外的路径） |
| `unknown-session` | 404 | 这个 Host 既不认识活会话，也没有它的存档头 |
| `not-found` | 404 | 目标不存在（`create` 之外的模式） |
| `stale-version` | 409 | 磁盘上的文件在编辑期间变过（含「文件已被删除」）——UI 会提示「覆盖保存」 |
| `not-observed` | 409 | `create` 模式下文件已存在 |
| `not-regular-file` | 409 | 目标是目录、符号链接等非普通文件 |
| `too-large` | 413 | 请求体或内容超限 |
| `unsupported-media-type` | 415 | 不是 `application/json` |
| `aborted` | 408 | 客户端断开或超过 30s 墙钟上限 |
| `write-failed` / `io-error` | 500 | 其它文件系统故障（原始信息在 `message`） |

## 安全模型（三道闸 + 一道版本闸）

1. **信任围栏**：每个请求先过 `ctx.connection.requestRejection(req)` —— 不可信 Host/Origin
   直接 403，浏览器没认证就是 401。非本机认证页面发不进来。
2. **路径围栏**：目标解析后必须落在**该会话的工作区根**之内
   （`ctx.fs.contains(会话根, 目标)`），并且最终节点不能是符号链接（`lstat` 检查），
   想借软链写穿出去会被 403 挡住。
3. **沙箱策略围栏**：写入显式带上 `ctx.sandboxPolicy.resolve({ session })`，
   由组合文件系统 `ctx.fs` 再判一次（`read-only` 会话一律拒绝，`workspace-write` 只放行
   工作区内与平台临时区）。
4. **版本闸**：`expectedVersion` 走 `FsWriteIntent.replaceIfVersion`
   （或 `createIfAbsent`），写入是原子的；版本不符就 `FS_STALE_VERSION`，绝不静默覆盖。

边界说明：**这不是**内核级隔离。DSH 的文件沙箱本身是"可信代码对不可信路径"的包含性检查
（官方注释原话：*containment, not a security boundary*），本插件与官方 Agent 的 `write`
工具站在同一层能力上，没有引入更宽的口子；能访问到这个 Host 端口的本机用户，本来就能让
Agent 写文件。

## 与 Agent 的关系

- 插件**不**给模型加任何工具：Agent 自己的 `read` / `edit` / `write` 工具足以改文件，
  再加一个同名工具只会污染工具表。
- 插件**不**伪造文件观察状态（不 `emit('fs/observed', …)`）。人在 GUI 里改过的文件，
  对模型来说就是"没读过"——模型应当重新 `read` 之后再 `edit`，这是正确且更安全的语义。

## 已知限制

- 只处理 **UTF-8 文本**：非 UTF-8、含 NUL 或超过 1 MiB 的文件会显示说明而不给编辑
  （HTTP 侧上限是 4 MiB 内容 / 8 MiB 请求体）。
- 没有语法高亮、行号、查找替换、多文件、新建文件入口——目前只解决"能改、能存、
  不丢、不覆盖"。
- 没有扩展名的文件（`Makefile`、`LICENSE`）匹配不到任何渲染器，默认视图仍是官方只读
  纯文本；但只要它能在预览里显示 Host 路径，「✎ 编辑」按钮就在，点一下照样能编辑。
- 「✎ 编辑」按钮开的是**编辑器页签**（与预览并列），不能把预览就地换成编辑器 ——
  后者的开关在文档预览自己的 store 里，外部插件没有公开入口。
- 文件树本身仍然只读（不改官方 `ui-sidebar-files`），改名/删除/新建仍走终端或 Agent。

## 怎么验证

**浏览器侧（唯一的完整验证路径）**：

1. `.json` / `.yaml` / `.txt` 默认就是编辑器：底部状态条显示「已与磁盘同步」，改一个字变
   「未保存的修改」且「保存」变品牌色，点「保存」或 Ctrl/Cmd+S 变「已保存」，磁盘同步变化。
2. 打开一个 `.md` 或 `.ts`（默认是官方预览），点工具栏上的**「✎ 编辑」** —— 同一个面板里
   应出现一个标题为「编辑 main.ts」的页签，正文是可编辑文本；再点一次按钮只会聚焦它，
   不会开出第二个。
3. 编辑器页签里点「换行：开/关」应在自动换行与横向滚动间切换。

命令行能覆盖的部分（已在本机实测）：

| 检查 | 结果 |
|---|---|
| Loader 行激活 | `list_plugins` → `include:workspace-editor` / `enabled: true` / `fiberPhase: active`（`apply()` 跑完、7 个注入服务都在） |
| 渲染器注册 | Client `Slots.listSubTree` on `sidebar.right.tab.document` → occupants 里出现 `@local/dsh-plugin-workspace-editor/text` 与 `.../text-option`，`active: true` |
| 编辑器页签注册 | `Slots.listSubTree` on `sidebar.right.pane.tab` → occupants 里出现 `@local/dsh-plugin-workspace-editor/tab`，`active: true` |
| 「编辑」按钮注册 | `Slots.listSubTree` on `sidebar.right.tab.document.actions` → occupants 里出现 `{id: workspace-editor, order: 5}`，`active: true` |
| 页签类型注册 | 按钮的注册在 `ctx.sidebarRightTabs.register(...)` **之后**执行且成功 ⇒ 类型注册没抛错（同一 `apply` 内） |
| 信任围栏 | 无认证的 `POST /workspace-editor/write` 被拒（403），不会落到 SPA fallback |

**注意 curl 的坑**：本 profile 装了 `@xgone/dsh-remote`，它会**猴补 `ctx.webServer.register`**，
给它之后注册的每条路由都套一层自己的会话门禁（`wrapHttp`）。所以从 shell 里 curl 这条路由，
先撞上的是它（返回 `{"ok":false,"error":"unauthorized"}`），拿不到「路由存在与否」的信息 ——
要么带上它自己的登录 cookie，要么就按上面在页面里点。浏览器本来就带着它的会话，不受影响；
它放行后还会替请求补上核心的浏览器 cookie，再由插件自己的 `requestRejection` 判一次。

**UI 与交互**（按钮点下去开不开页签、状态条、两处横幅、页签怎么排布）只能在浏览器里看，
本仓库没有前端测试环境，这一层没法用命令行替代验证。
