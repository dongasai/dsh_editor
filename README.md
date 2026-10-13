# @dongasai/dsh-editor

在 DSH Web GUI 的右侧栏里**直接把工作区文件改掉**：官方文档预览注册的 Markdown / 代码 /
图片 / PDF / Office 渲染器全部只读，读文件的 Remote 命名空间
`@deepseek-ai/dsh-api-workspace-files` 也明确写着 *"The service exposes no mutation operation."*，
这个插件补上**写**的那一半 —— 可编辑的正文、保存按钮、未保存状态与冲突处理，外加一条
只服务于它的 Host 写路由。

与「用终端 / 让 Agent 改」的差别不是快慢，而是**谁在改**：人在 GUI 里改完点保存，
版本闸记得住「你读到的是哪一版」，磁盘中途被模型改过就停下来问，不静默覆盖。

- **怎么用插件** → 本文件（安装、怎么进编辑器、线上协议、排错、已知边界）。
- **为什么这么实现** → [IMPLEMENTATION.md](IMPLEMENTATION.md)（设计决策、两半怎么拼起来、
  四条实现约束的来龙去脉）。

## 快速开始

两步：装插件 → 在右侧栏打开一个文件。

### 1. 装插件

三种装法，按场景选。**都走同一条 pnpm 路径**（`@deepseek-ai/dsh-plugin-manager/operations`，
共用一把 profile 写锁），装完都会出现在侧栏「插件」页的**已安装**列表里。

**都不需要手写注册行**：本包在 `package.json` 里声明了 `dsh.bundle.patch`，只要这个 bundle
被选中，生效的那一行就来自本包自带的 [cordis.patch.yml](cordis.patch.yml)。命令行（方式二、
三）安装会顺带把它选进 `dsh.profile.bundles`；Web 上（方式一）是装完点 **立即启用**才选中 ——
不点就只是「装着但没启用」。

本包 `private: true`、未发布到 npm，所以没有「按包名从 registry 装」这条路：spec 要么是本地
路径，要么是 git 地址。

#### 方式一：Web 界面（推荐）

DSH Web → 左侧栏**插件** → **添加插件** → 填入本仓库绝对路径 `/data/ai/dsh/dsh_editor`
（或下面的 git 地址）→ **安装** → 装完点**立即启用**。

- 「添加插件」接受：包名（可带版本）、Git 地址、压缩包、**本地绝对路径**。
- 装完不点**立即启用**，就只是「装着但没启用」。
- 侧栏这个「插件」页才能装和开关；**设置 → 内置插件**里的清单是只读的。
- 填 git 地址时若 GitHub 连不上，界面会提示**无法访问 GitHub** 并给出改用国内镜像的选项
  （镜像只提供注册表里的包与依赖，不代替 GitHub 仓库下载）。

#### 方式二：命令行 · git 源（分发）

```bash
dsh plugin --profile web add github:dongasai/dsh_editor
# 或
dsh plugin --profile web add git+https://github.com/dongasai/dsh_editor.git
```

`dsh plugin --profile <name> <pnpm args>` 把参数转发给该 profile 目录里的 pnpm。装进来的是
**副本**：之后改本仓库代码不影响已装的副本（想边改边用就走方式三）。

- `--profile` **必填**（不写直接报 `required option '--profile <name> not specified'`）；
  `web` 换成你要装进的 profile。
- **钉版本**：URL 后加 `#`，例如
  `git+https://github.com/dongasai/dsh_editor.git#v1.0.0`（tag / 分支 / commit 都行）。
- **私有仓库**：`git+ssh://git@github.com/dongasai/dsh_editor.git`（需已配好 SSH key），
  或先把 HTTPS 凭据配好。
