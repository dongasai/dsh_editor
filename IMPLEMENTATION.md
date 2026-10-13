# 实现思路

面向改这个插件的人（人和代理）。**怎么用**见 [README.md](README.md)，这里是**为什么这么写**：
设计决策、两半怎么拼起来、以及每条约束背后踩过的坑。与代码冲突时以代码为准。

源码只有两个文件，一个包两半：[index.js](index.js)（Host 半边，335 行）与
[client.js](client.js)（浏览器半边，789 行）。

## 一页总览

```
Harness 启动（profile 作用域）
  └─ index.js 的 apply(ctx)
       └─ ctx.effect(() => ctx.webServer.register({ kind:'exact', path:'/workspace-editor/write' }))
          └─ 每次保存：POST → route()
               ├─ rejected()            Connection 信任围栏（不可信 Host/Origin、未认证）
               ├─ 媒体类型 / 请求体 / 字段校验
               ├─ requestLifetime()     断连 + 30s 墙钟 → AbortSignal
               └─ writeWorkspaceFile()
                    ├─ resolveSessionRoot()   会话身份 → 工作区根
                    ├─ lstat                  最终节点必须是普通文件（符号链接一律拒）
                    ├─ resolve + contains     路径围栏：必须落在会话工作区内
                    └─ ctx.fs.writeText()     带沙箱策略与版本闸的原子写

浏览器加载（bundle 由 dsh-client-modules 从磁盘现读）
  └─ client.js 的 factory → apply(ctx)
       ├─ locale.register(NS, { zh, en })
       ├─ documentPreviews.register × 2    默认档（extension）/ 可选档（builtin）
       ├─ slots.register × 2               sidebar.right.tab.document 的两份正文
       ├─ sidebarRightTabs.register         kind: workspace-editor（pattern 命中不了真实地址）
       ├─ slots.register                   sidebar.right.pane.tab 的编辑器正文
       └─ slots.register                   sidebar.right.tab.document.actions 的「✎ 编辑」按钮
                    ↓ 三个入口共用
              EditorSurface：读盘 → 草稿 → 版本闸保存 → 冲突横幅
                    ↓ 读走 ctx.remote.workspaceFiles.readBytes（官方只读接口）
                    ↓ 写走 fetch('/workspace-editor/write')（本插件自己的路由）
```

两条通道刻意分开：**读**复用官方生成的 Remote 客户端（类型安全、不用自己造
`InvocationDescriptor`），**写**走一条自己注册的精确路由。下面 D1 解释为什么写不能也走 Remote。

## 三条不可动摇的设计决策

### D1 写走自注册的 HTTP 路由，不新增 Remote 命名空间

官方 `@deepseek-ai/dsh-api-workspace-files` 是只读的
（"The service exposes no mutation operation."）。看起来最自然的补法是新增一个 Typert Remote
命名空间 `workspaceEditor.write`，但**新增 Remote 方法需要构建期生成的
`InvocationDescriptor`** —— 客户端 `ctx.remote.$mount()` 只接受生成物，而本插件以 `link:`
方式装进 profile、**没有构建步骤**，走不通。

于是采用官方 `dsh-host-open-in-app` 对「UI 动作需要 Host 能力」时的同款做法：
`ctx.webServer.register()` 注册一条精确路由，用 **Connection 的信任围栏**挡住一切非本机认证
页面发来的请求。路由只发 JSON、只写文件，不返回任何可浏览的文档 —— 它不是「多开了一个网站
入口」，而是「给已有 GUI 会话加一个动作端点」。

**推论：浏览器半边不能用 `ctx.remote` 去调写接口**，只能用 `fetch`。这也是为什么写请求的
错误处理是**按 `code` 分支**的（`stale-version` → 冲突横幅；`not-observed` → 「文件已存在」），
而不是抛一个类型化异常。

### D2 三档入口，正文只有一份

「在右侧栏编辑」有三种进入方式，它们**不是三套实现**：

| 入口 | 注册点 | 为什么需要它 |
|---|---|---|
| 默认档渲染器 | `documentPreviews.register` + `sidebar.right.tab.document` | 数据 / 配置 / 纯文本类文件官方本来也只有只读预览，直接当默认视图 |
| 可选档渲染器 | 同上（`priority: 'builtin'`） | 官方已有更合适的只读渲染器（Markdown 排版、代码高亮 + 行号），编辑器只做「打开方式」里的备选 |
| 编辑器页签 | `sidebarRightTabs.register` + `sidebar.right.pane.tab` | 给「默认不进编辑器」的文件一个一键入口，且能顶掉预览页签 |

三者共用同一个 `EditorSurface`，差别只在 props（`variant`、`wrap`、`reloadKey` 与
`onLoaded` / `onFailed` 回调）。**改正文逻辑只需要改一处**；要加「第四种入口」时也照这个形状做。

### D3 「✎ 编辑」换的是页签，不是渲染器

