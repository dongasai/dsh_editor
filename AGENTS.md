# AGENTS.md

给 AI 编码代理的项目须知。文档分工：[README.md](README.md) 讲**怎么用**（安装、怎么进编辑器、
线上协议、排错、怎么验证、已知边界），[IMPLEMENTATION.md](IMPLEMENTATION.md) 讲**为什么这么
实现**（设计决策、两半怎么拼、四条约束的来龙去脉）。与代码冲突时以代码为准。

## 项目是什么

`@dongasai/dsh-editor` —— DSH 插件，一个包两半：**Host 半边** [index.js](index.js) 注册六条变更
路由（`/workspace-editor/` 下的 `write` / `delete` / `mkdir` / `rename` / `copy` / `upload`）；
**浏览器半边** [client.js](client.js) 在右侧栏注册可编辑的文档渲染器、一个编辑器页签类型、预览
头部的「✎ 编辑」与「🗑 删除」按钮，以及一个自带文件树、自带剪贴板的工具面板 **「文件编辑」**。

三句话概括设计：变更走**自注册的 HTTP 路由**（新增 Remote 命名空间需要构建期生成物，`link:`
安装走不通）；三档入口（默认渲染器 / 可选渲染器 / 编辑器页签）**共用同一份正文**，「文件编辑」
是一个**页类型**（`sidebarRightTabs.register`，没有新槽位）；破坏性变更**带版本闸**、覆盖性变更
**带排他**（目标必须不存在），磁盘中途变过就停下来问人，不静默覆盖、也不静默删除。

## 命令

| 目的 | 命令 |
|---|---|
| Host 半边语法自检 | `node --check index.js` |
| 浏览器半边语法自检 | `node --check client.js` |

无构建、无 lint、无依赖安装、**没有测试目录**：`package.json` 没有 `dependencies`，`index.js`
只用 `node:` 内建模块；`client.js` 是手写的浏览器 bundle（由 Host 直接读盘发出，不经打包器）。

**没有测试目录是刻意的**（取舍见 [IMPLEMENTATION.md](IMPLEMENTATION.md) 的「为什么没有测试
目录」）：可测部分几乎全在浏览器侧，没有前端测试环境，为 Host 写「stub 掉 `ctx.fs` 再断言调了
`writeText`」的用例，验证的是插件自己的转述。验证靠 README「怎么验证」的两张清单：
命令行验注册与围栏，浏览器验交互。

**改哪一半、怎么生效**：

| 改了 | 生效方式 |
|---|---|
| `client.js` | 刷新浏览器页面（bundle 每次请求从磁盘现读，按内容 revision 换 URL） |
| `index.js` | **重启 Harness**（本目录不在 HMR 监视集内，禁用 / 启用插件只会重挂 fiber，不会重新 `import()` 模块） |
| `cordis.patch.yml` / `package.json` 的 `dsh.*` | 重启 Harness |

**但「装进 profile / 启停插件行」本身是热应用的**（2026-10-17 实测，宿主全程没重启）：
`dsh plugin --profile web add <本仓库>` 之后六条路由立刻回 403（未认证被围栏挡 = 已注册），在
profile 的 `cordis.patch.yml` 里给 `- id: workspace-editor` 加 `disabled: true` 后同一批路由变
200（SPA 兜底 = 未注册），摘掉这块又回 403。所以：**新装载与启停不用重启**；上面那行「重启
Harness」只针对**改自己 `index.js` 的内容** —— 那个模块已经被 `import()` 过，禁用再启用只会重挂
fiber，不会重新读盘。判据（可直接 curl，无需认证）：`GET /workspace-editor/write` 回 **403 = Host
半边在位**，回 **200 = 没加载**；对照 `GET /workspace-editor/随便一个不存在的名字` 恒为 200。

## 文件地图

| 文件 | 作用 |
|---|---|
| [index.js](index.js) | Host 半边全部实现：六条路由共用外壳 + 三道闸 + 版本闸 + `node:fs` 的 errno 映射 + base64 线性校验 |
| [client.js](client.js) | 浏览器半边全部实现：三档入口 + `EditorSurface` + 语法高亮层与令牌表 + 删除按钮 + 「文件编辑」文件树面板（含剪贴板 / 粘贴）+ 右键菜单动作（复制路径 / 复制相对路径 / 在终端打开，编辑器与文件树共用一份实现）+ 右键「发送到 DSH」 |
| [cordis.patch.yml](cordis.patch.yml) | 插进 profile 的那一行 |
| [package.json](package.json) | bundle 清单：`dsh.bundle.patch` + `dsh.client`（`platform` / `immediately` / `inject`） |
| [locale/zh.json](locale/zh.json) / [locale/en.json](locale/en.json) | 插件列表里的标题与描述 |
| [icon.svg](icon.svg) | 插件卡片图标 |
| [README.md](README.md) | **怎么用**：安装、编辑器入口、线上协议、排错、怎么验证、已知边界 |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | **为什么**：设计决策、一次保存 / 删除的路径、四条约束 |
| [AGENTS.md](AGENTS.md) | 本文件：命令、约束清单、改动连带项 |

