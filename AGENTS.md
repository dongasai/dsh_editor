# AGENTS.md

给 AI 编码代理的项目须知。文档分工：[README.md](README.md) 讲**怎么用**（安装、怎么进编辑器、
线上协议、排错、怎么验证、已知边界），[IMPLEMENTATION.md](IMPLEMENTATION.md) 讲**为什么这么
实现**（设计决策、两半怎么拼、四条约束的来龙去脉）。与代码冲突时以代码为准。

## 项目是什么

`@dongasai/dsh-editor` —— DSH 插件，一个包两半：**Host 半边** [index.js](index.js) 注册五条变更
路由（`/workspace-editor/` 下的 `write` / `delete` / `mkdir` / `rename` / `copy`）；**浏览器半边**
[client.js](client.js) 在右侧栏注册可编辑的文档渲染器、一个编辑器页签类型、预览头部的「✎ 编辑」
与「🗑 删除」按钮，以及一个自带文件树的工具面板 **「文件编辑」**。

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

## 文件地图

| 文件 | 作用 |
|---|---|
| [index.js](index.js) | Host 半边全部实现：五条路由共用外壳 + 三道闸 + 版本闸 + `node:fs` 的 errno 映射 |
| [client.js](client.js) | 浏览器半边全部实现：三档入口 + `EditorSurface` + 删除按钮 + 「文件编辑」文件树面板 + 右键「发送到 DSH」 |
| [cordis.patch.yml](cordis.patch.yml) | 插进 profile 的那一行 |
| [package.json](package.json) | bundle 清单：`dsh.bundle.patch` + `dsh.client`（`platform` / `immediately` / `inject`） |
| [locale/zh.json](locale/zh.json) / [locale/en.json](locale/en.json) | 插件列表里的标题与描述 |
| [icon.svg](icon.svg) | 插件卡片图标 |
| [README.md](README.md) | **怎么用**：安装、编辑器入口、线上协议、排错、怎么验证、已知边界 |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | **为什么**：设计决策、一次保存 / 删除的路径、四条约束 |
| [AGENTS.md](AGENTS.md) | 本文件：命令、约束清单、改动连带项 |

`index.js` 内部顺序：常量（含五条路由的 `ENDPOINTS` 表）→ `FS_FAILURES` / `NODE_FAILURES` 码表
→ `name` / `inject` → `apply`（按表注册五条路由）→ `route`（五条共用的外壳）→ `rejected`
（信任围栏）→ `requestLifetime`（断连 + 墙钟）→ 五个 `parse*Request` → `writeWorkspaceFile`
（lstat → resolve/contains → sandboxPolicy → writeText）→ `deleteWorkspaceEntry` /
`mkdirWorkspaceEntry` / `renameWorkspaceEntry` / `copyWorkspaceEntry` → `guardMutation`（会话根 →
contains → 自判 sandboxPolicy）→ `entryNoFollow` → `requireParentDirectory` → `removeEntry` /
`makeEntryDirectory` / `moveEntry` / `copyEntry` → `nodeFailure`（errno → 线上码）→
`resolveSessionRoot` → `readBody` → `sendFailure` → 若干纯工具函数。

`client.js` 内部顺序：常量（`WRITE_URL` / `DELETE_URL` / 两个扩展名表 / 三个 id /
`EDITOR_TAB_PATTERN` / 模块级 `drafts` / `inputTargets` / `CSS`）→ 文案 `zh` / `en` → 地址与纯工具
（`addressParts` / `parseSessionFileAddress` / `absoluteFileAddress` / `fileNameOf` / `paneTarget` /
`relativizeToCwd` / `lineNumberOf` / `lineReferenceToken` / `menuAnchorFor` / `sessionCwd` /
`writeClipboard` / `readClipboard`）→ `InputSink`（`conversation.input.dock` 哨兵）→
`createEditor(ctx)`（`EditorSurface` / `DocumentBody` / `PaneBody` / `EditAction` / `DeleteAction`）
→ `createFilesPanel(ctx)`（`FilesPanel` / `FilesTree`）→ `inject` + `apply`（编辑 / 删除按钮注册在
同一个槽位，id 与 order 各一档；「文件编辑」是页签类型 + `sidebar.right.pane.tab` 正文 + 快捷键
+ 输入框哨兵）。

## 硬性约束（违反即出 bug，别试探）

完整来龙去脉见 [IMPLEMENTATION.md](IMPLEMENTATION.md) —— 这里是要背下来的规则。