- **必须带 `git+` 或 `github:` 前缀**。`git@github.com:owner/repo.git` 这种 scp 写法不会被认成
  git spec，pnpm 会把它当路径，装出一条指向不存在目录的 `link:` 死链（本机 profile 里就留着一条
  这样的残留：依赖名 `git` → `link:github.com:yangshen830-eng/dsh-editor.git`，`node_modules/git`
  是断链）。CLI 识别 git spec 的判定也是这个：`/^git\+|^github:|\.git(?:#|$)/`。
- pnpm 默认会拦 `prepare` 等依赖构建脚本；本包**没有任何构建步骤**（`client.js` 是手写的浏览器
  bundle，由 Host 直接读盘发出），不会遇到。
- git / tarball 这类 spec 要先 fetch 才知道 peer 范围，所以 DSH 版本兼容判定发生在**安装之后**；
  判定不兼容会回滚 `package.json` 与 `pnpm-lock.yaml` 并打印 `allow-version` 命令。本包没有声明
  任何 DSH peer 依赖，不会触发。

#### 方式三：命令行 · 本地目录（link，开发）

```bash
dsh plugin --profile web add link:/data/ai/dsh/dsh_editor
```

装成 `link:` 依赖，代码改动立刻是「已装的那份」—— 适合边改插件边用。

- 改 **Host 半边**（`index.js`）：要重启 Harness 才生效（见「已知边界」）。
- 改 **浏览器半边**（`client.js`）：刷新页面即可（bundle 每次请求都从磁盘现读，
  按内容 revision 换 URL），不需要重启。

#### 装完确认

`Config.listConfigs`（`name: "@dongasai/dsh-editor"`）里能看到行、且 `enabled` 为真，即已生效。
再新开一个会话（或重启 Harness）让插件加载，然后按第 2 步在右侧栏验证。

### 2. 在右侧栏用起来

1. 打开右侧栏的「文件」页，点开任意一个文本文件。
2. **默认就以编辑器打开的文件**：`.txt .text .log .json .jsonc .json5 .jsonl .ndjson
   .yaml .yml .toml .ini .cfg .conf .config .env .properties .lock`
   —— 官方对这些文件本来也只有只读纯文本 / 代码预览，没有不可替代的能力，所以直接给编辑器
   当默认视图，点开就能改。
3. **其它文本 / 代码文件**（`.md .ts .py .sh .html .css .sql .csv` …）：默认仍是官方的排版 /
   高亮预览。要编辑，**点预览工具栏上的「✎ 编辑」按钮** —— 它用编辑器页签**顶掉**这张预览
   页签（同一个面板、同一个位置）；该文件的编辑器页签已经开着时只聚焦它。也可以走
   **「打开方式」下拉**选「编辑器」，那是就地换渲染器，选择按标签页记住。
4. 改完点**「保存」**，或按 **Ctrl/Cmd+S**。

### 3. 确认它真的在工作

改一个字，底部状态条应当从「已与磁盘同步」变成「未保存的修改」并且「保存」按钮变成品牌色；
点保存后变「已保存」，用 `cat` / `git diff` 看磁盘，内容确实变了。看不到编辑器时按「排错」表逐条对。

## 编辑器长什么样

状态条会显示「已与磁盘同步 / 未保存的修改 / 保存中… / 已保存」；标题栏右侧是「重新加载」
（丢弃本地修改、重读磁盘）与「保存」。编辑器页签里多一个「换行：开 / 关」（页签窄，默认开）。

> 「✎ 编辑」按钮换的是**页签**而不是就地切换渲染器：预览用哪个渲染器由文档预览自己的
> store 决定（`state.rendererId`），外部插件没有公开的写入入口；右侧栏的页签类型是公开的，
> 所以按钮走 `ctx.sidebarRight.openResource(address, { kind: 'workspace-editor', replaceTab })`。
> 想回预览：从文件树再点一次该文件（会开新的预览页签）。
> 编辑器页签类型刻意声明了一个**命中不了任何真实地址**的 pattern，因此它永远不会参与
> 自动排名 —— 普通打开文件仍旧是官方预览，编辑器只在按钮 / 显式打开时出现。