`index.js` 内部顺序：常量（含六条路由的 `ENDPOINTS` 表、`isBase64`）→ `FS_FAILURES` /
`NODE_FAILURES` 码表 → `name` / `inject` → `apply`（按表注册六条路由）→ `route`（六条共用的
外壳）→ `rejected`（信任围栏）→ `requestLifetime`（断连 + 墙钟）→ 六个 `parse*Request` →
`writeWorkspaceFile`（lstat → resolve/contains → sandboxPolicy → writeText）→
`deleteWorkspaceEntry` / `mkdirWorkspaceEntry` / `renameWorkspaceEntry` / `copyWorkspaceEntry` /
`uploadWorkspaceFile` → `guardMutation`（会话根 →
contains → 自判 sandboxPolicy）→ `entryNoFollow` → `requireParentDirectory` → `removeEntry` /
`makeEntryDirectory` / `moveEntry` / `copyEntry` → `nodeFailure`（errno → 线上码）→
`resolveSessionRoot` → `readBody` → `sendFailure` → 若干纯工具函数。

`client.js` 内部顺序：常量（`WRITE_URL` / `DELETE_URL` / `MKDIR_URL` / `RENAME_URL` / `COPY_URL` /
`UPLOAD_URL` / `MAX_PASTE_BYTES` / 两个扩展名表 / 四个 id（默认渲染器、可选渲染器、编辑器页签、
图片页签）/ `EDITOR_TAB_PATTERN` / `IMAGE_TAB_PATTERN` / 模块级 `drafts` /
`inputTargets` / `filesClipboard` / `CSS`）→ 文案 `zh` / `en` → 地址与纯工具
（`addressParts` / `parseSessionFileAddress` / `absoluteFileAddress` / `fileNameOf` / `paneTarget` /
`relativizeToCwd` / `lineNumberOf` / `lineReferenceToken` / `menuAnchorFor` / `sessionCwd` /
`writeClipboard` / `readClipboard`）→ **路径工具区**（`/* path-tools:start */` …
`/* path-tools:end */`：`shortenPath`，**必须留在工厂作用域** —— 它被 `EditorSurface` 与
`ImageBody` 共用）→ **文件树纯函数区**（`/* tree:start */` …
`/* tree:end */`：`TREE_SORT_KEYS` / `DEFAULT_TREE_SORT` / `TREE_CHAIN_MAX` /
`TREE_PRELOAD_BUDGET` / `extensionOf` / `isHiddenName` / `compareTreeNames` / `sortEntries` /
`foldLevel` / `chainCandidates` / `rangeSelection` / `pruneForBatchDelete`）→
**粘贴 / 终端命令纯函数区**（`/* paste:start */` …
`/* paste:end */`：`PASTE_EXTENSIONS` / `base64OfBytes` / `pastedNameFor` / `clipboardFilesOf` /
`shellQuotePath` / `IMAGE_MEDIA_TYPES` / `imageMediaTypeOf`）→
**语法高亮区**（`/* highlight:start */` …
`/* highlight:end */`：上限常量 / 高亮名映射 / 关键字表 / 各语言规则表 / `keywordSource` /
`clikeRules` / `makeScanner` / `scannerFor` / `languageOfPath` / `normalizeNewlines` /
`needsTrailingLine` / `highlightRegistry` / `highlightSupported` / `tokenize`）→
`HIGHLIGHT_API_SUPPORTED` + `applyHighlights` / `releaseHighlights` / `rebuildHighlights`（DOM 侧，
Range 与 `CSS.highlights`）→ `InputSink`（`conversation.input.dock` 哨兵）→
`createEditor(ctx)`（`EditorSurface` / `DocumentBody` / `PaneBody` / `EditAction` / `DeleteAction`）
→ **两半共用的动作层**（`useNotice` 一次性提示状态机 / `copyPathText` / `copyPathToClipboard` /
`directoryOfFile` / `openTerminalAt`+`sendCdInto`+`waitForTerminalTab`：编辑器菜单、文件树菜单、
图片预览菜单三处同一份实现）→ `createImageBody(ctx)`（`ImageBody`：读字节 → Blob 对象 URL →
适配 / 原始大小、元信息、右键菜单、解不开与读失败的出路；**核对官方那三个契约别变**）→ `createFilesPanel(ctx)`（`FilesPanel` / `FilesTree`：目录树 + 内部剪贴板 /
系统剪贴板粘贴 + 菜单里的 `copyPath` / `openInTerminal`）→
`inject` + `apply`（编辑 / 删除按钮注册在
同一个槽位，id 与 order 各一档；「文件编辑」是页签类型 + `sidebar.right.pane.tab` 正文 + 快捷键
+ 输入框哨兵）。

## 硬性约束（违反即出 bug，别试探）

完整来龙去脉见 [IMPLEMENTATION.md](IMPLEMENTATION.md) —— 这里是要背下来的规则。

### Host 半边

1. **只 import `node:` 内建模块**，不新增任何依赖。`FsError` 这类官方类型改为按 `error.code`
   判别（查 `FS_FAILURES` 表），不 import 官方包，也不导出 `Config`（那需要 schemastery）。
2. **变更必须过三道闸**：Connection 信任围栏（`ctx.connection.requestRejection`）→ 会话工作区
   包含性检查（`ctx.fs.contains`）→ 沙箱策略围栏。写路径的第三道闸由 `ctx.fs.writeText` 执行；
   **另外五条没有这层自动保护**（`ctx.fs` 没有删除 / 改名 / 建目录 / 复制 / 写二进制的接口，它们
   走 `node:fs`），必须走 `guardMutation()` 自己按 `policy.mode === 'read-only'` 拒绝。**不要为了
   「方便保存 / 方便删除 / 方便粘贴」放宽任何一道**，也不要拿掉 `entryNoFollow()` 的符号链接
   检查（这五条既不递归跟软链，也不删 / 改软链指向的东西）。
