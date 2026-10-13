# AGENTS.md

给 AI 编码代理的项目须知。文档分工：[README.md](README.md) 讲**怎么用**（安装、怎么进编辑器、
线上协议、排错、怎么验证、已知边界），[IMPLEMENTATION.md](IMPLEMENTATION.md) 讲**为什么这么
实现**（设计决策、两半怎么拼、四条约束的来龙去脉）。与代码冲突时以代码为准。

## 项目是什么

`@dongasai/dsh-editor` —— DSH 插件，一个包两半：**Host 半边** [index.js](index.js) 注册唯一一条
写路由 `POST /workspace-editor/write`；**浏览器半边** [client.js](client.js) 在右侧栏文档预览里
注册可编辑的渲染器、一个编辑器页签类型与预览头部的「✎ 编辑」按钮。

三句话概括设计：写走**自注册的 HTTP 路由**（新增 Remote 命名空间需要构建期生成物，`link:`
安装走不通）；三档入口（默认渲染器 / 可选渲染器 / 编辑器页签）**共用同一份正文**；每次保存都
**带版本闸**，磁盘中途变过就停下来问人，不静默覆盖。

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
| [index.js](index.js) | Host 半边全部实现（335 行）：一条路由 + 三道闸 + 版本闸 |
| [client.js](client.js) | 浏览器半边全部实现（789 行）：三档入口 + `EditorSurface` |
| [cordis.patch.yml](cordis.patch.yml) | 插进 profile 的那一行 |
| [package.json](package.json) | bundle 清单：`dsh.bundle.patch` + `dsh.client`（`platform` / `immediately` / `inject`） |
| [locale/zh.json](locale/zh.json) / [locale/en.json](locale/en.json) | 插件列表里的标题与描述 |
| [icon.svg](icon.svg) | 插件卡片图标 |
| [README.md](README.md) | **怎么用**：安装、编辑器入口、线上协议、排错、怎么验证、已知边界 |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | **为什么**：设计决策、一次保存的路径、四条约束 |
| [AGENTS.md](AGENTS.md) | 本文件：命令、约束清单、改动连带项 |

`index.js` 内部顺序：常量 → `FS_FAILURES` 码表 → `name` / `inject` → `apply` → `route` →
`rejected`（信任围栏）→ `requestLifetime`（断连 + 墙钟）→ `parseWriteRequest` → `writeWorkspaceFile`
（lstat → resolve/contains → sandboxPolicy → writeText）→ `resolveSessionRoot` → `readBody` →
`sendFailure` → 若干纯工具函数。

`client.js` 内部顺序：常量（`WRITE_URL` / 两个扩展名表 / 三个 id / `EDITOR_TAB_PATTERN` /
模块级 `drafts` / `CSS`）→ 文案 `zh` / `en` → 地址工具（`addressParts` /
`parseSessionFileAddress` / `absoluteFileAddress` / `fileNameOf` / `paneTarget`）→
`createEditor(ctx)`（`EditorSurface` / `DocumentBody` / `PaneBody` / `EditAction`）→ `inject` +
`apply`。

## 硬性约束（违反即出 bug，别试探）

完整来龙去脉见 [IMPLEMENTATION.md](IMPLEMENTATION.md) —— 这里是要背下来的规则。

### Host 半边

1. **只 import `node:` 内建模块**，不新增任何依赖。`FsError` 这类官方类型改为按 `error.code`
   判别（查 `FS_FAILURES` 表），不 import 官方包，也不导出 `Config`（那需要 schemastery）。
2. **写入必须同时过三道闸**：Connection 信任围栏（`ctx.connection.requestRejection`）→ 会话
   工作区包含性检查（`ctx.fs.contains`）→ `ctx.fs` 自身的沙箱策略围栏（显式传入
   `ctx.sandboxPolicy.resolve({ session })`）。**不要为了「方便保存」放宽任何一道**，也不要拿掉
   `lstat` 的符号链接检查。
3. **写入带版本闸**：`expectedVersion` → `{ kind: 'replaceIfVersion' }`；`create` →
   `{ kind: 'createIfAbsent' }`；不传 `expectedVersion` 才是无条件覆盖（只允许发生在用户点过
   「覆盖保存」之后）。
4. **不改观察状态**：不 `emit('fs/observed', …)`。人工在 GUI 里改过的文件对模型来说必须仍是
   「没读过」。
5. **错误按 `code` 判别，绝不看 `message`**；表里没有的码一律 500 `write-failed` 并记日志，
   不要新增「猜」的分支。

### 浏览器半边

6. **三个入口共用 `EditorSurface`**，不要为某个入口复制一份正文逻辑；入口差异只体现在 props
   （`variant` / `wrap` / `reloadKey` / `onLoaded` / `onFailed`）。
7. **草稿活过重挂**：卸载时脏则写 `drafts`、干净则删；挂载读盘后有草稿就恢复草稿**及其基线
   版本**。`drafts` 是纯派生的 UI 缓存，保存或丢弃后必须立刻删。
8. **读盘后总是回报磁盘版本**（`content.loaded(version)`），**即使缓冲区是脏的**。回报旧版本会
   让 owner 的自动刷新陷入重读循环 —— 这条最容易被「顺手优化」掉。
9. **磁盘变化不覆盖脏缓冲区**：只亮横幅，正文一个字都不动，由用户选「加载磁盘版本」还是
   「继续编辑」。
10. **编辑器页签的 pattern 必须命中不了真实地址**（`dsh-resource://workspace-editor/**`）：
    它一旦能命中，普通打开文件就会被抢走，官方预览从此进不来。显式打开不看 pattern，
    所以这条不会挡住按钮。
11. **`doc.version`（草稿基线，版本闸用）与 `doc.diskVersion`（磁盘现状，展示与冲突判定用）
    是两个字段**，不要合并。

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
- 动线上协议（路由路径、字段、错误码、上限）→ 同步 README 的「线上协议」整节、`FS_FAILURES`
  表与 [client.js](client.js) 里 `WRITE_URL` 的注释；两边路径必须逐字一致。
- 动保存 / 冲突 / 草稿逻辑 → 同步 [IMPLEMENTATION.md](IMPLEMENTATION.md) 的「数据不丢的三条
  规矩」。
- 动 Host 侧的闸 → 同步 [IMPLEMENTATION.md](IMPLEMENTATION.md) 的「一次保存的完整路径」与
  「四条实现约束」。
- 已知边界（1 MiB 编辑上限、没有高亮 / 行号 / 新建入口、页签顶替而非就地切换、文件树仍只读、
  `link:` 下 Host 半边要重启、草稿只在内存里）写在 README 末尾；**没真正解决之前不要从文档里
  删掉**。
- **文档分工别混**：README 只回答「怎么用」（用户视角的问题进排错表 / 已知边界），
  IMPLEMENTATION 只回答「为什么」；别让 README 重新长出实现细节。
