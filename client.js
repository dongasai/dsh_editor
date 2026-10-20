/**
 * @module @dongasai/dsh-editor/client
 *
 * **工作区文件编辑器 —— 浏览器半边**。给右侧栏补上「改」的能力，一共三个入口，
 * 共用同一份可编辑正文（`EditorSurface`）：
 *
 * 1. **文档渲染器（默认档，`priority: 'extension'`）**：数据 / 配置 / 纯文本类扩展名。
 *    这些文件在官方渲染器里本来只有只读纯文本或代码预览，没有行号跳转等不可替代的能力，
 *    所以让编辑器直接当默认视图 —— 从文件树点开就能改、就能存。
 * 2. **文档渲染器（可选档，`priority: 'builtin'`）**：代码 / 文档类扩展名。官方已有更合适的
 *    只读渲染器（Markdown 排版、代码高亮 + 行号定位），编辑器只作为「打开方式」下拉里的
 *    一个选项出现，不抢默认。
 * 3. **「编辑」按钮 + 编辑器页签**：预览工具栏上的按钮，对**任何文本文件**一键进编辑器 ——
 *    它用编辑器页签**顶掉**当前那张预览页签（同一个面板、同一个位置，`replaceTab`），
 *    该文件的编辑器页签已经开着时就聚焦它。这是给 `.md` / `.ts` 这类「默认不进编辑器」的
 *    文件准备的快捷入口 —— 不用去「打开方式」下拉里翻。
 *
 * ## 为什么按钮是「换页签」而不是「就地切换渲染器」
 *
 * 预览用哪个渲染器由文档预览自己的 store 决定（`selected = candidates.find(id ===
 * state.rendererId) ?? candidates[0]`），`state.rendererId` 只有它自己的下拉能写，外部插件
 * 没有公开入口 —— 所以「原地把预览换成编辑器」做不到。右侧栏的**页签**是公开的：
 * `ctx.sidebarRightTabs.register` 注册一个 kind，`ctx.sidebarRight.openResource(address,
 * { kind, replaceTab })` 显式打开它并顶掉当前页签（侧边栏的 `claim(address, kind)` 只查
 * `canOpen`、**不查 patterns**），于是编辑器页签既不会跟官方预览抢自动打开的文件，又能
 * 一键到达、且不留下两张同文件的页签。
 *
 * ## 数据不丢的三条规矩（改代码时别踩）
 *
 * 1. **未保存草稿活过重挂**：切标签 / 关掉页签再打开都会卸载正文组件，草稿放在模块级
 *    `drafts` 里按 `会话 + 路径` 索引，重挂时恢复（纯派生的 UI 缓存，保存或丢弃后立刻删）。
 * 2. **磁盘变化不覆盖草稿**：渲染器模式下文件在磁盘上变了会推进 `content.revision`；
 *    缓冲区是脏的时候就只提示、不覆盖，横幅里由用户选「加载磁盘版本」还是「继续编辑」。
 * 3. **保存带版本闸**：保存时把「缓冲区基线对应的版本」作为 `expectedVersion` 送上去，
 *    磁盘变过就返回 `stale-version`，横幅里让用户显式点「覆盖保存」。
 *
 * 另外（渲染器模式）：读盘后**总是**把读到的磁盘版本回报给 `content.loaded(version)`，
 * 即使缓冲区是脏的 —— 文档预览的 owner 用这个版本号判断「磁盘变了没有」，若回报旧版本，
 * 它的自动刷新会一直认为需要重读，形成重读循环。
 *
 * ## 把文件与行号发到对话输入框
 *
 * 编辑器正文的文本框上**右键**有一份菜单：除剪切 / 复制 / 粘贴 / 全选外，最后一项是
 * **「发送到 DSH 输入框」** —— 它把「当前文件 + 选区所在行」拼成 DSH 的 `@` 引用
 * （`@A.html#L15` / `@A.html#L15-20`，工作区内的路径按相对路径写）插进**这个会话的**
 * 对话输入框，位置就是输入框里光标上次所在处。
 *
 * 写入面的来源有两条，**两条都不假设侧栏槽位实际传了什么 prop**：
 *
 * 1. **就近的槽位 prop**：渲染点给了 `inputActions` 就直接用（作用域最明确）。
 * 2. **哨兵注册表兜底**：「文件编辑」之外，本插件还在 `conversation.input.dock` 注册了一个
 *    渲染 `null` 的哨兵 —— 挂载时把该会话的 `inputActions` 记进模块级 `inputTargets`，
 *    卸载即删。那是官方自己（语音输入、目标栏）在用的位置，这个面一定有。
 *
 * **为什么不只信槽位 prop**：slot catalog 列的是**类型并集**，某个渲染点可能只传了子集。
 * `sidebar.right.tab.document` 的正文就拿不到 `useSessions`，而正文里直接调用它的后果是
 * `TypeError` → React 卸载整棵子树 → **编辑器整块白屏**（真踩过，见 AGENTS.md 约束 19）。
 * 所以工作区根也不走 prop：从 `ctx.sessions.list.getSnapshot()` 在事件里现读（比渲染期的
 * prop 还新），读不到就退回绝对路径 —— 少一个相对化，绝不让整块正文挂掉。
 *
 * 插进去的是**普通文本而不是芯片**：官方公开面 `InputActions` 只有
 * `insertText(text, span)`，没有带结构化引用的插入（带引用的那条路只对内通过
 * scoped event 开放）；`#L` 行号语法交给模型侧解析，与 Harness 系统提示里规定的
 * `@…#L` 引用写法一致。**尾随空格是刻意的** —— `@` 触发检测要求触发 token 紧贴光标，
 * 空格让刚插进去的引用不会又把 `@` 文件菜单唤出来。
 *
 * 拿不到写入面（会话还没起来、对话区没打开、或输入框正被审批 / 问答占用）或插入被拒
 * （正在提交、草稿刚变过）时，只在编辑器里亮一条横幅说明，不静默失败。
 *
 * ## 语法高亮：一层等宽文本 + Custom Highlight API
 *
 * 可编辑正文是 `<textarea>`，颜色只有一条稳的路：**底下铺一层等宽文本**（高亮层），textarea 的
 * 字设为透明（只留光标与选区），看得见的字形全来自高亮层。两层必须逐字逐行重合，所以排版样式
 * 写在同一组 CSS 规则里、宽度与滚动每轮渲染后贴一次、正文结尾是换行（或正文为空）时高亮层补一个
 * `<br>`（textarea 给结尾空行留行盒，块级文本不给）。
 *
 * 上色**不用 `<span>` 包令牌**，而是 `Range` + `::highlight()`：高亮层里只有一个文本节点，
 * 一个 DOM 节点都不加。`<span>` 方案每次按键都要重建整篇高亮 DOM（实测 26 KiB 就要 37 ms，
 * 打字明显掉帧），换成 Range 之后同样内容只要 9 ms。语言按**后缀**选一套近似规则表（十几档，
 * 见 `LANGUAGE_BY_EXTENSION`），认不出的后缀、超过 256 KiB 字符 / 2 万令牌、或浏览器没有
 * Custom Highlight API 时按纯文本显示 —— 状态挂在 `data-workspace-editor-highlight` 上。
 *
 * 高亮那一段是**纯函数**（夹在 `highlight:start` 与 `highlight:end` 两个标记之间），不碰 React 与
 * DOM，可以整段截出来单独跑；Range 与注册表的胶水在它下面。来龙去脉与实测数据见
 * [IMPLEMENTATION.md](IMPLEMENTATION.md) 的「语法高亮」一节。
 *
 * ## 「文件编辑」面板里的粘贴：两个来源，一场两路
 *
 * 面板的「粘贴」有两种来源，**内部剪贴板优先**：
 *
 * 1. **树内剪贴板**（「复制到剪贴板」/「剪切」/ Ctrl+C / Ctrl+X）—— 存在模块级 `filesClipboard`
 *    里（像草稿一样活过重挂），粘贴时走官方的复制 / 改名路由，所以不碰二进制、也没有新路由。
 * 2. **系统剪贴板里的文件** —— 键盘 Ctrl/Cmd+V 走 `paste` 事件（`clipboardData` 里带**真文件名**），
 *    菜单 / 工具条上的「粘贴」按钮只能走 `navigator.clipboard.read()`（那个 API **不给文件名**，
 *    只能按 MIME 起名）。两条路最后都打成 `POST /workspace-editor/upload`：base64 → 新文件，
 *    目标必须不存在。
 *
 * `paste` 事件只处理**文件**，纯文本一律放行（不 `preventDefault`）；目录明确说明不支持 ——
 * 浏览器拿不到剪贴板里目录的内容。
 */

/**
 * 整个 bundle 包在这层 IIFE 里 —— **这不是风格选择，是必需的**。
 *
 * 宿主 `@deepseek-ai/dsh-client-modules` 的 `buildComboScript` 把 profile 里所有 client bundle
 * 的源码**直接拼成一个 classic script**（`source += resource.source + ';\n'`），**不按包加作用域
 * 隔离**。于是所有插件的顶层词法声明共享同一个全局作用域：两个插件各写一个同名顶层
 * `const PACKAGE_NAME`，整条 combo 就抛 `SyntaxError: Identifier 'PACKAGE_NAME' has already been
 * declared` —— **一个 bundle 都不注册**，页面表现为「loaded without registering … via
 * __ModuleLoader__.load」，而这条报错完全看不出是跟别的插件撞了名（真踩过：与
 * `@dongasai/dsh-sidebar-terminal` 的顶层 `const PACKAGE_NAME` 相撞）。
 *
 * 所以本文件的顶层**只允许**注释与这一个 IIFE；要加顶层常量，请加在 IIFE 内部。
 */