3. **破坏性变更带版本闸，覆盖性变更带排他**：写 `expectedVersion` → `{ kind: 'replaceIfVersion' }`
   （`create` 走 `createIfAbsent`）；删在落盘前逐字比对同一个版本令牌；改名卡「目标必须不存在」；
   复制用 `COPYFILE_EXCL`、粘贴上传用 `writeFile` 的 `wx`。不传 `expectedVersion` 才是无条件变更
   （只允许发生在用户点过「覆盖保存」/「仍然删除」之后）。
4. **不改观察状态**：不 `emit('fs/observed', …)`。人工在 GUI 里改过的文件对模型来说必须仍是
   「没读过」。
5. **错误按 `code` 判别，绝不看 `message`**；表里没有的码一律 500 并记日志（写 `write-failed`，
   五条 `node:fs` 路由各有 `*-failed`），不要新增「猜」的分支。`upload` 的 base64 校验**不许用
   大正则**（`(?:…{4})*` 套在 4 MiB 字符串上会把 V8 的 regexp 栈撑爆，见 `isBase64` 的注释）。
6. **五条 `node:fs` 路由的每一步都过公共前置**：`guardMutation()`（会话根 → `contains` →
   自己判 `read-only`）→ `entryNoFollow()`（软链一律拒）→ `requireParentDirectory()`（目标父级
   必须存在且是目录）→ 才轮到 `unlink` / `rmdir` / `rm -r` / `mkdir` / `rename` / `copyFile` /
   `writeFile`。删除带版本闸、复制带 `COPYFILE_EXCL`、粘贴上传带 `wx`、改名卡「目标必须不存在」
   —— 这几条不要互相「统一」掉。

### 浏览器半边

7. **三个入口共用 `EditorSurface`**，不要为某个入口复制一份正文逻辑；入口差异只体现在 props
   （`variant` / `wrap` / `reloadKey` / `onLoaded` / `onFailed`）。
8. **草稿活过重挂**：卸载时脏则写 `drafts`、干净则删；挂载读盘后有草稿就恢复草稿**及其基线
   版本**。`drafts` 是纯派生的 UI 缓存，保存或丢弃后必须立刻删。
9. **读盘后总是回报磁盘版本**（`content.loaded(version)`），**即使缓冲区是脏的**。回报旧版本会
   让 owner 的自动刷新陷入重读循环 —— 这条最容易被「顺手优化」掉。
10. **磁盘变化不覆盖脏缓冲区**：只亮横幅，正文一个字都不动，由用户选「加载磁盘版本」还是
   「继续编辑」。
11. **编辑器页签（以及图片预览页签）的 pattern 必须命中不了真实地址**
    （`dsh-resource://workspace-editor/**` / `dsh-resource://workspace-editor-image/**`）：
    它们一旦能命中，普通打开文件就会被抢走，官方预览（包括官方那个图片渲染器）从此进不来。
    显式打开不看 pattern，所以这两条不会挡住树里的单击。
12. **`doc.version`（草稿基线，版本闸用）与 `doc.diskVersion`（磁盘现状，展示与冲突判定用）
    是两个字段**，不要合并。
13. **删除按钮要两次点击**：第一下只进确认态、同时抓版本基线（按钮在这期间禁用显示「检查中…」），
    第二下才发请求；确认态 / 冲突态 8 秒自己过期；**每个状态都要有出路**（失败态也得留「取消」，
    否则按钮消失、用户连重试都点不到）；删成功用 `closeTarget` 关掉点击时捕获的那张页签。
14. **「文件编辑」面板是页类型，不是新槽位**：`sidebarRightTabs.register`（无 patterns，只能按
    kind 打开）+ `sidebar.right.pane.tab` 同 id 的正文；列表 / 监听只用官方只读 Remote
    （`list` / `stat` / `changes` 走受管 `$stream`），变更一律打插件自己的六条路由。树的面板
    **单击文件开编辑器页签时必须带 `paneId` 且不带 `replaceTab`** —— 否则一点文件就把面板自己
    顶掉了。
15. **树的状态都在组件里，不要把目录树塞进模块级缓存**：换会话 / 换工作区根靠外层 `key` 重挂，
    每个加载过的目录订阅一次变更流（120ms 防抖合并重列），读盘用代次号挡住晚到的旧结果。
    因此「文件编辑」页签必须声明官方的 `keepMounted: true`：状态在组件里，页签切走就卸载，
    点一个文件进编辑器页签再回来会只剩根一层（用户报过「打开新文件再回来树缩回去了」）。
    编辑器 / 图片页签**不要**跟着开 —— 它们每个页签都持有一份正文与高亮层。
16. **行操作只允许有「一套实现、多个入口」**：行内图标、行尾常显的「⋯」菜单、右键菜单、
    工具条按钮、F2 全部调同一个 `startRename()` —— 不要再写第二份改名逻辑。新增行操作时照这个
    形状加（`menuItem()` 一处声明、各处复用），并记得**常显入口**：只有悬停才出现的按钮等于
    没有按钮（用户反馈过一次「tree 缺重命名」）。**跨面同理**：编辑器右键菜单与文件树菜单的
    「复制路径 / 复制相对路径 / 在终端打开」是同一份实现（工厂作用域那几个函数），各面只渲染
    自己位置的横幅 —— 想在某一面加动作时先问「另一面要不要」，要就加到共用那一层。