### 数据不会悄悄丢

- **磁盘变了**（模型或别的工具改了同一个文件）：不会覆盖你正在编辑的内容，改为顶部横幅
  提示，让你选「加载磁盘版本」还是「继续编辑」。
- **保存时磁盘变过**：Host 的版本闸会拒绝，横幅里让你选「覆盖保存」或「加载磁盘版本」。
- **切到别的标签页、或关掉编辑器页签再打开**：未保存的草稿还在（草稿按
  `会话 + 路径` 缓存在浏览器内存里）。
- **读盘临时失败**：已经显示着正文时只挂一条提示，不把正文擦掉（磁盘抽风不该毁掉草稿）。

## 结构

| 文件 | 作用 |
|---|---|
| [index.js](index.js) | **Host 半边**：注册 `POST /workspace-editor/write`，做信任围栏、路径围栏、沙箱策略、版本闸与原子写。只 import `node:` 内置模块。 |
| [client.js](client.js) | **浏览器半边**：两档文档渲染器 + 编辑器页签类型 + 预览头部的「编辑」按钮，共用同一份可编辑正文 `EditorSurface`。 |
| [cordis.patch.yml](cordis.patch.yml) | 只插入一行插件；浏览器半边由 `package.json` 的 `dsh.client` 声明，由 dsh-client-modules 扫出来。 |
| [package.json](package.json) | bundle 清单：`dsh.bundle.patch` + `dsh.client`。 |
| [locale/{zh,en}.json](locale/zh.json) | 插件卡片上的显示名与说明。 |
| [icon.svg](icon.svg) | 插件卡片图标。 |

Host 半边 `inject`：`webServer` / `connection` / `fs` / `sandboxPolicy` / `sessions`
（`sessionPersistence` 用 `ctx.get()` 可选取，冷会话才需要）。

浏览器半边占用的扩展点：

| 扩展点 | 注册物 |
|---|---|
| `ctx.documentPreviews.register` | `@dongasai/dsh-editor/text`（`extension` 档，默认视图）、`@dongasai/dsh-editor/text-option`（`builtin` 档，下拉备选） |
| `sidebar.right.tab.document` | 上面两个 id 的正文 |
| `ctx.sidebarRightTabs.register` | kind `workspace-editor`，id `@dongasai/dsh-editor/tab`，pattern 命中不了真实地址 |
| `sidebar.right.pane.tab` | 该 id 的页签正文（编辑器） |
| `sidebar.right.tab.document.actions` | id `workspace-editor`、`order: 5` 的「✎ 编辑」按钮 |

## 哪些文件能进编辑器

| 档位 | `priority` | 扩展名 | 打开方式 |
|---|---|---|---|
| 默认 | `extension` | `.txt .text .log .json .jsonc .json5 .jsonl .ndjson .yaml .yml .toml .ini .cfg .conf .config .env .properties .lock` | 从文件树点开就是编辑器 |
| 可选 | `builtin` | 代码 / 文档 / 标记 / 表格类（`.md .ts .py .sh .html .css .sql .csv` 等，见 `client.js` 的 `OPTIONAL_EXTENSIONS`） | 只在「打开方式」下拉里出现，不抢默认 |
| 兜底 | — | 能在预览里显示出正文与 Host 路径的文本文件（预览的「不支持此文件」分支里没有这个按钮） | 点工具栏上的「✎ 编辑」按钮 |

`priority` 是**档位**而不是排序分值：`extension` 档按扩展名声明就能当默认，`builtin` 档只
作为显式备选。