### Host 半边

1. **只 import `node:` 内建模块**，不新增任何依赖。`FsError` 这类官方类型改为按 `error.code`
   判别（查 `FS_FAILURES` 表），不 import 官方包，也不导出 `Config`（那需要 schemastery）。
2. **变更必须过三道闸**：Connection 信任围栏（`ctx.connection.requestRejection`）→ 会话工作区
   包含性检查（`ctx.fs.contains`）→ 沙箱策略围栏。写路径的第三道闸由 `ctx.fs.writeText` 执行；
   **另外四条没有这层自动保护**（`ctx.fs` 没有删除 / 改名 / 建目录 / 复制的接口，它们走
   `node:fs`），必须走 `guardMutation()` 自己按 `policy.mode === 'read-only'` 拒绝。**不要为了
   「方便保存 / 方便删除」放宽任何一道**，也不要拿掉 `entryNoFollow()` 的符号链接检查（这四条
   既不递归跟软链，也不删 / 改软链指向的东西）。
3. **破坏性变更带版本闸，覆盖性变更带排他**：写 `expectedVersion` → `{ kind: 'replaceIfVersion' }`
   （`create` 走 `createIfAbsent`）；删在落盘前逐字比对同一个版本令牌；改名卡「目标必须不存在」；
   复制用 `COPYFILE_EXCL`。不传 `expectedVersion` 才是无条件变更（只允许发生在用户点过
   「覆盖保存」/「仍然删除」之后）。
4. **不改观察状态**：不 `emit('fs/observed', …)`。人工在 GUI 里改过的文件对模型来说必须仍是
   「没读过」。
5. **错误按 `code` 判别，绝不看 `message`**；表里没有的码一律 500 并记日志（写 `write-failed`，
   四条 `node:fs` 路由各有 `*-failed`），不要新增「猜」的分支。
6. **四条 `node:fs` 路由的每一步都过公共前置**：`guardMutation()`（会话根 → `contains` →
   自己判 `read-only`）→ `entryNoFollow()`（软链一律拒）→ `requireParentDirectory()`（目标父级
   必须存在且是目录）→ 才轮到 `unlink` / `rmdir` / `rm -r` / `mkdir` / `rename` / `copyFile`。
   删除带版本闸、复制带 `COPYFILE_EXCL`、改名卡「目标必须不存在」—— 这三条不要互相「统一」掉。

### 浏览器半边

7. **三个入口共用 `EditorSurface`**，不要为某个入口复制一份正文逻辑；入口差异只体现在 props
   （`variant` / `wrap` / `reloadKey` / `onLoaded` / `onFailed`）。
8. **草稿活过重挂**：卸载时脏则写 `drafts`、干净则删；挂载读盘后有草稿就恢复草稿**及其基线
   版本**。`drafts` 是纯派生的 UI 缓存，保存或丢弃后必须立刻删。
9. **读盘后总是回报磁盘版本**（`content.loaded(version)`），**即使缓冲区是脏的**。回报旧版本会
   让 owner 的自动刷新陷入重读循环 —— 这条最容易被「顺手优化」掉。
10. **磁盘变化不覆盖脏缓冲区**：只亮横幅，正文一个字都不动，由用户选「加载磁盘版本」还是
   「继续编辑」。
11. **编辑器页签的 pattern 必须命中不了真实地址**（`dsh-resource://workspace-editor/**`）：
    它一旦能命中，普通打开文件就会被抢走，官方预览从此进不来。显式打开不看 pattern，
    所以这条不会挡住按钮。
12. **`doc.version`（草稿基线，版本闸用）与 `doc.diskVersion`（磁盘现状，展示与冲突判定用）
    是两个字段**，不要合并。
13. **删除按钮要两次点击**：第一下只进确认态、同时抓版本基线（按钮在这期间禁用显示「检查中…」），
    第二下才发请求；确认态 / 冲突态 8 秒自己过期；**每个状态都要有出路**（失败态也得留「取消」，
    否则按钮消失、用户连重试都点不到）；删成功用 `closeTarget` 关掉点击时捕获的那张页签。
14. **「文件编辑」面板是页类型，不是新槽位**：`sidebarRightTabs.register`（无 patterns，只能按
    kind 打开）+ `sidebar.right.pane.tab` 同 id 的正文；列表 / 监听只用官方只读 Remote
    （`list` / `stat` / `changes` 走受管 `$stream`），变更一律打插件自己的五条路由。树的面板
    **单击文件开编辑器页签时必须带 `paneId` 且不带 `replaceTab`** —— 否则一点文件就把面板自己
    顶掉了。