17. **「发送到 DSH」的两个细节不要「顺手优化」掉**：插进输入框的引用**必须带尾随空格** ——
    否则 `@` 触发检测会认为用户正在输引用、把 `@` 文件菜单唤出来，用户得手动 Esc；
    `captureInsertion()` 与 `insertText()` 必须挨着调用 —— 中间任何编辑都会让版本 CAS 失败、
    插入被静默拒绝。引用文本只用 `lineReferenceToken()` 拼，自己拼字符串必然绕不开
    引号 / 空白 / 控制字符的边界（官方 grammar 表示不了的就是 `null`，别硬塞）。
18. **高亮层与 textarea 必须逐字逐行重合**：字体 / 内边距 / 换行规则放在**同一条 CSS 规则**里
    （`.dsh-we-editor,.dsh-we-hl`）；宽度按 `textarea.clientWidth` 贴（滚动条会改变内容宽度）、
    滚动位置每轮渲染后贴一次并在 `onScroll` 里直接贴；**正文结尾是换行或正文为空时要补一个
    `<br>`**（textarea 给结尾空行留行盒，块级文本不给）。上色走 Custom Highlight API：高亮层里
    **只有一个文本节点**，一个 span 都不加；`Range` 只能建在文本节点上（传元素会按子节点下标解释
    offset → `IndexSizeError` → layout effect 抛错 → React 卸载整棵子树 → 白屏，真踩过）；
    能力探测走 `globalThis.CSS`（本模块的 `const CSS` 会遮蔽全局命名空间）；只增删自己那 9 个高亮名，
    **绝不 `CSS.highlights.clear()`**（全局注册表，别的插件也在用）；同屏多个实例的高亮由
    `highlightSources` 统一重建（高亮名必须写死在样式表里，没法按实例命名）。

19. **别假设槽位标准 prop 都在；也别往 `h(...)` 的子元素里多打一个 `)`** —— 这两条各造成过
    一次编辑器白屏，代价很大，务必记住：
    - **slot catalog 列的是类型并集，某个渲染点可能只传子集**：`sidebar.right.tab.document`
      的正文实际拿不到 `useSessions`，渲染期直接调用它的后果是 `TypeError` → React 卸载整棵
      子树。要用某个 prop 之前先做守卫，或改从 ctx 服务现读 —— 工作区根走
      `ctx.sessions.list.getSnapshot()`（事件里现读，比渲染期 prop 还新）；输入框写入面走
      **「槽位 prop 优先 + `conversation.input.dock` 哨兵登记（`inputTargets`）兜底」**两条路。
    - **`return h('div', {...}, 子元素…)` 尾部追加元素时，多一个 `)` 会让整段变成逗号表达式**：
      `return h(...), menu && h(...)` 的返回值是最后那个 `&&`（菜单关着就是 `false`），
      React 渲染 `false` = 什么都不画 —— **白屏且控制台没有报错**。`node --check` 只验语法，
      这种语义错误它看不见：改完用 `node -e` + acorn 确认那个 `return` 仍是 `CallExpression`。

20. **跨插件的 cordis 服务 / 命名空间一律用 `ctx.get('remote.<ns>')` 取，不要写进 `inject`**：
    命名空间是 cordis **服务**，没在 `inject` 里声明就写 `ctx.remote.<ns>` 会直接抛
    「cannot get property "remote.<ns>" without inject」（cordis 4.0.4 实测）；被 try/catch 吃掉
    就变成「功能静默失效」（真踩过：面板页脚读不到版本，只剩包名）。而写进 `inject` 又是硬依赖 ——
    没有那个服务的部署里整个插件会卡在等待中，编辑器与面板全都不出来。本插件的 `inject` 只列
    自己**必需**的服务（`remote.workspaceFiles` 是编辑器读盘必需的）；可选的（如
    `remote.pluginManager`）一律 `ctx.get(...)`，拿不到就退回兜底表现。

21. **粘贴是「两个来源、一场两路」，别把它统一成一条**：内部剪贴板（`filesClipboard`，模块级 ——
    这是约束 15 的唯一例外，它跟草稿一样要活过重挂）优先，走已有的复制 / 改名路由（剪切贴完
    必须清空，复制贴完保留）；没有内部剪贴板时才去系统剪贴板拿文件，走 `POST /upload`。
    系统剪贴板那两条路的差别是**信息和能力不一样，不是实现偷懒**：
    - 键盘 **Ctrl/Cmd+V** 只能走 `paste` 事件（`clipboardData` 带**真文件名**）；
    - 菜单 / 工具条上的「粘贴」只能走 `navigator.clipboard.read()` —— 它**不携带文件名**，
      只能按 MIME 起名（`pasted-<时间戳>.<扩展名>`），且需要安全上下文与权限。
    另外：`paste` 事件里**纯文本一律 `return`（不 `preventDefault`）**，目录要明确说「不支持」
    （浏览器拿得到目录入口、拿不到内容）—— 别顺手把它做成「贴文本建文件」，那是另一个需求。