**没有扩展名的文件（`Makefile`、`LICENSE`）进不了编辑器**：官方预览匹配不到渲染器时会走它的
「不支持此文件」分支，那个分支**不渲染 `sidebar.right.tab.document.actions` 槽位**，所以
「✎ 编辑」按钮根本不出现。想编辑就给文件名加个扩展名，或从「打开方式」下拉里选（前提是它
至少能匹配到可选档）。

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
| `bad-request` | 400 | 请求体不是 JSON 对象、字段类型不对（`sessionId` / `path` 必须是非空字符串，`content` 必须是字符串） |
| `outside-workspace` | 403 | 目标不在该会话的工作区内 |
| `denied` | 403 | 会话沙箱策略拒绝（`read-only` 会话、部署默认 `workspace-write` 之外的路径） |
| `unknown-session` | 404 | 这个 Host 既不认识活会话，也没有它的存档头 |
| `not-found` | 404 | 目标不存在（`create` 之外的模式） |
| `stale-version` | 409 | 磁盘上的文件在编辑期间变过（含「文件已被删除」）——UI 会提示「覆盖保存」 |
| `not-observed` | 409 | `create` 模式下文件已存在 |
| `not-regular-file` | 409 | 目标是目录、符号链接等非普通文件 |
| `not-directory` | 409 | 路径中间的一段不是目录 |
| `too-large` | 413 | 请求体（8 MiB）或内容（4 MiB 字符）超限 |
| `unsupported-media-type` | 415 | 不是 `application/json` |
| `not-text` | 415 | 底层文件系统策略判定不是文本（本插件读盘走 `readBytes`，**不做**文本判定，所以这一条只在底层拒绝时出现；非 UTF-8 / 含 NUL 的文件通常由浏览器侧的 `TextDecoder` 先判掉，见「已知边界」） |
| `aborted` | 408 | 客户端断开或超过 30s 墙钟上限 |
| `write-failed` / `io-error` | 500 | 其它文件系统故障（原始信息在 `message`） |

其它方法一律 `405` 并带 `allow: POST`；所有应答都带 `cache-control: no-store`。

`fsCode` 只在失败源自底层文件系统时出现（`FS_STALE_VERSION` 这类原始码），排查时看它比看
`message` 稳。

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

边界说明：**这不是**内核级隔离。DSH 的文件沙箱本身是「可信代码对不可信路径」的包含性检查
（官方注释原话：*containment, not a security boundary*），本插件与官方 Agent 的 `write`
工具站在同一层能力上，没有引入更宽的口子；能访问到这个 Host 端口的本机用户，本来就能让
Agent 写文件。

## 与 Agent 的关系

- 插件**不**给模型加任何工具：Agent 自己的 `read` / `edit` / `write` 工具足以改文件，
  再加一个同名工具只会污染工具表。
- 插件**不**伪造文件观察状态（不 `emit('fs/observed', …)`，也不用 `replaceIfVersion` 去
  「补」一次观察）。人在 GUI 里改过的文件，对模型来说就是「没读过」—— 模型应当重新 `read`
  之后再 `edit`，这是正确且更安全的语义。
- 反向的一条：人在编辑器里保存后，Agent 那边基于旧内容发起的 `edit` 会照常撞上版本不符，
  不会把人的修改冲掉。

## 排错

浏览器侧的现象先看**状态条**与**横幅文案**（它们直接对应下表的码）；Host 侧的现象看 Harness
日志里那条 `500 write-failed`。