预览用哪个渲染器由文档预览自己的 store 决定：

```js
selected = candidates.find((id) => id === state.rendererId) ?? candidates[0]
```

`state.rendererId` 只有它自己的「打开方式」下拉能写，外部插件没有公开入口 —— 所以
「原地把预览换成编辑器」**做不到**。右侧栏的**页签**是公开的（`ctx.sidebarRightTabs.register`
注册 kind，`ctx.sidebarRight.openResource(address, { kind, replaceTab })` 显式打开），
于是：

- 按钮用编辑器页签**顶掉**当前预览页签（同一个面板、同一个位置，不新增页签）；
- 编辑器页签类型声明一个**命中不了任何真实地址**的 pattern
  （`dsh-resource://workspace-editor/**`），于是它永远不参与自动排名 —— 普通打开文件仍旧是
  官方预览，编辑器只在按钮 / 显式打开时出现；
- 显式指定 kind 的打开**不看 pattern**（侧边栏的 `claim(address, kind)` 只查 `canOpen`），
  所以「命中不了」不会挡住按钮。`canOpen` 仍然生效，它只放行 `dsh-resource://file/` 开头的地址。

按钮还要知道「顶掉哪张页签」：用 `ctx.sidebarRight.commandTarget(event.currentTarget)` 从按钮
所在的真实 DOM 位置问出面板与页签（浮动面板里问不到就退回「当前活动的停靠面板」，在旁边开）。

## Host 半边：一次保存的完整路径

```
route(ctx, req, res)
  ├─ rejected(ctx, req, res)                 ctx.connection.requestRejection → 403/401，直接结束
  ├─ req.method !== 'POST'                   → 405 + allow: POST
  ├─ mediaTypeOf(req) !== application/json    → 415 unsupported-media-type
  ├─ requestLifetime(req, res)               断连 或 30s 墙钟 → AbortSignal
  ├─ readBody(req)                           8 MiB 上限，超限先 req.resume() 再抛 413
  ├─ parseWriteRequest(value)                字段校验（sessionId/path/content/mode/expectedVersion）
  └─ writeWorkspaceFile(ctx, input, signal)
       ├─ resolveSessionRoot()               活会话 header.cwd → 存档头 → 404
       ├─ lstat                              存在且不是 file → 409 not-regular-file
       ├─ resolve + contains                 不在工作区内 → 403 outside-workspace
       ├─ intent = createIfAbsent | replaceIfVersion | undefined
       ├─ policy = sandboxPolicy.resolve({ session })
       └─ ctx.fs.writeText(target, content, intent, signal, policy)
```

几个刻意的选择：

- **错误按 `code` 判别，绝不看 message**（`FS_FAILURES` 表）。`FsError` 是官方包里的类，而本模块
  不能 import 官方包（见约束 1），所以只按 `error.code` 这个字符串判别；表里没有的码一律
  500 `write-failed` 并记日志 —— 宁可把未知故障显式暴露，也不要猜。
- **`lstat` 与 `resolve`+`contains` 两道都要**：前者保证最终节点不是符号链接（`lstat` 不跟随），
  后者保证解析后的真实路径没跑出工作区。少任何一道，软链就是一个写穿口子。
- **`session === undefined` 时 `sandboxPolicy.resolve()` 不带参数**：冷会话（只有存档头）拿不到
  session 对象，此时用部署默认策略，路径围栏仍然按存档头的 `cwd` 生效。
- **`requestLifetime` 只在「应答没写完就断开」时才算客户端走了**（`!res.writableEnded`），
  否则正常应答结束触发的 `close` 会把成功写入判成取消。

## 浏览器半边：数据不丢的三条规矩

### 规矩 1：未保存草稿活过重挂

切标签、关掉编辑器页签再打开都会**卸载**正文组件（React 状态随之消失），所以草稿放在模块级
`drafts` 里，按 `${sessionId}\u0000${path}` 索引：

- 卸载时（`useEffect` 的 cleanup）：脏则写进 `drafts`，干净则 `delete`；
- 挂载读盘后：有草稿就恢复草稿（连同「草稿基于哪个版本」），没有就用磁盘内容；
- 保存成功或主动丢弃时立刻删除。

它是**纯派生的 UI 缓存**，不是持久化：刷新页面就没了，而且只在浏览器内存里。

### 规矩 2：磁盘变化不覆盖草稿

渲染器模式下文件在磁盘上变了会推进 `content.revision`（owner 给的信号），正文据此重读。此时：

- 缓冲区**干净** → 直接换成新内容；
- 缓冲区**脏** → 只把新版本记进 `doc.diskVersion` 并亮「磁盘上的文件已被改动」横幅，
  正文一个字都不动，由用户选「加载磁盘版本」还是「继续编辑」。