22. **文件树的「光标」与「勾选」是两个字段，且勾选只由显式入口产生**：`selected`（光标 / 锚点，
    工具条 / F2 / Shift 范围都从它出发，视觉上是一圈虚线 `data-anchor`）与 `selection`（勾选集，
    视觉上是实心 ✓ + 行背景 + 左侧色带）。**行左侧的常显勾选框是主入口**（悬停才出现的按钮等于
    没有按钮）；`Ctrl/Cmd+点` 与它共用 `toggleSelection`；`Shift+点` 按可见行取范围；
    `Ctrl/Cmd+A` 全选可见行；**普通单击只挪光标并清空勾选**（不产生勾选）；**右键不碰勾选集**。
    批量条门槛是 **≥1**（勾一个就得拿到批量操作），最左那颗是全选框（✓ / −  两态）。
    **不带修饰键的点击必须保持老语义**（目录展开 / 文件进编辑器）；Ctrl / Shift / 勾选框都**不许
    打开文件页签**。Shift 范围与全选的坐标是**当前渲染出来的可见行**（`walk` 收集的
    `visiblePaths`）—— 折叠起来的子树不在范围里，**改排序会改范围落点**，这是刻意的。
    勾选框与展开箭头**必须 `stopPropagation`**，否则点一下勾选框会顺手展开目录 / 打开文件。

23. **排序在渲染时做，折叠只用读过的层级**：`levels[dir].entries` 存后端原始顺序，排序在 `walk` 里
    用 `sortEntries(entries, sort)` —— 换排序键**不许触发读盘**。名字比较**不用 `localeCompare`**
    （locale 相关，会让同一棵树在不同机器上顺序不同，而顺序是范围选择的坐标）。目录链折叠的
    **行代表链尾**（`chain` 最后一项就是行的 `path`），改名 / 删除 / 新建 / 拖入都作用在它上面；
    为发现链而做的预读（`chainCandidates` + `preloadDir`）必须：① 每个路径只试一次（`preloaded`
    记账，失败不重试）；② 受 `TREE_PRELOAD_BUDGET` 限制；③ **不给预读目录订阅变更**（订阅只给
    展开着的目录）；④ 隐藏项不计入「唯一子项」判定。

24. **批量删除不许有「整批无条件」的口子**：先 `pruneForBatchDelete` 收敛选择集（父目录已选中就
    去掉子项、工作区根不删）→ **一次确认** → **逐条取版本基线**（每条路径各自的令牌）→ **逐条
    串行**发 `POST /workspace-editor/delete`（目录带 `recursive`）。部分失败必须：失败项**留在
    选择里** + 一条带「重试删除」的横幅（重试重新取基线）。**不要**加一个「整批仍然删除」按钮，
    也不要为了快改成并发。

25. **`client.js` 的顶层只允许注释 + 一个 IIFE，别的什么都不许放**：宿主
    `@deepseek-ai/dsh-client-modules` 的 `buildComboScript` 把 profile 里**所有** client bundle
    的源码**直接拼成一个 classic script**（`source += resource.source + ';\n'`），**不按包加作用域
    隔离** —— 所有插件的顶层词法声明共享同一个全局作用域。两个插件各写一个同名顶层
    `const PACKAGE_NAME`，整条 combo 就抛 `SyntaxError: Identifier … has already been declared`，
    于是**一个 bundle 都不注册**，页面只报「loaded without registering … via
    `__ModuleLoader__.load`」，**完全看不出是跟别的插件撞了名**（真踩过：与
    `@dongasai/dsh-sidebar-terminal` 相撞，表现为整个插件加载失败并被用户在 profile 里关掉）。
    所以：① 新常量一律放 IIFE 内部；② 改完跑 `reference/probes/combo-scope.mjs`（它按宿主的
    拼法把 profile 里全部 bundle 拼起来解析，并会点名是哪两个包撞名）。

26. **拖拽落点按「这一行代表哪个目录」算，且行必须挡住冒泡**：目录行 = 它自己，**文件行 = 它
    所在的目录**（VS Code 同款）。文件行必须算落点，因为**根目录自己没有行** —— 树一长、正文里
    连空白都没有，只认目录行的话「搬到根」就没入口（用户正是这么反馈的）。行的 `onDragOver` /
    `onDrop` **一律 `stopPropagation`**：指针在某一行上时落点归那一行，事件冒到正文会被当成
    「根落点」（高亮跳到根、松手直接搬去根）。另外一开始拖就亮一条「工作区根目录」落点条
    （`data-workspace-editor-files-drop-root`），那是根唯一**看得见**的落点；拖的东西本来就在
    根下时不亮。空操作 / 非法落点（自己、原地、把目录拖进自己子树）**不发请求**。

## 代码风格

- 中文 JSDoc（`@param` / `@returns` / `@throws`）；注释解释**为什么** —— 尤其是反直觉的取舍
  （版本闸、脏缓冲区回报版本、页签顶替、三道闸的顺序），不解释语法。
- **`index.js`**：无分号、单引号、2 空格缩进；`function` 声明 + 顶层 `const` 常量；工具函数保持
  纯函数，失败用 `RequestError`（带 `status` + 线上 `code`）表达。
- **`client.js`**：无分号、单引号、2 空格缩进；文案字典与 `CSS` 模板里**内层用双引号**
  （`'…'` 包着 `"…"`），这是刻意的，不要「统一」成单引号。