15. **树的状态都在组件里，不要把目录树塞进模块级缓存**：换会话 / 换工作区根靠外层 `key` 重挂，
    每个加载过的目录订阅一次变更流（120ms 防抖合并重列），读盘用代次号挡住晚到的旧结果。
16. **重命名等行操作只允许有「一套实现、多个入口」**：行内图标、行尾常显的「⋯」菜单、右键菜单、
    工具条按钮、F2 全部调同一个 `startRename()` —— 不要再写第二份改名逻辑。新增行操作时照这个
    形状加（`menuItem()` 一处声明、各处复用），并记得**常显入口**：只有悬停才出现的按钮等于
    没有按钮（用户反馈过一次「tree 缺重命名」）。
17. **「发送到 DSH」的两个细节不要「顺手优化」掉**：插进输入框的引用**必须带尾随空格** ——
    否则 `@` 触发检测会认为用户正在输引用、把 `@` 文件菜单唤出来，用户得手动 Esc；
    `captureInsertion()` 与 `insertText()` 必须挨着调用 —— 中间任何编辑都会让版本 CAS 失败、
    插入被静默拒绝。引用文本只用 `lineReferenceToken()` 拼，自己拼字符串必然绕不开
    引号 / 空白 / 控制字符的边界（官方 grammar 表示不了的就是 `null`，别硬塞）。
18. **别假设槽位标准 prop 都在；也别往 `h(...)` 的子元素里多打一个 `)`** —— 这两条各造成过
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

## 代码风格

- 中文 JSDoc（`@param` / `@returns` / `@throws`）；注释解释**为什么** —— 尤其是反直觉的取舍
  （版本闸、脏缓冲区回报版本、页签顶替、三道闸的顺序），不解释语法。
- **`index.js`**：无分号、单引号、2 空格缩进；`function` 声明 + 顶层 `const` 常量；工具函数保持
  纯函数，失败用 `RequestError`（带 `status` + 线上 `code`）表达。
- **`client.js`**：无分号、单引号、2 空格缩进；文案字典与 `CSS` 模板里**内层用双引号**
  （`'…'` 包着 `"…"`），这是刻意的，不要「统一」成单引号。
- 组件用 `React.createElement`（`h`），不用 JSX —— 这个 bundle 没有构建步骤。
- 样式只挂组件本地 `<style>` 且只用主题令牌（`--dsw-alias-*`），不要引外部样式表、不要写死
  颜色。
- 给测试 / 调试用的钩子一律走 `data-workspace-editor-*` 属性，不要用 `class` 选择器或
  可见文案当锚点。

## 验证规范

改完至少跑：

```bash
node --check index.js
node --check client.js
```

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
  `RENAME_URL` / `COPY_URL` 的注释；两边路径必须逐字一致。
- 动保存 / 冲突 / 草稿逻辑 → 同步 [IMPLEMENTATION.md](IMPLEMENTATION.md) 的「数据不丢的四条
  规矩」；动删除按钮的状态机 → 同步同文件的「规矩 4：删除要两次点击」；动「文件编辑」面板 →
  同步同文件的「「文件编辑」面板：浏览器侧的设计」。
- 动 Host 侧的闸 → 同步 [IMPLEMENTATION.md](IMPLEMENTATION.md) 的「一次保存的完整路径」
  （五条路由那张图）、「删除 / 改名 / 建目录 / 复制为什么走 `node:fs`」与「四条实现约束」。
- 已知边界（1 MiB 编辑上限、没有高亮 / 行号 / 多文件、页签顶替而非就地切换、官方文件树仍只读、
  删除永久且带毫秒级窗口、面板不做多选 / 不复制目录 / 不递归建中间目录、改名的预检窗口、递归
  删除只盖直接条目、`link:` 下 Host 半边要重启、草稿只在内存里、发送的是纯文本引用而非芯片、
  发送目标恒为当前会话、右键菜单替代原生文本框菜单、插入不聚焦输入框）写在 README 末尾；
  **没真正解决之前不要从文档里删掉**。
- **文档分工别混**：README 只回答「怎么用」（用户视角的问题进排错表 / 已知边界），
  IMPLEMENTATION 只回答「为什么」；别让 README 重新长出实现细节。


## 其他事项
- 修改提交后记得push