| 症状 | 原因 | 处置 |
|---|---|---|
| 打开文件只有只读预览，没有「✎ 编辑」按钮 | 该文件没匹配到任何渲染器，预览头部的 actions 槽位没挂上（没有扩展名的文件是典型） | 换文件名加扩展名，或从「打开方式」下拉选「编辑器」 |
| 「打开方式」下拉里没有「编辑器」 | 该扩展名不在 `OPTIONAL_EXTENSIONS` 里 | 直接点「✎ 编辑」按钮；要长期支持就在 `client.js` 里加扩展名 |
| 状态条一直是「读取中…」然后转成读取失败 | 该会话 / 路径读不出来（文件被删、权限、不是文本） | 文案里有 Host 的原始说明；不是 UTF-8、含 NUL 或超过 1 MiB 的文件本来就只能只读看 |
| 保存后横幅说「磁盘上的文件在编辑期间变过」 | 版本闸生效：内容被模型或别的工具改过 | 选「加载磁盘版本」看对方改了什么，或确认要覆盖再点「覆盖保存」 |
| 保存时提示「文件已存在，没有覆盖」 | 走的是 `create` 模式（新建语义） | 这是刻意的：新建入口不会覆盖同名文件 |
| 保存报「保存请求没有到达 Host」 | 请求根本没到（网络 / 页面 / 反向代理） | 内容还在编辑器里，重试即可；连着必现就看代理是否拦了 `/workspace-editor/write` |
| 保存报 403 `outside-workspace` | 目标不在**该会话**的工作区根内（多根工作区里点开了别的根） | 确认文件属于当前会话的工作区 |
| 保存报 403 `denied` | 会话是 `read-only` 沙箱 | 换可写会话，或改会话的沙箱策略 |
| 保存报 404 `unknown-session` | 会话已经被这个 Host 忘掉（换了 Harness 实例、存档已清） | 重开会话再编辑 |
| 保存报 413 | 内容超过 4 MiB 字符 / 请求体超过 8 MiB | 用别的工具改大文件 |
| 从 shell 里 curl 这条路由拿到 `{"ok":false,"error":"unauthorized"}` | **不是插件的错**：本 profile 装了 `@xgone/dsh-remote`，它**猴补 `ctx.webServer.register`**，给之后注册的每条路由套一层自己的会话门禁（`wrapHttp`），先撞上的是它 | 带上它自己的登录 cookie，或按「怎么验证」在页面里点；浏览器本来就带着它的会话，不受影响 |
| plugin 行是 `enabled: true` 但页面里什么都没变 | 浏览器 bundle 是上一次加载的 | 刷新页面（`link:` 安装时 `client.js` 每次从磁盘现读）；Host 半边改了则要重启 Harness |
| 改了 `index.js` 不生效 | Host 半边不在 HMR 监视集内，ESM 模块缓存按解析后的 URL 命中 | **重启 Harness**（禁用 / 启用插件不够） |

## 怎么验证

### 命令行能覆盖的部分

**静态自检**：

| 检查 | 命令 | 期望 |
|---|---|---|
| Host 半边语法 | `node --check index.js` | 退出码 0 |
| 浏览器半边语法 | `node --check client.js` | 退出码 0 |

**运行时注册**走 Cordis 检视工具：先 `cordis_inspect_list` 看这台 Host 上有哪些 provider，再用
`cordis_inspect_query({ platform, provider, method, input })` 查（provider / method 名字必须
来自 `cordis_inspect_list` 的结果，别猜）。

| 检查 | 手段 | 期望 |
|---|---|---|
| Loader 行激活 | Host provider `Config`.`listConfigs`，`{ name: "@dongasai/dsh-editor" }`（或按 id `workspace-editor`） | 目录里出现该 entry 且 Config 正常 —— 即 `apply()` 跑完（`cordis.patch.yml` 插的是 `id: workspace-editor` / `name: '@dongasai/dsh-editor'`） |
| 渲染器注册 + 正文 | Client provider `Slots`.`listSubTree`，`root: sidebar.right.tab.document` | occupants 里出现 `@dongasai/dsh-editor/text` 与 `.../text-option`，`active: true` |
| 编辑器页签注册 + 正文 | 同上，`root: sidebar.right.pane.tab` | occupants 里出现 `@dongasai/dsh-editor/tab`，`active: true` |
| 「编辑」按钮注册 | 同上，`root: sidebar.right.tab.document.actions` | occupants 里出现 `{ id: workspace-editor, order: 5 }`，`active: true` |
| 页签类型注册 | 「编辑」按钮的注册在 `ctx.sidebarRightTabs.register(...)` **之后**执行且成功 | 类型注册没抛错（同一 `apply` 内，上一条通过即蕴含） |