- 组件用 `React.createElement`（`h`），不用 JSX —— 这个 bundle 没有构建步骤。
- 样式只挂组件本地 `<style>` 且只用主题令牌（`--dsw-alias-*`），不要引外部样式表、不要写死
  颜色；**但选中态这类关键反馈要带硬编码兜底色**（`var(--dsw-alias-brand-primary,#4d6bfe)`）——
  皮肤能把那个变量改成和常态没区别（真踩过：orca-link 皮肤下多选完全没有视觉反馈）。
  **`CSS` 是模板字符串：里面任何注释都不许出现反引号**（`--dsw-alias-*` 这种写法会提前终止模板，
  表现为 `SyntaxError: Invalid left-hand side expression in postfix operation`）。
- 给测试 / 调试用的钩子一律走 `data-workspace-editor-*` 属性，不要用 `class` 选择器或
  可见文案当锚点。

## 验证规范

改完至少跑：

```bash
node --check index.js
node --check client.js
```

动了高亮：把 `/* highlight:start */` … `/* highlight:end */` 之间那段**纯函数**整段截出来，在 Node
里断言「令牌首尾相接逐字还原正文」（`tokenize` 的令牌文本拼起来必须等于 LF 归一后的正文）与类别
归属；几何部分（高亮层与 textarea 逐字符坐标一致、wrap 开 / 关、滚到底部）只能在浏览器里量 ——
用真 React 把真 `client.js` 挂到无头 Chrome 里，拿 textarea 的镜像逐点比坐标。

动了粘贴 / 终端命令：`/* paste:start */` … `/* paste:end */` 之间同样是**纯函数**（`base64OfBytes` /
`pastedNameFor` / `clipboardFilesOf` / `PASTE_EXTENSIONS` / `shellQuotePath`），整段截出来在 Node 里断言「与
`Buffer` 的 base64 逐例一致（含 0x8000 分块边界）」「无名文件的命名」「从 `ClipboardEvent` 里
挑文件 / 认目录」。组件那一层（菜单、Ctrl+C/X/V、工具条、剪贴板横幅）用**真 jsdom + 真 React**
把真 `client.js` 挂起来跑同一份断言脚本；本机 Chrome 在 DSH 的 bwrap 沙箱里起不来，真浏览器 +
真系统剪贴板那一段只能走 README 的手工清单。

动了文件树的**排序 / 折叠 / 选择 / 批量删除**：`/* tree:start */` … `/* tree:end */` 之间同样是
**纯函数**（`sortEntries` / `foldLevel` / `chainCandidates` / `rangeSelection` / `pruneForBatchDelete`），
整段截出来在 Node 里断言：排序键与「大小写不敏感 + 码点决胜」、链折叠的每个停条件（两个子项 /
隐藏项不算唯一 / 未加载就地停 / `TREE_CHAIN_MAX` 上限）、范围选择的正反两个方向与锚点失效、
批量删除的选择集收敛（父目录覆盖子项、根不删、浅的在前）。交互那一层用**迷你 React 运行时**
把真 `client.js` 的 `FilesPanel` 挂起来跑状态机：`Ctrl` / `Shift` / `Esc` / `Ctrl+A` 的选择语义、
批量条门槛、批量删除的逐条版本闸与部分失败重试、排序菜单不触发读盘、折叠预读的收敛与预算。
本机没有 `react` / `jsdom`（宿主的 `node_modules` 里也没有），探针自带一个够用的运行时 —— 它必须
按组件树路径分表存 hook 槽位、给 `useCallback` / `useMemo` 做依赖记忆、递归渲染子元素，否则探针
自己的缺陷会误判被测代码。**探针必须能抓 bug**：改完至少做一次变异测试（把关键判断改坏，确认探针
变红再改回来）。

**「全绿」不等于有效 —— 探针自己有 bug 时会假绿**（2026-10-17 ~ 10-18 连着踩到两次，都是真的）：

- **案例一（探针的分支写错）**：迷你 React 里给节点挂 `parent` 的那段写成
  `if (Array.isArray(child)) for (…) if (…) …; else if (…) …` —— `else` 绑到了**内层** `if`，
  非数组的 child 整个分支被跳过，`parent` 永远是 `null`、冒泡链形同虚设。于是「勾选框漏了
  `stopPropagation`」这种真 bug 探针完全看不见，还报了 66/66 全绿。
- **案例二（探针覆盖面不够，而 `node --check` 也帮不上）**：把 `shortenPath` 放进
  `createFilesPanel` 内部的 `/* tree */` 区，而调用它的是 `EditorSurface` 与 `ImageBody`。
  `node --check` 通过（语法没错）、tree 纯函数探针全绿（它把那段**截出来单独求值**，看不见作用域）、
  状态机探针全绿（它只挂面板，**从没渲染过那两面**）—— 浏览器里却是渲染期 `ReferenceError` 白屏。

四条硬规矩：
① **新写一类断言，先证明它抓得住对应的变异**（把被测代码改坏，看它红不红；红了才算这条断言存在）；
② 探针运行时里的分支**一律带大括号**，禁止 `if … for … if … else` 这种悬挂结构；
③ 事件派发要**像浏览器** —— 用 `dispatchClick` 这类沿祖先链冒泡的助手，而不是直接调节点自己的
handler，否则「该不该冒泡」这一整类问题根本进不了视野；
④ 别用运行时探针去够作用域问题 —— 给编辑器补 `textarea` / `CSS.highlights` / `ResizeObserver`
一堆 DOM 桩是错路（越补越假，还会 OOM）。用 `reference/probes/scope-check.mjs`：它**不执行任何
代码**，只用 AST 把「引用处能不能看见那个声明」静态算一遍（当前覆盖 `client.js` + `index.js`
共 4186 处引用）。**动了任何一侧的作用域、或新增函数级声明，都要跑它。**