还有一条反直觉的（**别删**）：读盘后**总是**把读到的磁盘版本回报给 `content.loaded(version)`，
**即使缓冲区是脏的**。文档预览的 owner 用这个版本号判断「磁盘变了没有」，若在脏的时候回报旧
版本，它的自动刷新会一直认为需要重读 —— 形成重读循环。

### 规矩 3：保存带版本闸，冲突要人点

保存时把「缓冲区基线对应的版本」（`doc.version`）作为 `expectedVersion` 送上去：

- 磁盘没变 → 写入成功，把返回的新版本同时记进 `version` 与 `diskVersion`；
- 磁盘变过 → `stale-version`，进冲突横幅，**只有**用户点「覆盖保存」才走 `force`
  （此时请求里不带 `expectedVersion`，即无条件覆盖）；
- `not-observed`（`create` 模式下文件已存在）走同一张横幅，文案不同。

`doc.version` 与 `doc.diskVersion` 是两个不同的东西：前者是**草稿的基线**（版本闸用），后者是
**磁盘现状**（展示与冲突判定用）。草稿恢复时两者可以不同，这正是冲突判定的依据。

## 四条实现约束（改代码前先读）

1. **`index.js` 只 import `node:` 内置模块。** 插件包以 `link:` 装进 profile，模块真实路径在
   插件仓库内，`@deepseek-ai/*` 这类裸包名从这里解析不到（同 `dsh-project-mcp` 的约束 1）。
   `FsError` 等类型改为按 `error.code` 结构化判别，不 import 官方包，也不导出 `Config`
   （那需要 schemastery）。
2. **写入必须同时过三道闸**：Connection 信任围栏 → 会话工作区包含性检查 → `ctx.fs` 自身的
   沙箱策略围栏（显式传入 `ctx.sandboxPolicy.resolve({ session })`）。三道闸任一被绕过都是安全
   回归，不要为了「方便保存」放宽其中任何一道。
3. **写入带版本闸**：`expectedVersion` → `{ kind: 'replaceIfVersion' }`；磁盘在编辑期间变过就
   返回 `stale-version`，由用户显式选择覆盖（不带 `expectedVersion` 才是无条件覆盖，
   `create` 模式走 `createIfAbsent`）。
4. **不改观察状态**：`index.js` 刻意**不** `emit('fs/observed', …)`。FS 观察策略要求 `edit`
   前必须读过文件，人工在 GUI 里改过的文件对模型来说就是「没读过」—— 模型应当重新 `read`
   之后再改，这是正确的语义，别用一条 emit 把它「喂」成已观察。

## 为什么没有测试目录

本插件的可测部分几乎全在**浏览器侧**（React 状态机、草稿、横幅、页签顶替），而 Host 半边是
一层薄薄的校验 + 转发。没有前端测试环境的前提下，为 Host 写一套「stub 掉 `ctx.fs` 再断言调了
`writeText`」的用例，验证的是插件自己的转述而不是真实行为 —— 成本大于收益。

因此验证策略是：**命令行验注册与围栏**（`node --check`、`Slots.listSubTree`、无认证 POST 被拒、
`GET` 得 405），**浏览器验交互**，两张清单都在 README 的「怎么验证」里。要补自动化的话，
第一优先级是**浏览器侧的交互**，不是 Host 的转发。

## 明确不做的事

| 不做 | 理由 |
|---|---|
| 新增 Typert Remote 命名空间 | 需要构建期生成的 `InvocationDescriptor`，`link:` 安装没有构建步骤（D1） |
| 就地切换渲染器（不换页签） | `state.rendererId` 没有公开写入入口（D3） |
| 给模型加一个「编辑器」工具 | Agent 自己的 `read` / `edit` / `write` 足够，多加一个只会污染工具表 |
| `emit('fs/observed', …)` 喂观察状态 | 会让模型跳过必要的 `read`，语义是错的（约束 4） |
| 文件树改名 / 删除 / 新建 | 那是官方 `ui-sidebar-files` 的地盘，改它要连带改它的 store |
| 语法高亮 / 行号 / 查找替换 | 官方代码预览已经更好，编辑器不重复造 |
| 持久化草稿到 localStorage | 目的是「重挂活下来」，不是「跨会话恢复」；持久化要引入清理与配额问题 |
| 分片上传大文件 | 一次请求一份内容更简单，超限就明确拒绝 |

## 相关文件

| 文件 | 关系 |
|---|---|
| [README.md](README.md) | 用法：安装、怎么进编辑器、线上协议、排错、怎么验证、已知边界 |
| [index.js](index.js) | Host 半边全部实现（路由、三道闸、版本闸） |
| [client.js](client.js) | 浏览器半边全部实现（三档入口、`EditorSurface`、草稿与冲突） |
| [cordis.patch.yml](cordis.patch.yml) | profile 里的插入行 |
| [package.json](package.json) | bundle 清单：`dsh.bundle.patch` + `dsh.client` |
| [AGENTS.md](AGENTS.md) | 给代理的速查：命令、约束清单、改动连带项 |