> Client provider 的查询要等页面回一次响应（Host 转发），所以页面得开着；超时说明没有活页面。

**HTTP 面**（不经过检视工具，直接打这条路由）：

| 检查 | 手段 | 期望 |
|---|---|---|
| 信任围栏 | 无认证的 `POST /workspace-editor/write` | 被拒（403），不会落到 SPA fallback |
| 路由存在性 | 同一个 URL 用 `GET` | `405` + `allow: POST`（而不是 SPA 的 HTML） |

本机 profile 装了 `@xgone/dsh-remote` 时，从 shell 打这两条会先撞上它的会话门禁（返回
`{"ok":false,"error":"unauthorized"}`）—— 那不是本插件的应答，见「排错」表最后几行。

### 只能在浏览器里看的

**UI 与交互**（按钮点下去开不开页签、状态条、两处横幅、页签怎么排布、草稿能不能活过切换）
没有前端测试环境，命令行替代不了。手工走一遍：

1. `.json` / `.yaml` / `.txt` 默认就是编辑器：底部状态条显示「已与磁盘同步」，改一个字变
   「未保存的修改」且「保存」变品牌色，点「保存」或 Ctrl/Cmd+S 变「已保存」，磁盘同步变化。
2. 打开一个 `.md` 或 `.ts`（默认是官方预览），点工具栏上的**「✎ 编辑」** —— 同一张页签
   应变成标题为「编辑 main.ts」的编辑器页签（位置不变、不新增页签），正文可编辑；
   该文件的编辑器页签已开着时再点只聚焦，不会开出第二个。
3. 编辑器页签里点「换行：开 / 关」应在自动换行与横向滚动间切换。
4. 在编辑器里改几个字（先别保存），从文件树点开另一个文件、再点回来：草稿还在。
5. 让 Agent 改同一个文件，再回来看：出现「磁盘上的文件已被改动」横幅，你的正文没被覆盖。

## 已知边界

- **只处理 UTF-8 文本**：非 UTF-8、含 NUL 或超过 **1 MiB 字符**的文件会显示说明而不给编辑。
  这是浏览器侧的编辑上限；Host 接受的上限更宽（内容 4 MiB 字符 / 请求体 8 MiB），
  两者别混。
- **没有语法高亮、行号、查找替换、多文件、新建文件入口** —— 目前只解决「能改、能存、不丢、
  不覆盖」。`create` 模式已经支持，但 UI 上还没有触达它的入口。
- **点「✎ 编辑」会把预览页签换成编辑器页签**，不能把预览就地换成编辑器正文 —— 后者的开关在
  文档预览自己的 store 里，外部插件没有公开入口。想回预览：从文件树再点该文件。
- **文件树本身仍然只读**（不改官方 `ui-sidebar-files`），改名 / 删除 / 新建仍走终端或 Agent。
- **`link:` 安装时 Host 半边改完要重启 Harness**：本目录不在 HMR 的监视集内，
  `plugin_manager` 的禁用 / 启用只会重挂 fiber，不会重新 `import()` 模块。浏览器半边不受这条
  限制（bundle 按内容 revision 取，刷新即新）。
- **草稿只在浏览器内存里**：刷新页面、换个标签页打开同一个会话都会丢未保存的草稿
  （它是「重挂活下来」的缓存，不是持久化）。
- **一次保存是一个请求**：没有分片、没有断点续传，超过上限的文件只能换工具改。

## 相关文件

| 文件 | 关系 |
|---|---|
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | 为什么这么实现：设计决策、两半怎么拼、四条约束的来龙去脉 |
| [AGENTS.md](AGENTS.md) | 给代理的速查：命令、硬性约束、改动连带项 |
| [index.js](index.js) | Host 半边全部实现 |
| [client.js](client.js) | 浏览器半边全部实现 |
| [cordis.patch.yml](cordis.patch.yml) | profile 里的插入行 |