命令行能覆盖的注册断言（`cordis_inspect_list` → `cordis_inspect_query`：Host `Config.listConfigs`
查 Loader 行，Client `Slots.listSubTree` 查槽位占用；外加无认证 POST 被拒、`GET` 得 405）与
浏览器侧的手工清单都在 README「怎么验证」里，两处都要走一遍；**动了 `client.js` 的交互就必须在
浏览器里实测**，命令行替代不了。

## 提交

历史格式：`<类型>(<范围>): <中文描述>`，例如
`功能(编辑器按钮): 「✎ 编辑」改为顶掉预览页签，不再并排开第二个`。
类型用「功能 / 修复 / 重构 / 文档 / 测试」。

## 改动连带项

- 增删扩展名档位（`DEFAULT_EXTENSIONS` / `OPTIONAL_EXTENSIONS` / `priority`）→ 同步 README
  「哪些文件能进编辑器」表与「怎么用」第 2 步。
- 动线上协议（路由路径、字段、错误码、上限）→ 同步 README 的「线上协议」整节、`FS_FAILURES` /
  `NODE_FAILURES` 表与 [client.js](client.js) 里 `WRITE_URL` / `DELETE_URL` / `MKDIR_URL` /
  `RENAME_URL` / `COPY_URL` / `UPLOAD_URL` 的注释；两边路径必须逐字一致，客户端
  `MAX_PASTE_BYTES` 与 Host `MAX_UPLOAD_BYTES` 也必须同值。
- 动保存 / 冲突 / 草稿逻辑 → 同步 [IMPLEMENTATION.md](IMPLEMENTATION.md) 的「数据不丢的四条
  规矩」；动删除按钮的状态机 → 同步同文件的「规矩 4：删除要两次点击」；动「文件编辑」面板 →
  同步同文件的「「文件编辑」面板：浏览器侧的设计」。
- 动「文件编辑」面板的页脚（插件信息）→ 同步 [IMPLEMENTATION.md](IMPLEMENTATION.md) 的
  「「文件编辑」面板：浏览器侧的设计」那一节与 README 面板一节：页脚走 `pluginInfo`
  （`ctx.get('remote.pluginManager')` 现读 + 读到才缓存），**不要在客户端写死版本号**，也
  **不要**把命名空间写进 `inject`（见约束 20）；改 `package.json` 的 `version` 因此不需要动客户端。