;(() => {
/**
 * 插件包名。两个用处：`__ModuleLoader__.load` 的 id，以及「文件编辑」面板页脚的归属信息
 * （页脚要按它去 Host 的插件清单里认领自己的版本号）—— 只此一份字面量。
 */
const PACKAGE_NAME = '@dongasai/dsh-editor'

window.__ModuleLoader__.load({
  id: PACKAGE_NAME,
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** 界面文案命名空间。 */
    const NS = 'workspaceEditor'

    /** 写文件路由；与 Host 半边注册的绝对路径逐字一致。 */
    const WRITE_URL = '/workspace-editor/write'

    /** 删除条目路由；与 Host 半边注册的绝对路径逐字一致。 */
    const DELETE_URL = '/workspace-editor/delete'

    /** 新建目录路由；与 Host 半边注册的绝对路径逐字一致。 */
    const MKDIR_URL = '/workspace-editor/mkdir'

    /** 重命名 / 移动路由；与 Host 半边注册的绝对路径逐字一致。 */
    const RENAME_URL = '/workspace-editor/rename'

    /** 复制文件路由；与 Host 半边注册的绝对路径逐字一致。 */
    const COPY_URL = '/workspace-editor/copy'

    /** 粘贴上传路由（base64 → 新文件）；与 Host 半边注册的绝对路径逐字一致。 */
    const UPLOAD_URL = '/workspace-editor/upload'

    /** 一次粘贴上传的字节上限：与 Host 的 `MAX_UPLOAD_BYTES` 同一个数，超了先在客户端拦下来。 */
    const MAX_PASTE_BYTES = 4 * 1024 * 1024

    /** 能在这个编辑框里安全编辑的文本上限（UTF-16 码元）。 */
    const MAX_EDIT_CHARS = 1024 * 1024

    /** 文件地址前缀（官方 `dsh-resource://file/` 语法）。 */
    const FILE_ADDRESS_PREFIX = 'dsh-resource://file/'

    /** 默认档扩展名：官方只有只读纯文本 / 代码预览的数据、配置、日志类文件。 */
    const DEFAULT_EXTENSIONS = [
      'txt', 'text', 'log', 'json', 'jsonc', 'json5', 'jsonl', 'ndjson',
      'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'config', 'env', 'properties', 'lock',
    ]

    /** 可选档扩展名：已有 Markdown / 代码高亮 / 行号定位等更合适默认视图的文件。 */
    const OPTIONAL_EXTENSIONS = [
      'md', 'markdown', 'mdx', 'rst', 'adoc', 'tex',
      'html', 'htm', 'xhtml', 'xml', 'xsl', 'xslt', 'svg',
      'css', 'scss', 'sass', 'less',
      'js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'cts', 'tsx', 'vue', 'svelte', 'astro',
      'py', 'pyi', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'scala', 'swift', 'cs', 'php',
      'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh', 'hxx', 'm', 'mm',
      'lua', 'pl', 'pm', 'r', 'jl', 'dart', 'ex', 'exs', 'erl', 'hrl', 'hs', 'clj', 'cljs',
      'sh', 'bash', 'zsh', 'fish', 'ksh', 'ps1', 'psm1', 'bat', 'cmd',
      'sql', 'graphql', 'gql', 'proto', 'csv', 'tsv', 'gradle', 'groovy', 'cmake', 'mk',
      'diff', 'patch', 'asm', 's', 'nim', 'zig', 'v',
    ]

    /**
     * 编辑器页签类型刻意声明一个**命中不了任何真实地址**的 pattern：这样它永远不参与自动
     * 排名（普通打开文件仍旧是官方预览），而显式指定 kind 的打开不看 pattern（见侧边栏的
     * `claim(address, kind)`，那里只有 `canOpen` 仍然生效）。
     */
    const EDITOR_TAB_PATTERN = 'dsh-resource://workspace-editor/**'

    /** 两档渲染器与页签类型的 id（正文组件同一份，注册在各自的槽位里）。 */
    const DEFAULT_RENDERER_ID = '@dongasai/dsh-editor/text'
    const OPTIONAL_RENDERER_ID = '@dongasai/dsh-editor/text-option'
    const EDITOR_TAB_ID = '@dongasai/dsh-editor/tab'

    /** 编辑器页签的 kind（`openResource(address, { kind })` 里用的名字）。 */
    const EDITOR_KIND = 'workspace-editor'

    /**
     * 图片预览页签的 kind / id / pattern。
     *
     * 与编辑器页签同一套做法：pattern 刻意**命中不了任何真实地址**（图片自动打开仍然归官方预览），
     * 只有显式点名 kind 才开 —— 本插件的文件树就是这么开的。
     */
    const IMAGE_TAB_ID = '@dongasai/dsh-editor/image'
    const IMAGE_KIND = 'workspace-editor-image'
    const IMAGE_TAB_PATTERN = 'dsh-resource://workspace-editor-image/**'

    /** 未保存草稿，按 `会话 + 路径` 索引；切标签 / 关页签都会重挂正文，草稿要活过重挂。 */
    const drafts = new Map()

    /**
     * 对话输入框的写入面，按会话索引：`conversation.input.dock` 的哨兵挂载时登记、卸载即删。
     * 编辑器「发送到 DSH」优先用自己槽位上的 `inputActions` prop，prop 没有（侧栏某些渲染点
     * 不传标准 prop，见文件头注释）时从这里取。
     */
    const inputTargets = new Map()

    /**
     * 「文件编辑」面板的内部剪贴板（树里「复制到剪贴板」/「剪切」→ 在别的目录「粘贴」）。
     *
     * 刻意放在模块级：它和草稿一样是**跨重挂**的界面状态 —— 关掉面板再打开、切一下页签，剪贴板
     * 不该就没了。约束 15 说的是「不要把目录树本身塞进模块级缓存」，剪贴板不是目录树：它只有一条
     * `{ mode: 'copy' | 'cut', path, name }`，谁挂载谁读它，路径真不真由 Host 的三道闸兜底。
     * 粘贴成功后剪切清空、复制保留（可以连着贴好几处）。
     */
    let filesClipboard = null

    /** 组件本地样式：随组件挂载渲染、卸载即消失，只用主题令牌。 */
    const CSS = `
.dsh-we-root{display:flex;flex-direction:column;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size-secondary,13px)}
.dsh-we-fill{position:absolute;inset:0}
.dsh-we-pane{flex:auto;height:100%}
.dsh-we-bar{display:flex;align-items:center;gap:8px;flex:none;padding:6px 10px;border-bottom:.5px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsh-we-spacer{flex:1 1 auto}
.dsh-we-hint{white-space:nowrap}
.dsh-we-status-path{max-width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary)}
.dsh-we-status[data-tone="saved"]{color:var(--dsw-alias-state-success-primary)}
.dsh-we-status[data-tone="dirty"]{color:var(--dsw-alias-state-warn-primary)}
.dsh-we-status[data-tone="error"]{color:var(--dsw-alias-state-error-primary)}
.dsh-we-button{font:inherit;font-size:12px;line-height:18px;padding:4px 10px;border-radius:6px;border:.5px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap}
.dsh-we-button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.dsh-we-button:disabled{opacity:.4;cursor:not-allowed}
.dsh-we-button[data-primary="true"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dsh-we-button[data-primary="true"]:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.dsh-we-open{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 8px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap;flex:none}
.dsh-we-open:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
.dsh-we-open[data-danger="true"]{color:var(--dsw-alias-state-error-primary)}
.dsh-we-open[data-danger="true"]:hover:not(:disabled){color:var(--dsw-alias-state-error-primary)}
.dsh-we-open:disabled{opacity:.4;cursor:not-allowed}
.dsh-we-note{display:inline-block;max-width:30ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsh-we-note[data-tone="warn"]{color:var(--dsw-alias-state-warn-primary)}
.dsh-we-note[data-tone="error"]{color:var(--dsw-alias-state-error-primary)}
.dsh-we-banner{flex:none;display:flex;align-items:center;gap:10px;margin:0;padding:6px 10px;font-size:12px;background:var(--dsw-alias-bg-layer-2);border-bottom:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
.dsh-we-banner[data-tone="warn"]{color:var(--dsw-alias-state-warn-primary)}
.dsh-we-banner[data-tone="error"]{color:var(--dsw-alias-state-error-primary)}
.dsh-we-banner[data-tone="success"]{color:var(--dsw-alias-state-success-primary)}
.dsh-we-banner-text{flex:1 1 auto;white-space:normal;overflow-wrap:anywhere}
.dsh-we-detail{color:var(--dsw-alias-label-secondary)}
.dsh-we-code{position:relative;flex:1 1 auto;min-height:0;overflow:hidden}
.dsh-we-editor,.dsh-we-hl{box-sizing:border-box;margin:0;padding:8px 10px;border:none;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:inherit;line-height:1.6;tab-size:2;white-space:pre}
.dsh-we-hl{position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;pointer-events:none;user-select:none;color:var(--shiki-foreground,var(--dsw-alias-label-primary))}
.dsh-we-editor{position:absolute;top:0;left:0;width:100%;height:100%;outline:none;resize:none;background:transparent;color:transparent;-webkit-text-fill-color:transparent;caret-color:var(--dsw-alias-label-primary);overflow:auto}
.dsh-we-editor::selection{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary)) 30%,transparent)}
.dsh-we-editor[data-wrap="true"],.dsh-we-code[data-wrap="true"] .dsh-we-hl{white-space:pre-wrap;overflow-wrap:anywhere}
::highlight(dsh-we-com){color:var(--shiki-token-comment,var(--dsw-alias-label-tertiary))}
::highlight(dsh-we-str){color:var(--shiki-token-string,var(--dsw-alias-label-primary))}
::highlight(dsh-we-exp){color:var(--shiki-token-string-expression,var(--shiki-token-string,var(--dsw-alias-label-primary)))}
::highlight(dsh-we-num){color:var(--shiki-token-constant,var(--dsw-alias-label-primary))}
::highlight(dsh-we-kw){color:var(--shiki-token-keyword,var(--dsw-alias-label-primary))}
::highlight(dsh-we-fn){color:var(--shiki-token-function,var(--dsw-alias-label-primary))}
::highlight(dsh-we-var){color:var(--shiki-token-parameter,var(--dsw-alias-label-primary))}
::highlight(dsh-we-pun){color:var(--shiki-token-punctuation,var(--dsw-alias-label-secondary))}
::highlight(dsh-we-lnk){color:var(--shiki-token-link,var(--dsw-alias-brand-primary))}
.dsh-we-message{flex:1 1 auto;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:12px;padding:16px 20px;text-align:center;color:var(--dsw-alias-label-secondary);line-height:1.6;white-space:normal}
.dsh-wi-body{flex:1 1 auto;min-height:0;overflow:auto;display:flex;align-items:center;justify-content:center;padding:12px;background:var(--dsw-alias-bg-layer-2)}
.dsh-wi-image{max-width:100%;max-height:100%;object-fit:contain}
.dsh-wi-body[data-fit="false"]{display:block}
.dsh-wi-body[data-fit="false"] .dsh-wi-image{max-width:none;max-height:none}
.dsh-we-message-text{margin:0;overflow-wrap:anywhere}
.dsh-wef-root{display:flex;flex-direction:column;flex:auto;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:1.5}
.dsh-wef-bar{flex:none;display:flex;align-items:center;gap:2px;height:38px;padding:0 6px 0 12px;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.dsh-wef-path{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:12px}
.dsh-wef-tool{width:26px;height:26px;flex:none;display:inline-flex;align-items:center;justify-content:center;padding:0;border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsh-wef-tool:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.dsh-wef-tool:disabled{opacity:.4;cursor:not-allowed}
.dsh-wef-banner{flex:none;display:flex;align-items:center;gap:8px;padding:6px 10px;font-size:12px;background:var(--dsw-alias-bg-layer-2);border-bottom:.5px solid var(--dsw-alias-border-l1)}
.dsh-wef-banner[data-tone="error"]{color:var(--dsw-alias-state-error-primary)}
.dsh-wef-banner[data-tone="warn"]{color:var(--dsw-alias-state-warn-primary)}
.dsh-wef-banner[data-tone="ok"]{color:var(--dsw-alias-state-success-primary)}
.dsh-wef-banner-text{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}
.dsh-wef-body{flex:1 1 auto;min-height:0;overflow:auto;padding:6px 4px 12px;scrollbar-gutter:stable}
.dsh-wef-body[data-drop="true"]{background:var(--dsw-alias-bg-layer-2)}
.dsh-wef-row{display:flex;align-items:center;gap:4px;width:100%;box-sizing:border-box;padding:4px 6px 4px 2px;border:none;background:transparent;color:inherit;font:inherit;text-align:left;border-radius:var(--dsw-radius-sm,6px);cursor:pointer}
.dsh-wef-row:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.dsh-wef-row[data-selected="true"]{background:var(--dsw-alias-interactive-bg-selected,var(--dsw-alias-bg-layer-2));box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary,#4d6bfe)}
/* 行左侧常显的多选框 = 多选的主入口。选中态刻意做**三重独立信号**（勾选框填充 / 行背景 /
   左侧色条），且勾选框与色条都带硬编码兜底色：皮肤可以改 --dsw-alias-* 这套变量，但改不出「看不见」
   （真踩过：orca-link 皮肤下 --dsw-alias-interactive-bg-selected 与常态无差别，多选完全无反馈）。 */
.dsh-wef-check{width:16px;height:16px;flex:none;display:inline-flex;align-items:center;justify-content:center;padding:0;margin-right:2px;border:.5px solid var(--dsw-alias-border-l2);border-radius:3px;background:var(--dsw-alias-bg-base);color:transparent;font-size:11px;line-height:14px;cursor:pointer}
.dsh-wef-check:hover{border-color:var(--dsw-alias-brand-primary,#4d6bfe)}
.dsh-wef-check[data-checked="true"]{background:var(--dsw-alias-brand-primary,#4d6bfe);border-color:var(--dsw-alias-brand-primary,#4d6bfe);color:var(--dsw-alias-bg-base,#fff)}
/* 表头那颗全选框的「半选」态：勾了但不全 —— 用一条横线，不是实心块。 */
.dsh-wef-check[data-checked="partial"]{border-color:var(--dsw-alias-brand-primary,#4d6bfe);color:var(--dsw-alias-brand-primary,#4d6bfe);background:var(--dsw-alias-bg-base)}
/* 光标行（F2 / 工具条「重命名选中行」的作用对象）单独给一条虚线勾边：它和「勾上了」是两件事，
   不能共用同一个视觉，否则看不出 F2 会改哪一行。 */
.dsh-wef-row[data-anchor="true"]:not([data-drop="true"]){outline:1px dashed var(--dsw-alias-border-l2);outline-offset:-1px}
.dsh-wef-check-gap{width:18px;flex:none}
.dsh-wef-row[data-drop="true"]{outline:1px dashed var(--dsw-alias-brand-primary);outline-offset:-1px}
.dsh-wef-row[data-busy="true"]{opacity:.5}
.dsh-wef-row[data-hidden="true"] .dsh-wef-name,.dsh-wef-row[data-hidden="true"] .dsh-wef-glyph{opacity:.55}
.dsh-wef-caret{width:16px;height:16px;flex:none;display:inline-flex;align-items:center;justify-content:center;padding:0;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.dsh-wef-spacer{width:16px;flex:none}
.dsh-wef-glyph{flex:none;display:inline-flex;color:var(--dsw-alias-label-tertiary)}
.dsh-wef-row[data-kind="directory"] .dsh-wef-glyph{color:var(--dsw-alias-label-secondary)}
.dsh-wef-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wef-actions{flex:none;display:none;align-items:center;gap:2px}
.dsh-wef-row:hover .dsh-wef-actions,.dsh-wef-row:focus-within .dsh-wef-actions,.dsh-wef-row[data-selected="true"] .dsh-wef-actions{display:inline-flex}
.dsh-wef-more{width:20px;height:20px;flex:none;display:inline-flex;align-items:center;justify-content:center;padding:0;border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;opacity:.7}
.dsh-wef-more:hover{opacity:1;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.dsh-wef-backdrop{position:fixed;inset:0;z-index:40}
.dsh-wef-menu{position:fixed;z-index:41;min-width:158px;display:flex;flex-direction:column;gap:1px;padding:4px;border-radius:var(--dsw-radius-md,8px);border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base));box-shadow:0 8px 24px var(--dsw-alias-shadow-md,rgba(0,0,0,.18))}
.dsh-wef-menu-item{display:flex;align-items:center;gap:8px;padding:5px 8px;border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;text-align:left;cursor:pointer;white-space:nowrap}
.dsh-wef-menu-item:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.dsh-wef-menu-item[data-danger="true"]{color:var(--dsw-alias-state-error-primary)}
.dsh-wef-menu-sep{height:1px;margin:3px 4px;background:var(--dsw-alias-border-l1)}
.dsh-wef-menu-check{flex:none;width:12px;color:var(--dsw-alias-brand-primary)}
.dsh-wef-batch{flex:none;display:flex;align-items:center;gap:6px;padding:5px 10px;border-bottom:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base));font-size:12px}
.dsh-wef-batch-text{flex:none;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}
.dsh-wef-batch-fill{flex:1 1 auto}
.dsh-wef-note{margin:0;padding:3px 10px;color:var(--dsw-alias-label-tertiary);font-size:12px}
.dsh-wef-input{width:100%;box-sizing:border-box;font:inherit;font-size:12px;padding:2px 6px;border-radius:var(--dsw-radius-sm,6px);border:.5px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);outline:none}
.dsh-wef-status{flex:none;padding:6px 10px;border-top:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:12px}
.dsh-wef-clip{flex:none;display:flex;align-items:center;gap:6px;padding:6px 10px;border-top:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:12px}
.dsh-wef-clip-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-wef-gap{flex:1 1 auto}
.dsh-wef-plugin{flex:none;margin:0;padding:6px 10px;border-top:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`

    /** 界面文案。 */
    const zh = {
      'viewer.title': '编辑器',
      'tab.title': '编辑 {name}',
      'action.edit': '编辑',
      'action.save': '保存',
      'action.saving': '保存中…',
      'action.reload': '重新加载',
      'action.retry': '重试',
      'action.wrap.on': '换行：开',
      'action.wrap.off': '换行：关',
      'action.overwrite': '覆盖保存',
      'action.discard': '加载磁盘版本',
      'action.keep': '继续编辑',
      'action.delete': '删除',
      'action.deleteConfirm': '确认删除',
      'action.deleteForce': '仍然删除',
      'action.cancel': '取消',
      'editor.label': '文件内容编辑框',
      'status.loading': '读取中…',
      'status.clean': '已与磁盘同步',
      'status.dirty': '未保存的修改',
      'status.saved': '已保存',
      'status.deleting': '删除中…',
      'status.deleted': '已删除',
      'status.checking': '检查中…',
      'status.noAddress': '无法解析这个文件的地址，编辑器不可用。',
      'error.read': '读取失败：{message}',
      'error.notUtf8': '这个文件不是 UTF-8 文本，无法在页面里编辑。',
      'error.tooLarge': '文件太大（超过 {limit}），不适合在页面里编辑，请用其它工具打开。',
      'error.transport': '保存请求没有到达 Host（连接中断？），内容仍留在编辑器里。',
      'error.save': '保存失败：{message}',
      'error.delete': '删除失败：{message}',
      'error.deleteTransport': '删除请求没有到达 Host（连接中断？），文件没有被删除。',
      'error.deleteRoute': 'Host 侧还没有这条删除路由（改过 index.js 之后要重启 Harness），文件没有被删除。',
      'delete.hint': '删除后无法恢复',
      'files.title': '文件编辑',
      'files.guide': '自带文件树：新建、改名、复制 / 剪切 / 粘贴（含系统剪贴板里的文件）、删除、拖拽移动',
      'files.dropRoot': '放到这里 = 搬到工作区根目录：{path}',
      'files.shortcut': '打开「文件编辑」面板',
      'files.newFile': '新建文件',
      'files.newFolder': '新建文件夹',
      'files.rename': '重命名 / 移动',
      'files.copy': '创建副本',
      'files.copyTo': '复制到剪贴板',
      'files.cut': '剪切',
      'files.paste': '粘贴',
      'files.clipboard': '剪贴板：{name}（{mode}）',
      'files.clipboardClear': '清空',
      'files.clipboardMode.copy': '复制',
      'files.clipboardMode.cut': '剪切',
      'files.delete': '删除',
      'files.refresh': '刷新',
      'files.sort': '排序',
      'files.sort.name': '按名称',
      'files.sort.type': '按类型',
      'files.sort.dirsFirst': '目录优先',
      'files.batch.count': '已选 {count} 项',
      'files.check': '勾选这一行（用于批量操作）',
      'files.batch.copyPaths': '复制路径',
      'files.batch.selectAll': '全选',
      'files.batch.delete': '删除',
      'files.batch.clear': '清空',
      'files.batch.copied': '已复制 {count} 条路径',
      'files.batch.done': '已删除 {count} 项',
      'files.batch.failed': '{failed} 项没删成（其中 {conflicted} 项在确认期间变过），它们还留在选择里，可以重试。',
      'files.batch.retry': '重试删除',
      'files.confirmDeleteMany': '删除选中的 {count} 项？删除后无法恢复',
      'files.confirmDeleteManyDirs': '删除选中的 {count} 项（其中 {dirs} 个目录会连内容一起删）？删除后无法恢复',
      'files.open': '用编辑器打开',
      'files.more': '更多操作（重命名 / 复制 / 剪切 / 粘贴 / 删除）',
      'files.root': '工作区',
      'files.loading': '读取中…',
      'files.empty': '空目录',
      'files.truncated': '条目太多，只列出了前面这些。',
      'files.noRoot': '这个会话还没有工作区根，文件编辑不可用。',
      'files.readFailed': '读取失败：{message}',
      'files.namePlaceholder': '输入名称后回车（改名可以用 a/b 移到子目录）',
      'files.confirmDeleteFile': '删除 {name}？删除后无法恢复',
      'files.confirmDeleteDir': '删除目录 {name}（含 {count} 项，内容会一起删掉）？',
      'files.confirmDeleteEmptyDir': '删除空目录 {name}？',
      'files.recursive': '递归删除',
      'files.stale': '这个条目在确认期间变过，没有删除。',
      'files.force': '仍然删除',
      'files.cancel': '取消',
      'files.busy': '处理中…',
      'files.error.exists': '目标已经存在，没有覆盖也没有改名。',
      'files.error.notEmpty': '目录不是空的，要连内容一起删请点「递归删除」。',
      'files.error.outside': '这个路径不在当前会话的工作区内。',
      'files.error.denied': '当前会话是只读沙箱，不能改文件。',
      'files.error.notFound': '路径已经不在了（可能被模型或别的工具动过）。',
      'files.error.invalid': '这个目标不合法（例如把目录移进它自己里面）。',
      'files.error.name': '名称不能为空，也不能包含 . 或 .. 这样的路径段。',
      'files.error.absolute': '只接受相对当前目录的名字或相对路径。',
      'files.error.route': 'Host 侧还没有这条路由（改过 index.js 之后要重启 Harness）。',
      'files.error.transport': '请求没有到达 Host（连接中断？），什么都没改。',
      'files.error.generic': '操作失败（{code}）：{message}',
      'files.error.tooLarge': '文件太大，超过上限，没有粘贴。',
      'files.paste.empty': '剪贴板里没有文件（只读到文本）。先在系统里复制一个文件，再用 Ctrl/Cmd+V 或这个按钮粘贴。',
      'files.paste.denied': '浏览器不让读剪贴板。把鼠标点进这棵树，按 Ctrl/Cmd+V 粘贴文件。',
      'files.paste.unsupported': '这个浏览器不支持读剪贴板里的文件，请按 Ctrl/Cmd+V 粘贴。',
      'files.paste.directory': '「{name}」是目录：剪贴板粘贴只支持文件，目录请用拖拽或改名移动。',
      'files.paste.tooLarge': '「{name}」超过 {limit}，没有粘贴。',
      'files.paste.readFailed': '「{name}」读不出来，没有粘贴。',
      'files.copyPath': '复制路径',
      'files.copyPathRelative': '复制相对路径',
      'files.copyPath.done': '已复制：{path}',
      'files.copyPath.failed': '浏览器不让写剪贴板，路径没有复制。手动选中再复制吧。',
      'files.openTerminal': '在终端打开',
      'files.terminal.done': '已在终端打开：{path}',
      'files.terminal.missing': '这个部署没有侧边栏终端（终端页签类型没注册）。',
      'files.terminal.failed': '没能打开终端页签。',
      'files.terminal.noInput': '终端开了，但拿不到它的输入面，没能切到该目录。',
      'files.terminal.timeout': '终端开了，但等它可写超时，没能自动切到该目录。',
      'files.batchList': '批量列目录 (F2)',
      'files.batchListTitle': '已选 {count} 个目录的内容',
      'files.copyEntries': '复制条目列表',
      'files.noEntries': '没有条目',
      'files.close': '关闭',
      'search.placeholder': '搜索文件内容…',
      'search.loading': '搜索中…',
      'search.noResults': '没有找到匹配项',
      'search.failed': '搜索失败',
      'search.noSession': '当前没有可用的会话，请先选择一个会话。',
      'image.title': '预览 {name}',
      'image.alt': '图片预览',
      'image.loading': '读取中…',
      'image.fit': '适配窗口',
      'image.actual': '原始大小',
      'image.meta': '{size} · {width}×{height} · {type}',
      'image.size': '{bytes} 字节',
      'image.readFailed': '读取失败：{message}',
      'image.decodeFailed': '浏览器解不开这个格式（{type}），文件本身是好的：{bytes} 字节。',
      'image.openEditor': '用编辑器打开',
      'delete.stale': '文件已变更，未删除',
      'delete.noVersion': '读不到文件状态',
      'conflict.stale': '磁盘上的文件在编辑期间变过，尚未覆盖。',
      'conflict.exists': '文件已存在，没有覆盖。',
      'conflict.message': '磁盘上的文件已被改动（可能是模型或其它工具改的），直接保存会覆盖对方的修改。',
      'changed.message': '磁盘上的文件已被改动。你的未保存修改还留着，不会被覆盖。',
      'hint.save': 'Ctrl/Cmd+S 保存',
      'action.cut': '剪切',
      'action.copy': '复制',
      'action.paste': '粘贴',
      'action.selectAll': '全选',
      'send.menu': '发送到 DSH 输入框',
      'send.menuTitle': '把 {token} 插进对话输入框',
      'send.sent': '已插入 {token}',
      'send.failed.input': '现在没有可用的对话输入框（这个会话的对话区没打开，或正被审批 / 问答占用）。',
      'send.failed.busy': '输入框正忙或内容刚变过，没有插入，再试一次。',
      'send.failed.path': '这个文件的路径没法安全地表示成引用。',
      'send.failed.clipboard': '浏览器不让写剪贴板，改用 Ctrl/Cmd+C 吧。',
    }

    const en = {
      'viewer.title': 'Editor',
      'tab.title': 'Edit {name}',
      'action.edit': 'Edit',
      'action.save': 'Save',
      'action.saving': 'Saving…',
      'action.reload': 'Reload',
      'action.retry': 'Retry',
      'action.wrap.on': 'Wrap: on',
      'action.wrap.off': 'Wrap: off',
      'action.overwrite': 'Overwrite',
      'action.discard': 'Load disk version',
      'action.keep': 'Keep editing',
      'action.delete': 'Delete',
      'action.deleteConfirm': 'Confirm delete',
      'action.deleteForce': 'Delete anyway',
      'action.cancel': 'Cancel',
      'editor.label': 'File content editor',
      'status.loading': 'Loading…',
      'status.clean': 'In sync with disk',
      'status.dirty': 'Unsaved changes',
      'status.saved': 'Saved',
      'status.deleting': 'Deleting…',
      'status.deleted': 'Deleted',
      'status.checking': 'Checking…',
      'status.noAddress': 'This file address cannot be parsed, so the editor is unavailable.',
      'error.read': 'Read failed: {message}',
      'error.notUtf8': 'This file is not UTF-8 text and cannot be edited here.',
      'error.tooLarge': 'This file is too large (over {limit}) to edit here; open it with another tool.',
      'error.transport': 'The save request never reached the host (connection lost?). Your text is still in the editor.',
      'error.save': 'Save failed: {message}',
      'error.delete': 'Delete failed: {message}',
      'error.deleteTransport': 'The delete request never reached the host (connection lost?). The file was not deleted.',
      'error.deleteRoute': 'The host has no delete route yet (restart the harness after changing index.js); the file was not deleted.',
      'delete.hint': 'Deleting cannot be undone',
      'files.title': 'File editor',
      'files.guide': 'Its own file tree: create, rename, copy / cut / paste (including files from the system clipboard), delete, drag to move',
      'files.shortcut': 'Open the file editor panel',
      'files.newFile': 'New file',
      'files.newFolder': 'New folder',
      'files.rename': 'Rename / move',
      'files.copy': 'Duplicate',
      'files.copyTo': 'Copy to clipboard',
      'files.cut': 'Cut',
      'files.paste': 'Paste',
      'files.dropRoot': 'Drop here to move into the workspace root: {path}',
      'files.clipboard': 'Clipboard: {name} ({mode})',
      'files.clipboardClear': 'Clear',
      'files.clipboardMode.copy': 'copy',
      'files.clipboardMode.cut': 'cut',
      'files.delete': 'Delete',
      'files.refresh': 'Refresh',
      'files.sort': 'Sort',
      'files.sort.name': 'By name',
      'files.sort.type': 'By type',
      'files.sort.dirsFirst': 'Folders first',
      'files.batch.count': '{count} selected',
      'files.check': 'Select this row (for batch actions)',
      'files.batch.copyPaths': 'Copy paths',
      'files.batch.selectAll': 'Select all',
      'files.batch.delete': 'Delete',
      'files.batch.clear': 'Clear',
      'files.batch.copied': 'Copied {count} paths',
      'files.batch.done': 'Deleted {count} entries',
      'files.batch.failed': '{failed} entries were not deleted ({conflicted} of them changed on disk). They stay selected, so you can retry.',
      'files.batch.retry': 'Retry delete',
      'files.confirmDeleteMany': 'Delete the {count} selected entries? This cannot be undone',
      'files.confirmDeleteManyDirs': 'Delete the {count} selected entries ({dirs} folders go with their contents)? This cannot be undone',
      'files.open': 'Open in the editor',
      'files.more': 'More actions (rename / copy / cut / paste / delete)',
      'files.root': 'Workspace',
      'files.loading': 'Loading…',
      'files.empty': 'Empty folder',
      'files.truncated': 'Too many entries; only the first ones are listed.',
      'files.noRoot': 'This session has no workspace root yet, so the file editor is unavailable.',
      'files.readFailed': 'Read failed: {message}',
      'files.namePlaceholder': 'Type a name and press Enter (a/b moves into a subfolder)',
      'files.confirmDeleteFile': 'Delete {name}? This cannot be undone',
      'files.confirmDeleteDir': 'Delete folder {name} (holds {count} entries, all of them go)?',
      'files.confirmDeleteEmptyDir': 'Delete empty folder {name}?',
      'files.recursive': 'Delete recursively',
      'files.stale': 'This entry changed while you were confirming; nothing was deleted.',
      'files.force': 'Delete anyway',
      'files.cancel': 'Cancel',
      'files.busy': 'Working…',
      'files.error.exists': 'The target already exists; nothing was overwritten or renamed.',
      'files.error.notEmpty': 'The folder is not empty; use "Delete recursively" to remove its contents too.',
      'files.error.outside': 'That path is outside this session\'s workspace.',
      'files.error.denied': 'This session is a read-only sandbox; files cannot be changed.',
      'files.error.notFound': 'The path is gone (the agent or another tool may have moved it).',
      'files.error.invalid': 'That target is not allowed (moving a folder into itself, for example).',
      'files.error.name': 'The name cannot be empty or contain . / .. path segments.',
      'files.error.absolute': 'Only a name or a relative path inside the current folder is accepted.',
      'files.error.route': 'The host has no such route yet (restart the harness after changing index.js).',
      'files.error.transport': 'The request never reached the host (connection lost?). Nothing changed.',
      'files.error.generic': 'Operation failed ({code}): {message}',
      'files.error.tooLarge': 'The file is too large; nothing was pasted.',
      'files.paste.empty': 'The clipboard holds no files (only text). Copy a file in your system first, then paste with Ctrl/Cmd+V or this button.',
      'files.paste.denied': 'The browser refused clipboard access. Click inside the tree and press Ctrl/Cmd+V to paste files.',
      'files.paste.unsupported': 'This browser cannot read files from the clipboard; press Ctrl/Cmd+V to paste.',
      'files.paste.directory': '"{name}" is a folder: clipboard paste only handles files; move folders by dragging or renaming.',
      'files.paste.tooLarge': '"{name}" is over {limit}; nothing was pasted.',
      'files.paste.readFailed': '"{name}" could not be read; nothing was pasted.',
      'files.copyPath': 'Copy path',
      'files.copyPathRelative': 'Copy relative path',
      'files.copyPath.done': 'Copied: {path}',
      'files.copyPath.failed': 'The browser refused clipboard access; the path was not copied.',
      'files.openTerminal': 'Open in terminal',
      'files.terminal.done': 'Opened in the terminal: {path}',
      'files.terminal.missing': 'This deployment has no sidebar terminal (no terminal tab type is registered).',
      'files.terminal.failed': 'The terminal tab could not be opened.',
      'files.terminal.noInput': 'The terminal opened, but its input was unavailable; the directory was not entered.',
      'files.terminal.timeout': 'The terminal opened, but it did not become writable in time; the directory was not entered.',
      'image.title': 'Preview {name}',
      'image.alt': 'Image preview',
      'image.loading': 'Loading…',
      'image.fit': 'Fit to window',
      'image.actual': 'Actual size',
      'image.meta': '{size} · {width}×{height} · {type}',
      'image.size': '{bytes} bytes',
      'image.readFailed': 'Read failed: {message}',
      'image.decodeFailed': 'The browser cannot decode this format ({type}); the file itself is fine: {bytes} bytes.',
      'image.openEditor': 'Open in the editor',
      'delete.stale': 'File changed, not deleted',
      'delete.noVersion': 'File state unavailable',
      'conflict.stale': 'The file changed on disk while you were editing; nothing was overwritten.',
      'conflict.exists': 'The file already exists; nothing was overwritten.',
      'conflict.message': 'The file changed on disk (the agent or another tool may have written it). Saving now would overwrite those changes.',
      'changed.message': 'The file changed on disk. Your unsaved text is kept and will not be overwritten.',
      'hint.save': 'Ctrl/Cmd+S to save',
      'action.cut': 'Cut',
      'action.copy': 'Copy',
      'action.paste': 'Paste',
      'action.selectAll': 'Select all',
      'send.menu': 'Send to the DSH input',
      'send.menuTitle': 'Insert {token} into the chat input',
      'send.sent': 'Inserted {token}',
      'send.failed.input': 'No chat input is available right now (this session\'s conversation area is closed, or an approval / question is holding the composer).',
      'send.failed.busy': 'The input is busy or just changed; nothing was inserted. Try again.',
      'send.failed.path': 'This file path cannot be represented as a reference safely.',
      'send.failed.clipboard': 'The browser refused clipboard access; use Ctrl/Cmd+C instead.',
      'files.batchList': 'Batch list directories (F2)',
      'files.batchListTitle': 'Contents of {count} selected directories',
      'files.copyEntries': 'Copy entries',
      'files.noEntries': 'No entries',
      'files.close': 'Close',
      'search.placeholder': 'Search file contents…',
      'search.loading': 'Searching…',
      'search.noResults': 'No matches found',
      'search.failed': 'Search failed',
      'search.noSession': 'No available session. Please select a session first.',
    }

    /**
     * 取出地址里 `dsh-resource://file/` 之后的分段（去掉查询串与片段）。
     * @param address - 完整地址。
     * @returns 未解码的分段数组。
     */
    function addressParts(address) {
      const end = address.search(/[?#]/u)
      return (end === -1 ? address.slice(FILE_ADDRESS_PREFIX.length) : address.slice(FILE_ADDRESS_PREFIX.length, end)).split('/')
    }

    /**
     * 逐段解码；任一段非法即返回 null。
     * @param segments - 未解码的分段。
     * @returns 解码后的分段，或 null。
     */
    function decodeSegments(segments) {
      try {
        return segments.map((segment) => decodeURIComponent(segment))
      } catch {
        return null
      }
    }

    /**
     * 解析 `dsh-resource://file/session/<sessionId>/<分段编码路径>`（官方语法：逐段 percent
     * 编码、`/` 保留为分隔符、绝对路径带一个空的首段）。
     * @param address - 文档正文拿到的资源地址。
     * @returns `{ sessionId, path }`；不是会话文件地址时为 null。
     */
    function parseSessionFileAddress(address) {
      if (typeof address !== 'string' || !address.startsWith(FILE_ADDRESS_PREFIX)) return null
      const parts = addressParts(address)
      if (parts[0] !== 'session') return null
      const id = parts[1]
      const segments = parts.slice(2)
      if (id === undefined || id === '' || segments.length === 0) return null
      const decoded = decodeSegments(segments)
      if (decoded === null) return null
      return { sessionId: decodeURIComponent(id), path: decoded.join('/') }
    }

    /**
     * 按官方 `absoluteFileAddress` 的语法拼一个「绝对路径」文件地址；它只作为本插件页签的
     * 身份（同一路径 → 同一地址，于是重复打开只会聚焦已有页签），真实路径另经 `params` 传递。
     * @param path - 绝对路径。
     * @returns `dsh-resource://file/absolute/<分段编码路径>`。
     */
    function absoluteFileAddress(path) {
      const normalized = path.replace(/\\/gu, '/')
      const unc = normalized.startsWith('//')
      const stripped = normalized.replace(/^\/+/u, '')
      const encoded = stripped
        .split('/')
        .map((segment) => encodeURIComponent(segment).replace(/%3A/giu, ':'))
        .join('/')
      return `${FILE_ADDRESS_PREFIX}absolute/${unc ? '/' : ''}${encoded}`
    }

    /**
     * 地址里的文件名（页签标题用）。
     * @param address - 完整地址。
     * @returns 解码后的最后一段；解不出来时回落到原始文本。
     */
    function fileNameOf(address) {
      if (typeof address !== 'string' || address === '') return ''
      const parts = addressParts(address)
      const decoded = decodeSegments(parts)
      const last = (decoded ?? parts).filter((segment) => segment !== '').pop() ?? ''
      return last
    }

    /**
     * 体量文案。
     * @param chars - 字符数。
     * @returns 人类可读的体量。
     */
    function sizeLabel(chars) {
      return chars >= 1024 * 1024
        ? `${String(Math.round(chars / 1024 / 1024))} MiB`
        : `${String(Math.max(1, Math.round(chars / 1024)))} KiB`
    }

    /**
     * 失败文案：已知码用本地化说明，其余回落到 Host 的原始诊断。
     * @param failure - `{ code, message }`。
     * @param t - 命名空间文案函数。
     * @returns 显示文本。
     */
    function describeFailure(failure, t) {
      if (failure.code === 'not-utf8') return t('error.notUtf8')
      if (failure.code === 'too-large') return t('error.tooLarge', { limit: sizeLabel(MAX_EDIT_CHARS) })
      return t('error.read', { message: failure.message })
    }

    /**
     * 页签的编辑目标：优先用打开时带的 `params`，否则解析 `dsh-resource://file/absolute/…`
     * （本插件自己拼的地址，路径按绝对路径处理）。
     * @param tab - 页签记录。
     * @param fallbackSessionId - 槽位交来的会话（params 里没有时用它）。
     * @returns `{ sessionId, path }`，或 null。
     */
    function paneTarget(tab, fallbackSessionId) {
      const params = tab?.navigation?.params
      if (params !== null && typeof params === 'object' && typeof params.path === 'string' && params.path !== '') {
        const id = typeof params.sessionId === 'string' && params.sessionId !== '' ? params.sessionId : fallbackSessionId
        return id === undefined || id === '' ? null : { sessionId: id, path: params.path }
      }
      const address = tab?.navigation?.address ?? tab?.contentId
      if (typeof address !== 'string' || !address.startsWith(FILE_ADDRESS_PREFIX)) return null
      const parts = addressParts(address)
      if (parts[0] !== 'absolute' || fallbackSessionId === undefined || fallbackSessionId === '') return null
      const segments = decodeSegments(parts.slice(1))
      if (segments === null) return null
      const kept = segments.filter((segment) => segment !== '')
      if (kept.length === 0) return null
      return { sessionId: fallbackSessionId, path: `/${kept.join('/')}` }
    }

    /**
     * 工作区内的绝对路径改写成相对路径（DSH 的 `@` 引用惯例：工作区内用相对路径，
     * 工作区外用绝对路径；与官方 `relativizeToCwd` 同一套规则）。
     * @param path - 绝对路径。
     * @param cwd - 会话工作区根；缺失、或路径不在根下时原样返回。
     * @returns 相对路径或原路径。
     */
    function relativizeToCwd(path, cwd) {
      if (typeof cwd !== 'string' || cwd === '') return path
      const root = cwd.replace(/[/\\]+$/u, '')
      if (path.startsWith(`${root}/`) || path.startsWith(`${root}\\`)) return path.slice(root.length + 1)
      return path
    }

    /* path-tools:start */

    /**
     * 状态条上的路径缩写：太长时从**头部**截断，保住最后一段文件名。
     *
     * 为什么不能只交给 CSS：`text-overflow: ellipsis` 只会截**尾**，而这条 bar 里最有信息量的
     * 就是文件名 —— 截成 `…/dsh_edito` 等于没显示。头部截断保住 `README.md`，完整绝对路径仍在
     * `title` 与 `data-workspace-editor-status-path` 上（锚点值**永远是绝对路径**，与显示出的
     * 相对路径分开，这样断言不必关心栏宽）。
     *
     * **必须待在工厂作用域**（与 `relativizeToCwd` 并排，两者口径绑定）：它同时被
     * `EditorSurface` 与 `ImageBody` 用；挪进 `createFilesPanel` 就会让那两面渲染时
     * `ReferenceError` 白屏 —— 而只挂面板的探针抓不到这种跨作用域引用。
     * @param text - 要显示的路径。
     * @param max - 最多保留多少个字符（含省略号）；非正数用 48。
     * @returns 不超长原样返回；超长时返回省略号 + 尾部。
     */
    function shortenPath(text, max) {
      const value = String(text ?? '')
      const limit = typeof max === 'number' && max > 1 ? Math.floor(max) : 48
      if (value.length <= limit) return value
      return `…${value.slice(-(limit - 1))}`
    }

    /* path-tools:end */

    /**
     * 文本里某个偏移所在的行号（1 起）。
     * @param text - 全文。
     * @param offset - 字符偏移。
     * @returns 行号。
     */
    function lineNumberOf(text, offset) {
      let line = 1
      const limit = Math.min(Math.max(offset, 0), text.length)
      for (let index = 0; index < limit; index += 1) {
        if (text.charCodeAt(index) === 10) line += 1
      }
      return line
    }

    /**
     * 拼一个「文件 + 行号」引用（DSH 的 `@` 语法）：`@A.html#L15`、`@A.html#L15-20`。
     * 路径带空白时按官方 grammar 加引号（`@"a b.html"#L15`），与 `@` 选择器插进去的
     * 芯片同一套写法，模型侧才认。
     * @param path - 工作区相对路径或绝对路径。
     * @param startLine - 起始行（1 起）。
     * @param endLine - 结束行；与起始行相同则只写一个行号。
     * @returns 引用文本；路径含控制字符或引号（官方 grammar 表示不了）时返回 null。
     */
    function lineReferenceToken(path, startLine, endLine) {
      if (path === '') return null
      if (startLine < 1 || endLine < startLine) return null
      // 与官方 formatFileMention 同一条底线：这些字符进不了 grammar，别硬塞。
      if (/[\u0000-\u001f\u007f-\u009f"]/u.test(path)) return null
      const lines = endLine > startLine ? `#L${String(startLine)}-${String(endLine)}` : `#L${String(startLine)}`
      return /\s/u.test(path) ? `@"${path}"${lines}` : `@${path}${lines}`
    }

    /**
     * 菜单落点：右键取鼠标位置，按钮点击取按钮左下角；都按视口坐标（菜单是
     * `position:fixed`）并对视口下边缘做一次收敛，免得菜单被切掉。两个菜单
     * （文件树行的、编辑器正文的）共用这一份实现。
     * @param event - 触发事件（`contextmenu` 或 `click`）。
     * @returns `{ x, y }`。
     */
    function menuAnchorFor(event) {
      const fromPointer = event.type === 'contextmenu' || (event.button ?? 0) === 2
      const rect = fromPointer || typeof event.currentTarget?.getBoundingClientRect !== 'function'
        ? null
        : event.currentTarget.getBoundingClientRect()
      const height = typeof window === 'undefined' ? 0 : window.innerHeight
      const raw = rect === null ? { x: event.clientX ?? 0, y: event.clientY ?? 0 } : { x: rect.left, y: rect.bottom }
      return { x: raw.x, y: height > 0 ? Math.min(raw.y, Math.max(0, height - 220)) : raw.y }
    }

    /**
     * 读一个会话的工作区根。
     *
     * 走 `ctx.sessions` 服务快照、在**事件里现读**，而不是渲染期从槽位取 `useSessions`
     * prop —— 侧栏某些渲染点不传这个标准 prop，正文里调用它会让整块正文白屏（真踩过）。
     * 服务不在、会话行还没到、cwd 是空串，都只是「拿不到」：引用退回绝对路径。
     * @param ctx - 客户端根上下文。
     * @param sessionId - 会话 id。
     * @returns 工作区根，或 undefined。
     */
    function sessionCwd(ctx, sessionId) {
      try {
        const cwd = ctx.sessions?.list?.getSnapshot?.()?.byId?.[sessionId]?.cwd
        return typeof cwd === 'string' && cwd !== '' ? cwd : undefined
      } catch {
        return undefined
      }
    }

    /**
     * 写剪贴板：优先 async clipboard API；非安全上下文（用局域网 IP 的 http 打开页面）
     * 或旧浏览器没有它，回落到一次性的 textarea + `execCommand('copy')`。
     * @param text - 要写入的文本。
     * @returns 是否写成功。
     */
    async function writeClipboard(text) {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch {
        // 没有 clipboard API（或权限被拒）：走下面的兜底。
      }
      try {
        const area = document.createElement('textarea')
        area.value = text
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        const written = document.execCommand('copy')
        area.remove()
        return written
      } catch {
        return false
      }
    }

    /**
     * 读剪贴板：权限被拒或非安全上下文时返回 undefined，调用方静默跳过
     * （键盘 Ctrl/Cmd+V 照样能用）。
     * @returns 剪贴板文本，或 undefined。
     */
    async function readClipboard() {
      try {
        return await navigator.clipboard.readText()
      } catch {
        return undefined
      }
    }

    /* paste:start —— 粘贴与终端命令的纯函数（不碰 React / DOM 状态）。调试脚本按这两个标记截出来单独跑。 */

    /**
     * 剪贴板里的 MIME → 文件后缀。
     *
     * 只有 `navigator.clipboard.read()` 这条路需要它：那个 API 给得出 blob 却**给不出文件名**
     * （剪贴板条目不携带名字），只能按类型起一个。键盘粘贴走 `paste` 事件，`DataTransfer` 里的
     * `File` 带着真名，用不到这张表。
     */
    const PASTE_EXTENSIONS = {
      'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif',
      'image/webp': 'webp', 'image/bmp': 'bmp', 'image/avif': 'avif', 'image/svg+xml': 'svg',
      'image/tiff': 'tiff', 'application/pdf': 'pdf', 'application/zip': 'zip',
      'application/gzip': 'gz', 'application/x-tar': 'tar', 'application/json': 'json',
      'application/octet-stream': 'bin', 'text/plain': 'txt', 'text/csv': 'csv',
      'text/markdown': 'md', 'text/html': 'html',
    }

    /**
     * 字节 → base64（`btoa` 只吃 latin1，所以按块喂）。
     *
     * 不用 `String.fromCharCode(...bytes)`：4 MiB 的文件展开成实参会撑爆调用栈（实参个数上限约
     * 十万）。按 0x8000 一块切，既躲开栈上限，也不至于造出十万个小字符串。
     * @param bytes - `Uint8Array`。
     * @returns base64 文本。
     */
    function base64OfBytes(bytes) {
      let latin1 = ''
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        latin1 += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
      }
      return btoa(latin1)
    }

    /**
     * 没有文件名时按 MIME 起一个：`pasted-20261016-203245.png`。
     *
     * 前缀刻意用 ASCII：这个名字会直接变成磁盘上的文件名，跨语言环境（en 界面、非中文文件系统）
     * 下比「粘贴-…」安全。
     * @param type - MIME 类型（可能是空串）。
     * @param index - 同一次粘贴里的第几个（从 2 起才带序号）。
     * @param now - 取时间戳用的 `Date`（便于调试脚本注入固定值）。
     * @returns 文件名。
     */
    function pastedNameFor(type, index, now) {
      const extension = PASTE_EXTENSIONS[type] ?? 'bin'
      const at = now ?? new Date()
      const pad = (value) => String(value).padStart(2, '0')
      const stamp = `${String(at.getFullYear())}${pad(at.getMonth() + 1)}${pad(at.getDate())}`
        + `-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`
      return `pasted-${stamp}${index > 1 ? `-${String(index)}` : ''}.${extension}`
    }

    /**
     * 后缀 → 图片的 MIME（预览时给 `Blob` 用的类型）。
     *
     * 这份表比官方的 `IMAGE_MEDIA_TYPES`（png / jpg / jpeg / gif / webp / bmp / ico / svg）宽：
     * 本插件的文件树点开图片时走的是**自己的**预览页签，遇到浏览器解不开的格式（tiff / heic 这些）
     * 会明确说「解不开」而不是回一句「不是 UTF-8 文本」。表里认得、浏览器不认得的，由预览页的
     * `error` 分支兜住。
     */
    const IMAGE_MEDIA_TYPES = {
      png: 'image/png', apng: 'image/apng', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      jfif: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
      ico: 'image/x-icon', svg: 'image/svg+xml', avif: 'image/avif',
      tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic', heif: 'image/heif',
    }

    /**
     * 一个文件名 / 路径的后缀是不是图片。
     * @param path - 文件名或路径。
     * @returns 认出的 MIME，或 undefined（不是图片）。
     */
    function imageMediaTypeOf(path) {
      const name = String(path).replaceAll('\\', '/')
      const cut = name.lastIndexOf('/')
      const file = (cut === -1 ? name : name.slice(cut + 1)).toLowerCase()
      const dot = file.lastIndexOf('.')
      if (dot <= 0) return undefined
      return IMAGE_MEDIA_TYPES[file.slice(dot + 1)]
    }

    /**
     * 给一条路径加 shell 引号（「在终端打开」自动 `cd` 用）。
     *
     * 用**单引号**：它在 POSIX shell 与 PowerShell 里都是字面量，能挡住 `$`、反引号、空格的展开；
     * 单引号自身按 POSIX 的写法收尾再拼（`'` → `'\''`）。cmd.exe 不吃单引号 —— 这条前提写在
     * README 的已知边界里（那些平台上默认 shell 是 PowerShell，够用）。
     * @param path - 绝对路径。
     * @returns 可以直接拼进一行命令的带引号路径。
     */
    function shellQuotePath(path) {
      return `'${path.split("'").join("'\\''")}'`
    }

    /**
     * 从一次 `paste` 事件里取出可写的文件。
     *
     * 优先走 `clipboardData.items` + `webkitGetAsEntry()`：只有这条能认出「用户复制的是一个目录」
     * （目录在剪贴板里没有内容可读，浏览器不给遍历），从而明确说明而不是造一个 0 字节文件。
     * `dataTransfer.files` 只作为没有 `items` 的旧环境兜底。
     * @param dataTransfer - `ClipboardEvent.clipboardData`（可能是 null）。
     * @returns `{ files, directories }`：要写的文件，以及被跳过的目录名（认不出名字时是空串）。
     */
    function clipboardFilesOf(dataTransfer) {
      const files = []
      const directories = []
      const items = dataTransfer?.items
      if (items != null && items.length > 0) {
        for (const item of items) {
          if (item.kind !== 'file') continue
          let entry = null
          try {
            entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null
          } catch {
            entry = null
          }
          if (entry?.isDirectory === true) {
            directories.push(typeof entry.name === 'string' ? entry.name : '')
            continue
          }
          const file = typeof item.getAsFile === 'function' ? item.getAsFile() : null
          if (file != null) files.push(file)
        }
        if (files.length > 0 || directories.length > 0) return { files, directories }
      }
      const list = dataTransfer?.files
      if (list != null) for (const file of list) files.push(file)
      return { files, directories }
    }

    /* paste:end */

    /**
     * 内联 SVG 图标：这个 bundle 没有构建步骤、也不能 require 官方图标包（它不在 boot 图里），
     * 所以图标是几段写死的 path。颜色只吃 `currentColor`，跟着主题令牌走。
     */
    const ICON_PATHS = {
      chevronOpen: ['M4.6 6.4 8 9.8l3.4-3.4'],
      chevronClosed: ['M6.4 4.6 9.8 8l-3.4 3.4'],
      folder: ['M1.8 4.2h4.1l1.4 1.9h6.9v7.7H1.8z'],
      file: ['M3.8 1.8h5.1l3.3 3.3v9.1H3.8z', 'M8.7 1.9v3.4h3.4'],
      newFile: ['M3.8 1.8h5.1l3.3 3.3v9.1H3.8z', 'M8.7 1.9v3.4h3.4', 'M8 9.6v3', 'M6.5 11.1h3'],
      newFolder: ['M1.8 4.2h4.1l1.4 1.9h6.9v7.7H1.8z', 'M8 8.6v3', 'M6.5 10.1h3'],
      rename: ['M2.2 13.8l.9-3 7.4-7.4 2.1 2.1-7.4 7.4z'],
      copy: ['M5.6 1.8h6.6v9.4H5.6z', 'M3.8 4.8v9.4h6.6'],
      cut: [
        'M5.3 3.2 10.4 10.1', 'M10.7 3.2 5.6 10.1',
        'M2.8 11.7a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0',
        'M10 11.7a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0',
      ],
      paste: ['M4.6 3.8h6.8v9.6H4.6z', 'M6.6 3.8V2.4h2.8v1.4', 'M6.4 7.2h3.2', 'M6.4 9.6h3.2'],
      path: ['M5.6 3 10.4 13', 'M3.2 6.2h.01', 'M12.8 9.8h.01'],
      terminal: ['M2.6 3.4 6.4 7.8 2.6 12.2', 'M8.6 12.4h4.8'],
      image: ['M2.4 3.6h11.2v8.8H2.4z', 'M2.4 10.6 5.8 7.6l2.4 2 2.2-1.8 3.2 2.8', 'M10.8 6.2h.01'],
      trash: ['M2.8 4.6h10.4', 'M6.3 4.6V2.9h3.4v1.7', 'M4.4 4.6l.7 9.1h5.8l.7-9.1'],
      refresh: ['M13 8a5 5 0 1 1-1.7-3.7', 'M13.3 2.6v3.2h-3.2'],
      open: ['M2.5 12.5V6h6.5l-2.4 2.4', 'M6.6 3.5h6v6'],
      more: ['M3.6 8h.01', 'M8 8h.01', 'M12.4 8h.01'],
      sort: ['M4.4 3.2v9.6', 'M2.4 5.2 4.4 3.2 6.4 5.2', 'M11.6 12.8V3.2', 'M9.6 10.8l2 2 2-2'],
      send: ['M2.2 8h9.4', 'M8.4 4.4 11.8 8l-3.4 3.6'],
    }

    /**
     * 一枚内联图标。
     * @param name - `ICON_PATHS` 里的名字。
     * @param size - 边长（px），默认 16。
     * @returns SVG 元素。
     */
    function glyph(name, size) {
      const paths = ICON_PATHS[name] ?? ICON_PATHS.file
      const edge = size ?? 16
      return h('svg', {
        width: edge,
        height: edge,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: '1.2',
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      }, paths.map((d) => h('path', { key: d, d })))
    }

    /* highlight:start —— 语法高亮。这一段是纯函数（不碰 React / DOM），调试脚本按这两个标记截出来单独跑。 */

    /**
     * 高亮上限（UTF-16 码元）：超过就整篇按纯文本画。
     *
     * 上色走 Custom Highlight API（`::highlight()`），一个 DOM 节点都不加，成本只有
     * 「切令牌 + 建 Range」两项；实测（无头 Chrome，真实文件）256 KiB 一档约 25 ms 一次，
     * 再往上打字就会掉帧。宁可大文件不上色（内容照样能编辑、能存），也不换一个
     * 「打字时全篇变灰、停手才上色」的体验 —— 那种方案每次按键都要整篇闪一下。
     */
    const HIGHLIGHT_MAX_CHARS = 256 * 1024

    /**
     * 令牌数上限：Range 是一个一个建出来的，十万级令牌光分配就够呛。
     * 与字符上限一起判，谁先超谁负责（`data-workspace-editor-highlight` 都是 `over-limit`）。
     */
    const HIGHLIGHT_MAX_TOKENS = 20000

    /**
     * 令牌类别 → `CSS.highlights` 注册名（同时是 `::highlight()` 里的名字）。
     * 名字带插件前缀，只增删自己这几个 —— 绝不 `CSS.highlights.clear()`，
     * 那会把别的插件（比如搜索高亮）注册的条目一起删掉。
     */
    const HIGHLIGHT_NAME_BY_TYPE = {
      com: 'dsh-we-com',
      exp: 'dsh-we-exp',
      fn: 'dsh-we-fn',
      kw: 'dsh-we-kw',
      lnk: 'dsh-we-lnk',
      num: 'dsh-we-num',
      pun: 'dsh-we-pun',
      str: 'dsh-we-str',
      var: 'dsh-we-var',
    }

    /** 本插件会注册 / 删除的全部高亮名。 */
    const HIGHLIGHT_NAMES = Object.values(HIGHLIGHT_NAME_BY_TYPE)

    /** 数字（十进制 / 十六进制 / 二进制 / 八进制，含下划线分隔与常见后缀）。 */
    const RE_NUMBER = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.[\d_]*)?(?:[eE][+-]?\d+)?)[uUlLfFn]*/u

    /** 双引号字符串（不跨行，`\\.` 吃掉转义）。 */
    const RE_STRING_DQ = /"(?:[^"\\\n]|\\.)*"/u

    /** 单引号字符串。 */
    const RE_STRING_SQ = /'(?:[^'\\\n]|\\.)*'/u

    /** 一段连续的标点 / 运算符（按段上色，避免一个括号一个 span）。 */
    const RE_PUNCT = /[-{}\[\]();,.:?!+*\/%&|^<>=~]+/u

    /**
     * C 风格块注释（可跨行）。
     *
     * 用「不吃星的线性写法」而不是惰性 `[\s\S]*?`：后者在一篇到处是注释开头的病态文本里
     * 会退化成 O(n²)（每个起点都扫到文末），打字就卡死了。
     */
    const RE_COMMENT_BLOCK = /\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//u

    /** C 风格行注释。 */
    const RE_COMMENT_SLASH = /\/\/[^\n]*/u

    /** `#` 行注释。 */
    const RE_COMMENT_HASH = /#[^\n]*/u

    /** JS / TS 关键字（含常用 TS 类型词）。 */
    const KEYWORDS_JS = [
      'abstract', 'any', 'as', 'asserts', 'async', 'await', 'bigint', 'boolean', 'break', 'case',
      'catch', 'class', 'const', 'continue', 'debugger', 'declare', 'default', 'delete', 'do',
      'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'get',
      'if', 'implements', 'import', 'in', 'infer', 'instanceof', 'interface', 'is', 'keyof', 'let',
      'namespace', 'never', 'new', 'null', 'number', 'object', 'of', 'out', 'override', 'package',
      'private', 'protected', 'public', 'readonly', 'return', 'satisfies', 'set', 'static',
      'string', 'super', 'switch', 'symbol', 'this', 'throw', 'true', 'try', 'type', 'typeof',
      'undefined', 'unique', 'unknown', 'var', 'void', 'while', 'with', 'yield',
    ]

    /** C 家族（含 Java、C#、Kotlin、Swift、Scala、Dart、Proto 等）的关键字。 */
    const KEYWORDS_C = [
      'abstract', 'assert', 'auto', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class',
      'const', 'constexpr', 'continue', 'default', 'delete', 'do', 'double', 'else', 'enum',
      'explicit', 'export', 'extends', 'extern', 'false', 'final', 'finally', 'float', 'for',
      'friend', 'goto', 'if', 'implements', 'import', 'inline', 'instanceof', 'int', 'interface',
      'internal', 'is', 'label', 'long', 'namespace', 'native', 'new', 'null', 'nullptr',
      'operator', 'override', 'package', 'private', 'protected', 'public', 'readonly', 'record',
      'register', 'return', 'sealed', 'short', 'signed', 'sizeof', 'static', 'strictfp', 'struct',
      'super', 'switch', 'synchronized', 'template', 'this', 'throw', 'throws', 'transient', 'true',
      'try', 'typedef', 'typename', 'typeof', 'union', 'unsigned', 'using', 'var', 'virtual',
      'void', 'volatile', 'while',
    ]

    /** Go 关键字。 */
    const KEYWORDS_GO = [
      'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else', 'fallthrough',
      'false', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface', 'iota', 'map', 'nil',
      'package', 'range', 'return', 'select', 'struct', 'switch', 'true', 'type', 'var',
    ]

    /** Rust 关键字。 */
    const KEYWORDS_RUST = [
      'as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn', 'else', 'enum', 'extern',
      'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub',
      'ref', 'return', 'self', 'Self', 'static', 'struct', 'super', 'trait', 'true', 'type',
      'unsafe', 'use', 'where', 'while',
    ]

    /** Ruby / Perl 关键字（`#` 注释、`$var`、`:symbol` 也归这一档）。 */
    const KEYWORDS_RUBY = [
      'alias', 'and', 'begin', 'break', 'case', 'class', 'def', 'defined', 'do', 'else', 'elsif',
      'end', 'ensure', 'false', 'for', 'if', 'in', 'module', 'next', 'nil', 'not', 'or', 'redo',
      'rescue', 'retry', 'return', 'self', 'super', 'then', 'true', 'undef', 'unless', 'until',
      'when', 'while', 'yield',
    ]

    /** Lua 关键字。 */
    const KEYWORDS_LUA = [
      'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto', 'if', 'in',
      'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while',
    ]

    /** Python 关键字。 */
    const KEYWORDS_PY = [
      'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
      'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import',
      'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while',
      'with', 'yield',
    ]

    /** Shell 关键字。 */
    const KEYWORDS_SH = [
      'case', 'do', 'done', 'elif', 'else', 'esac', 'fi', 'for', 'function', 'if', 'in', 'local',
      'return', 'select', 'then', 'time', 'until', 'while',
    ]

    /** SQL 关键字。 */
    const KEYWORDS_SQL = [
      'add', 'all', 'alter', 'and', 'any', 'as', 'asc', 'begin', 'between', 'by', 'case', 'cast',
      'check', 'column', 'commit', 'constraint', 'create', 'cross', 'database', 'default', 'delete',
      'desc', 'distinct', 'drop', 'else', 'end', 'except', 'exists', 'false', 'foreign', 'from',
      'full', 'group', 'having', 'if', 'in', 'index', 'inner', 'insert', 'intersect', 'into', 'is',
      'join', 'key', 'left', 'like', 'limit', 'not', 'null', 'offset', 'on', 'or', 'order', 'outer',
      'primary', 'references', 'right', 'rollback', 'select', 'set', 'table', 'then', 'true',
      'union', 'unique', 'update', 'values', 'view', 'when', 'where', 'with',
    ]

    /**
     * 把关键字表拼成一条规则源码：长词在前，免得 `in` 先把 `instanceof` 咬掉。
     * @param words - 关键字表。
     * @param foldCase - true 时把每个字母展开成 `[sS]`（SQL 关键字大小写不敏感；拼出来的
     *   规则仍然跑在 `gu` 扫描器里 —— 扫描器只有一面旗，不能给单条规则加 `i`）。
     * @returns 带词边界的非捕获组源码。
     */
    function keywordSource(words, foldCase) {
      const parts = [...words].sort((a, b) => b.length - a.length)
      const body = parts.map((word) => (foldCase === true ? foldWordCase(word) : word)).join('|')
      return `(?:${body})\\b`
    }

    /**
     * 把一个词展开成大小写不敏感的正则片段（`select` → `[sS][eE][lL][eE][cC][tT]`）。
     * @param word - 原词。
     * @returns 正则片段。
     */
    function foldWordCase(word) {
      return word.replace(/[A-Za-z]/gu, (ch) => (ch === ch.toLowerCase() ? `[${ch}${ch.toUpperCase()}]` : `[${ch}${ch.toLowerCase()}]`))
    }

    /**
     * 大括号家族（JS / TS / C / Java / Go / Rust …）的规则表。
     *
     * 规则顺序即优先级：同一位置靠前的规则先匹配（注释与字符串必须先于标点）。
     * @param keywords - 这门语言的关键字表。
     * @param extra - 追加在字符串之后的语言专属规则（如 Rust 的生命周期）。
     * @returns `[类别, 正则]` 规则表。
     */
    function clikeRules(keywords, extra) {
      return [
        ['com', RE_COMMENT_BLOCK],
        ['com', RE_COMMENT_SLASH],
        ['str', /`(?:[^`\\]|\\.)*`/u],
        ['str', RE_STRING_DQ],
        ['str', RE_STRING_SQ],
        ['num', RE_NUMBER],
        ...(extra ?? []),
        ['fn', /@[\w$.]+/u],
        ['kw', new RegExp(keywordSource(keywords), 'u')],
        ['fn', /[A-Za-z_$][\w$]*(?=\s*\()/u],
        ['var', /[A-Za-z_$][\w$]*(?=\s*[:=])/u],
        ['pun', RE_PUNCT],
      ]
    }

    /** JSON / JSONC / JSON5：键与值分开上色。 */
    const RULES_JSON = [
      ['com', RE_COMMENT_SLASH],
      ['com', RE_COMMENT_BLOCK],
      ['var', /"(?:[^"\\\n]|\\.)*"(?=\s*:)/u],
      ['str', RE_STRING_DQ],
      ['str', RE_STRING_SQ],
      ['num', /\b(?:true|false|null)\b/u],
      ['num', RE_NUMBER],
      ['pun', RE_PUNCT],
    ]

    /** HTML / XML / Vue / Svelte：标签、属性、属性值。 */
    const RULES_HTML = [
      ['com', /<!--[\s\S]*?-->/u],
      ['kw', /<![A-Za-z][^>]*>/u],
      ['kw', /<\/?[A-Za-z][\w:.-]*/u],
      ['var', /[\w:.-]+(?=\s*=)/u],
      ['str', RE_STRING_DQ],
      ['str', RE_STRING_SQ],
      ['num', /&#?\w+;/u],
      ['pun', RE_PUNCT],
    ]

    /** CSS / SCSS / LESS：at 规则、属性名、颜色与尺寸。 */
    const RULES_CSS = [
      ['com', RE_COMMENT_BLOCK],
      ['str', RE_STRING_DQ],
      ['str', RE_STRING_SQ],
      ['kw', /@[\w-]+/u],
      ['kw', /!(?:important|default)\b/u],
      ['var', /--[\w-]+/u],
      ['num', /#[0-9a-fA-F]{3,8}\b/u],
      ['num', /\b\d[\d.]*(?:[a-z%]{0,8})?/u],
      ['fn', /[\w-]+(?=\s*:)/u],
      ['pun', RE_PUNCT],
    ]

    /** Markdown：标题、围栏、行内代码、链接、加粗。 */
    const RULES_MARKDOWN = [
      ['com', /<!--[\s\S]*?-->/u],
      ['str', /`[^`\n]*`/u],
      ['lnk', /!?\[[^\]\n]*\]\([^)\n]*\)/u],
      ['lnk', /<https?:\/\/[^>\s]*>/u],
      ['kw', /```[^\n]*/u],
      ['fn', /\*\*[^\n]+?\*\*/u],
      ['kw', /#{1,6}[^\n]*/u],
    ]

    /** YAML：键、注释、锚点、布尔与数字。 */
    const RULES_YAML = [
      ['com', RE_COMMENT_HASH],
      ['str', RE_STRING_DQ],
      ['str', RE_STRING_SQ],
      ['kw', /-{3,}|\.{3}/u],
      ['var', /[&*][\w-]+/u],
      ['var', /!!?[\w:./-]+/u],
      ['num', /\b(?:true|false|null|yes|no|on|off|True|False|Null)\b|~/u],
      ['num', RE_NUMBER],
      ['fn', /(?:^|\n)[ \t]*-?[ \t]*[\w$./-]+(?=\s*:)/u],
      ['pun', /[{}\[\],:|>-]+/u],
    ]

    /** INI / TOML / .env / properties / *.conf：小节、键、注释。 */
    const RULES_INI = [
      ['com', /[;#][^\n]*/u],
      ['kw', /\[[^\]\n]*\]/u],
      ['str', RE_STRING_DQ],
      ['str', RE_STRING_SQ],
      ['num', /\b(?:true|false|yes|no|on|off)\b/u],
      ['num', RE_NUMBER],
      ['fn', /(?:^|\n)[ \t]*[\w.$-]+(?=\s*[=:])/u],
      ['pun', /[,=.]+/u],
    ]

    /** Python：`#` 注释、三引号字符串、装饰器。 */
    const RULES_PY = [
      ['com', RE_COMMENT_HASH],
      ['str', /(?:[rRbBuUfF]{0,2})?"""[\s\S]*?"""/u],
      ['str', /(?:[rRbBuUfF]{0,2})?'''[\s\S]*?'''/u],
      ['str', /(?:[rRbBuUfF]{0,2})?"(?:[^"\\\n]|\\.)*"/u],
      ['str', /(?:[rRbBuUfF]{0,2})?'(?:[^'\\\n]|\\.)*'/u],
      ['fn', /@[\w.]+/u],
      ['num', RE_NUMBER],
      ['kw', new RegExp(keywordSource(KEYWORDS_PY), 'u')],
      ['fn', /[A-Za-z_]\w*(?=\s*\()/u],
      ['pun', RE_PUNCT],
    ]

    /** Shell / PowerShell / 批处理：`#` 注释、变量、开关。 */
    const RULES_SH = [
      ['com', RE_COMMENT_HASH],
      ['str', RE_STRING_SQ],
      ['str', /"(?:[^"\\$\n]|\\.)*"/u],
      ['var', /\$(?:\{[^}\n]*\}|[\w@*#?$!-]+)/u],
      ['kw', new RegExp(keywordSource(KEYWORDS_SH), 'u')],
      ['num', RE_NUMBER],
      ['var', /(?:^|\s)--?[A-Za-z][\w-]*/u],
      ['pun', RE_PUNCT],
    ]

    /** SQL：`--` 注释、单引号字符串、大小写不敏感的关键字。 */
    const RULES_SQL = [
      ['com', /--[^\n]*/u],
      ['com', RE_COMMENT_BLOCK],
      ['str', /'(?:[^']|'')*'/u],
      ['str', RE_STRING_DQ],
      ['num', RE_NUMBER],
      ['kw', new RegExp(keywordSource(KEYWORDS_SQL, true), 'u')],
      ['pun', RE_PUNCT],
    ]

    /** 补丁 / 差异：`+` 行、`-` 行、块头与文件头。 */
    const RULES_DIFF = [
      ['com', /(?:^|\n)(?:diff|index|new file|deleted file|similarity index|rename (?:from|to)|old mode|new mode)[^\n]*/u],
      ['com', /(?:^|\n)(?:\+\+\+|---)[^\n]*/u],
      ['var', /(?:^|\n)@@[^\n]*/u],
      ['str', /(?:^|\n)\+[^\n]*/u],
      ['kw', /(?:^|\n)-[^\n]*/u],
    ]

    /**
     * 扩展名 → 语言 id。与官方 `languageForPath` 一样**只看后缀**：无后缀、认不出来的后缀
     * 一律按纯文本画（`Dockerfile`、`Makefile` 这类没有后缀的名字不上色）。
     */
    const LANGUAGE_BY_EXTENSION = new Map(Object.entries({
      js: 'js', mjs: 'js', cjs: 'js', jsx: 'js',
      ts: 'ts', mts: 'ts', cts: 'ts', tsx: 'ts',
      json: 'json', jsonc: 'json', json5: 'json', jsonl: 'json', ndjson: 'json',
      html: 'html', htm: 'html', xhtml: 'html', xml: 'html', xsl: 'html', xslt: 'html',
      svg: 'html', vue: 'html', svelte: 'html', astro: 'html',
      css: 'css', scss: 'css', sass: 'css', less: 'css',
      md: 'markdown', markdown: 'markdown', mdx: 'markdown',
      yaml: 'yaml', yml: 'yaml',
      ini: 'ini', cfg: 'ini', conf: 'ini', config: 'ini', env: 'ini', properties: 'ini',
      toml: 'ini', lock: 'ini',
      py: 'python', pyi: 'python', pyw: 'python',
      sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell', ksh: 'shell',
      ps1: 'shell', psm1: 'shell', bat: 'shell', cmd: 'shell',
      sql: 'sql',
      diff: 'diff', patch: 'diff',
      c: 'c', h: 'c', cc: 'c', cpp: 'c', cxx: 'c', hpp: 'c', hh: 'c', hxx: 'c', m: 'c', mm: 'c',
      java: 'c', kt: 'c', kts: 'c', scala: 'c', swift: 'c', cs: 'c', dart: 'c', php: 'php',
      proto: 'c', graphql: 'c', gql: 'c', hs: 'c', clj: 'c', cljs: 'c', nim: 'c', zig: 'c',
      v: 'c', asm: 'c', s: 'c', gradle: 'c', groovy: 'c', cmake: 'c', mk: 'c', tex: 'c',
      go: 'go',
      rs: 'rust',
      rb: 'ruby', rake: 'ruby', gemspec: 'ruby', pl: 'ruby', pm: 'ruby', r: 'ruby', jl: 'ruby',
      ex: 'ruby', exs: 'ruby', erl: 'ruby', hrl: 'ruby',
      lua: 'lua',
    }))

    /** clike 家族的语言 id → 关键字表。 */
    const CLIKE_KEYWORDS = {
      c: KEYWORDS_C,
      go: KEYWORDS_GO,
      js: KEYWORDS_JS,
      lua: KEYWORDS_LUA,
      php: KEYWORDS_C,
      ruby: KEYWORDS_RUBY,
      rust: KEYWORDS_RUST,
      ts: KEYWORDS_JS,
    }

    /** 语言专属的补充规则。 */
    const CLIKE_EXTRA = {
      php: [
        ['var', /\$[A-Za-z_]\w*/u],
        ['com', RE_COMMENT_HASH],
      ],
      rust: [['exp', /'[A-Za-z_]\w*/u]],
    }

    /** 语言 id → 规则表（`clike` 家族按关键字表现拼）。 */
    const RULES_BY_LANGUAGE = {
      css: RULES_CSS,
      diff: RULES_DIFF,
      html: RULES_HTML,
      ini: RULES_INI,
      json: RULES_JSON,
      markdown: RULES_MARKDOWN,
      python: RULES_PY,
      shell: RULES_SH,
      sql: RULES_SQL,
      yaml: RULES_YAML,
    }

    /** 语言 id → 扫描函数（惰性编译：一门语言第一次用到时才把它拼成正则）。 */
    const scanners = new Map()

    /**
     * 路径 → 语言 id。只看后缀（与官方 `languageForPath` 同一套规则）；`.` 开头的文件
     * 仍以第一个 `.` 为分隔，于是 `.env` 是 `env` → ini。
     * @param path - 文件路径（绝对或相对都行）。
     * @returns 语言 id，或 null（纯文本）。
     */
    function languageOfPath(path) {
      if (typeof path !== 'string' || path === '') return null
      const name = path.replace(/\\/gu, '/').split('/').pop() ?? ''
      const dot = name.lastIndexOf('.')
      if (dot === -1) return null
      return LANGUAGE_BY_EXTENSION.get(name.slice(dot + 1).toLowerCase()) ?? null
    }

    /**
     * 正文归一成 LF：textarea 的 value 本来就把 CRLF 归一成 LF，高亮层必须跟着归一，
     * 否则 CRLF 文件里两层会差一个不可见字符。
     * @param text - 原始正文。
     * @returns 归一后的正文。
     */
    function normalizeNewlines(text) {
      return text.replace(/\r\n?/gu, '\n')
    }

    /**
     * 高亮层要不要在末尾补一个 `<br>`。
     *
     * textarea 会给「最后一个换行之后的那个空行」留一行高度，而块级文本里**结尾的换行
     * 不产生行盒** —— 不补这一下，高亮层就比 textarea 少一行，滚到底部时两层错开一行。
     * 空正文同理（空 textarea 也占一行高）。
     * @param source - 已归一成 LF 的正文。
     * @returns 是否需要补行盒。
     */
    function needsTrailingLine(source) {
      return source === '' || source.endsWith('\n')
    }

    /**
     * Custom Highlight 的注册表（全局 `CSS.highlights`）。
     *
     * **必须走 `globalThis`**：本模块自己有一个 `const CSS`（组件那张样式表），它会遮蔽
     * 全局的 `CSS` 命名空间 —— 直接写 `CSS.highlights` 拿到的是那个字符串的 undefined 属性，
     * 于是能力探测永远判成「不支持」（真踩过：整块高亮静默不上色，还查了半天）。
     * @returns 注册表，或 undefined（浏览器不支持）。
     */
    function highlightRegistry() {
      const namespace = globalThis.CSS
      return namespace === undefined || namespace === null ? undefined : namespace.highlights
    }

    /** 浏览器是否支持 Custom Highlight API（Chrome 105+ / Safari 17.2+ / Firefox 140+）。 */
    function highlightSupported() {
      return typeof Highlight === 'function' && highlightRegistry() !== undefined
    }

    /**
     * 把规则表拼成一个扫描器：一条规则一个捕获组，`g` 扫描 + 最左优先，同位置靠前的规则赢。
     * @param rules - `[类别, 正则]` 表；正则里**不许有捕获组**（只能写 `(?:…)`），否则组号会错位。
     * @returns `(text) => [{ type, text }]`，未匹配到的部分 `type` 为 null。
     */
    function makeScanner(rules) {
      const pattern = new RegExp(rules.map((rule) => `(${rule[1].source})`).join('|'), 'gu')
      const types = rules.map((rule) => rule[0])
      return (text) => {
        const tokens = []
        let last = 0
        let match
        pattern.lastIndex = 0
        while ((match = pattern.exec(text)) !== null) {
          if (match[0] === '') {
            pattern.lastIndex += 1
            continue
          }
          for (let index = 0; index < types.length; index += 1) {
            if (match[index + 1] === undefined) continue
            if (match.index > last) tokens.push({ type: null, text: text.slice(last, match.index) })
            tokens.push({ type: types[index], text: match[0] })
            last = match.index + match[0].length
            break
          }
        }
        if (last < text.length) tokens.push({ type: null, text: text.slice(last) })
        return tokens
      }
    }

    /**
     * 取一门语言的扫描函数；认不出来的语言返回 null。
     * @param language - 语言 id。
     * @returns 扫描函数或 null。
     */
    function scannerFor(language) {
      const cached = scanners.get(language)
      if (cached !== undefined) return cached
      const extra = CLIKE_EXTRA[language]
      const clikeKeywords = CLIKE_KEYWORDS[language]
      const rules = RULES_BY_LANGUAGE[language] ?? (clikeKeywords === undefined ? undefined : clikeRules(clikeKeywords, extra))
      const scan = rules === undefined ? null : makeScanner(rules)
      scanners.set(language, scan)
      return scan
    }

    /**
     * 把正文切成令牌。
     *
     * 认不出语言、正文为空、超过字符 / 令牌上限时返回 null —— 调用方按纯文本画
     * （正文照旧显示，只是不上色）。
     * @param text - 正文。
     * @param language - 语言 id，或 null（纯文本）。
     * @returns `[{ type, text }]`（`type` 为 null 表示这段不上色），或 null。
     */
    function tokenize(text, language) {
      const source = normalizeNewlines(text)
      if (language === null || source.length > HIGHLIGHT_MAX_CHARS) return null
      if (source === '') return []
      const scan = scannerFor(language)
      if (scan === null) return null
      const tokens = scan(source)
      return tokens.length > HIGHLIGHT_MAX_TOKENS ? null : tokens
    }

    /* highlight:end */

    /** 浏览器是否支持 Custom Highlight API；模块加载时判一次（能力不会中途变）。 */
    const HIGHLIGHT_API_SUPPORTED = highlightSupported()

    /**
     * 活着的编辑器实例的高亮源：`实例 id → { node, tokens }`。
     *
     * 为什么要这张表：`CSS.highlights` 是**全局**注册表，而 `::highlight(...)` 的名字必须是
     * 静态的（样式表里写死），没法给每个实例一套名字 —— 于是同一时刻所有实例的高亮由这里
     * **统一重建**：任何实例的正文变了，就把全部实例的 Range 一起重贴。不这么做的话，并排开
     * 两个编辑器时后渲染的那个会把前一个的高亮整个删掉（实测就是这样）。
     * 实例数是个位数，重建的代价可以忽略。
     */
    const highlightSources = new Map()

    /** 高亮源 id 的自增序号。 */
    let highlightSourceSeq = 0

    /**
     * @returns 一个新的高亮源 id。
     */
    function nextHighlightSourceId() {
      highlightSourceSeq += 1
      return `we-hl-${String(highlightSourceSeq)}`
    }

    /**
     * 登记 / 更新一个实例的高亮源，并重建全局高亮。
     * @param id - 实例 id。
     * @param node - 正文文本节点。
     * @param tokens - 令牌表，或 null（不上色）。
     * @returns 是否具备上色能力（false 表示这个浏览器没有 Custom Highlight API）。
     */
    function applyHighlights(id, scope, tokens) {
      const registry = highlightRegistry()
      if (registry === undefined) return false
      // Range 只能建在**文本节点**上：传进来的是高亮层元素，取它的第一个子节点。
      // （直接拿元素当边界节点会按「子节点下标」解释 offset，越界就 IndexSizeError，
      // 而 layout effect 里抛错会让 React 卸载整棵子树 —— 编辑器白屏，真踩过。）
      const first = scope === null ? null : scope.firstChild
      const node = first !== null && first.nodeType === 3 ? first : null
      highlightSources.set(id, { node: node, tokens: tokens })
      rebuildHighlights(registry)
      return true
    }

    /**
     * 摘掉一个实例的高亮源并重建（卸载时调用，免得留下指向已卸载节点的 Range）。
     * @param id - 实例 id。
     * @returns 无。
     */
    function releaseHighlights(id) {
      if (!highlightSources.delete(id)) return
      const registry = highlightRegistry()
      if (registry !== undefined) rebuildHighlights(registry)
    }

    /**
     * 把所有实例的令牌重建成高亮（每个类别一个 `Highlight`，装该类别全部 Range）。
     * @param registry - `CSS.highlights`。
     * @returns 无。
     */
    function rebuildHighlights(registry) {
      for (const name of HIGHLIGHT_NAMES) registry.delete(name)
      const grouped = new Map()
      for (const source of highlightSources.values()) {
        if (source.tokens === null || source.node === null) continue
        let offset = 0
        for (const token of source.tokens) {
          const end = offset + token.text.length
          if (token.type !== null) {
            const range = document.createRange()
            range.setStart(source.node, offset)
            range.setEnd(source.node, end)
            const list = grouped.get(token.type)
            if (list === undefined) grouped.set(token.type, [range])
            else list.push(range)
          }
          offset = end
        }
      }
      for (const [type, ranges] of grouped) {
        registry.set(HIGHLIGHT_NAME_BY_TYPE[type], new Highlight(...ranges))
      }
    }

    /**
     * 「输入框哨兵」：渲染 `null`，唯一作用是把本会话的 `inputActions`（对话输入框的公开
     * 写入面）登记进模块级 `inputTargets`，供编辑器正文的「发送到 DSH」取用；卸载即删。
     *
     * 为什么不让编辑器正文只从自己的槽位 prop 拿：侧栏槽位的渲染点**不保证**传全那套标准
     * prop —— `sidebar.right.tab.document` 的正文连 `useSessions` 都没有，正文里直接调用
     * 会让整块白屏（真踩过）。`conversation.input.*` 是官方自己（语音输入、目标栏）在用的
     * 位置，`inputActions` 一定在；两处都拿不到时发送只亮横幅，不影响正文。
     *
     * 删除时先比对象：同一会话重挂（换布局 / 换会话）时新哨兵可能已经登记，晚到的旧
     * cleanup 不能把新的那份删掉。
     * @param props - `conversation.input.dock` 交来的 props（`sessionId` 与 `inputActions`；
     *   会话 id 缺失时退回 owner 的 `session.sessionId`）。
     * @returns null。
     */
    function InputSink(props) {
      const { sessionId, inputActions, session } = props
      const id = typeof sessionId === 'string' && sessionId !== '' ? sessionId : session?.sessionId
      React.useEffect(() => {
        if (typeof id !== 'string' || id === '' || inputActions === undefined) return undefined
        inputTargets.set(id, inputActions)
        return () => {
          if (inputTargets.get(id) === inputActions) inputTargets.delete(id)
        }
      }, [id, inputActions])
      return null
    }

    /**
     * 造出本插件的三个组件（闭包持有客户端上下文，Remote 读接口在这里取）。
     * @param ctx - 客户端根上下文。
     * @returns 文档渲染器正文、页签正文、预览头部的「编辑」按钮。
     */
    function createEditor(ctx) {
      /**
       * 共用的可编辑正文：读盘、草稿、版本闸、冲突处理都在这里。
       * @param props - `{ t, sessionId, path, wrap, onToggleWrap, scrollportRef, reloadKey, variant, onLoaded, onFailed, inputActions }`。
       * @returns 编辑区、状态条与横幅。
       */
      function EditorSurface(props) {
        const { t, sessionId, path, wrap, onToggleWrap, scrollportRef, reloadKey, variant, onLoaded, onFailed, inputActions } = props
        const storageKey = `${sessionId}\u0000${path}`
        const [doc, setDoc] = React.useState({ phase: 'loading' })
        const [draft, setDraft] = React.useState('')
        const [save, setSave] = React.useState({ phase: 'idle' })
        const [conflict, setConflict] = React.useState(null)
        const [changed, setChanged] = React.useState(false)
        const [token, setToken] = React.useState(0)
        /** 右键菜单：`{ x, y, token }`；`token` 是右键那一刻算好的引用（ null 表示这文件没法表示成引用）。 */
        const [menu, setMenu] = React.useState(null)
        /** 「发送到 DSH」的结果：`sent` 亮一会儿，`failed` 留在横幅里等人处理。 */
        const [send, setSend] = React.useState({ phase: 'idle' })
        /** 菜单里那几项「就地动作」的提示（复制路径 / 在终端打开），查询与文件树共用同一个状态机。 */
        const { notice, showNotice, dismissNotice } = useNotice()

        const draftRef = React.useRef(draft)
        draftRef.current = draft
        const docRef = React.useRef(doc)
        docRef.current = doc
        const dirtyRef = React.useRef(false)
        dirtyRef.current = doc.phase === 'ready' && draft !== doc.text
        const savingRef = React.useRef(false)
        /** 文本框元素：菜单里的剪切 / 复制 / 粘贴 / 全选都要对「右键时那一块区域」下手。 */
        const areaRef = React.useRef(null)
        /** 高亮层元素（textarea 底下那层**可见**文字，textarea 自己的字是透明的）。 */
        const hlRef = React.useRef(null)
        /** 本实例在高亮源表里的 id（同屏多个编辑器时统一重建高亮，见 applyHighlights）。 */
        const highlightId = React.useRef('')
        if (highlightId.current === '') highlightId.current = nextHighlightSourceId()

        /** 当前语言：按路径后缀判定，认不出来就是纯文本（高亮层退化成一层等宽文本）。 */
        const language = React.useMemo(() => languageOfPath(path), [path])
        /** 高亮层显示的正文：与 textarea 的 value 同一形态（LF 归一）。 */
        const highlightText = React.useMemo(() => normalizeNewlines(draft), [draft])
        /**
         * 令牌表（Range 就按它建）。
         *
         * **同步算、不等**：高亮层就是可见文字，晚一帧上色等于「打字时整篇变灰、停手才上色」。
         * 所以这里同步切令牌（纯函数，上限内很快），并且**任何异常都退回纯文本** ——
         * 高亮炸了最多是不上色，绝不能让整块正文白掉。
         */
        const tokens = React.useMemo(() => {
          if (!HIGHLIGHT_API_SUPPORTED) return null
          try {
            return tokenize(draft, language)
          } catch {
            return null
          }
        }, [draft, language])

        /**
         * 高亮层与 textarea 对齐（宽度 + 滚动位置）。
         *
         * 三件必须做的事：两层是各自独立滚动的，每轮渲染后都要重贴一次（下面的
         * `useLayoutEffect` 故意不带依赖）；用户滚动不走 React，由 textarea 的 `onScroll`
         * 直接调；宽度也要贴 —— textarea 冒出竖向滚动条时它的内容宽度会窄一截，
         * 不贴就会出现两套换行点（错位）。
         * @returns 无。
         */
        const syncHighlight = React.useCallback(() => {
          const area = areaRef.current
          const layer = hlRef.current
          if (area === null || layer === null) return
          const width = `${String(area.clientWidth)}px`
          if (layer.style.width !== width) layer.style.width = width
          layer.scrollTop = area.scrollTop
          layer.scrollLeft = area.scrollLeft
        }, [])

        /**
         * textarea 的 ref 有两个用处（组件内部的选区操作 + owner 的滚动位置记忆），而 owner
         * 的回调必须**原样**接到元素上：包成一个每轮渲染都变的新函数，React 会每轮 detach /
         * attach，attach 会把 scrollTop 重置回记录值 —— 打字时页面会往上跳。这里的
         * `useCallback` 只依赖 `scrollportRef`，identity 与 owner 那个回调同步变化。
         */
        const attachArea = React.useCallback((node) => {
          areaRef.current = node
          if (typeof scrollportRef === 'function') scrollportRef(node)
        }, [scrollportRef])

        // 每轮渲染后贴一次：正文、换行开关、横幅出现都可能改变 textarea 的宽度或滚动位置。
        React.useLayoutEffect(syncHighlight)

        // 上色：令牌变了才重建 Range（高亮层不加任何 DOM 节点，这一步只碰 Range 与
        // `CSS.highlights` 注册表；放在 layout effect 里是为了在绘制前生效，不闪一下无色）。
        React.useLayoutEffect(() => {
          try {
            applyHighlights(highlightId.current, hlRef.current, tokens)
          } catch {
            // 上色出问题绝不能连累正文：摘掉自己那份高亮，正文照旧按纯文本显示。
            releaseHighlights(highlightId.current)
          }
        }, [tokens])

        // 卸载时把自己的高亮源摘掉（否则全局注册表里会留下一堆指向已卸载节点的 Range）。
        React.useEffect(() => () => { releaseHighlights(highlightId.current) }, [])


        // 面板被拖动、窗口缩放时 textarea 的宽度会变，而 React 不一定重渲染 —— 用
        // ResizeObserver 补上（content-box：滚动条出现 / 消失也算内容尺寸变化）。
        React.useEffect(() => {
          const area = areaRef.current
          if (area === null || typeof ResizeObserver !== 'function') return undefined
          const observer = new ResizeObserver(() => { syncHighlight() })
          observer.observe(area, { box: 'content-box' })
          return () => { observer.disconnect() }
        }, [syncHighlight])

        // 读盘：外部信号（渲染器模式的 revision）或本地重载按钮变化时重读。
        React.useEffect(() => {
          const controller = new AbortController()
          let cancelled = false
          void (async () => {
            const result = await ctx.remote.workspaceFiles.readBytes(sessionId, path, {}, controller.signal)
            if (cancelled) return
            if (!result.ok) {
              if (onFailed !== undefined) onFailed()
              const failure = describeFailure({ code: result.error.code, message: result.error.message }, t)
              // 已经显示着内容时不擦掉正文：只挂一条提示（磁盘临时读不到不该毁掉草稿）。
              setDoc((prev) => (prev.phase === 'ready'
                ? { ...prev, notice: failure }
                : { phase: 'failed', code: result.error.code, message: failure }))
              return
            }
            const value = result.value
            let text
            try {
              text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(value.data)
            } catch {
              if (onFailed !== undefined) onFailed()
              setDoc((prev) => (prev.phase === 'ready'
                ? { ...prev, notice: t('error.notUtf8') }
                : { phase: 'failed', code: 'not-utf8', message: t('error.notUtf8') }))
              return
            }
            if (text.length > MAX_EDIT_CHARS) {
              if (onFailed !== undefined) onFailed()
              const message = t('error.tooLarge', { limit: sizeLabel(MAX_EDIT_CHARS) })
              setDoc((prev) => (prev.phase === 'ready'
                ? { ...prev, notice: message }
                : { phase: 'failed', code: 'too-large', message }))
              return
            }
            // 规矩 2 的半个前提：无论缓冲区脏不脏都回报磁盘版本，否则 owner 的自动刷新会循环重读。
            if (onLoaded !== undefined) onLoaded(value.version)
            if (dirtyRef.current) {
              setDoc((prev) => (prev.phase === 'ready' ? { ...prev, diskVersion: value.version } : prev))
              setChanged(true)
              return
            }
            // 规矩 1：重挂后用草稿缓存恢复；基线是草稿基于的版本，磁盘版本只用于展示与冲突判定。
            const stash = drafts.get(storageKey)
            setDoc({
              phase: 'ready',
              text: stash === undefined ? text : stash.text,
              version: stash === undefined ? value.version : stash.version,
              diskVersion: value.version,
              absolutePath: value.absolutePath,
              notice: null,
            })
            setDraft(stash === undefined ? text : stash.text)
            setSave({ phase: 'idle' })
            setConflict(null)
            setChanged(false)
          })().catch((error) => {
            if (cancelled) return
            const message = error instanceof Error ? error.message : String(error)
            if (onFailed !== undefined) onFailed()
            setDoc((prev) => (prev.phase === 'ready'
              ? { ...prev, notice: t('error.read', { message }) }
              : { phase: 'failed', code: 'read-failed', message: t('error.read', { message }) }))
          })
          return () => {
            cancelled = true
            controller.abort()
          }
        }, [reloadKey, token, storageKey])

        // 规矩 1：卸载时按「脏不脏」存/删草稿。
        React.useEffect(() => () => {
          if (dirtyRef.current) drafts.set(storageKey, { text: draftRef.current, version: docRef.current.version })
          else drafts.delete(storageKey)
        }, [storageKey])

        // 「已保存」「已插入」提示只亮一会儿。
        React.useEffect(() => {
          if (save.phase !== 'saved' && send.phase !== 'sent') return undefined
          const timer = setTimeout(() => {
            setSave((prev) => (prev.phase === 'saved' ? { phase: 'idle' } : prev))
            setSend({ phase: 'idle' })
          }, 2500)
          return () => { clearTimeout(timer) }
        }, [save.phase, send.phase])

        /**
         * 写盘：带版本闸；磁盘变过就进冲突横幅，等用户显式覆盖。
         * @param force - true 表示无条件覆盖（用户点过「覆盖保存」）。
         * @returns 请求结束即返回。
         */
        const saveNow = async (force) => {
          const current = docRef.current
          if (current.phase !== 'ready' || savingRef.current) return
          const body = { sessionId, path, content: draftRef.current }
          if (!force && current.version !== undefined) body.expectedVersion = current.version
          savingRef.current = true
          setSave({ phase: 'saving' })
          let response
          try {
            response = await fetch(WRITE_URL, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            })
          } catch {
            savingRef.current = false
            setSave({ phase: 'failed', message: t('error.transport') })
            return
          }
          let payload = null
          try {
            payload = await response.json()
          } catch {
            payload = null
          }
          savingRef.current = false
          if (!response.ok) {
            const code = typeof payload?.code === 'string' ? payload.code : 'write-failed'
            const message = typeof payload?.message === 'string' ? payload.message : `HTTP ${String(response.status)}`
            if (code === 'stale-version' || code === 'not-observed') {
              setConflict({ code, message })
              setSave({ phase: 'idle' })
              return
            }
            setSave({ phase: 'failed', message: t('error.save', { message }) })
            return
          }
          drafts.delete(storageKey)
          setDoc({
            phase: 'ready',
            text: draftRef.current,
            version: payload?.version ?? current.version,
            diskVersion: payload?.version ?? current.diskVersion,
            absolutePath: current.absolutePath,
            notice: null,
          })
          setConflict(null)
          setChanged(false)
          setSave({ phase: 'saved' })
        }

        /** 丢掉本地修改、重新读磁盘（冲突与「磁盘已变更」横幅上的动作）。 */
        const discard = () => {
          drafts.delete(storageKey)
          setConflict(null)
          setChanged(false)
          setDraft(docRef.current.phase === 'ready' ? docRef.current.text : '')
          setToken((value) => value + 1)
        }

        /** 当前选区切片；没有选区时是空串。 */
        const selectedText = () => {
          const area = areaRef.current
          if (area === null) return ''
          return area.value.slice(area.selectionStart ?? 0, area.selectionEnd ?? 0)
        }

        /** 用一段文本换掉选区（菜单里的剪切 / 粘贴都走它），并同步 React 状态。 */
        const replaceSelection = (text) => {
          const area = areaRef.current
          if (area === null) return
          const start = area.selectionStart ?? 0
          const end = area.selectionEnd ?? start
          area.setRangeText(text, start, end, 'end')
          area.focus()
          setDraft(area.value)
          setSave((prev) => (prev.phase === 'saving' ? prev : { phase: 'idle' }))
        }

        /** 剪切：先写剪贴板，写成功了才从缓冲区里删掉选区。 */
        const cutSelection = async () => {
          const text = selectedText()
          if (text === '') return
          if (!(await writeClipboard(text))) {
            setSend({ phase: 'failed', text: t('send.failed.clipboard') })
            return
          }
          replaceSelection('')
        }

        /** 复制：写剪贴板；浏览器不肯写时亮一条提示（Ctrl/Cmd+C 仍可用）。 */
        const copySelection = async () => {
          const text = selectedText()
          if (text === '') return
          if (!(await writeClipboard(text))) setSend({ phase: 'failed', text: t('send.failed.clipboard') })
        }

        /** 粘贴：读剪贴板插进选区；读不到（权限 / 非安全上下文）就静默跳过。 */
        const pasteSelection = async () => {
          const text = await readClipboard()
          if (text === undefined || text === '') return
          replaceSelection(text)
        }

        /** 全选：先把焦点收回文本框再 select，否则选区落在别处。 */
        const selectAll = () => {
          const area = areaRef.current
          if (area === null) return
          area.focus()
          area.select()
        }

        /**
         * 把「当前文件 + 选区所在行」拼成 `@` 引用，插进这个会话的对话输入框。
         *
         * 两处刻意：
         * 1. **先 `captureInsertion()` 再 `insertText()`，两步挨着做** —— 公开面的插入是
         *    「捕获时的选区 + 草稿版本」CAS，中间任何编辑都会让插入被拒（返回 false）。
         * 2. **尾随空格** —— `@` 触发检测要求触发 token 紧贴光标，空格让刚插进去的引用
         *    不会又把 `@` 文件菜单唤出来。
         * @returns 无。
         */
        /**
         * 「复制路径 / 复制相对路径」：复制**这个文件**的路径。
         *
         * 路径优先用读盘拿到的 `absolutePath`（渲染器入口给的相对路径不一定带工作区根）；
         * 相对路径的基准是**会话工作区根**（事件里现读，见约束 19：不假设槽位传了什么 prop）。
         * 与文件树共用 `copyPathToClipboard`，只是横幅渲染在编辑器自己的位置。
         * @param relative - true 复制相对工作区根的路径。
         * @returns 无。
         */
        const copyEditorPath = async (relative) => {
          const outcome = await copyPathToClipboard(doc.absolutePath ?? path, relative, sessionCwd(ctx, sessionId), t)
          if (!outcome.ok) {
            showNotice(outcome.text, 'error', true)
            return
          }
          showNotice(t('files.copyPath.done', { path: outcome.text }), 'ok')
        }

        /**
         * 「在终端打开」：打开这个文件**所在目录**的终端（同样受官方 API 限制，见
         * `openTerminalAt` —— 是开完再替你敲一条 `cd`）。
         * @param element - 触发这次动作的元素。
         * @returns 无。
         */
        const openEditorTerminal = async (element) => {
          const file = doc.absolutePath ?? path
          await openTerminalAt(ctx, directoryOfFile(file, sessionCwd(ctx, sessionId)), element, t, (result) => {
            if (result.ok === true) {
              showNotice(t('files.terminal.done', { path: result.dir }), 'ok')
              return
            }
            showNotice(t(result.key), 'error', true)
          })
        }

        const sendToInput = () => {
          const area = areaRef.current
          const current = docRef.current
          if (area === null || current.phase !== 'ready') return
          const start = area.selectionStart ?? 0
          const end = area.selectionEnd ?? start
          const reference = lineReferenceToken(
            relativizeToCwd(current.absolutePath ?? path, sessionCwd(ctx, sessionId)),
            lineNumberOf(draftRef.current, start),
            lineNumberOf(draftRef.current, end),
          )
          if (reference === null) {
            setSend({ phase: 'failed', text: t('send.failed.path') })
            return
          }
          // 写入面：槽位 prop 优先（作用域最明确），没有就用哨兵登记的那份（官方的
          // conversation.input.dock 一定有这个面 —— 侧栏某些渲染点不传标准 prop）。
          const actions = inputActions ?? inputTargets.get(sessionId)
          if (actions === undefined || typeof actions.captureInsertion !== 'function' || typeof actions.insertText !== 'function') {
            // 会话还没起来、对话区没打开、或输入框正被审批 / 问答占用（composer 被接管）。
            setSend({ phase: 'failed', text: t('send.failed.input') })
            return
          }
          if (!actions.insertText(`${reference} `, actions.captureInsertion())) {
            setSend({ phase: 'failed', text: t('send.failed.busy') })
            return
          }
          setSave((prev) => (prev.phase === 'saved' ? { phase: 'idle' } : prev))
          setSend({ phase: 'sent', text: t('send.sent', { token: reference }) })
        }

        /** Ctrl/Cmd+S 保存；菜单开着时 Esc 先关菜单。 */
        const onKeyDown = (event) => {
          if (event.key === 'Escape' && menu !== null) {
            event.preventDefault()
            setMenu(null)
            return
          }
          if (event.key === 's' && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
            event.preventDefault()
            void saveNow(false)
          }
        }

        if (doc.phase === 'loading') {
          return h('div', { className: `dsh-we-root ${variant}`, 'data-workspace-editor': 'loading' },
            h('style', null, CSS),
            h('div', { className: 'dsh-we-message' },
              h('p', { className: 'dsh-we-message-text' }, t('status.loading'))))
        }

        if (doc.phase === 'failed') {
          return h('div', { className: `dsh-we-root ${variant}`, 'data-workspace-editor': 'failed' },
            h('style', null, CSS),
            h('div', { className: 'dsh-we-message' },
              h('p', { className: 'dsh-we-message-text', 'data-workspace-editor-error': doc.code }, doc.message),
              h('button', {
                type: 'button',
                className: 'dsh-we-button',
                'data-workspace-editor-retry': '',
                onClick: () => { setToken((value) => value + 1) },
              }, t('action.retry'))))
        }

        /**
         * 右键菜单里的一项。属性值带上禁用态与当前 token，方便浏览器里断言
         * （`data-workspace-editor-*` 是调试锚点，不用 class 或可见文案当锚点）。
         * @param id - 锚点后缀（同时当 key）。
         * @param label - 可见文案。
         * @param run - 点下去干什么。
         * @param extra - `{ disabled, title, icon }`；`icon: null` 表示这一项不要图标。
         * @returns 菜单项。
         */
        const sendMenuItem = (id, label, run, extra) => h('button', {
          key: id,
          type: 'button',
          className: 'dsh-wef-menu-item',
          disabled: extra?.disabled === true,
          title: extra?.title,
          'data-workspace-editor-send-item': id,
          'data-disabled': extra?.disabled === true ? 'true' : 'false',
          onClick: (event) => {
            event.stopPropagation()
            setMenu(null)
            // 事件要透下去：`ctx.sidebarRight.commandTarget(element)` 靠触发元素定位侧边栏页。
            run(event)
          },
        }, extra?.icon === null ? null : glyph(extra?.icon ?? 'file', 14), label)

        const dirty = draft !== doc.text
        /** 高亮层的状态（浏览器里可断言）：`plain` 认不出语言、`over-limit` 超过高亮上限。 */
        /**
         * 高亮层的状态（浏览器里可断言）：`plain` 认不出语言、`over-limit` 超过字符 / 令牌上限、
         * `unsupported` 这个浏览器没有 Custom Highlight API。
         */
        const highlightTone = !HIGHLIGHT_API_SUPPORTED
          ? 'unsupported'
          : language === null
            ? 'plain'
            : tokens === null ? 'over-limit' : 'on'
        const statusTone = save.phase === 'saved' ? 'saved' : dirty ? 'dirty' : 'clean'
        const statusText = save.phase === 'saving'
          ? t('action.saving')
          : save.phase === 'saved'
            ? t('status.saved')
            : dirty
              ? t('status.dirty')
              : t('status.clean')

        return h('div', {
          className: `dsh-we-root ${variant}`,
          'data-workspace-editor': 'ready',
          'data-workspace-editor-path': doc.absolutePath ?? '',
        },
        h('style', null, CSS),
        conflict !== null && h('p', {
          className: 'dsh-we-banner',
          'data-tone': 'warn',
          'data-workspace-editor-conflict': conflict.code,
        },
        h('span', { className: 'dsh-we-banner-text' },
          t(conflict.code === 'not-observed' ? 'conflict.exists' : 'conflict.stale'),
          ' ',
          t('conflict.message'),
          ' ',
          h('span', { className: 'dsh-we-detail', 'data-workspace-editor-conflict-detail': '' }, conflict.message)),
        h('button', {
          type: 'button',
          className: 'dsh-we-button',
          'data-workspace-editor-conflict-reload': '',
          onClick: discard,
        }, t('action.discard')),
        h('button', {
          type: 'button',
          className: 'dsh-we-button',
          'data-primary': 'true',
          'data-workspace-editor-overwrite': '',
          onClick: () => { void saveNow(true) },
        }, t('action.overwrite'))),
        conflict === null && changed && h('p', {
          className: 'dsh-we-banner',
          'data-tone': 'warn',
          'data-workspace-editor-changed': '',
        },
        h('span', { className: 'dsh-we-banner-text' }, t('changed.message')),
        h('button', {
          type: 'button',
          className: 'dsh-we-button',
          'data-workspace-editor-changed-reload': '',
          onClick: discard,
        }, t('action.discard')),
        h('button', {
          type: 'button',
          className: 'dsh-we-button',
          'data-workspace-editor-changed-keep': '',
          onClick: () => { setChanged(false) },
        }, t('action.keep'))),
        save.phase === 'failed' && h('p', {
          className: 'dsh-we-banner',
          'data-tone': 'error',
          'data-workspace-editor-save-error': '',
        }, h('span', { className: 'dsh-we-banner-text' }, save.message)),
        send.phase === 'sent' && h('p', {
          className: 'dsh-we-banner',
          'data-tone': 'success',
          'data-workspace-editor-send': 'sent',
        }, h('span', { className: 'dsh-we-banner-text' }, send.text)),
        send.phase === 'failed' && h('p', {
          className: 'dsh-we-banner',
          'data-tone': 'error',
          'data-workspace-editor-send': 'failed',
        }, h('span', { className: 'dsh-we-banner-text' }, send.text)),
        doc.notice != null && h('p', {
          className: 'dsh-we-banner',
          'data-tone': 'warn',
          'data-workspace-editor-notice': '',
        }, h('span', { className: 'dsh-we-banner-text' }, doc.notice)),
        notice !== null && h('p', {
          className: 'dsh-we-banner',
          'data-tone': notice.tone,
          'data-workspace-editor-action-notice': '',
        },
        h('span', { className: 'dsh-we-banner-text' }, notice.text),
        h('button', {
          type: 'button',
          className: 'dsh-we-button',
          'data-workspace-editor-action-notice-dismiss': '',
          onClick: () => { dismissNotice() },
        }, t('action.cancel'))),
        h('div', { className: 'dsh-we-bar' },
          h('span', {
            className: 'dsh-we-status',
            'data-tone': statusTone,
            'data-workspace-editor-status': statusTone,
          }, statusText),
          // 路径：与右键「复制相对路径」**同一份口径**（`relativizeToCwd` + `sessionCwd`），
          // 所以工作区外的文件自动回退成绝对路径、拿不到 cwd 时原样显示。
          // 显示宽度不够时从头部截断（保住文件名），完整绝对路径在 `title` 与锚点属性上。
          h('span', {
            className: 'dsh-we-status-path',
            title: doc.absolutePath ?? path,
            'data-workspace-editor-status-path': doc.absolutePath ?? path,
          }, shortenPath(relativizeToCwd(doc.absolutePath ?? path, sessionCwd(ctx, sessionId)))),
          h('span', { className: 'dsh-we-spacer' }),
          h('span', { className: 'dsh-we-hint', 'data-workspace-editor-hint': '' }, t('hint.save')),
          onToggleWrap !== undefined && h('button', {
            type: 'button',
            className: 'dsh-we-button',
            'data-workspace-editor-wrap': wrap ? 'true' : 'false',
            onClick: onToggleWrap,
          }, t(wrap ? 'action.wrap.on' : 'action.wrap.off')),
          h('button', {
            type: 'button',
            className: 'dsh-we-button',
            'data-workspace-editor-reload': '',
            disabled: save.phase === 'saving',
            onClick: discard,
          }, t('action.reload')),
          h('button', {
            type: 'button',
            className: 'dsh-we-button',
            'data-primary': dirty ? 'true' : 'false',
            'data-workspace-editor-save': '',
            disabled: !dirty || save.phase === 'saving',
            onClick: () => { void saveNow(false) },
          }, t('action.save'))),
        h('div', {
          className: 'dsh-we-code',
          'data-wrap': wrap ? 'true' : 'false',
          'data-workspace-editor-language': language ?? '',
        },
        // 高亮层在**下**、textarea 在**上**：textarea 的字是透明的（只留光标与选区），
        // 看得见的字形全部来自这一层。`aria-hidden` 免得读屏把正文念两遍。
        h('pre', {
          className: 'dsh-we-hl',
          'aria-hidden': 'true',
          'data-workspace-editor-highlight': highlightTone,
          ref: hlRef,
        },
        // 正文就是**一个文本节点**：上色交给 Custom Highlight API（Range + `::highlight()`），
        // 一个 span 都不加 —— 每次按键重建几千个 span 的代价实测会让打字掉帧（见 applyHighlights）。
        // 末尾那个 `<br>` 是给 textarea 的「结尾空行」补行盒的（见 needsTrailingLine）。
        highlightText,
        needsTrailingLine(highlightText) ? h('br') : null),
        h('textarea', {
          ref: attachArea,
          className: 'dsh-we-editor',
          'data-wrap': wrap ? 'true' : 'false',
          'data-workspace-editor-input': '',
          'aria-label': t('editor.label'),
          value: draft,
          wrap: wrap ? 'soft' : 'off',
          spellCheck: false,
          autoCapitalize: 'off',
          autoCorrect: 'off',
          onScroll: syncHighlight,
          onChange: (event) => {
            setDraft(event.target.value)
            setSave((prev) => (prev.phase === 'saving' ? prev : { phase: 'idle' }))
          },
          onContextMenu: (event) => {
            // 右键菜单自己画：原生文本框菜单里没有「发送到 DSH」，而在原生菜单旁边
            // 再挂一个浮层会出现两份菜单。剪切 / 复制 / 粘贴 / 全选照给，不损失原生
            // 菜单本就有的编辑能力。
            event.preventDefault()
            areaRef.current = event.currentTarget
            const start = event.currentTarget.selectionStart ?? 0
            const end = event.currentTarget.selectionEnd ?? start
            setMenu({
              ...menuAnchorFor(event),
              // 引用在右键那一刻就算好：点菜单不会动选区，但先算一次能让菜单项的
              // title 直接显示「将要插入什么」，发送时也不必再猜选区。
              token: lineReferenceToken(
                relativizeToCwd(doc.absolutePath ?? path, sessionCwd(ctx, sessionId)),
                lineNumberOf(draft, start),
                lineNumberOf(draft, end),
              ),
            })
          },
          onKeyDown,
        })),
        menu !== null && h('div', {
          className: 'dsh-wef-backdrop',
          'data-workspace-editor-send-backdrop': '',
          onClick: () => { setMenu(null) },
          onContextMenu: (event) => { event.preventDefault(); setMenu(null) },
        }),
        menu !== null && h('div', {
          className: 'dsh-wef-menu',
          style: { left: `${String(menu.x)}px`, top: `${String(menu.y)}px` },
          'data-workspace-editor-send-menu': menu.token ?? '',
        },
        sendMenuItem('cut', t('action.cut'), () => { void cutSelection() }, { icon: null }),
        sendMenuItem('copy', t('action.copy'), () => { void copySelection() }, { icon: null }),
        sendMenuItem('paste', t('action.paste'), () => { void pasteSelection() }, { icon: null }),
        sendMenuItem('selectAll', t('action.selectAll'), selectAll, { icon: null }),
        h('div', { className: 'dsh-wef-menu-sep', key: 'sep' }),
        sendMenuItem('send', t('send.menu'), sendToInput, {
          icon: 'send',
          disabled: menu.token === null,
          title: menu.token === null ? t('send.failed.path') : t('send.menuTitle', { token: menu.token }),
        }),
        h('div', { className: 'dsh-wef-menu-sep', key: 'sep-paths' }),
        sendMenuItem('copy-path', t('files.copyPath'), () => { void copyEditorPath(false) }, { icon: 'path' }),
        sendMenuItem('copy-path-relative', t('files.copyPathRelative'), () => { void copyEditorPath(true) }, { icon: 'path' }),
        sendMenuItem('open-terminal', t('files.openTerminal'), (event) => { void openEditorTerminal(event?.currentTarget ?? null) }, { icon: 'terminal' })))
      }

      /**
       * 文档渲染器正文（入口 1 / 2）：从资源地址取出会话与路径，把 owner 的
       * `content.loaded/failed` 接上。
       * @param props - 文档正文槽位交来的 props（含 `inputActions`：本会话输入框的公开写入面）。
       * @returns 编辑器正文，或地址不可用时的说明。
       */
      function DocumentBody(props) {
        const { resourceAddress, content, wrap, scrollportRef, t, inputActions } = props
        const request = content !== undefined && content !== null && content.kind === 'renderer' ? content : null
        const file = React.useMemo(() => parseSessionFileAddress(resourceAddress), [resourceAddress])
        if (file === null || request === null) {
          return h('div', { className: 'dsh-we-root dsh-we-fill', 'data-workspace-editor': 'unavailable' },
            h('style', null, CSS),
            h('div', { className: 'dsh-we-message' },
              h('p', { className: 'dsh-we-message-text' }, t('status.noAddress'))))
        }
        return h(EditorSurface, {
          t,
          sessionId: file.sessionId,
          path: file.path,
          wrap: wrap === true,
          scrollportRef,
          reloadKey: `r${String(request.revision)}`,
          variant: 'dsh-we-fill',
          onLoaded: (version) => { request.loaded(version) },
          onFailed: () => { request.failed() },
          inputActions,
        })
      }

      /**
       * 编辑器页签正文（入口 3）：目标来自打开时带的 `navigation.params`，没有参数时
       * 回落到解析地址里的绝对路径。
       * @param props - 页签正文槽位交来的 props（含 `inputActions`：本会话输入框的公开写入面）。
       * @returns 编辑器正文，或目标不可用时的说明。
       */
      function PaneBody(props) {
        const { useTabInfo, sessionId, t, inputActions } = props
        const { tab } = useTabInfo()
        const [wrap, setWrap] = React.useState(true)
        const target = React.useMemo(() => paneTarget(tab, sessionId), [tab, sessionId])
        if (target === null) {
          return h('div', { className: 'dsh-we-root dsh-we-pane', 'data-workspace-editor': 'unavailable' },
            h('style', null, CSS),
            h('div', { className: 'dsh-we-message' },
              h('p', { className: 'dsh-we-message-text' }, t('status.noAddress'))))
        }
        return h(EditorSurface, {
          t,
          sessionId: target.sessionId,
          path: target.path,
          wrap,
          onToggleWrap: () => { setWrap((value) => !value) },
          scrollportRef: null,
          reloadKey: 'tab',
          variant: 'dsh-we-pane',
          inputActions,
        })
      }

      /**
       * 预览头部的「编辑」按钮：用编辑器页签**顶掉**这张预览页签（同一个面板、同一个位置），
       * 该文件的编辑器页签已经开着时就聚焦它。
       * @param props - `sidebar.right.tab.document.actions` 交来的 props（含 `absolutePath`）。
       * @returns 按钮，或没有 Host 路径时不渲染。
       */
      function EditAction(props) {
        const { absolutePath, sessionId, t } = props
        if (typeof absolutePath !== 'string' || absolutePath === '') return null
        // 图片没有「编辑」这件事：本插件只提供预览（文件树里点图片），编辑器给不了图片任何东西。
        if (imageMediaTypeOf(absolutePath) !== undefined) return null
        const open = (event) => {
          // 用按钮所在的真实 DOM 位置问出面板与页签：只有拿得到当前页签才能「顶掉」它；
          // 问不到（浮动面板等）就退回「当前活动的停靠面板」，在旁边开一个。
          const target = ctx.sidebarRight.commandTarget(event.currentTarget)
          const owner = target?.sessionId ?? sessionId
          const placement = target?.tabId === undefined
            ? target?.paneId === undefined ? {} : { paneId: target.paneId }
            : { replaceTab: target.tabId }
          ctx.sidebarRight.openResource(absoluteFileAddress(absolutePath), {
            kind: EDITOR_KIND,
            ...placement,
            params: { sessionId: owner, path: absolutePath },
          })
        }
        return h('button', {
          type: 'button',
          className: 'dsh-we-open',
          'data-workspace-editor-open': '',
          title: t('action.edit'),
          onClick: open,
        }, '✎', h('span', null, t('action.edit')))
      }

      /**
       * 预览头部的「删除」按钮：真删磁盘上的这个文件，不经过编辑器。
       *
       * 三条安全设计（与保存同一套思路）：
       *
       * 1. **两次点击**：第一下只进确认态，第二下才发请求；确认态 8 秒后自己过期 —— 免得
       *    一次误点留下一个随时会删掉文件的按钮。
       * 2. **版本闸**：进入确认态的同时抓一份当前版本，删除请求带上它。磁盘在你确认期间
       *    变过（模型或别的工具写了一把）Host 返回 `stale-version`：这里只提示、不删，
       *    要删必须再点一次「仍然删除」——那才是不带版本闸的无条件删除。
       * 3. **删完关页签**：文件没了，这张预览也就没有内容可看；页签还是当初那张就关掉它，
       *    已经换过（`stale`）就留在原地显示「已删除」。
       *
       * 删除本身没有「丢弃修改」这一步：这里删的是磁盘上的文件，不是编辑器里的缓冲区。
       * @param props - `sidebar.right.tab.document.actions` 交来的 props（含 `absolutePath`）。
       * @returns 删除按钮（含确认 / 冲突 / 失败态），或没有 Host 路径时不渲染。
       */
      function DeleteAction(props) {
        const { absolutePath, sessionId, t } = props
        const [state, setState] = React.useState({ phase: 'idle' })
        /** 本次确认的上下文：会话、版本闸基线、按钮所在页签；没有确认态时为 null。 */
        const pendingRef = React.useRef(null)
        const statRef = React.useRef(null)
        const busyRef = React.useRef(false)
        const aliveRef = React.useRef(true)

        // 请求与读状态都可能比页签活得久：卸载之后一律不再写状态。
        React.useEffect(() => () => {
          aliveRef.current = false
          statRef.current?.abort()
        }, [])

        // 确认态与冲突态自己过期：误点一下不该留下一个待触发的删除。
        React.useEffect(() => {
          if (state.phase !== 'confirm' && state.phase !== 'stale') return undefined
          const timer = setTimeout(() => {
            if (!aliveRef.current) return
            pendingRef.current = null
            setState({ phase: 'idle' })
          }, 8000)
          return () => { clearTimeout(timer) }
        }, [state.phase])

        if (typeof absolutePath !== 'string' || absolutePath === '') return null

        /**
         * 第一下点击：进确认态，并顺手抓一份当前版本当版本闸基线。
         * @param event - 点击事件（用来问出按钮所在的页签与会话）。
         * @returns 无。
         */
        const arm = (event) => {
          if (busyRef.current) return
          const target = ctx.sidebarRight.commandTarget(event.currentTarget)
          const owner = target?.sessionId ?? sessionId
          const slot = { sessionId: owner, version: undefined, detail: null, target }
          pendingRef.current = slot
          statRef.current?.abort()
          const controller = new AbortController()
          statRef.current = controller
          setState({ phase: 'confirm', checked: false, version: undefined, detail: null })
          if (typeof owner !== 'string' || owner === '') {
            setState({ phase: 'failed', text: t('delete.noVersion'), detail: null })
            return
          }
          void (async () => {
            let result
            try {
              result = await ctx.remote.workspaceFiles.stat(owner, absolutePath, controller.signal)
            } catch (error) {
              result = { ok: false, error: { message: error instanceof Error ? error.message : String(error) } }
            }
            if (!aliveRef.current || controller.signal.aborted || pendingRef.current !== slot) return
            if (result.ok) slot.version = result.value.version
            else slot.detail = result.error.message
            setState((prev) => (prev.phase === 'confirm'
              ? { ...prev, checked: true, version: slot.version, detail: slot.detail }
              : prev))
          })()
        }

        /** 回到初始态：取消、过期、删完关不掉页签时都走这里。 */
        const reset = () => {
          statRef.current?.abort()
          pendingRef.current = null
          setState({ phase: 'idle' })
        }

        /**
         * 发删除请求。
         * @param force - true 表示不带版本闸（用户点过「仍然删除」）。
         * @returns 请求结束即返回。
         */
        const remove = async (force) => {
          const slot = pendingRef.current
          if (slot === null || busyRef.current) return
          const body = { sessionId: slot.sessionId, path: absolutePath }
          if (!force && slot.version !== undefined) body.expectedVersion = slot.version
          busyRef.current = true
          setState({ phase: 'deleting' })
          let response
          try {
            response = await fetch(DELETE_URL, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            })
          } catch {
            busyRef.current = false
            if (!aliveRef.current) return
            setState({ phase: 'failed', text: t('error.deleteTransport'), detail: null })
            return
          }
          let payload = null
          try {
            payload = await response.json()
          } catch {
            payload = null
          }
          busyRef.current = false
          if (!aliveRef.current) return
          if (!response.ok) {
            const code = typeof payload?.code === 'string' ? payload.code : 'delete-failed'
            const message = typeof payload?.message === 'string' ? payload.message : `HTTP ${String(response.status)}`
            // 405 只可能是「这条路由还没注册」：静态 fallback 对非 GET/HEAD 就是这个码，
            // 而本插件自己的 405 只对非 POST 方法 —— 也就是改了 index.js 还没重启 Harness。
            if (response.status === 405 && payload === null) {
              setState({ phase: 'failed', text: t('error.deleteRoute'), detail: null })
              return
            }
            setState(code === 'stale-version'
              ? { phase: 'stale', text: t('delete.stale'), detail: message }
              : { phase: 'failed', text: t('error.delete', { message }), detail: message })
            return
          }
          // 文件已经没了：留着的草稿再也不会被恢复，顺手清掉。
          drafts.delete(`${slot.sessionId}\u0000${absolutePath}`)
          let closed = 'unavailable'
          try {
            if (slot.target !== undefined) closed = ctx.sidebarRight.closeTarget(slot.target)
          } catch {
            closed = 'unavailable'
          }
          pendingRef.current = null
          // 页签关掉了就不再写状态（这个组件正在卸载）；关不掉时留在原地显示「已删除」。
          if (closed !== 'closed') setState({ phase: 'deleted', text: t('status.deleted'), detail: null })
        }

        /**
         * 工具栏里的一条短提示：完整文本放 `title`，长消息不撑破工具条；
         * 属性值带上当前状态，方便浏览器里用选择器断言（`data-workspace-editor-*` 是调试锚点）。
         */
        const note = (text, title, tone, extra) => h('span', {
          className: 'dsh-we-note',
          title: title ?? text,
          'data-tone': tone,
          'data-workspace-editor-delete-note': state.phase,
          ...extra,
        }, text)

        const checking = state.phase === 'confirm' && state.checked !== true
        const gated = state.phase === 'confirm' && state.checked === true && state.version !== undefined
        const forced = state.phase === 'stale' || (state.phase === 'confirm' && state.checked === true && state.version === undefined)
        const label = state.phase === 'idle'
          ? t('action.delete')
          : state.phase === 'deleting'
            ? t('status.deleting')
            : checking
              ? t('status.checking')
              : t(gated ? 'action.deleteConfirm' : 'action.deleteForce')

        return h(React.Fragment, null,
          h('style', null, CSS),
          state.phase === 'confirm' && note(t('delete.hint'), null, null, {}),
          state.phase === 'confirm' && state.detail !== null && note(t('delete.noVersion'), state.detail, 'warn', {}),
          state.phase === 'stale' && note(state.text, state.detail, 'warn', {}),
          state.phase === 'failed' && note(state.text, state.detail, 'error', { 'data-workspace-editor-delete-error': '' }),
          state.phase === 'deleted' && note(state.text, null, null, {}),
          state.phase !== 'failed' && state.phase !== 'deleted' && h('button', {
            type: 'button',
            className: 'dsh-we-open',
            'data-danger': state.phase === 'idle' ? 'false' : 'true',
            'data-workspace-editor-delete': state.phase,
            'data-workspace-editor-delete-go': checking ? 'pending' : gated ? 'gated' : 'force',
            disabled: state.phase === 'deleting' || checking,
            onClick: state.phase === 'deleting' || checking
              ? null
              : state.phase === 'idle'
                ? arm
                : () => { void remove(forced) },
          }, '🗑\uFE0E ', label),
          // 取消 / 失败 / 已删除都停在原地：失败态也给一个出口，不能只剩一条错误文字。
          (state.phase === 'confirm' || state.phase === 'stale' || state.phase === 'failed') && h('button', {
            type: 'button',
            className: 'dsh-we-open',
            'data-workspace-editor-delete-cancel': '',
            onClick: reset,
          }, t('action.cancel')))
      }

      return { DocumentBody, PaneBody, EditAction, DeleteAction }
    }

    /** 「文件编辑」面板：页签类型 id / kind，以及树上每个目录的观察节流。 */
    const FILES_TAB_ID = '@dongasai/dsh-editor/files'
    const FILES_KIND = 'workspace-editor-files'

    /** 变更帧到达后合并成一次重列的等待时间（毫秒）。 */
    const WATCH_DEBOUNCE_MS = 120

    /** 一次性提示（「已复制路径」这类没有落盘副作用的回话）在屏幕上留多久。 */
    const NOTICE_MS = 6000

    /**
     * 侧边栏终端页类型注册的 kind。与官方 `@deepseek-ai/dsh-client-ui-sidebar-terminal`
     * 逐字一致 —— 它不是我们的类型，我们只是按这个 kind 请侧边栏开一个终端页签。
     */
    const TERMINAL_KIND = 'terminal'

    /** 开完终端页签后，等它出现在页签清单里的上限（毫秒）。 */
    const TERMINAL_TAB_MS = 2000

    /**
     * 等新终端「变成可写」的上限（毫秒）。到了就放弃自动 cd —— 终端本身已经开着，用户自己敲一条
     * 也一样；但不能不吭声（见 `files.terminal.timeout`）。
     */
    const TERMINAL_READY_MS = 15000

    /**
     * 一次性提示的状态机：「已复制：<路径>」这类没有落盘副作用的回话。
     *
     * 文件树与编辑器共用同一份（两处都要「亮一条、几秒后自己消失、也能点掉」），各自在
     * 自己的位置渲染横幅 —— 这两个面（`sidebar.right.pane.tab` 的两种 kind）状态是分开的，
     * 共享的只有这套状态机本身。
     * @returns `{ notice, showNotice, dismissNotice }`。
     */
    function useNotice() {
      const [notice, setNotice] = React.useState(null)
      const timer = React.useRef(null)
      const alive = React.useRef(true)
      React.useEffect(() => () => {
        alive.current = false
        if (timer.current !== null) clearTimeout(timer.current)
      }, [])
      const dismissNotice = React.useCallback(() => {
        if (timer.current !== null) clearTimeout(timer.current)
        timer.current = null
        setNotice(null)
      }, [])
      /**
       * @param text - 已经本地化好的文本。
       * @param tone - `ok` | `warn` | `error`。
       * @param sticky - true 时不自动消失（失败要留到用户处理或点掉），只能手动关。
       */
      const showNotice = React.useCallback((text, tone, sticky) => {
        // 组件已经卸载：不再动状态（「在终端打开」的结果可能来得比面板的命还晚）。
        if (!alive.current) return
        if (timer.current !== null) clearTimeout(timer.current)
        timer.current = null
        setNotice({ text, tone })
        if (sticky !== true) {
          timer.current = setTimeout(() => {
            timer.current = null
            if (alive.current) setNotice(null)
          }, NOTICE_MS)
        }
      }, [])
      return { notice, showNotice, dismissNotice }
    }

    /**
     * 「复制相对路径」的文本：相对 `cwd`（会话工作区根）。
     *
     * 根自己用 `.` —— 回一个绝对路径会让人以为「相对路径没生效」；拿不到 `cwd` 时原样返回
     * （宁可给绝对路径，也不要凭空造一个相对路径）。
     * @param path - 这一行的路径。
     * @param relative - true 要相对路径。
     * @param cwd - 会话工作区根。
     * @returns 要写进剪贴板的文本。
     */
    function copyPathText(path, relative, cwd) {
      if (relative !== true) return path
      if (typeof cwd !== 'string' || cwd === '') return path
      return path === cwd.replace(/[/\\]+$/u, '') ? '.' : relativizeToCwd(path, cwd)
    }

    /**
     * 把一条路径写进系统剪贴板（文件树与编辑器的「复制路径 / 复制相对路径」共用）。
     * @param path - 要复制的路径。
     * @param relative - true 复制相对工作区根的路径。
     * @param cwd - 会话工作区根。
     * @param t - 文案函数。
     * @returns `{ ok: true, text }`（写进去了）或 `{ ok: false, text }`（失败文案，调用方显示）。
     */
    async function copyPathToClipboard(path, relative, cwd, t) {
      const text = copyPathText(path, relative, cwd)
      if (await writeClipboard(text)) return { ok: true, text }
      return { ok: false, text: t('files.copyPath.failed') }
    }

    /**
     * 一个**文件**路径所在目录。
     *
     * 与文件树里的 `parentOf` 不同：这里的路径可能没有分隔符（编辑器拿到的是相对工作区根的
     * 路径），那时不能把文件名当目录回给 `cd`，而要回工作区根（终端就是从那儿起步的）。
     * @param path - 文件路径（绝对或相对）。
     * @param cwd - 会话工作区根，拿不到时退回 `.`。
     * @returns 目录路径。
     */
    function directoryOfFile(path, cwd) {
      const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
      if (cut > 0) return path.slice(0, cut)
      if (cut === 0) return '/'
      return typeof cwd === 'string' && cwd !== '' ? cwd : '.'
    }

    /** 一个会话提交后的页签记录（公开接口 `tabsIn`；读不到就当没有）。 */
    function tabsOfSession(ctx, sessionId) {
      try { return ctx.sidebarRight.tabsIn(sessionId) ?? [] } catch { return [] }
    }

    /**
     * 等刚开的终端页签出现。
     *
     * 先看公开的 `active()`（开页签会把选中挪过去，正常情况一次就命中），再拿 `tabsIn()` 的差集
     * 兜底 —— 布局 store 是异步提交的，所以是轮询而不是读一次。
     * @param ctx - 客户端根上下文。
     * @param sessionId - 在哪个会话里开。
     * @param before - 开之前已有的页签 id。
     * @returns 新终端页签，或 undefined。
     */
    async function waitForTerminalTab(ctx, sessionId, before) {
      const until = Date.now() + TERMINAL_TAB_MS
      for (;;) {
        const active = (() => {
          try { return ctx.sidebarRight.active() } catch { return undefined }
        })()
        if (active !== undefined && active.kind === TERMINAL_KIND && !before.has(active.id)) return active
        const found = tabsOfSession(ctx, sessionId).find((tab) => tab.kind === TERMINAL_KIND && !before.has(tab.id))
        if (found !== undefined) return found
        if (Date.now() >= until) return undefined
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    }

    /**
     * 等一个终端可写，然后把 `cd '<目录>'` 敲进去。
     *
     * 这个 watcher **刻意不随调用它的组件卸载而取消**：开了终端之后那个面板很可能被终端页签顶掉
     * （我们会把新页签聚焦过来），而这时的 cd 还没发出去。它自己在三个出口收尾 —— 可写（写一次）、
     * 失败 / 关闭（不吭声：终端页签自己会显示失败原因）、超时（回调里说明）。
     * @param terminals - 客户端的 `webTerminals` 服务。
     * @param sessionId - 会话 id。
     * @param tab - 刚开的终端页签记录。
     * @param dir - 要切过去的目录。
     * @param report - 结果回调（可能比调用晚很多；调用方自己守卫组件是否还活着）。
     * @returns 无。
     */
    function sendCdInto(terminals, sessionId, tab, dir, report) {
      const view = (() => {
        try { return terminals.view(sessionId, tab.id, tab.contentId, undefined, undefined) } catch { return undefined }
      })()
      if (view === undefined || view.state === undefined) {
        report({ ok: false, key: 'files.terminal.noInput' })
        return
      }
      const command = `cd ${shellQuotePath(dir)}\r`
      let settled = false
      let unsubscribe = () => {}
      let timer = null
      const finish = (after) => {
        if (settled) return
        settled = true
        if (timer !== null) clearTimeout(timer)
        try { unsubscribe() } catch { /* 退订失败无所谓 */ }
        if (after !== undefined) after()
      }
      const onChange = () => {
        let state
        try { state = view.state.getSnapshot() } catch { return }
        if (state?.writable === true) {
          // `write()` 在不可写时是**静默丢弃**的，所以必须等到 writable；到了就只写一次。
          try { view.write(command) } catch {
            finish(() => { report({ ok: false, key: 'files.terminal.noInput' }) })
            return
          }
          finish(() => { report({ ok: true, dir }) })
          return
        }
        // 失败 / 已关闭：终端页签自己会显示原因（例如超了终端数量上限），这里不再叠一条横幅。
        if (state?.phase === 'failed' || state?.phase === 'closed') finish()
      }
      timer = setTimeout(() => {
        finish(() => { report({ ok: false, key: 'files.terminal.timeout' }) })
      }, TERMINAL_READY_MS)
      try {
        unsubscribe = view.state.subscribe(onChange)
      } catch {
        finish()
        return
      }
      onChange()
    }

    /**
     * 「在终端打开」的公共实现（文件树与编辑器共用）。
     *
     * 官方 `remote.terminal.create` 只收 `shellPath`（没有 cwd），页签 params 也只有
     * `terminalId` / `shellPath` —— 侧边栏终端一律从**会话工作区根**起步。所以目录只能靠开完
     * 再敲一条 `cd` 带过去，而 `TerminalView.write()` 在不可写时**静默丢弃**，必须等
     * `state.writable === true`（见 `sendCdInto`）。
     *
     * 三条不假设：终端页类型可能没注册（先问 `sidebarRightTabs.entries()`）；`webTerminals` 是
     * 跨插件服务（一律 `ctx.get`，不进 `inject`，见约束 20）；页签身份只能从公开的
     * `active()` / `tabsIn()` 现读（布局 store 异步提交），取不到就报「没能打开」，不猜。
     * @param ctx - 客户端根上下文。
     * @param dir - 要在哪个目录里打开（绝对路径，或相对工作区根的路径 —— 终端从工作区根起步）。
     * @param element - 触发这次动作的元素，交给 `commandTarget` 定位当前侧边栏页。
     * @param t - 文案函数。
     * @param report - 结果回调：`{ ok: true, dir }` 或 `{ ok: false, key }`（本地化键）。
     * @returns 请求处理完即返回（真正的结果走 report）。
     */
    async function openTerminalAt(ctx, dir, element, t, report) {
      const registered = (() => {
        try { return ctx.sidebarRightTabs.entries().some((entry) => entry.kind === TERMINAL_KIND) } catch { return false }
      })()
      if (!registered) {
        report({ ok: false, key: 'files.terminal.missing' })
        return
      }
      const target = (() => {
        try { return ctx.sidebarRight.commandTarget(element ?? null) } catch { return undefined }
      })()
      if (target === undefined) {
        report({ ok: false, key: 'files.terminal.failed' })
        return
      }
      const before = new Set(tabsOfSession(ctx, target.sessionId).map((tab) => tab.id))
      try {
        ctx.sidebarRight.openTabFromTarget(TERMINAL_KIND, target)
      } catch {
        report({ ok: false, key: 'files.terminal.failed' })
        return
      }
      const tab = await waitForTerminalTab(ctx, target.sessionId, before)
      if (tab === undefined) {
        report({ ok: false, key: 'files.terminal.failed' })
        return
      }
      try { ctx.sidebarRight.focus(tab.id) } catch { /* 聚焦不了不影响后面的 cd */ }
      const terminals = ctx.get('webTerminals')
      if (terminals === undefined || typeof terminals.view !== 'function') {
        report({ ok: false, key: 'files.terminal.noInput' })
        return
      }
      sendCdInto(terminals, target.sessionId, tab, dir, report)
    }

    /** 读到的插件信息（读到才缓存；读不到不缓存，下次开面板再试）。 */
    let pluginInfoValue = null

    /** 正在读的那一次（同屏多个面板同时挂载时共用同一次请求）。 */
    let pluginInfoInFlight = null

    /**
     * 读本插件的展示信息：Host 插件清单里按包名认领自己那一行。
     *
     * 两处刻意：
     *
     * 1. **命名空间必须用 `ctx.get('remote.pluginManager')` 取** —— 不能写
     *    `ctx.remote.pluginManager`，更**不能**把它加进插件的 `inject`。命名空间是一个 cordis
     *    **服务**：没在 `inject` 里声明就访问会直接抛
     *    「cannot get property "remote.pluginManager" without inject」（cordis 4.0.4 实测，
     *    错误被下面的 catch 吃掉，页脚就只剩包名 —— 真踩过）；而写进 `inject` 等于硬依赖
     *    「这个部署必须有插件管理器」，没有时**整个插件**会卡在等待里，编辑器与面板全都不出来。
     *    `ctx.get` 是不做可访问性检查的取值口，拿不到就是 undefined。
     * 2. **读失败不缓存**：启动早期命名空间可能还没挂上，下次开面板重试即可。
     * @param ctx - 客户端根上下文。
     * @returns `{ title, version, description }`（字段缺失时为 null），或 null。
     */
    function pluginInfo(ctx) {
      if (pluginInfoValue !== null) return Promise.resolve(pluginInfoValue)
      if (pluginInfoInFlight === null) {
        pluginInfoInFlight = readPluginInfo(ctx).then((value) => {
          pluginInfoInFlight = null
          pluginInfoValue = value
          return value
        })
      }
      return pluginInfoInFlight
    }

    /**
     * 真正去问一次 Host；任何失败都返回 null，绝不抛。
     * @param ctx - 客户端根上下文。
     * @returns 同 `pluginInfo`。
     */
    async function readPluginInfo(ctx) {
      try {
        const manager = ctx.get('remote.pluginManager')
        const result = await manager?.listBundles?.()
        if (result?.ok !== true || !Array.isArray(result.value)) return null
        const row = result.value.find((item) => item?.name === PACKAGE_NAME)
        if (row === undefined) return null
        return {
          title: pluginText(ctx, row.meta?.title),
          version: typeof row.version === 'string' && row.version !== '' ? row.version : null,
          description: pluginText(ctx, row.meta?.description),
        }
      } catch {
        return null
      }
    }

    /**
     * 解析插件清单里的本地化文本（`string | { en, [locale] }`）。
     * @param ctx - 客户端根上下文。
     * @param text - `LocalizedText`，或 undefined。
     * @returns 当前语言的文本，或 null。
     */
    function pluginText(ctx, text) {
      if (text === undefined || text === null) return null
      try {
        const resolved = ctx.locale.resolveText(text)
        return typeof resolved === 'string' && resolved !== '' ? resolved : null
      } catch {
        return typeof text === 'string' && text !== '' ? text : null
      }
    }

    /**
     * 造出**图片预览**页签正文。
     *
     * 为什么是另一个页签类型而不是一个文档渲染器：官方已经有图片渲染器
     * （`IMAGE_MEDIA_TYPES` 那八种后缀 + 共享缩放视图），注册一个默认档渲染器会把它顶掉 ——
     * 这一步刻意只补**本插件自己的入口**：文件树的单击原来一律开文本编辑器，图片落到那里只会
     * 得到「这个文件不是 UTF-8 文本，无法在页面里编辑。」。
     *
     * 页面里做三件事：把字节读出来交给 `<img>`（`Blob` + 对象 URL，换文件 / 卸载时 `revoke`）、
     * 显示「适配窗口 / 原始大小」与字节数 / 尺寸 / MIME、以及一份右键菜单（复制路径 / 复制相对
     * 路径 / 在终端打开 —— 调的是与文件树、编辑器**同一份**共用动作层）。
     * @param ctx - 客户端根上下文。
     * @returns 正文组件 `ImageBody`。
     */
    function createImageBody(ctx) {
      /**
       * 图片预览页签正文：目标来自打开时带的 `navigation.params`（与编辑器页签同一套）。
       * @param props - 页签正文槽位交来的 props（`useTabInfo` / `sessionId` / `t`）。
       * @returns 图片、工具条与提示，或缺目标 / 读盘失败 / 解不开时的说明。
       */
      function ImageBody(props) {
        const { useTabInfo, sessionId, t } = props
        const { tab } = useTabInfo()
        const target = React.useMemo(() => paneTarget(tab, sessionId), [tab, sessionId])
        const owner = target === null ? sessionId : target.sessionId
        const path = target === null ? '' : target.path
        const [state, setState] = React.useState({ phase: 'loading' })
        const [fit, setFit] = React.useState(true)
        const [menu, setMenu] = React.useState(null)
        const [token, setToken] = React.useState(0)
        const { notice, showNotice, dismissNotice } = useNotice()
        /** 当前预览的对象 URL：读完就建，换文件 / 卸载时释放（不释放会一直占着这份字节）。 */
        const urlRef = React.useRef(null)
        const release = () => {
          if (urlRef.current !== null) {
            try { URL.revokeObjectURL(urlRef.current) } catch { /* 释放失败无所谓 */ }
            urlRef.current = null
          }
        }

        // 读盘：换文件、点重试都重读一次。字节交给 Blob，MIME 按后缀给（读接口只给字节）。
        React.useEffect(() => {
          if (path === '') return undefined
          const controller = new AbortController()
          let cancelled = false
          release()
          setState({ phase: 'loading' })
          void (async () => {
            let result
            try {
              result = await ctx.remote.workspaceFiles.readBytes(owner, path, {}, controller.signal)
            } catch (error) {
              if (!cancelled) {
                const message = error instanceof Error ? error.message : String(error)
                setState({ phase: 'failed', code: 'transport', message: t('image.readFailed', { message }) })
              }
              return
            }
            if (cancelled) return
            if (!result.ok) {
              setState({ phase: 'failed', code: result.error.code, message: t('image.readFailed', { message: result.error.message }) })
              return
            }
            const type = imageMediaTypeOf(path) ?? 'application/octet-stream'
            let url
            try {
              url = URL.createObjectURL(new Blob([result.value.data], { type }))
            } catch (error) {
              // 没有 `URL.createObjectURL`（极老的浏览器 / 某些嵌入环境）也不该白屏。
              const message = error instanceof Error ? error.message : String(error)
              setState({ phase: 'failed', code: 'blob', message: t('image.readFailed', { message }) })
              return
            }
            urlRef.current = url
            setState({ phase: 'ready', url, type, bytes: result.value.data.byteLength, width: 0, height: 0 })
          })()
          return () => { cancelled = true; controller.abort() }
        }, [owner, path, token])

        // 卸载释放对象 URL（页签关掉、换会话都会走这里）。
        React.useEffect(() => () => { release() }, [])

        /** 在这个文件上再开一个文本编辑器页签（看 SVG 源码这类用途的逃生口）。 */
        const openEditor = () => {
          ctx.sidebarRight.openResource(absoluteFileAddress(path), {
            kind: EDITOR_KIND,
            params: { sessionId: owner, path },
          })
        }

        /** 一枚图片预览里的菜单项；动作本身调共用动作层，这里只管一处声明。 */
        const menuButton = (id, icon, label, run) => h('button', {
          key: id,
          type: 'button',
          className: 'dsh-wef-menu-item',
          'data-workspace-editor-image-item': id,
          onClick: (event) => {
            event.stopPropagation()
            setMenu(null)
            run(event)
          },
        }, glyph(icon, 14), label)

        if (target === null) {
          return h('div', { className: 'dsh-we-root dsh-we-pane', 'data-workspace-editor-image': 'unavailable' },
            h('style', null, CSS),
            h('div', { className: 'dsh-we-message' },
              h('p', { className: 'dsh-we-message-text' }, t('status.noAddress'))))
        }

        const meta = state.phase === 'ready'
          ? (state.width > 0
            ? t('image.meta', {
              size: t('image.size', { bytes: state.bytes }),
              width: state.width,
              height: state.height,
              type: state.type,
            })
            : `${t('image.size', { bytes: state.bytes })} · ${state.type}`)
          : null

        return h('div', {
          className: 'dsh-we-root dsh-we-pane',
          'data-workspace-editor-image': state.phase,
          'data-workspace-editor-image-path': path,
          onContextMenu: (event) => {
            if (state.phase !== 'ready') return
            event.preventDefault()
            setMenu({ ...menuAnchorFor(event) })
          },
        },
        h('style', null, CSS),
        h('div', { className: 'dsh-we-bar' },
          h('span', { className: 'dsh-we-status', 'data-workspace-editor-image-meta': '' }, meta ?? t('image.loading')),
          // 与编辑器状态条同一份口径、同一个锚点（约束 16：跨面同理）；cwd 用 `owner` ——
          // 与这面那三个菜单动作一致，跨会话查看时相对路径才不会被算错。
          h('span', {
            className: 'dsh-we-status-path',
            title: path,
            'data-workspace-editor-status-path': path,
          }, shortenPath(relativizeToCwd(path, sessionCwd(ctx, owner)))),
          h('span', { className: 'dsh-we-spacer' }),
          state.phase === 'ready' && h('button', {
            type: 'button',
            className: 'dsh-we-button',
            'data-workspace-editor-image-fit': fit ? 'true' : 'false',
            onClick: () => { setFit((value) => !value) },
          }, t(fit ? 'image.actual' : 'image.fit')),
          state.phase === 'ready' && h('button', {
            type: 'button',
            className: 'dsh-we-button',
            'data-workspace-editor-image-editor': '',
            onClick: openEditor,
          }, t('image.openEditor')),
          state.phase === 'failed' && h('button', {
            type: 'button',
            className: 'dsh-we-button',
            'data-workspace-editor-image-retry': '',
            onClick: () => { setToken((value) => value + 1) },
          }, t('action.retry'))),
        notice !== null && h('p', {
          className: 'dsh-we-banner',
          'data-tone': notice.tone,
          'data-workspace-editor-image-notice': '',
        },
        h('span', { className: 'dsh-we-banner-text' }, notice.text),
        h('button', {
          type: 'button',
          className: 'dsh-we-button',
          'data-workspace-editor-image-notice-dismiss': '',
          onClick: () => { dismissNotice() },
        }, t('action.cancel'))),
        state.phase === 'failed' && h('div', { className: 'dsh-we-message', 'data-workspace-editor-image-error': state.code },
          h('p', { className: 'dsh-we-message-text' }, state.message)),
        state.phase === 'ready' && h('div', {
          className: 'dsh-wi-body',
          'data-fit': fit ? 'true' : 'false',
        },
        h('img', {
          className: 'dsh-wi-image',
          src: state.url,
          alt: t('image.alt'),
          draggable: false,
          onLoad: (event) => {
            const width = event.currentTarget.naturalWidth
            const height = event.currentTarget.naturalHeight
            setState((prev) => (prev.phase === 'ready' ? { ...prev, width, height } : prev))
          },
          onError: () => {
            // 后缀说是图片、浏览器解不开（tiff / heic 这类）：说清楚，并给出逃生口。
            setState((prev) => (prev.phase === 'ready' ? { ...prev, phase: 'undecodable' } : prev))
          },
        })),
        state.phase === 'undecodable' && h('div', { className: 'dsh-we-message' },
          h('p', { className: 'dsh-we-message-text', 'data-workspace-editor-image-undecodable': state.type },
            t('image.decodeFailed', { type: state.type, bytes: state.bytes })),
          h('div', { className: 'dsh-we-message-text' },
            h('button', {
              type: 'button',
              className: 'dsh-we-button',
              'data-workspace-editor-image-retry': '',
              onClick: () => { setToken((value) => value + 1) },
            }, t('action.retry')),
            ' ',
            h('button', {
              type: 'button',
              className: 'dsh-we-button',
              'data-workspace-editor-image-editor': '',
              onClick: openEditor,
            }, t('image.openEditor')))),
        menu !== null && h('div', {
          className: 'dsh-wef-backdrop',
          'data-workspace-editor-image-backdrop': '',
          onClick: () => { setMenu(null) },
          onContextMenu: (event) => { event.preventDefault(); setMenu(null) },
        }),
        menu !== null && h('div', {
          className: 'dsh-wef-menu',
          style: { left: `${String(menu.x)}px`, top: `${String(menu.y)}px` },
          'data-workspace-editor-image-menu': path,
        },
        menuButton('copy-path', 'path', t('files.copyPath'), () => {
          void (async () => {
            const outcome = await copyPathToClipboard(path, false, sessionCwd(ctx, owner), t)
            showNotice(outcome.ok ? t('files.copyPath.done', { path: outcome.text }) : outcome.text, outcome.ok ? 'ok' : 'error', outcome.ok !== true)
          })()
        }),
        menuButton('copy-path-relative', 'path', t('files.copyPathRelative'), () => {
          void (async () => {
            const outcome = await copyPathToClipboard(path, true, sessionCwd(ctx, owner), t)
            showNotice(outcome.ok ? t('files.copyPath.done', { path: outcome.text }) : outcome.text, outcome.ok ? 'ok' : 'error', outcome.ok !== true)
          })()
        }),
        menuButton('open-terminal', 'terminal', t('files.openTerminal'), (event) => {
          void openTerminalAt(ctx, directoryOfFile(path, sessionCwd(ctx, owner)), event?.currentTarget ?? null, t, (result) => {
            showNotice(result.ok === true ? t('files.terminal.done', { path: result.dir }) : t(result.key), result.ok === true ? 'ok' : 'error', result.ok !== true)
          })
        })))
      }

      return { ImageBody }
    }

    /**
     * 造出「文件编辑」面板（页签类型 + 自带文件树）。
     *
     * 与「工作区文件」面板的关系：两者都是右侧栏的**页签类型**（`sidebarRightTabs.register`
     * + `sidebar.right.pane.tab`），都按目录懒加载、都订阅官方的 `workspaceFiles.changes`。
     * 差别在于这个面板自带写操作 —— 新建、改名 / 移动、创建副本、复制 / 剪切 / 粘贴、删除都打到本
     * 插件自己的 Host 路由（官方 `workspaceFiles` 是只读的），并且**单击文件直接开本插件的编辑器
     * 页签**。
     * @param ctx - 客户端根上下文。
     * @returns 面板正文与 guide 卡片上的图标。
     */
    function createFilesPanel(ctx) {
      /** 绝对路径的父目录；已经是根时返回它自己。 */
      function parentOf(path) {
        const cut = path.lastIndexOf('/')
        return cut <= 0 ? path : path.slice(0, cut)
      }

      /** 绝对路径的最后一段。 */
      function nameOf(path) {
        const cut = path.lastIndexOf('/')
        return cut === -1 ? path : path.slice(cut + 1)
      }

      /** `a` 是否就是 `b`，或在 `b` 的子树里（拖拽时用来挡住「搬进自己」）。 */
      function isInside(inner, outer) {
        return inner === outer || inner.startsWith(`${outer}/`)
      }

      /** 复制出来的默认名字：`x.txt` → `x 副本.txt`。 */
      function copyNameOf(name) {
        const dot = name.lastIndexOf('.')
        if (dot <= 0) return `${name} 副本`
        return `${name.slice(0, dot)} 副本${name.slice(dot)}`
      }

      /* tree:start */

      /** 排序键：按名字（默认）或按扩展名分组。 */
      const TREE_SORT_KEYS = ['name', 'type']

      /** 默认排序：目录优先 + 按名字 —— 与后端给的顺序一致，所以默认状态看不出任何变化。 */
      const DEFAULT_TREE_SORT = { key: 'name', dirsFirst: true }

      /** 目录链最多折多少层：挡住「一路单子目录」的病态深树把渲染拖住。 */
      const TREE_CHAIN_MAX = 32

      /** 一次挂载最多为折叠探测预读多少个目录（每个路径只试一次，所以这就是请求数上限）。 */
      const TREE_PRELOAD_BUDGET = 64

      /** 扩展名（最后一个点之后，小写）；没有扩展名、或点开头（`.env`）返回空串。 */
      function extensionOf(name) {
        const dot = name.lastIndexOf('.')
        return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase()
      }

      /** 隐藏条目：名字以点开头。折叠时**不计入**「唯一子项」判定，与 VSCode 一致。 */
      function isHiddenName(name) {
        return name.startsWith('.')
      }

      /**
       * 名字比较：先大小写不敏感，再用原始码点决胜。
       *
       * 为什么不用 `localeCompare`：它依赖运行时 locale，同一个目录在两台机器上可能给出不同顺序，
       * 而这棵树的行顺序会被键盘 Shift 范围选择当成坐标用 —— 顺序必须可复现。
       * @param left - 左名字。
       * @param right - 右名字。
       * @returns 负数 / 0 / 正数。
       */
      function compareTreeNames(left, right) {
        const a = left.toLowerCase()
        const b = right.toLowerCase()
        if (a !== b) return a < b ? -1 : 1
        if (left === right) return 0
        return left < right ? -1 : 1
      }

      /**
       * 排一个目录的条目。默认（`name` + 目录优先）与后端顺序逐项一致。
       * @param entries - `workspaceFiles.list` 给的条目。
       * @param sort - `{ key, dirsFirst }`；省略用默认。
       * @returns 新数组（不改入参）。
       */
      function sortEntries(entries, sort) {
        const spec = sort === undefined ? DEFAULT_TREE_SORT : sort
        const dirsFirst = spec.dirsFirst !== false
        return [...entries].sort((left, right) => {
          if (dirsFirst) {
            const diff = (left.type === 'directory' ? 0 : 1) - (right.type === 'directory' ? 0 : 1)
            if (diff !== 0) return diff
          }
          if (spec.key === 'type') {
            const diff = compareTreeNames(extensionOf(left.name), extensionOf(right.name))
            if (diff !== 0) return diff
          }
          return compareTreeNames(left.name, right.name)
        })
      }

      /**
       * 把「一路只有一个真子目录」的链折成一行（VSCode 的 compact folders）。
       *
       * 只折**已经加载过**的层级：没读过的目录不知道它有几个子项，猜着折会把两条不同的链显示成
       * 一行。`chainCandidates` 负责把候选目录预读进来，读到了下一轮渲染才会折。
       * @param dir - 正在渲染的目录。
       * @param entries - 这个目录的条目（已排序）。
       * @param lookup - `(path) => entries | undefined`，取一个已加载目录的条目。
       * @returns 每项 `{ path, entry, chain }`；`path` 是**链尾**（折叠行代表它），`chain` 至少一项。
       */
      function foldLevel(dir, entries, lookup) {
        const rows = []
        for (const entry of entries) {
          const head = `${dir}/${entry.name}`
          const chain = [head]
          if (entry.type === 'directory') {
            let current = head
            while (chain.length < TREE_CHAIN_MAX) {
              const children = lookup(current)
              if (children === undefined) break
              const real = children.filter((child) => !isHiddenName(child.name))
              if (real.length !== 1 || real[0].type !== 'directory') break
              current = `${current}/${real[0].name}`
              chain.push(current)
            }
          }
          rows.push({ path: chain[chain.length - 1], entry, chain })
        }
        return rows
      }

      /**
       * 还要预读哪些目录才能把链折出来：只挑「当前唯一真子目录」那一条，逐层往下。
       * @param dir - 正在渲染的目录。
       * @param entries - 这个目录的条目。
       * @param lookup - 取已加载目录的条目。
       * @returns 需要读的目录路径（按链顺序、已去重）。
       */
      function chainCandidates(dir, entries, lookup) {
        const wanted = []
        for (const entry of entries) {
          if (entry.type !== 'directory') continue
          let current = `${dir}/${entry.name}`
          while (wanted.length < TREE_CHAIN_MAX) {
            const children = lookup(current)
            if (children !== undefined) {
              const real = children.filter((child) => !isHiddenName(child.name))
              if (real.length !== 1 || real[0].type !== 'directory') break
              current = `${current}/${real[0].name}`
              continue
            }
            if (!wanted.includes(current)) wanted.push(current)
            break
          }
        }
        return wanted
      }

      /**
       * Shift 范围选择：在**可见行的顺序**上从锚点到目标取一段。
       * @param paths - 可见行的路径，按渲染顺序。
       * @param anchor - 锚点路径。
       * @param target - 目标路径。
       * @returns 选中的路径集合；锚点不在可见行里时只选目标。
       */
      function rangeSelection(paths, anchor, target) {
        const from = paths.indexOf(anchor)
        const to = paths.indexOf(target)
        if (from === -1 || to === -1) return new Set([target])
        return new Set(paths.slice(Math.min(from, to), Math.max(from, to) + 1))
      }

      /**
       * 批量删除前把选择集收一遍：被选中的目录已经会连内容一起删，它下面那些**也被选中**的路径
       * 必须去掉，否则第二次请求会撞「路径已经不在了」。工作区根自己也不删。
       * @param selected - 选中的路径。
       * @param root - 工作区根。
       * @returns 要删的路径，浅的在前（父目录先删，子项随后自然消失）。
       */
      function pruneForBatchDelete(selected, root) {
        const depthOf = (path) => path.split('/').length
        const kept = []
        const ordered = [...selected].sort((left, right) => depthOf(left) - depthOf(right) || compareTreeNames(left, right))
        for (const path of ordered) {
          if (path === root) continue
          const covered = kept.some((outer) => path === outer || path.startsWith(`${outer}/`))
          if (covered) continue
          kept.push(path)
        }
        return kept
      }

      /* tree:end */

      /**
       * 一次操作的失败说明：能对号入座的就给本地化的人话，其余回落到 Host 的原始诊断。
       * @param outcome - `{ ok: false, code, message }`。
       * @param t - 命名空间文案函数。
       * @returns 显示文本。
       */
      function describeMutationFailure(outcome, t) {
        const known = {
          'target-exists': 'files.error.exists',
          'not-empty': 'files.error.notEmpty',
          'outside-workspace': 'files.error.outside',
          denied: 'files.error.denied',
          'not-found': 'files.error.notFound',
          'invalid-target': 'files.error.invalid',
          'too-large': 'files.error.tooLarge',
        }
        const key = known[outcome.code]
        if (key !== undefined) return t(key)
        // 405 只可能是「这条路由还没注册」：静态 fallback 对非 GET/HEAD 就是这个码。
        if (outcome.status === 405) return t('files.error.route')
        return t('files.error.generic', { code: outcome.code, message: outcome.message })
      }

      /**
       * 面板页脚：插件信息（标题 + 版本），永远贴在面板最底部。
       *
       * 信息来自 Host 的插件清单（见 `pluginInfo`），读不到就退回包名 —— 页脚只是归属说明，
       * 绝不能因为它把面板搞坏，所以整条路径都是「拿不到就不显示版本」。
       * @returns 页脚那一行。
       */
      function FilesFooter() {
        const [info, setInfo] = React.useState(null)
        React.useEffect(() => {
          let alive = true
          void pluginInfo(ctx).then((value) => { if (alive) setInfo(value) })
          return () => { alive = false }
        }, [])
        const version = info === null ? null : info.version
        const title = info === null || info.title === null ? PACKAGE_NAME : info.title
        return h('p', {
          className: 'dsh-wef-plugin',
          title: info !== null && info.description !== null ? info.description : `${PACKAGE_NAME}${version === null ? '' : ` v${version}`}`,
          'data-workspace-editor-files-plugin': PACKAGE_NAME,
          'data-workspace-editor-files-version': version ?? '',
        }, version === null ? title : `${title} · v${version}`)
      }

      /**
       * 面板正文：会话工作区根 → 一层层列目录 → 行上做变更 → 单击文件开编辑器页签。
       * @param props - `sidebar.right.pane.tab` 交来的 props（`sessionId` / `useSessions` /
       *   `useTabInfo` / `t`）。
       * @returns 树面板，或没有工作区根时的说明。
       */
      function FilesPanel(props) {
        const { sessionId, useSessions, t } = props
        const cwd = useSessions((state) => state.byId?.[sessionId]?.cwd)
        const root = typeof cwd === 'string' && cwd !== '' ? cwd.replace(/[/\\]+$/, '') : null
        if (root === null) {
          return h('div', { className: 'dsh-wef-root', 'data-workspace-editor-files': 'no-root' },
            h('style', null, CSS),
            h('p', { className: 'dsh-wef-note' }, t('files.noRoot')),
            h('div', { className: 'dsh-wef-gap' }),
            h(FilesFooter, null))
        }
        // key：换会话 / 换工作区根就整棵树重挂，免得把上个工作区的列表与草稿留在屏幕上。
        return h(FilesTree, { ...props, root, key: `${sessionId}\u0000${root}` })
      }

      /**
       * 树本体。所有状态都活在这个组件里；`FilesPanel` 用 key 保证换会话即重挂。
       * @param props - `FilesPanel` 的 props 加上解析好的 `root`。
       * @returns 工具条、横幅、树与确认条。
       */
      function FilesTree(props) {
        const { sessionId, root, useTabInfo, t } = props
        const { tab } = useTabInfo()
        const paneId = tab?.panel?.id
        const [levels, setLevels] = React.useState({})
        const [expanded, setExpanded] = React.useState(() => new Set([root]))
        const [selected, setSelected] = React.useState(root)
        /**
         * 多选集合：批量条与批量删除都读它。`selected` 只是「光标 / 锚点」（工具条、F2、Shift 范围
         * 都从它出发），两个字段刻意不合并 —— 光标可以在没有选区的情况下单独存在。
         */
        const [selection, setSelection] = React.useState(() => new Set())
        /** 排序规格。只影响渲染顺序，不重新读盘（数据里存的是原始顺序）。 */
        const [sort, setSort] = React.useState(DEFAULT_TREE_SORT)
        /** 排序菜单的开合：`{ x, y }`（视口坐标，与右键菜单同一套定位）或 null。 */
        const [sortOpen, setSortOpen] = React.useState(null)
        /** 批量删除的待确认状态：`{ items }`。与单条删除的 `pending` 分开，两者不会同时在屏。 */
        const [batch, setBatch] = React.useState(null)
        /**
         * 批量删除**部分失败**的收场状态：`{ failed, conflicted }`。失败项留在选择集里，这条横幅
         * 带一个「重试删除」—— 重试会重新取版本基线，所以磁盘变过的那几条也能接着处理。
         */
        const [batchFailed, setBatchFailed] = React.useState(null)
        const [editor, setEditor] = React.useState(null)
        const [pending, setPending] = React.useState(null)
        const [busy, setBusy] = React.useState(null)
        const [error, setError] = React.useState(null)
        /** 一次性提示：成功自己消失、失败留到用户点掉（共享的状态机，见 `useNotice`）。 */
        const { notice, showNotice, dismissNotice } = useNotice()
        const [dropOn, setDropOn] = React.useState(null)
        /**
         * 正在拖的那一行（`null` = 没在拖）。只用来渲染「工作区根」落点条：
         * **根目录自己没有行**，当树把正文铺满时（长列表），空白的落点区根本看不见，
         * 于是「拖到根目录」变成一件做不到的事。所以一开始拖就亮一条明确写着根路径的落点条，
         * 松开即搬到根；拖的东西本来就在根下时不亮（那是空操作）。
         */
        const [dragging, setDragging] = React.useState(null)
        /** 右键菜单：`{ path, type, x, y }`；坐标是视口坐标（菜单用 position:fixed）。 */
        const [menu, setMenu] = React.useState(null)
        /** 内部剪贴板的渲染镜像：模块级那份是真相，这里只是为了横幅与菜单跟着变。 */
        const [clipboard, setClipboard] = React.useState(filesClipboard)
        /** 树正文元素：点过一行之后把焦点收回它，键盘 Ctrl/Cmd+V 才落在这棵树里。 */
        const bodyRef = React.useRef(null)
        const aliveRef = React.useRef(true)
        const levelsRef = React.useRef(levels)
        levelsRef.current = levels
        const pendingRef = React.useRef(pending)
        pendingRef.current = pending
        const batchRef = React.useRef(batch)
        batchRef.current = batch
        /** 已经为「折叠探测」预读过、或有在飞请求的目录：每个路径只试一次，失败也不重试。 */
        const preloaded = React.useRef(new Set())
        const controllerRef = React.useRef(null)
        if (controllerRef.current === null) controllerRef.current = new AbortController()
        /** 每个目录的最新一次读盘代次：晚到的旧结果不许覆盖新结果。 */
        const generations = React.useRef(new Map())
        /** 每个目录的观察流停止函数。 */
        const watchers = React.useRef(new Map())
        const reloadTimers = React.useRef(new Map())
        const dragRef = React.useRef(null)
        const reloadRef = React.useRef(null)

        // 卸载：停掉观察流、清掉节流计时器、中止在飞的读盘。
        React.useEffect(() => () => {
          aliveRef.current = false
          controllerRef.current?.abort()
          for (const timer of reloadTimers.current.values()) clearTimeout(timer)
          for (const stop of watchers.current.values()) void stop()
          watchers.current.clear()
        }, [])

        /**
         * 读一个目录（懒加载 + 刷新都走它）。
         * @param path - 目录的绝对路径。
         * @returns 读盘结束即返回。
         */
        const reloadDir = async (path) => {
          const generation = (generations.current.get(path) ?? 0) + 1
          generations.current.set(path, generation)
          setLevels((prev) => ({ ...prev, [path]: { ...prev[path], phase: prev[path]?.entries === undefined ? 'loading' : 'ready' } }))
          let result
          try {
            result = await ctx.remote.workspaceFiles.list(sessionId, path, controllerRef.current.signal)
          } catch (failure) {
            result = { ok: false, error: { message: failure instanceof Error ? failure.message : String(failure) } }
          }
          if (!aliveRef.current || controllerRef.current.signal.aborted) return
          if (generations.current.get(path) !== generation) return
          if (!result.ok) {
            setLevels((prev) => ({ ...prev, [path]: { phase: 'failed', message: result.error.message } }))
            return
          }
          // 存**原始顺序**，排序放到渲染时做：换排序键要立刻重排，不能为它再读一次盘。
          setLevels((prev) => ({ ...prev, [path]: { phase: 'ready', entries: result.value.entries, truncated: result.value.truncated } }))
        }
        reloadRef.current = reloadDir

        /** 变更帧合并成一次重列：一次保存会连着来好几帧。 */
        const scheduleReload = (path) => {
          const timers = reloadTimers.current
          if (timers.has(path)) clearTimeout(timers.get(path))
          timers.set(path, setTimeout(() => {
            timers.delete(path)
            if (aliveRef.current) void reloadRef.current(path)
          }, WATCH_DEBOUNCE_MS))
        }

        /**
         * 订阅一个目录的变更。用受管的 `$stream`：断线由 Remote 自己重连，这里只负责重列。
         * @param path - 目录的绝对路径。
         * @returns 无。
         */
        const watchDir = (path) => {
          if (watchers.current.has(path)) return
          const stream = ctx.remote.$stream({
            name: `workspace-editor-files ${path}`,
            open: (signal) => ctx.remote.workspaceFiles.changes(sessionId, path, signal),
            ended: () => new Error(`workspace-editor-files: watch ended (${path})`),
          })
          const task = (async () => {
            try {
              for await (const item of stream) {
                if (item.value.kind === 'ready') {
                  item.accept()
                  continue
                }
                scheduleReload(path)
              }
            } catch {
              // 受管流会自己重连；彻底结束时这份列表就停在最后一次读到的样子。
            }
          })()
          watchers.current.set(path, () => { void stream.dispose().then(() => task) })
        }

        /** 首次读某个目录、或上次读失败时重试，都顺手把它盯上。 */
        const ensureDir = (path) => {
          const level = levelsRef.current[path]
          if (level === undefined || level.phase === 'failed') void reloadDir(path)
          watchDir(path)
        }

        // 挂载就把工作区根列出来，并盯上它（root 由外层的 key 固定，换会话会整棵树重挂）。
        React.useEffect(() => { ensureDir(root) }, [root])

        /**
         * 预读一个目录，只为「折叠探测」：**不订阅**（订阅只给展开着的目录，见 `watchDir`）。
         * 每个路径只试一次（`preloaded` 记账），失败也不重试 —— 折叠是锦上添花，不该为它反复打请求。
         * @param path - 目录的绝对路径。
         * @returns 读盘结束即返回。
         */
        const preloadDir = async (path) => {
          if (levelsRef.current[path] !== undefined) return
          await reloadDir(path)
        }

        /**
         * 把「一路单子目录」的链预读出来：折叠要知道下一层有几个子项，而没读过的目录无从判断。
         *
         * 只沿**当前唯一真子目录**那一条链逐层往下（`chainCandidates`），所以常见的树里一个请求都
         * 不会发；`preloaded` 记账保证收敛，`TREE_PRELOAD_BUDGET` 兜住病态深树。预读过的目录不进
         * `expanded`、也不订阅变更 —— 它只影响折叠标签，真要看内容还是得展开（展开时才订阅）。
         */
        React.useEffect(() => {
          const lookup = (path) => levelsRef.current[path]?.entries
          const wanted = []
          const visit = (dir) => {
            const level = levelsRef.current[dir]
            if (level === undefined || level.phase !== 'ready') return
            for (const path of chainCandidates(dir, level.entries, lookup)) {
              if (!wanted.includes(path)) wanted.push(path)
            }
            for (const entry of level.entries) {
              const child = `${dir}/${entry.name}`
              if (entry.type === 'directory' && expanded.has(child)) visit(child)
            }
          }
          visit(root)
          for (const path of wanted) {
            if (preloaded.current.size >= TREE_PRELOAD_BUDGET) break
            if (preloaded.current.has(path)) continue
            preloaded.current.add(path)
            void preloadDir(path)
          }
        }, [levels, expanded, root])

        /**
         * 发一条变更请求。
         * @param url - 路由路径。
         * @param body - 请求体（`sessionId` 由这里统一补上）。
         * @param path - 这次操作牵动的路径（用来亮「处理中」）。
         * @returns `{ ok }` 或失败时的 `{ ok: false, code, message, status }`；连接层失败返回 null。
         */
        const postJson = async (url, body, path) => {
          setBusy(path ?? null)
          let response
          try {
            response = await fetch(url, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ sessionId, ...body }),
            })
          } catch {
            if (aliveRef.current) {
              setBusy(null)
              setError(t('files.error.transport'))
            }
            return null
          }
          let payload = null
          try {
            payload = await response.json()
          } catch {
            payload = null
          }
          if (!aliveRef.current) return null
          setBusy(null)
          if (response.ok) return { ok: true, payload }
          return {
            ok: false,
            status: response.status,
            code: typeof payload?.code === 'string' ? payload.code : 'request-failed',
            message: typeof payload?.message === 'string' ? payload.message : `HTTP ${String(response.status)}`,
          }
        }

        /** 展开 / 收起一个目录（首次展开顺手加载 + 订阅）。 */
        const toggle = (path) => {
          ensureDir(path)
          setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(path)) next.delete(path)
            else next.add(path)
            return next
          })
        }

        /**
         * 在页签里打开一个文件（不顶掉本面板所在的页签）。
         *
         * **图片走图片预览页签**：落到文本编辑器上只会得到「这个文件不是 UTF-8 文本」。
         * @param path - 文件的绝对路径。
         * @returns 无。
         */
        const openFile = (path) => {
          const placement = paneId === undefined ? {} : { paneId }
          const kind = imageMediaTypeOf(path) === undefined ? EDITOR_KIND : IMAGE_KIND
          ctx.sidebarRight.openResource(absoluteFileAddress(path), {
            kind,
            ...placement,
            params: { sessionId, path },
          })
        }

        /** 把「光标」与选择集一起挪到一个路径上：所有变更动作收尾都走它，免得两个字段漂移。 */
        /**
         * 把「光标」挪到一个路径上，并**清空勾选集**。
         *
         * 变更动作（新建 / 改名 / 复制 / 移动 / 删除）收尾都走它：勾选是用户对**具体路径**的显式
         * 意图，而这些路径刚被动过（旧名字甚至已经不存在），留着只会让批量操作打在空气上。
         * @param path - 新的光标路径。
         * @returns 无。
         */
        const focusPath = (path) => {
          setSelected(path)
          setSelection(new Set())
        }

        /**
         * 切换一行的勾选 —— 行首复选框与 Ctrl/Cmd+点 **共用这一份**实现（约束 16）。
         * @param path - 这一行的路径。
         * @returns 无。
         */
        const toggleSelection = (path) => {
          setError(null)
          setPending(null)
          setBatch(null)
          setBatchFailed(null)
          setMenu(null)
          setSortOpen(null)
          bodyRef.current?.focus({ preventScroll: true })
          setSelected(path)
          setSelection((prev) => {
            const next = new Set(prev)
            if (next.has(path)) next.delete(path)
            else next.add(path)
            return next
          })
        }

        /**
         * 点一行。**不带修饰键 = 老语义**（目录展开 / 收起，文件直接进编辑器）；Ctrl/Cmd 点是切换
         * 勾选、Shift 点是按可见行顺序取一段 —— 这两种都**不打开文件**。勾选集只由复选框与
         * Ctrl / Shift / Ctrl+A 决定：普通单击只挪光标并清空勾选（与 VS Code 一致），
         * 这样「勾了 1 个」也能立刻拿到批量操作。
         * @param path - 这一行的路径。
         * @param type - `file` | `directory`。
         * @param event - 点击事件（读修饰键）；缺省按老语义走。
         * @returns 无。
         */
        const activate = (path, type, event) => {
          setError(null)
          setPending(null)
          setBatch(null)
          setBatchFailed(null)
          setMenu(null)
          setSortOpen(null)
          bodyRef.current?.focus({ preventScroll: true })
          if (event !== undefined && (event.ctrlKey || event.metaKey)) {
            toggleSelection(path)
            return
          }
          if (event !== undefined && event.shiftKey) {
            setSelection(rangeSelection(visiblePaths, selected, path))
            setSelected(path)
            return
          }
          // 普通单击：只挪光标、清空勾选（勾选是显式意图，不由单击产生）。
          focusPath(path)
          if (type === 'directory') toggle(path)
          else openFile(path)
        }

        /**
         * 在行上打右键菜单。菜单里的动作与行内图标、工具条按钮完全同一套实现，
         * 只是入口多一个 —— 悬停图标对不熟悉的人太难发现（用户反馈「tree 缺重命名」）。
         * @param event - 上下文菜单事件（取视口坐标）。
         * @param path - 这一行的路径。
         * @param type - `file` | `directory`。
         * @returns 无。
         */
        const openMenu = (event, path, type) => {
          event.preventDefault()
          event.stopPropagation()
          setSelected(path)
          setSortOpen(null)
          // 右键**不碰勾选集**：菜单里的动作都直接作用于被右键的那一行（`menu.path`），
          // 而勾选是用户对「批量作用域」的显式意图 —— 看一眼菜单不该把它清掉。
          setError(null)
          setMenu({ path, type, ...menuAnchorFor(event) })
        }

        /** 打开「新建」输入行：目录要顺手展开，否则输入框没地方待。 */
        const startCreate = (dir, mode) => {
          setPending(null)
          setBatch(null)
          setBatchFailed(null)
          setError(null)
          focusPath(dir)
          ensureDir(dir)
          setExpanded((prev) => new Set(prev).add(dir))
          setEditor({ mode, dir })
        }

        /** 打开「重命名」输入行：预填当前名字，允许带 `/` 直接搬到子目录。 */
        const startRename = (path) => {
          setPending(null)
          setBatch(null)
          setBatchFailed(null)
          setError(null)
          setEditor({ mode: 'rename', dir: parentOf(path), path })
        }

        /**
         * 提交输入行（回车或失焦）。
         * @param draft - 当前输入行。
         * @param raw - 输入框里的文本。
         * @returns 请求结束即返回。
         */
        const submitEditor = async (draft, raw) => {
          // 回车提交后输入框会卸载，部分浏览器仍补一次 blur；同一个 draft 只提交一次。
          if (draft.done === true) return
          draft.done = true
          const value = String(raw ?? '').trim()
          setEditor(null)
          if (value === '') return
          if (value.startsWith('/')) {
            setError(t('files.error.absolute'))
            return
          }
          const segments = value.split('/')
          if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
            setError(t('files.error.name'))
            return
          }
          const target = `${draft.dir}/${value}`
          if (draft.mode === 'rename') {
            if (target === draft.path) return
            const outcome = await postJson(RENAME_URL, { from: draft.path, to: target }, draft.path)
            if (outcome === null) return
            if (!outcome.ok) {
              setError(describeMutationFailure(outcome, t))
              return
            }
            focusPath(target)
            await reloadDir(draft.dir)
            if (parentOf(target) !== draft.dir) await reloadDir(parentOf(target))
            return
          }
          const outcome = draft.mode === 'folder'
            ? await postJson(MKDIR_URL, { path: target }, target)
            : await postJson(WRITE_URL, { path: target, content: '', mode: 'create' }, target)
          if (outcome === null) return
          if (!outcome.ok) {
            setError(describeMutationFailure(outcome, t))
            return
          }
          focusPath(target)
          await reloadDir(draft.dir)
          if (draft.mode === 'file') openFile(target)
        }

        /**
         * 在一个目录里挑一个不冲突的名字：首选名字被占了就 `x 2.txt`、`x 3.txt`…
         *
         * 只拿「已经列出来的条目」做参考，而且**只是让用户少撞一次墙** —— 真撞车仍然由 Host
         * 拒绝（复制是 `COPYFILE_EXCL`、粘贴上传是 `wx`），这里不假装自己是原子操作。
         * @param dir - 目标目录的绝对路径。
         * @param preferred - 首选名字。
         * @returns 可用的名字（都被占了就返回首选，让 Host 去报「目标已经存在」）。
         */
        const uniqueNameIn = (dir, preferred) => {
          const taken = new Set((levelsRef.current[dir]?.entries ?? []).map((entry) => entry.name))
          if (!taken.has(preferred)) return preferred
          const dot = preferred.lastIndexOf('.')
          const stem = dot <= 0 ? preferred : preferred.slice(0, dot)
          const tail = dot <= 0 ? '' : preferred.slice(dot)
          for (let index = 2; index < 20; index += 1) {
            const candidate = `${stem} ${String(index)}${tail}`
            if (!taken.has(candidate)) return candidate
          }
          return preferred
        }

        /** 复制一个文件：同目录下的「xxx 副本」，重名就往后编号（Host 仍会拒绝覆盖）。 */
        const copyEntry = async (path) => {
          const dir = parentOf(path)
          const target = `${dir}/${uniqueNameIn(dir, copyNameOf(nameOf(path)))}`
          const outcome = await postJson(COPY_URL, { from: path, to: target }, path)
          if (outcome === null) return
          if (!outcome.ok) {
            setError(describeMutationFailure(outcome, t))
            return
          }
          focusPath(target)
          await reloadDir(dir)
        }

        /**
         * 亮一条一次性提示；组件已经卸载时不再动状态。
         * @param text - 已经本地化好的文本。
         * @param tone - `ok` | `warn` | `error`。
         * @param sticky - true 时不自动消失（失败留到用户点掉）。
         * @returns 无。
         */
        const notify = (text, tone, sticky) => {
          if (!aliveRef.current) return
          showNotice(text, tone, sticky)
        }

        /**
         * 把一条路径写进系统剪贴板（右键菜单里的「复制路径 / 复制相对路径」）。
         *
         * 相对路径是相对**这个面板的根**（也就是会话工作区根）算的，分隔符沿用磁盘上的写法；
         * 根自己用 `.` 表示 —— 回一个绝对路径会让人以为「相对路径没生效」。
         * 写剪贴板失败（非安全上下文、权限被拒、浏览器没有 clipboard API 且 `execCommand` 也不行）
         * 时走错误横幅：这条动作唯一的结果就是剪贴板，静默失败等于什么都没发生。
         * @param path - 这一行的绝对路径。
         * @param relative - true 复制相对工作区根的路径。
         * @returns 无。
         */
        const copyPath = async (path, relative) => {
          const outcome = await copyPathToClipboard(path, relative, root, t)
          if (!outcome.ok) {
            notify(outcome.text, 'error', true)
            return
          }
          notify(t('files.copyPath.done', { path: outcome.text }), 'ok')
        }

        /**
         * 「在终端打开」：请侧边栏开一个终端页签，等它的 shell 变成可写了，再替用户敲一条 `cd`。
         *
         * 目录行用目录本身，文件行用它的父目录；目录行 / 文件行的判定与工具条一致（`isDirPath`）。
         * 实现是工厂作用域里的 `openTerminalAt`（编辑器那份菜单共用同一份），这里只负责把结果
         * 变成面板上的横幅：成功亮一次性提示，失败留一条（粘在屏幕上等用户处理或点掉）。
         * @param path - 被右键的那一行。
         * @param element - 触发这次动作的元素，交给 `commandTarget` 定位当前侧边栏页。
         * @returns 请求处理完即返回。
         */
        const openInTerminal = async (path, element) => {
          const dir = isDirPath(path) ? path : parentOf(path)
          await openTerminalAt(ctx, dir, element, t, (result) => {
            if (result.ok === true) {
              notify(t('files.terminal.done', { path: result.dir }), 'ok')
              return
            }
            notify(t(result.key), 'error', true)
          })
        }

        /** 换一块内部剪贴板：模块级那份是真相，`setClipboard` 只是让界面跟上。 */
        const armClipboard = (next) => {
          filesClipboard = next
          setClipboard(next)
        }

        /** 「复制到剪贴板」：只收文件（目录不复制，与 Host 的 `copy` 路由同一口径）。 */
        const copyToClipboard = (path) => {
          setError(null)
          armClipboard({ mode: 'copy', path, name: nameOf(path) })
        }

        /** 「剪切」：文件与目录都收（粘贴时走改名路由，也就是移动）。 */
        const cutToClipboard = (path) => {
          setError(null)
          armClipboard({ mode: 'cut', path, name: nameOf(path) })
        }

        /**
         * 把内部剪贴板里的东西贴进一个目录。
         *
         * 复制 → `copy` 路由（重名自动编号，剪贴板**保留**，可以连着贴好几处）；剪切 → `rename`
         * 路由（重名直接报「目标已经存在」—— 移动悄悄改名比报错更糟），贴成功后清空剪贴板。
         * @param dir - 目标目录的绝对路径。
         * @returns 请求结束即返回。
         */
        const pasteClipboardInto = async (dir) => {
          const clip = filesClipboard
          if (clip === null) return
          ensureDir(dir)
          setExpanded((prev) => new Set(prev).add(dir))
          if (clip.mode === 'cut') {
            const moved = `${dir}/${clip.name}`
            if (moved === clip.path) {
              // 贴回原地：什么都不用做，剪贴板继续留着。
              focusPath(moved)
              return
            }
            const outcome = await postJson(RENAME_URL, { from: clip.path, to: moved }, clip.path)
            if (outcome === null) return
            if (!outcome.ok) {
              setError(describeMutationFailure(outcome, t))
              return
            }
            armClipboard(null)
            focusPath(moved)
            await reloadDir(parentOf(clip.path))
            if (dir !== parentOf(clip.path)) await reloadDir(dir)
            return
          }
          const target = `${dir}/${uniqueNameIn(dir, clip.name)}`
          const outcome = await postJson(COPY_URL, { from: clip.path, to: target }, clip.path)
          if (outcome === null) return
          if (!outcome.ok) {
            setError(describeMutationFailure(outcome, t))
            return
          }
          focusPath(target)
          await reloadDir(dir)
        }

        /**
         * 把一批文件贴（上传）进一个目录：逐个读成字节 → base64 → 打上传路由。
         *
         * 名字先按目录里已有的条目编号；超过上限的文件跳过并说明，剩下的继续贴（一个 5 MiB 的
         * 截图不该把同一次粘贴里其它几个文件一起废掉）。
         * @param dir - 目标目录的绝对路径。
         * @param files - `File` 列表。
         * @returns 全部处理完即返回。
         */
        const uploadInto = async (dir, files) => {
          ensureDir(dir)
          setExpanded((prev) => new Set(prev).add(dir))
          let last = null
          let failure = null
          for (const file of files) {
            if (file.size > MAX_PASTE_BYTES) {
              failure = t('files.paste.tooLarge', { name: file.name, limit: '4 MiB' })
              continue
            }
            let data
            try {
              data = base64OfBytes(new Uint8Array(await file.arrayBuffer()))
            } catch {
              failure = t('files.paste.readFailed', { name: file.name })
              continue
            }
            const name = uniqueNameIn(dir, file.name === '' ? pastedNameFor(file.type, 1) : file.name)
            const target = `${dir}/${name}`
            const outcome = await postJson(UPLOAD_URL, { path: target, data }, target)
            if (outcome === null) return
            if (!outcome.ok) {
              failure = describeMutationFailure(outcome, t)
              continue
            }
            last = target
          }
          if (last !== null) focusPath(last)
          await reloadDir(dir)
          if (failure !== null) setError(failure)
        }

        /**
         * 「粘贴」的按钮 / 菜单入口：内部剪贴板优先，空了才去系统剪贴板里找文件。
         *
         * 这里必须用 `navigator.clipboard.read()`，它**拿不到文件名**（剪贴板条目不携带名字），
         * 所以这条路读到的文件按 MIME 起名；想保住原名的粘贴走键盘 Ctrl/Cmd+V ——
         * `paste` 事件里的 `clipboardData` 是带名字的。
         * @param dir - 目标目录的绝对路径。
         * @returns 请求结束即返回。
         */
        const pasteInto = async (dir) => {
          setError(null)
          if (filesClipboard !== null) {
            await pasteClipboardInto(dir)
            return
          }
          if (navigator.clipboard?.read === undefined) {
            setError(t('files.paste.unsupported'))
            return
          }
          let items
          try {
            items = await navigator.clipboard.read()
          } catch {
            setError(t('files.paste.denied'))
            return
          }
          const files = []
          let index = 0
          for (const item of items) {
            // 一个条目可能同时带 `text/plain`（复制富文本时）；取第一个非文本类型当文件。
            const type = item.types.find((value) => !value.startsWith('text/'))
            if (type === undefined) continue
            index += 1
            const blob = await item.getType(type)
            files.push(new File([blob], pastedNameFor(type, index), { type }))
          }
          if (files.length === 0) {
            setError(t('files.paste.empty'))
            return
          }
          await uploadInto(dir, files)
        }

        /** 移动一个条目（拖拽落点）：目标已存在时由 Host 拒绝，不静默覆盖。 */
        const moveEntry = async (from, to) => {
          if (from === to || isInside(to, from)) return
          const outcome = await postJson(RENAME_URL, { from, to }, from)
          if (outcome === null) return
          if (!outcome.ok) {
            setError(describeMutationFailure(outcome, t))
            return
          }
          focusPath(to)
          await reloadDir(parentOf(from))
          if (parentOf(to) !== parentOf(from)) await reloadDir(parentOf(to))
        }

        /** 点「删除」：先取一次版本闸基线（目录再问一次条目数），再亮确认条。 */
        const armDelete = async (path, type) => {
          setError(null)
          setEditor(null)
          // 单条删除与批量删除共用同一条确认位，两者不许同时在屏。
          setBatch(null)
          setBatchFailed(null)
          setBusy(path)
          const signal = controllerRef.current.signal
          let version
          try {
            const stat = await ctx.remote.workspaceFiles.stat(sessionId, path, signal)
            if (stat.ok) version = stat.value.version
          } catch {
            version = undefined
          }
          let count = 0
          if (type === 'directory') {
            try {
              const listing = await ctx.remote.workspaceFiles.list(sessionId, path, signal)
              if (listing.ok) count = listing.value.entries.length
            } catch {
              count = 0
            }
          }
          if (!aliveRef.current) return
          setBusy(null)
          setPending({ path, type, version, count, stale: false })
        }

        /**
         * 执行删除。目录按「空 / 非空」决定要不要递归：非空要用户点的是「递归删除」。
         * @param recursive - 目录是否连同内容一起删。
         * @returns 请求结束即返回。
         */
        const runDelete = async (recursive) => {
          const target = pendingRef.current
          if (target === null) return
          const body = { path: target.path }
          // 「仍然删除」= 用户已经知道对方变过了，这一次不带版本闸（与预览头部那个按钮同一套语义）。
          if (target.version !== undefined && !target.stale) body.expectedVersion = target.version
          if (target.type === 'directory') body.recursive = recursive
          const outcome = await postJson(DELETE_URL, body, target.path)
          if (outcome === null) return
          if (!outcome.ok) {
            if (outcome.code === 'stale-version') {
              // 确认期间对方被改过：只提示，要删得再点一次「仍然删除」（这次不带版本闸）。
              setPending({ ...target, stale: true })
              return
            }
            if (outcome.code === 'not-empty') {
              // 我们确认之后目录里多了东西：升级成递归确认，而不是替用户递归。基线已经过期
              // （目录版本变了），所以这里丢掉它 —— 接下来这一下是用户面对新状态重新点的。
              setPending({ ...target, count: Math.max(target.count, 1), stale: false, version: undefined })
              return
            }
            setError(describeMutationFailure(outcome, t))
            return
          }
          setPending(null)
          focusPath(parentOf(target.path))
          await reloadDir(parentOf(target.path))
        }

        /**
         * 点批量条上的「删除」：先把选择集收一遍（`pruneForBatchDelete`），再逐条取版本闸基线，
         * 最后亮**一次**确认条。
         *
         * 为什么逐条取基线：版本闸是每条路径各自的令牌，删之前必须知道「我看到的这一份」。逐条串行
         * 而不是并发，是为了让「正在处理哪一条」看得见，也方便中途卸载时立刻停下。
         * @returns 请求结束即返回。
         */
        const armBatchDelete = async () => {
          const targets = pruneForBatchDelete(selection, root)
          if (targets.length === 0) return
          setError(null)
          setEditor(null)
          setPending(null)
          setMenu(null)
          setBatchFailed(null)
          const signal = controllerRef.current.signal
          const items = []
          for (const path of targets) {
            const type = isDirPath(path) ? 'directory' : 'file'
            setBusy(path)
            let version
            try {
              const stat = await ctx.remote.workspaceFiles.stat(sessionId, path, signal)
              if (stat.ok) version = stat.value.version
            } catch {
              version = undefined
            }
            if (!aliveRef.current) return
            items.push({ path, type, version })
          }
          setBusy(null)
          setBatch({ items })
        }

        /**
         * 执行批量删除：**逐条串行**（一条失败不影响其余），每条都带自己的版本闸。
         *
         * 目录一律按递归删 —— 用户已经在确认条上看过「会连内容一起删」。失败项留在选择集里，用户
         * 可以再来一次；不带「仍然删除」这种整批强制口子：磁盘变过的那几条重新点一次就会拿到新基线，
         * 比一个能一把推平整批的按钮安全。
         * @returns 全部处理完即返回。
         */
        const runBatchDelete = async () => {
          const armed = batchRef.current
          if (armed === null) return
          const failed = []
          const parents = new Set()
          for (const item of armed.items) {
            const body = { path: item.path }
            if (item.version !== undefined) body.expectedVersion = item.version
            if (item.type === 'directory') body.recursive = true
            const outcome = await postJson(DELETE_URL, body, item.path)
            if (outcome === null) return
            parents.add(parentOf(item.path))
            if (!outcome.ok) failed.push({ path: item.path, code: outcome.code })
          }
          setBatch(null)
          for (const dir of parents) await reloadDir(dir)
          if (failed.length === 0) {
            setSelection(new Set())
            setSelected(root)
            setBatchFailed(null)
            notify(t('files.batch.done', { count: armed.items.length }), 'ok')
            return
          }
          // 失败项留在选择里 + 一条带「重试删除」的横幅：每个状态都得有出路，不能只剩一句提示。
          setSelection(new Set(failed.map((item) => item.path)))
          setBatchFailed({ failed: failed.length, conflicted: failed.filter((item) => item.code === 'stale-version').length })
        }

        /** 批量条上的「复制路径」：一条一行写系统剪贴板（写不进去就说一声，静默失败等于没发生）。 */
        const copySelectionPaths = async () => {
          const paths = [...selection].sort(compareTreeNames)
          if (paths.length === 0) return
          const ok = await writeClipboard(paths.map((path) => copyPathText(path, false, root)).join('\n'))
          if (!ok) {
            notify(t('files.copyPath.failed'), 'error', true)
            return
          }
          notify(t('files.batch.copied', { count: paths.length }), 'ok')
        }

        /**
         * 一枚右键菜单项。
         * @param id - 调试锚点后缀。
         * @param icon - `ICON_PATHS` 里的图标名。
         * @param path - 这一项作用的路径。
         * @param label - 文案；`null` 表示这一项不由这个入口提供（不出现在菜单里）。
         * @param run - 点下去干什么；拿得到点击事件（`commandTarget` 要按触发元素定位侧边栏页）。
         * @param hidden - true 时这一项不渲染（类型不适用）。
         * @param danger - true 时用错误色（删除）。
         * @returns 菜单项，或 null。
         */
        const menuItem = (id, icon, path, label, run, hidden, danger) => {
          if (hidden) return null
          return h('button', {
            key: id,
            type: 'button',
            className: 'dsh-wef-menu-item',
            'data-danger': danger === true ? 'true' : 'false',
            'data-workspace-editor-files-menu-item': id,
            'data-workspace-editor-files-menu-path': path,
            onClick: (event) => {
              event.stopPropagation()
              setMenu(null)
              run(event)
            },
          }, glyph(icon, 14), label)
        }

        const rows = []
        const createHere = editor !== null && editor.mode !== 'rename' ? editor.dir : null
        const inputRow = (depth, draft) => h('div', {
          className: 'dsh-wef-row',
          key: `input:${draft.dir}`,
          style: { paddingLeft: `${String(2 + depth * 14)}px` },
          'data-workspace-editor-files-input-row': draft.mode,
        },
        // 与真实行对齐：先让出多选框那一段宽度，再让出箭头那一段。
        h('span', { className: 'dsh-wef-check-gap' }),
        h('span', { className: 'dsh-wef-spacer' }),
        h('span', { className: 'dsh-wef-glyph' }, glyph(draft.mode === 'folder' ? 'folder' : 'file', 14)),
        h('input', {
          className: 'dsh-wef-input',
          'data-workspace-editor-files-input': draft.mode,
          defaultValue: draft.mode === 'rename' ? nameOf(draft.path) : '',
          placeholder: t('files.namePlaceholder'),
          spellCheck: false,
          autoFocus: true,
          onKeyDown: (event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void submitEditor(draft, event.currentTarget.value)
              return
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              setEditor(null)
            }
          },
          onBlur: (event) => { void submitEditor(draft, event.currentTarget.value) },
        }))

        /**
         * 一行。`item` 来自 `foldLevel`：`path` 是**链尾**（折叠行代表它 —— 改名 / 删除 / 新建 /
         * 拖入都作用在它上面），`chain` 长度大于 1 时标签写成 `a/b/c` 的样子。
         * @param item - `{ path, entry, chain }`。
         * @param depth - 缩进层级。
         * @returns 行元素。
         */
        const rowOf = (item, depth) => {
          const { path, entry, chain } = item
          const isDir = entry.type === 'directory'
          const open = isDir && expanded.has(path)
          const label = chain.length > 1 ? chain.map(nameOf).join('/') : entry.name
          /**
           * 这一行的落点目录：目录行 = 它自己，文件行 = 它**所在的目录**。
           *
           * 文件行也算落点是刻意的（VS Code 同款）：否则「搬进这个目录」在长列表里只剩
           * 「把行拖到目录上」一条路，而根目录**自己没有行** —— 想搬到根就只能找到正文底部的
           * 空白处，列表一长就根本没有空白。有了这条规则，拖到根下任意一个文件行就是搬到根。
           */
          const dropDir = isDir ? path : parentOf(path)
          /** 这个落点对 `from` 是不是空操作 / 非法（搬到原地、搬进自己子树）。 */
          const dropBlocked = (from) => from === path || dropDir === parentOf(from) || (isDir && isInside(path, from))
          return h('div', {
            key: path,
            className: 'dsh-wef-row',
            draggable: true,
            'data-workspace-editor-files-row': path,
            'data-kind': entry.type,
            'data-selected': selection.has(path) ? 'true' : 'false',
            'data-anchor': selected === path ? 'true' : 'false',
            'data-hidden': isHiddenName(entry.name) ? 'true' : 'false',
            'data-chain': chain.length > 1 ? chain.slice(1).map(nameOf).join('/') : undefined,
            'data-busy': busy === path ? 'true' : 'false',
            'data-drop': dropOn === path ? 'true' : 'false',
            style: { paddingLeft: `${String(2 + depth * 14)}px` },
            onClick: (event) => { activate(path, entry.type, event) },
            onContextMenu: (event) => { openMenu(event, path, entry.type) },
            onDragStart: (event) => {
              dragRef.current = path
              setDragging(path)
              try {
                event.dataTransfer.setData('text/plain', path)
                event.dataTransfer.effectAllowed = 'move'
              } catch {
                // 个别浏览器不给写 dataTransfer；移动逻辑只依赖 dragRef，照样可用。
              }
            },
            onDragEnd: () => { dragRef.current = null; setDragging(null); setDropOn(null) },
            onDragOver: (event) => {
              // 指针在这一行上时，落点就**归这一行**：接不接受都要挡住冒泡。
              // 否则事件继续冒泡到树正文，外层会把它当成「根目录」——高亮跳到根上、松手直接搬去根。
              event.stopPropagation()
              const from = dragRef.current
              if (from === null || dropBlocked(from)) {
                if (dropOn !== null) setDropOn(null)
                return
              }
              event.preventDefault()
              try {
                event.dataTransfer.dropEffect = 'move'
              } catch {
                // 同上：写不了 dropEffect 不影响落点判定。
              }
              if (dropOn !== path) setDropOn(path)
            },
            onDragLeave: () => { if (dropOn === path) setDropOn(null) },
            onDrop: (event) => {
              event.stopPropagation()
              const from = dragRef.current
              dragRef.current = null
              setDragging(null)
              setDropOn(null)
              if (from === null || dropBlocked(from)) return
              event.preventDefault()
              void moveEntry(from, `${dropDir}/${nameOf(from)}`)
            },
          },
          // 多选框：常显，不靠悬停、也不要求用户知道 Ctrl+点。点它 = 切换这一行的选中，
          // 与 Ctrl/Cmd+点 走同一个 `toggleSelection`（约束 16：一套实现、多个入口）。
          h('button', {
            type: 'button',
            className: 'dsh-wef-check',
            tabIndex: -1,
            title: t('files.check'),
            'aria-label': t('files.check'),
            'aria-pressed': selection.has(path) ? 'true' : 'false',
            'data-checked': selection.has(path) ? 'true' : 'false',
            'data-workspace-editor-files-check': path,
            onClick: (event) => {
              event.stopPropagation()
              toggleSelection(path)
            },
          // 字形用文本而不是 SVG：未勾选时 `color:transparent` 把它藏掉，勾上才显出来。
          }, selection.has(path) ? '✓' : ''),
          isDir
            ? h('button', {
              type: 'button',
              className: 'dsh-wef-caret',
              tabIndex: -1,
              'aria-label': open ? 'collapse' : 'expand',
              onClick: (event) => { event.stopPropagation(); toggle(path) },
            }, glyph(open ? 'chevronOpen' : 'chevronClosed', 14))
            : h('span', { className: 'dsh-wef-spacer' }),
          h('span', { className: 'dsh-wef-glyph' }, glyph(isDir ? 'folder' : 'file', 14)),
          h('span', { className: 'dsh-wef-name' }, label),
          h('span', { className: 'dsh-wef-actions' },
            isDir && h('button', {
              type: 'button',
              className: 'dsh-wef-tool',
              title: t('files.newFile'),
              'data-workspace-editor-files-new-file': path,
              onClick: (event) => { event.stopPropagation(); startCreate(path, 'file') },
            }, glyph('newFile', 14)),
            isDir && h('button', {
              type: 'button',
              className: 'dsh-wef-tool',
              title: t('files.newFolder'),
              'data-workspace-editor-files-new-folder': path,
              onClick: (event) => { event.stopPropagation(); startCreate(path, 'folder') },
            }, glyph('newFolder', 14)),
            h('button', {
              type: 'button',
              className: 'dsh-wef-tool',
              title: t('files.rename'),
              'data-workspace-editor-files-rename': path,
              onClick: (event) => { event.stopPropagation(); startRename(path) },
            }, glyph('rename', 14)),
            !isDir && h('button', {
              type: 'button',
              className: 'dsh-wef-tool',
              title: t('files.copy'),
              'data-workspace-editor-files-copy': path,
              onClick: (event) => { event.stopPropagation(); void copyEntry(path) },
            }, glyph('copy', 14)),
            h('button', {
              type: 'button',
              className: 'dsh-wef-tool',
              title: t('files.delete'),
              'data-workspace-editor-files-delete': path,
              onClick: (event) => { event.stopPropagation(); void armDelete(path, entry.type) },
            }, glyph('trash', 14))),
          // 常显的「⋯」：悬停图标对不熟悉的人太难发现，每行留一个不用悬停就能点的入口。
          h('button', {
            type: 'button',
            className: 'dsh-wef-more',
            title: t('files.more'),
            'data-workspace-editor-files-more': path,
            onClick: (event) => { openMenu(event, path, entry.type) },
          }, glyph('more', 14)))
        }

        /** 可见行的路径，按渲染顺序：Shift 范围选择拿它当坐标（`rangeSelection`）。 */
        const visiblePaths = []

        /**
         * 把一个目录的可见内容压平进 `rows`（递归，只走展开着的目录）。
         * @param dir - 目录的绝对路径。
         * @param depth - 缩进层级。
         * @returns 无。
         */
        const walk = (dir, depth) => {
          const level = levels[dir]
          if (level === undefined || level.phase === 'loading') {
            rows.push(h('p', { className: 'dsh-wef-note', key: `loading:${dir}` }, t('files.loading')))
            return
          }
          if (level.phase === 'failed') {
            rows.push(h('p', { className: 'dsh-wef-note', key: `failed:${dir}` }, t('files.readFailed', { message: level.message })))
            return
          }
          if (createHere === dir) rows.push(inputRow(depth, editor))
          const items = foldLevel(dir, sortEntries(level.entries, sort), (path) => levels[path]?.entries)
          if (items.length === 0 && createHere !== dir) {
            rows.push(h('p', { className: 'dsh-wef-note', key: `empty:${dir}` }, t('files.empty')))
          }
          for (const item of items) {
            const path = item.path
            visiblePaths.push(path)
            if (editor !== null && editor.mode === 'rename' && editor.path === path) {
              rows.push(inputRow(depth, editor))
              continue
            }
            rows.push(rowOf(item, depth))
            if (item.entry.type === 'directory' && expanded.has(path)) walk(path, depth + 1)
          }
          if (level.truncated) {
            rows.push(h('p', { className: 'dsh-wef-note', key: `truncated:${dir}` }, t('files.truncated')))
          }
        }
        walk(root, 0)

        /** 可见行是不是全勾上了：决定表头那颗全选框画 ✓ 还是画一条半选横线。 */
        const allVisibleSelected = visiblePaths.length > 0 && visiblePaths.every((path) => selection.has(path))

        /** 一个路径是不是目录：根永远是；其余看它父级列表里的那条记录。 */
        const isDirPath = (path) => {
          if (path === root) return true
          const entries = levels[parentOf(path)]?.entries ?? []
          return entries.some((entry) => entry.name === nameOf(path) && entry.type === 'directory')
        }
        // 工具条上的动作落在「选中的是目录 → 它自己；选中的是文件 → 它的父目录」上。
        const targetDir = selected !== null && isDirPath(selected) ? selected : parentOf(selected ?? root)

        /**
         * 键盘 Ctrl/Cmd+V 落在面板里：内部剪贴板优先，否则把系统剪贴板里的**文件**贴进来。
         *
         * 纯文本一律不拦（`preventDefault` 都不调），留给浏览器默认行为 —— 往这棵树里贴文本没有
         * 去处，硬造一个文件属于另一种需求。目录则明确说一句：浏览器读不到目录内容，只能不支持。
         * @param event - `paste` 事件。
         * @returns 无。
         */
        const onPasteEvent = (event) => {
          if (event.target?.tagName === 'INPUT') return
          if (filesClipboard !== null) {
            event.preventDefault()
            void pasteClipboardInto(targetDir)
            return
          }
          const { files, directories } = clipboardFilesOf(event.clipboardData)
          if (files.length === 0) {
            if (directories.length > 0) {
              event.preventDefault()
              setError(t('files.paste.directory', { name: directories[0] }))
            }
            return
          }
          event.preventDefault()
          void uploadInto(targetDir, files)
        }

        return h('div', {
          className: 'dsh-wef-root',
          'data-workspace-editor-files': 'ready',
          'data-workspace-editor-files-root': root,
          onPaste: onPasteEvent,
        },
        h('style', null, CSS),
        h('div', { className: 'dsh-wef-bar' },
          h('span', { className: 'dsh-wef-path', title: targetDir }, targetDir),
          h('span', { className: 'dsh-wef-spacer' }),
          h('button', {
            type: 'button',
            className: 'dsh-wef-tool',
            title: t('files.newFile'),
            'data-workspace-editor-files-new-file': targetDir,
            disabled: busy !== null,
            onClick: () => { startCreate(targetDir, 'file') },
          }, glyph('newFile')),
          h('button', {
            type: 'button',
            className: 'dsh-wef-tool',
            title: t('files.newFolder'),
            'data-workspace-editor-files-new-folder': targetDir,
            disabled: busy !== null,
            onClick: () => { startCreate(targetDir, 'folder') },
          }, glyph('newFolder')),
          h('button', {
            type: 'button',
            className: 'dsh-wef-tool',
            title: t('files.paste'),
            'data-workspace-editor-files-paste': targetDir,
            disabled: busy !== null,
            onClick: () => { void pasteInto(targetDir) },
          }, glyph('paste')),
          h('button', {
            type: 'button',
            className: 'dsh-wef-tool',
            title: t('files.rename'),
            'data-workspace-editor-files-rename-selected': '',
            disabled: busy !== null || selected === null || selected === root,
            onClick: () => { startRename(selected) },
          }, glyph('rename')),
          h('button', {
            type: 'button',
            className: 'dsh-wef-tool',
            title: t('files.refresh'),
            'data-workspace-editor-files-refresh': '',
            disabled: busy !== null,
            onClick: () => { void reloadDir(targetDir) },
          }, glyph('refresh')),
          // 排序入口：只改渲染顺序，不重新读盘（`levels` 里存的是原始顺序）。
          h('button', {
            type: 'button',
            className: 'dsh-wef-tool',
            title: t('files.sort'),
            'data-workspace-editor-files-sort': sort.key,
            'data-workspace-editor-files-sort-dirs': sort.dirsFirst === false ? 'off' : 'on',
            onClick: (event) => {
              event.stopPropagation()
              setMenu(null)
              setSortOpen((prev) => (prev === null ? menuAnchorFor(event) : null))
            },
          }, glyph('sort'))),
        // F2 批量列目录按钮（只显示在有多选时）
        selection.size >= 1 && selection.hasDirectory && h('button', {
          type: 'button',
          className: 'dsh-wef-tool',
          title: t('files.batchList'),
          'data-workspace-editor-files-batch-list': '',
          onClick: (event) => {
            event.stopPropagation()
            openBatchList(selection)
          },
        }, glyph('list')),
        // 批量条：**勾了至少一项就出现**（勾选框是主入口，只勾一个也得拿到批量操作）。
        // 最左那颗是全选框，与每行的勾选框纵向对齐 —— 多选相关的东西全部靠左，不跑到右边。
        selection.size >= 1 && h('div', {
          className: 'dsh-wef-batch',
          'data-workspace-editor-files-batch': String(selection.size),
        },
        h('button', {
          type: 'button',
          className: 'dsh-wef-check',
          title: t('files.batch.selectAll'),
          'aria-label': t('files.batch.selectAll'),
          'aria-pressed': allVisibleSelected ? 'true' : 'false',
          'data-checked': allVisibleSelected ? 'true' : 'partial',
          'data-workspace-editor-files-batch-all': '',
          onClick: () => {
            // 已全选 → 清空；否则全选**可见行**（与 Ctrl/Cmd+A 同一口径，不是整个工作区）。
            setSelection(allVisibleSelected ? new Set() : new Set(visiblePaths))
          },
        // 全选框永远画得出来：全选是 ✓，半选是一条横线。
        }, allVisibleSelected ? '✓' : '−'),
        h('span', { className: 'dsh-wef-batch-text' }, t('files.batch.count', { count: selection.size })),
        h('span', { className: 'dsh-wef-batch-fill' }),
        h('button', {
          type: 'button',
          className: 'dsh-we-open',
          'data-workspace-editor-files-batch-copy': '',
          onClick: () => { void copySelectionPaths() },
        }, t('files.batch.copyPaths')),
        h('button', {
          type: 'button',
          className: 'dsh-we-open',
          'data-danger': 'true',
          'data-workspace-editor-files-batch-delete': '',
          disabled: busy !== null,
          onClick: () => { void armBatchDelete() },
        }, t('files.batch.delete')),
        h('button', {
          type: 'button',
          className: 'dsh-we-open',
          'data-workspace-editor-files-batch-clear': '',
          onClick: () => { setSelection(new Set()) },
        }, t('files.batch.clear'))),
        error !== null && h('p', {
          className: 'dsh-wef-banner',
          'data-tone': 'error',
          'data-workspace-editor-files-error': '',
        },
        h('span', { className: 'dsh-wef-banner-text' }, error),
        h('button', {
          type: 'button',
          className: 'dsh-we-open',
          'data-workspace-editor-files-dismiss': '',
          onClick: () => { setError(null) },
        }, t('files.cancel'))),
        notice !== null && h('p', {
          className: 'dsh-wef-banner',
          'data-tone': notice.tone,
          'data-workspace-editor-files-notice': '',
        },
        h('span', { className: 'dsh-wef-banner-text' }, notice.text),
        h('button', {
          type: 'button',
          className: 'dsh-we-open',
          'data-workspace-editor-files-notice-dismiss': '',
          onClick: () => { dismissNotice() },
        }, t('files.cancel'))),
        pending !== null && h('p', {
          className: 'dsh-wef-banner',
          'data-tone': 'warn',
          'data-workspace-editor-files-confirm': pending.type,
        },
        h('span', { className: 'dsh-wef-banner-text' },
          pending.type === 'directory'
            ? t(pending.count > 0 ? 'files.confirmDeleteDir' : 'files.confirmDeleteEmptyDir', { name: nameOf(pending.path), count: pending.count })
            : t('files.confirmDeleteFile', { name: nameOf(pending.path) }),
          pending.stale ? ` ${t('files.stale')}` : ''),
        h('button', {
          type: 'button',
          className: 'dsh-we-open',
          'data-danger': 'true',
          'data-workspace-editor-files-confirm-go': pending.type === 'directory' && pending.count > 0 ? 'recursive' : 'plain',
          disabled: busy !== null,
          onClick: () => { void runDelete(pending.stale || (pending.type === 'directory' && pending.count > 0)) },
        }, pending.stale
          ? t('files.force')
          : pending.type === 'directory' && pending.count > 0 ? t('files.recursive') : t('files.delete')),
        h('button', {
          type: 'button',
          className: 'dsh-we-open',
          'data-workspace-editor-files-confirm-cancel': '',
          onClick: () => { setPending(null) },
        }, t('files.cancel'))),
        // 批量删除的确认条：与单条确认条同一处渲染，两者互斥（`armBatchDelete` 会先清 `pending`）。
        batch !== null && h('p', {
          className: 'dsh-wef-banner',
          'data-tone': 'warn',
          'data-workspace-editor-files-batch-confirm': String(batch.items.length),
        },
        h('span', { className: 'dsh-wef-banner-text' },
          t(batch.items.some((item) => item.type === 'directory') ? 'files.confirmDeleteManyDirs' : 'files.confirmDeleteMany', {
            count: batch.items.length,
            dirs: batch.items.filter((item) => item.type === 'directory').length,
          })),
        h('button', {
          type: 'button',
          className: 'dsh-we-open',
          'data-danger': 'true',
          'data-workspace-editor-files-batch-confirm-go': '',
          disabled: busy !== null,
          onClick: () => { void runBatchDelete() },
        }, t('files.delete')),
        h('button', {
          type: 'button',
          className: 'dsh-we-open',
          'data-workspace-editor-files-batch-confirm-cancel': '',
          onClick: () => { setBatch(null) },
        }, t('files.cancel'))),
        // 批量删除部分失败：失败项还在选择里，这条横幅给一条明确的出路（重试会重新取版本基线）。
        batchFailed !== null && h('p', {
          className: 'dsh-wef-banner',
          'data-tone': 'error',
          'data-workspace-editor-files-batch-failed': String(batchFailed.failed),
        },
        h('span', { className: 'dsh-wef-banner-text' },
          t('files.batch.failed', { failed: batchFailed.failed, conflicted: batchFailed.conflicted })),
        h('button', {
          type: 'button',
          className: 'dsh-we-open',
          'data-workspace-editor-files-batch-retry': '',
          disabled: busy !== null,
          onClick: () => { void armBatchDelete() },
        }, t('files.batch.retry')),
        h('button', {
          type: 'button',
          className: 'dsh-we-open',
          'data-workspace-editor-files-batch-failed-dismiss': '',
          onClick: () => { setBatchFailed(null) },
        }, t('files.cancel'))),
        // 「工作区根」落点条：**根目录自己没有行**，长列表里正文底部可能压根没有空白可拖，
        // 于是「搬到根」变成做不到的事（用户真反馈过）。所以一开始拖就亮这一条，松开即搬到根；
        // 拖的东西本来就在根下时不亮（那是空操作，亮出来只会误导）。
        dragging !== null && parentOf(dragging) !== root && h('p', {
          className: 'dsh-wef-banner',
          'data-tone': dropOn === root ? 'ok' : 'warn',
          'data-workspace-editor-files-drop-root': root,
          // 它自己就是落点：被行盖住时不必指望空白处，指针进到条上就是「搬到根」。
          onDragOver: (event) => {
            event.preventDefault()
            event.stopPropagation()
            if (dropOn !== root) setDropOn(root)
          },
          onDragLeave: () => { if (dropOn === root) setDropOn(null) },
          onDrop: (event) => {
            event.preventDefault()
            event.stopPropagation()
            const from = dragRef.current
            dragRef.current = null
            setDragging(null)
            setDropOn(null)
            if (from === null || parentOf(from) === root) return
            void moveEntry(from, `${root}/${nameOf(from)}`)
          },
        },
        h('span', { className: 'dsh-wef-banner-text' }, t('files.dropRoot', { path: root }))),
        h('div', {
          className: 'dsh-wef-body',
          tabIndex: 0,
          ref: bodyRef,
          'data-drop': dropOn === root ? 'true' : 'false',
          // 点空白处收掉选区与浮层；点行 / 点按钮不算（`target === currentTarget` 才是真·空白）。
          onClick: (event) => {
            if (event.target !== event.currentTarget) return
            setSelection(new Set())
            setMenu(null)
            setSortOpen(null)
          },
          // F2 = 重命名当前选中行（VS Code 的习惯）；Ctrl/Cmd+C/X = 把选中行放进内部剪贴板
          // （Ctrl/Cmd+V 走 `paste` 事件，见根节点上的 onPaste）；Esc 收起一切浮层。
          // 输入框里的按键归输入框自己管。
          onKeyDown: (event) => {
            if (event.target?.tagName === 'INPUT') return
            if (event.key === 'F2' && selected !== null && selected !== root) {
              event.preventDefault()
              startRename(selected)
              return
            }
            if ((event.ctrlKey || event.metaKey) && (event.key === 'c' || event.key === 'x')) {
              if (selected === null || selected === root) return
              const directory = isDirPath(selected)
              // 目录不复制（Host 的 copy 只收普通文件），但可以剪切（粘贴时是改名 / 移动）。
              if (event.key === 'c' && directory) return
              event.preventDefault()
              if (event.key === 'c') copyToClipboard(selected)
              else cutToClipboard(selected)
              return
            }
            if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
              // 全选**可见行**（不是整个工作区）：与 Shift 范围选择同一套坐标，用户看到什么就选什么。
              event.preventDefault()
              setSelection(new Set(visiblePaths))
              return
            }
            if (event.key === 'Escape') {
              setMenu(null)
              setEditor(null)
              setPending(null)
              setBatch(null)
              setSortOpen(null)
              setSelection(new Set())
            }
          },
          onDragOver: (event) => {
            const from = dragRef.current
            if (from === null || parentOf(from) === root) return
            event.preventDefault()
            if (dropOn !== root) setDropOn(root)
          },
          onDragLeave: () => { if (dropOn === root) setDropOn(null) },
          onDrop: (event) => {
            const from = dragRef.current
            dragRef.current = null
            setDragging(null)
            setDropOn(null)
            if (from === null || parentOf(from) === root) return
            event.preventDefault()
            void moveEntry(from, `${root}/${nameOf(from)}`)
          },
        }, rows),
        menu !== null && h('div', {
          className: 'dsh-wef-backdrop',
          'data-workspace-editor-files-menu-backdrop': '',
          onClick: () => { setMenu(null) },
          onContextMenu: (event) => { event.preventDefault(); setMenu(null) },
        }),
        menu !== null && h('div', {
          className: 'dsh-wef-menu',
          style: { left: `${String(menu.x)}px`, top: `${String(menu.y)}px` },
          'data-workspace-editor-files-menu': menu.path,
        },
        menuItem('new-file', 'newFile', menu.path, null, () => { startCreate(menu.path, 'file') }, menu.type === 'file'),
        menuItem('new-folder', 'newFolder', menu.path, null, () => { startCreate(menu.path, 'folder') }, menu.type === 'file'),
        menuItem('open', 'open', menu.path, t('files.open'), () => { openFile(menu.path) }, menu.type !== 'file'),
        h('div', { className: 'dsh-wef-menu-sep', key: 'sep' }),
        menuItem('rename', 'rename', menu.path, t('files.rename'), () => { startRename(menu.path) }, false),
        menuItem('copy', 'copy', menu.path, t('files.copy'), () => { void copyEntry(menu.path) }, menu.type !== 'file'),
        menuItem('copy-to', 'copy', menu.path, t('files.copyTo'), () => { copyToClipboard(menu.path) }, menu.type !== 'file'),
        menuItem('cut-to', 'cut', menu.path, t('files.cut'), () => { cutToClipboard(menu.path) }, false),
        menuItem('paste', 'paste', menu.path, t('files.paste'), () => { void pasteInto(menu.path) }, menu.type !== 'directory'),
        h('div', { className: 'dsh-wef-menu-sep', key: 'sep-paths' }),
        menuItem('copy-path', 'path', menu.path, t('files.copyPath'), () => { void copyPath(menu.path, false) }, false),
        menuItem('copy-path-relative', 'path', menu.path, t('files.copyPathRelative'), () => { void copyPath(menu.path, true) }, false),
        menuItem('open-terminal', 'terminal', menu.path, t('files.openTerminal'), (event) => { void openInTerminal(menu.path, event?.currentTarget ?? null) }, false),
        menuItem('delete', 'trash', menu.path, t('files.delete'), () => { void armDelete(menu.path, menu.type) }, false, true)),
        // 排序菜单：与行菜单同一套外观，位置来自按钮的视口坐标（`menuAnchorFor`）。
        sortOpen !== null && h('div', {
          className: 'dsh-wef-backdrop',
          'data-workspace-editor-files-sort-backdrop': '',
          onClick: () => { setSortOpen(null) },
          onContextMenu: (event) => { event.preventDefault(); setSortOpen(null) },
        }),
        sortOpen !== null && h('div', {
          className: 'dsh-wef-menu',
          style: { left: `${String(sortOpen.x)}px`, top: `${String(sortOpen.y)}px` },
          'data-workspace-editor-files-sort-menu': sort.key,
        },
        ...TREE_SORT_KEYS.map((key) => h('button', {
          key,
          type: 'button',
          className: 'dsh-wef-menu-item',
          'data-workspace-editor-files-sort-key': key,
          'data-active': sort.key === key ? 'true' : 'false',
          onClick: () => { setSort({ ...sort, key }); setSortOpen(null) },
        },
        h('span', { className: 'dsh-wef-menu-check' }, sort.key === key ? '✓' : ''),
        t(key === 'type' ? 'files.sort.type' : 'files.sort.name'))),
        h('div', { className: 'dsh-wef-menu-sep', key: 'sort-sep' }),
        h('button', {
          key: 'sort-dirs',
          type: 'button',
          className: 'dsh-wef-menu-item',
          'data-workspace-editor-files-sort-dirs-first': sort.dirsFirst === false ? 'off' : 'on',
          onClick: () => { setSort({ ...sort, dirsFirst: sort.dirsFirst === false }); setSortOpen(null) },
        },
        h('span', { className: 'dsh-wef-menu-check' }, sort.dirsFirst === false ? '' : '✓'),
        t('files.sort.dirsFirst'))),
        busy !== null && h('p', { className: 'dsh-wef-status', 'data-workspace-editor-files-busy': '' }, t('files.busy')),
        // 剪贴板横幅：不是「正在处理」，而是「贴的时候会贴什么」，所以单独一行、带一个清空按钮。
        clipboard !== null && h('p', {
          className: 'dsh-wef-clip',
          'data-workspace-editor-files-clipboard': clipboard.path,
          'data-workspace-editor-files-clipboard-mode': clipboard.mode,
        },
        h('span', { className: 'dsh-wef-clip-name' },
          t('files.clipboard', {
            name: clipboard.name,
            mode: t(clipboard.mode === 'cut' ? 'files.clipboardMode.cut' : 'files.clipboardMode.copy'),
          })),
        h('button', {
          type: 'button',
          className: 'dsh-we-open',
          'data-workspace-editor-files-clipboard-clear': '',
          onClick: () => { armClipboard(null) },
        }, t('files.clipboardClear'))),
        h(FilesFooter, null))
      }

      return { FilesPanel, FilesTree }
    }

    /** F2 批量列目录弹窗 */
    function createBatchListDialog(ctx) {
      const t = ctx.locale.bind(NS)
      
      /** 当前弹窗状态 */
      let dialogState = {
        directories: [],   // 选中的目录列表
        contents: [],      // 每个目录的内容 [{ directory, entries, count }]
        loading: false,
        error: null,
      }

      /** 打开批量列目录弹窗 */
      async function openBatchList(selectedPaths) {
        // 过滤出目录
        const dirs = []
        for (const path of selectedPaths) {
          try {
            const info = await ctx.fs.stat(path)
            if (info?.type === 'directory') {
              const parts = path.split('/')
              const name = parts[parts.length - 1]
              if (!name.startsWith('.')) { // 忽略隐藏项
                dirs.push(path)
              }
            }
          } catch (err) {
            ctx.logger.warn('batch list stat failed:', path, err)
          }
        }
        
        if (dirs.length === 0) {
          return
        }

        dialogState = {
          directories: dirs,
          contents: [],
          loading: true,
          error: null,
        }

        try {
          const sessionId = ctx.sessions.getActiveId?.() || (ctx.sessions.list.getSnapshot()?.[0]?.id)
          if (!sessionId) {
            throw new Error(t('search.noSession'))
          }

          const response = await fetch(LIST_BATCH_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              paths: dirs.slice(0, 50),
            }),
          })

          const data = await response.json()

          if (!response.ok || !data.ok) {
            throw new Error(data.message || t('files.batchListFailed'))
          }

          dialogState = {
            ...dialogState,
            contents: data.directories || [],
            loading: false,
          }
        } catch (err) {
          dialogState = { ...dialogState, loading: false, error: err.message }
          ctx.logger.error('batch list failed:', err)
        }
      }

      /** 关闭弹窗 */
      function closeBatchList() {
        dialogState = {
          directories: [],
          contents: [],
          loading: false,
          error: null,
        }
      }

      /** 复制到剪贴板 */
      async function copyToClipboard() {
        const lines = dialogState.contents.map(d => 
          `${d.displayName}/\n${d.entries.map(e => `  ${e}`).join('\n')}`
        )
        const text = lines.join('\n\n')
        try {
          await navigator.clipboard.writeText(text)
          ctx.notice.show?.('Copied to clipboard')
        } catch (err) {
          ctx.logger.error('copy failed:', err)
        }
      }

      /** 弹窗内容 */
      function BatchListDialogContent() {
        if (dialogState.directories.length === 0) return null

        return h('div', { className: 'dsh-web-batch-list-dialog-overlay' },
          h('div', { className: 'dsh-web-batch-list-dialog-backdrop', onClick: closeBatchList }),
          h('div', { className: 'dsh-web-batch-list-dialog' },
            h('div', { className: 'dsh-web-batch-list-header' },
              h('h3', {}, t('files.batchListTitle', { count: dialogState.directories.length })),
              h('button', {
                className: 'dsh-web-batch-list-close',
                onClick: (e) => { e.stopPropagation(); closeBatchList() },
              }, '×'),
            ),
            h('div', { className: 'dsh-web-batch-list-body' },
              dialogState.loading && h('div', { className: 'dsh-web-batch-list-loading' }, t('files.loading')),
              dialogState.error && h('div', { className: 'dsh-web-batch-list-error' }, dialogState.error),
              !dialogState.loading && !dialogState.error && h('div', { className: 'dsh-web-batch-list-empty' }, t('files.noEntries')),
              ...dialogState.contents.map((dir, i) => 
                h('div', { key: i, className: 'dsh-web-batch-list-dir' },
                  h('div', { className: 'dsh-web-batch-list-dir-name' }, dir.displayName),
                  h('ul', { className: 'dsh-web-batch-list-entries' },
                    dir.entries.map(entry => 
                      h('li', { key: entry }, entry)
                    ),
                  ),
                )
              ),
            ),
            h('div', { className: 'dsh-web-batch-list-footer' },
              h('button', {
                className: 'dsh-web-batch-list-copy',
                onClick: (e) => { e.stopPropagation(); copyToClipboard() },
              }, t('files.copyEntries')),
              h('button', {
                className: 'dsh-web-batch-list-close-btn',
                onClick: (e) => { e.stopPropagation(); closeBatchList() },
              }, t('files.close')),
            ),
          ),
        )
      }

      return { BatchListDialogContent, openBatchList, closeBatchList }
    }

    /** 搜索面板相关常量与纯函数 */
    /* search:start */
    const SEARCH_PATH = '/workspace-editor/search'
    const LIST_BATCH_PATH = '/workspace-editor/list-batch'

    /** 搜索结果预览的行数上限（每个文件）。 */
    const SEARCH_PREVIEW_LINES = 3

    /** 在文件中查找匹配行的索引范围（用于高亮定位）。 */
    function findLineIndex(content, lineNo) {
      const lines = content.split('\n')
      let index = 0
      for (let i = 1; i < lineNo && i <= lines.length; i++) {
        index += lines[i - 1].length + 1 // +1 for newline
      }
      return index
    }
    /* search:end */

    /** 创建搜索面板（独立的面板页签，像 VSCode 的搜索侧边栏）。 */
    function createSearchPanel(ctx) {
      const t = ctx.locale.bind(NS)
      
      /** 当前状态 */
      let state = {
        pattern: '',           // 搜索关键词
        caseSensitive: false,  // 区分大小写
        onlyFilenames: false,  // 仅文件名匹配
        results: [],           // 搜索结果 [{ path, matches }]
        loading: false,
        error: null,
        panelOpen: false,
      }

      /** 打开搜索面板并聚焦输入框 */
      function openSearchPanel() {
        state = { ...state, panelOpen: true, pattern: '', results: [], error: null, loading: false }
      }

      /** 关闭搜索面板 */
      function closeSearchPanel() {
        state = { ...state, panelOpen: false, pattern: '', results: [], error: null, loading: false }
      }

      /** 执行搜索 */
      async function executeSearch() {
        if (!state.pattern.trim()) return
        
        state = { ...state, loading: true, error: null }
        
        try {
          const sessionId = ctx.sessions.getActiveId?.() || (ctx.sessions.list.getSnapshot()?.[0]?.id)
          if (!sessionId) {
            throw new Error(t('search.noSession'))
          }
          
          const response = await fetch(SEARCH_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              pattern: state.pattern,
              caseSensitive: state.caseSensitive,
              // 注意：这里不支持 pathPrefix，搜索整个工作区
            }),
          })
          
          const data = await response.json()
          
          if (!response.ok || !data.ok) {
            throw new Error(data.message || t('search.failed'))
          }
          
          state = { 
            ...state, 
            results: data.results || [],
            loading: false,
          }
        } catch (err) {
          state = { ...state, loading: false, error: err.message }
          ctx.logger.error('search failed:', err)
        }
      }

      /** 打开搜索结果对应的编辑器页签 */
      function openResult(path, lineNo) {
        const address = FILE_ADDRESS_PREFIX + encodeURIComponent(path)
        const paneId = `${EDITOR_TAB_ID}-${path}-${lineNo}`
        
        ctx.sidebarRight.openTabFromTarget(
          EDITOR_KIND,
          ctx.sidebarRight.commandTarget(document.activeElement),
          { address, paneId, replaceTab: false }
        )
        
        // TODO: 滚动到对应行（需要等待编辑器加载完成）
      }

      /** 结果行渲染 */
      function ResultRow(props) {
        const { result, onClick } = props
        return h('div', {
          className: 'dsh-wes-result-row',
          onClick: () => onClick(result.path),
        },
          h('div', { className: 'dsh-wes-file-header' }, result.path),
          ...result.matches.slice(0, SEARCH_PREVIEW_LINES).map((m, i) => 
            h('div', {
              key: i,
              className: 'dsh-wes-match-line',
              onClick: (e) => {
                e.stopPropagation()
                onClick(result.path, m.lineNo)
              },
            },
              h('span', { className: 'dsh-wes-line-no' }, String(m.lineNo)),
              h('span', { className: 'dsh-wes-line-text' }, m.preview),
            )
          ),
        )
      }

      /** 搜索面板主体 */
      function SearchPanelBody() {
        if (!state.panelOpen) return null
        
        return h('div', { className: 'dsh-wes-panel' },
          // 顶部工具栏
          h('div', { className: 'dsh-wes-toolbar' },
            h('input', {
              type: 'text',
              className: 'dsh-wes-search-input',
              placeholder: t('search.placeholder'),
              value: state.pattern,
              onInput: (e) => {
                state = { ...state, pattern: e.target.value }
              },
              onKeyDown: (e) => {
                if (e.key === 'Enter') executeSearch()
                else if (e.key === 'Escape') closeSearchPanel()
              },
            }),
            h('button', {
              className: 'dsh-wes-close',
              onClick: closeSearchPanel,
            }, '×'),
          ),
          
          // 结果区
          h('div', { className: 'dsh-wes-results' },
            state.loading && h('div', { className: 'dsh-wes-loading' }, t('search.loading')),
            state.error && h('div', { className: 'dsh-wes-error' }, state.error),
            !state.loading && !state.error && state.results.length === 0 && state.pattern && 
              h('div', { className: 'dsh-wes-empty' }, t('search.noResults')),
            ...state.results.map(result => 
              h(ResultRow, { key: result.path, result, onClick: openResult })
            ),
          ),
        )
      }

      return { SearchPanelBody, openSearchPanel, closeSearchPanel }
    }
    /* search:end */

    /** 浏览器侧需要的服务：槽位、文案、文档渲染器注册表、右侧栏页签，以及工作区文件的读接口。 */
    const inject = [
      'slots',
      'locale',
      'documentPreviews',
      'remote',
      'remote.workspaceFiles',
      'sidebarRightTabs',
      'sidebarRight',
    ]

    /** 「文件编辑」面板在 guide 卡片上的图标：一个「文件夹 + 加号」，与工具条上那枚同款。 */
    function FilesGuideIcon(props) {
      const size = props?.size ?? 16
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: '1.2',
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
        className: props?.className,
      },
      h('path', { d: ICON_PATHS.folder[0] }),
      h('path', { d: 'M8 8.6v3' }),
      h('path', { d: 'M6.5 10.1h3' }))
    }

    /**
     * 客户端插件正文：注册两档文档渲染器、编辑器页签类型、预览头部的「编辑」「删除」按钮，
     * 以及「文件编辑」工具面板（页签类型 + 自带文件树）。
     * @param ctx - 客户端根上下文。
     * @returns 无。
     */
    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      const { DocumentBody, PaneBody, EditAction, DeleteAction } = createEditor(ctx)
      const { FilesPanel } = createFilesPanel(ctx)
      const searchPanel = createSearchPanel(ctx)
      const { SearchPanelBody, openSearchPanel, closeSearchPanel } = searchPanel
      const batchDialog = createBatchListDialog(ctx)
      const { BatchListDialogContent } = batchDialog
      const { ImageBody } = createImageBody(ctx)
      const bands = [
        { id: DEFAULT_RENDERER_ID, extensions: DEFAULT_EXTENSIONS, priority: 'extension' },
        { id: OPTIONAL_RENDERER_ID, extensions: OPTIONAL_EXTENSIONS, priority: 'builtin' },
      ]
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'workspace-editor: dictionaries')

      for (const band of bands) {
        ctx.effect(() => ctx.documentPreviews.register({
          id: band.id,
          extensions: band.extensions,
          priority: band.priority,
          title: () => t('viewer.title'),
          loading: 'renderer',
          wrap: true,
        }), `workspace-editor: ${band.id} metadata`)
        ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({
          name: 'sidebar.right.tab.document',
          key: band.id,
          locale: NS,
        }, DocumentBody)), `workspace-editor: ${band.id} body`)
      }

      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: EDITOR_TAB_ID,
        kind: EDITOR_KIND,
        patterns: [EDITOR_TAB_PATTERN],
        priority: 'builtin',
        canOpen: (address) => typeof address === 'string' && address.startsWith(FILE_ADDRESS_PREFIX),
        title: (address) => t('tab.title', { name: fileNameOf(address) }),
      }), 'workspace-editor: editor tab type')
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: EDITOR_TAB_ID,
        locale: NS,
      }, PaneBody)), 'workspace-editor: editor tab body')

      // 图片预览：**另一个页签类型**（不是文档渲染器，官方那个图片渲染器保持原样）。pattern 同样
      // 命中不了真实地址 —— 图片的自动打开仍然归官方预览，只有显式点名 kind 才开（本插件的文件树）。
      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: IMAGE_TAB_ID,
        kind: IMAGE_KIND,
        patterns: [IMAGE_TAB_PATTERN],
        priority: 'builtin',
        canOpen: (address) => typeof address === 'string' && address.startsWith(FILE_ADDRESS_PREFIX),
        title: (address) => t('image.title', { name: fileNameOf(address) }),
      }), 'workspace-editor: image tab type')
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: IMAGE_TAB_ID,
        locale: NS,
      }, ImageBody)), 'workspace-editor: image tab body')

      ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document.actions', () => ctx.slots.register({
        name: 'sidebar.right.tab.document.actions',
        id: 'workspace-editor',
        order: 5,
        locale: NS,
      }, EditAction)), 'workspace-editor: preview edit action')

      // 「删除」紧挨「编辑」：同一个槽位，order 大一号排在它后面。
      ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document.actions', () => ctx.slots.register({
        name: 'sidebar.right.tab.document.actions',
        id: 'workspace-editor-delete',
        order: 6,
        locale: NS,
      }, DeleteAction)), 'workspace-editor: preview delete action')

      // 「文件编辑」：一个自带文件树的右侧栏工具。没有 patterns —— 它是**页类型**，只能按 kind
      // 打开（guide 卡片 / 快捷键 / 代码），因此不会参与任何文件的自动打开排名。
      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: FILES_TAB_ID,
        kind: FILES_KIND,
        priority: 'builtin',
        title: () => t('files.title'),
        guide: [{
          id: 'workspace-editor-files',
          commandId: 'workspace.editor.files',
          order: 20,
          title: () => t('files.title'),
          description: () => t('files.guide'),
          icon: FilesGuideIcon,
        }],
      }), 'workspace-editor: files tab type')
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: FILES_TAB_ID,
        locale: NS,
      }, FilesPanel)), 'workspace-editor: files panel body')

      // 对话输入框的「哨兵」：不画任何东西，只把本会话的 `inputActions` 登记进
      // `inputTargets`，给编辑器正文的「发送到 DSH」兜底用（编辑器自己的槽位不保证传这个
      // prop，见文件头注释与 InputSink 的注释）。
      ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'workspace-editor-input',
        order: 90,
        locale: NS,
      }, InputSink)), 'workspace-editor: composer input sink')

      // 快捷键可选：`shortcuts` 服务不在也不影响面板（guide 卡片照样能打开它）。
      ctx.inject(['shortcuts'], (scoped) => {
        scoped.effect(() => scoped.shortcuts.register({
          id: 'workspace.editor.files',
          label: () => t('files.shortcut'),
          aliases: ['workspace editor files', '文件编辑'],
          defaults: {
            'desktop:macos': { code: 'KeyE', modifiers: ['primary', 'alt'] },
            'desktop:windows': { code: 'KeyE', modifiers: ['primary', 'alt'] },
            'desktop:linux': { code: 'KeyE', modifiers: ['primary', 'alt'] },
            'web:macos': { code: 'KeyE', modifiers: ['primary', 'alt'] },
            'web:windows': { code: 'KeyE', modifiers: ['primary', 'alt'] },
            'web:linux': { code: 'KeyE', modifiers: ['primary', 'alt'] },
          },
          regions: ['page', 'editable', 'terminal'],
          modals: [],
          resolve: ({ target }) => {
            const capture = ctx.sidebarRight.commandTarget(target)
            if (capture === undefined) return { status: 'blocked', reason: t('files.noRoot') }
            return { status: 'handled', run: () => { ctx.sidebarRight.openTabFromTarget(FILES_KIND, capture) } }
          },
        }), 'workspace-editor: files shortcut')
      })

      // F12 搜索 + F2 批量列目录 + ESC 关闭弹窗
      ctx.effect(() => {
        const onKey = (event) => {
          // F12: 打开搜索面板
          if (event.key === 'F12' && !event.ctrlKey && !event.altKey && !event.metaKey) {
            event.preventDefault()
            openSearchPanel()
          }
          // F2: 批量列目录（仅当文件树面板激活时）
          else if (event.key === 'F2' && !event.ctrlKey && !event.altKey && !event.metaKey) {
            event.preventDefault()
            // TODO: 检查是否在文件树面板中，这里简化处理直接调用
            openBatchListDialog(selection.get?.() || new Set())
          }
          // ESC: 关闭搜索面板或批量列表弹窗
          else if (event.key === 'Escape') {
            closeSearchPanel()
            // batchDialog.closeBatchList() 已经在内部处理
          }
        }

        document.addEventListener('keydown', onKey, true)
        return () => document.removeEventListener('keydown', onKey, true)
      }, 'workspace-editor: global key handler')
    }

    return { name: 'workspace-editor', inject, apply }
  },
})
})()