- **发版（改 `package.json` 的 `version`）→ 四处一起动**：`package.json` 的 `version`、
  附注标签 `v<version>`（逐字对应，本仓库口径是带 `v`、带 patch：`1.2.0` ↔ `v1.2.0`）、
  [README.md](README.md#L59) 「钉版本」那条里的示例与「本仓库当前 tag 是 …，对应 `package.json`
  的 …」那一行、**npm registry 上的那一版**（`npm publish --registry https://registry.npmjs.org/`）。
  推完用 `git ls-remote origin` 核对 `refs/heads/main` 与 `refs/tags/<tag>^{}` 指向同一个提交，
  再用 `npm view @dongasai/dsh-editor versions --registry https://registry.npmjs.org/` 核对发出
  去的正是这个版本号。面板页脚不用动 —— 它从 Host 插件清单现读 `version`。
  npm 这条路的三个坑：① `package.json` 里**不许有 `private: true`**，否则 npm 直接拒发（1.2.0
  首发时删掉的）；② 本机默认 registry 是只读镜像 `registry.npmmirror.com`，不加 `--registry` 会
  撞 403 / 假成功；③ 本包带 scope，首发必须 `--access public` —— `publishConfig` 里已经写好，
  别删。

  **npm 发布的实际机制（2026-10-25 首发踩过一遍，别再猜）**：

  - 账号（`1514582970`，开了 2FA）用带 bypass 的 granular 令牌发布会走**分段发布**：版本先进
    `Validating`（自动校验，装不到）→ `Pending approval`（装不到）→ 批准后才进 `versions` +
    `dist-tags`。占位版 **`0.0.0-stage` 就是这个机制的副产物**，不是 `latest`、按名字装不到，
    别当成发错；它也可能与真版本抢 semver 唯一索引，报 `409 Cannot publish over previously
    staged version` 就是撞上了它。
  - **`npm publish` 报错 ≠ 没发出去**。判据永远是注册表里的 `versions` 与 `dist-tags`
    （`curl -s https://registry.npmjs.org/@dongasai%2fdsh-editor`）；这次本地报 `EROFS`
    （`~/.npm/_cacache` 只读）时，PUT 其实已经成功、版本已经上线。
  - `npm stage` 子命令需要 **npm ≥ 11.21**，本机 11.6.2 **没有** —— 用 `npx -y npm@latest stage
    list|view|approve|reject|download ...`。其中 `publish` / `list` / `view` / `download`
    **不弹 2FA**，`approve` / `reject` **必须**弹。
  - **bypass-2FA 的 granular 令牌不能做敏感操作**（npm 2026-07-31 政策）：`unpublish`、改包
    access、改维护者、建删令牌一律 403；**2027-01 起连「直接发布」也会被收走**，只剩「暂存 +
    人批准」，CI 自动发布要改用 trusted publishing（OIDC）。`npm login` 的会话令牌相反：能暂存、
    能直发（直发弹码）、能做上面全部敏感操作 —— 两者用 `--userconfig` 分开，别在 `~/.npmrc`
    里并存两行 `_authToken`。
  - 排错时的码义：scope **不存在** → `PUT` 回 **404**（首发时 `@dongasai` 就撞的这个，建了
    `dongasai` 组织才好）；**无权限** → **403**；**缺动态码** → **401/EPT**；**撞暂存版本** → **409**。
  - 发版提交 / tag 只代表仓库；**npm 页上的 README 与代码都是那次发布时的快照**，文档改动不重发
    就不同步 —— 这一条在 README 的「已知边界」里也写了，别只改文档就以为线上跟着变。
- 动 Host 侧的闸 → 同步 [IMPLEMENTATION.md](IMPLEMENTATION.md) 的「一次保存的完整路径」
  （六条路由那张图）、「删除 / 改名 / 建目录 / 复制 / 粘贴上传为什么走 `node:fs`」与
  「四条实现约束」。
- 动粘贴 / 剪贴板 → 同步 [IMPLEMENTATION.md](IMPLEMENTATION.md) 的「「文件编辑」面板：浏览器侧
  的设计」里那条粘贴说明与 README 的排错表 / 已知边界 / 手工清单。
- 动文件树的选择 / 排序 / 折叠 / 批量删除 → 同步 [IMPLEMENTATION.md](IMPLEMENTATION.md) 的四节
  （「光标与勾选是两个字段」「批量删除：一次确认、逐条版本闸、失败必须有出路」「排序放在渲染时」
  「目录链折叠：行代表链尾，预读有预算且不订阅」）+ README 的用法表 / 已知边界 / 手工清单，并核对
  约束 22-24 是否仍然成立（那三条就是这几件事的契约）。**改勾选交互必须连冒泡断言一起改**
  （`dispatchClick` 那条链），并重新跑一遍变异测试。
- 动 tree 的菜单动作（复制路径这类只写系统剪贴板的动作）→ 同样同步上面两处；菜单项一律走
  `menuItem()` 一处声明，别只为右键菜单再写一份（约束 16）。
- 动图片预览 → 守住「**不注册文档渲染器**」这条：官方已有图片渲染器，接管它就是行为回归；
  改的是页签类型 + `sidebar.right.pane.tab` 正文，并同步 README 的「图片预览」一节 / 手工清单 /
  已知边界与 IMPLEMENTATION 的面板一节。动后缀表（`IMAGE_MEDIA_TYPES`）时顺带想一下
  `EditAction` 的图片守卫（同表判定）。
- 动「复制路径 / 在终端打开」→ 它们是**三个面共用**的（编辑器右键菜单 + 文件树菜单 + 图片预览
  菜单），改共用层
  就别只改一边；两处的手工清单与锚点（树的 `[data-workspace-editor-files-notice]`、编辑器的
  `[data-workspace-editor-action-notice]`）都要同步。
- 动「在终端打开」→ 先确认官方那三条契约没变（`remote.terminal.create` **没有 cwd**、
  `TerminalView.write` 在不可写时**静默丢弃**、页签身份只能从 `active()` / `tabsIn()` 现读）；
  变了就同步 README 的用法一段 / 排错表 / 已知边界与 IMPLEMENTATION 的面板一节。
- 已知边界（1 MiB 编辑上限、高亮 256 KiB / 2 万令牌上限与 Custom Highlight API 前提、
  面板页脚的插件信息依赖 Host 的插件清单（读不到就只显示包名）、没有行号 /
  查找替换 / 多文件、页签顶替而非就地切换、官方文件树仍只读、
  删除永久且带毫秒级窗口、面板不复制目录 / 不做下载 / 没有搜索与过滤、多选只认可见行（折叠起来的
  子树不在范围里，改排序会改范围落点）、排序偏好不持久化、目录链折叠会为探测多读几层（每次挂载
  上限 64，且这些预读目录不订阅变更，标签可能短暂过期）、批量删除逐条串行（条数多时会有可感耗时）、
  改名的预检窗口、递归
  删除只盖直接条目、`link:` 下 Host 半边要重启、草稿只在内存里、发送的是纯文本引用而非芯片、
  发送目标恒为当前会话、右键菜单替代原生文本框菜单、插入不聚焦输入框、
  粘贴只收文件且单个 4 MiB 上限、纯文本粘贴不处理、剪贴板里的目录不支持、菜单那条粘贴路丢失
  文件名、内部剪贴板只在内存里且换会话粘贴会被 403 挡下、复制相对路径的基准是工作区根且根
  自己没有行、侧边栏终端一律从工作区根起步（所以「在终端打开」是开完替你敲一条 `cd`，且会往
  shell 发一次输入）、自动 cd 的引号只保证 POSIX shell 与 PowerShell、图片预览只从本插件的
  文件树进（官方渲染器不动）、tiff / heic 这类不做解码兜底、图片是整份读进内存、
  npm 页上的 README 与代码只是那次发布的快照（不重发就不同步）、npm 版本列表里的 `0.0.0-stage`
  占位版、默认 registry 是只读镜像（刚发版可能装到旧版））写在 README
  末尾；
  **没真正解决之前不要从文档里删掉**。
- **文档分工别混**：README 只回答「怎么用」（用户视角的问题进排错表 / 已知边界），
  IMPLEMENTATION 只回答「为什么」；别让 README 重新长出实现细节。


## 其他事项
- 修改提交后记得push
