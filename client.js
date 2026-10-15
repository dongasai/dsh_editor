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
 * 插进去的是**普通文本而不是芯片**：官方公开面 `InputActions` 只有
 * `insertText(text, span)`，没有带结构化引用的插入（带引用的那条路只对内通过
 * scoped event 开放）；`#L` 行号语法交给模型侧解析，与 Harness 系统提示里规定的
 * `@…#L` 引用写法一致。**尾随空格是刻意的** —— `@` 触发检测要求触发 token 紧贴光标，
 * 空格让刚插进去的引用不会又把 `@` 文件菜单唤出来。
 *
 * 写入面的来源：`conversation.input.*` 与侧栏文档 / 页签槽位的标准 prop 里都带
 * `inputActions`（每个会话一份的稳定 facade）。这里**就近取用** —— 编辑器正文本来就
 * 活在会话作用域的槽位里，把自己的 `inputActions` 传进来即可，不另设哨兵槽位去别处
 * 记一份。拿不到这个面（会话还没起来、或输入框正被审批 / 问答占用）或插入被拒
 * （正在提交、草稿刚变过）时，只在编辑器里亮一条横幅说明，不静默失败。
 */

window.__ModuleLoader__.load({
  id: '@dongasai/dsh-editor',
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

    /** 未保存草稿，按 `会话 + 路径` 索引；切标签 / 关页签都会重挂正文，草稿要活过重挂。 */
    const drafts = new Map()

    /** 组件本地样式：随组件挂载渲染、卸载即消失，只用主题令牌。 */
    const CSS = `
.dsh-we-root{display:flex;flex-direction:column;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size-secondary,13px)}
.dsh-we-fill{position:absolute;inset:0}
.dsh-we-pane{flex:auto;height:100%}
.dsh-we-bar{display:flex;align-items:center;gap:8px;flex:none;padding:6px 10px;border-bottom:.5px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsh-we-spacer{flex:1 1 auto}
.dsh-we-hint{white-space:nowrap}
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
.dsh-we-editor{flex:1 1 auto;min-height:0;width:100%;box-sizing:border-box;margin:0;padding:8px 10px;border:none;outline:none;resize:none;background:transparent;color:inherit;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:inherit;line-height:1.6;tab-size:2;white-space:pre;overflow:auto}
.dsh-we-editor[data-wrap="true"]{white-space:pre-wrap;overflow-wrap:anywhere}
.dsh-we-message{flex:1 1 auto;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:12px;padding:16px 20px;text-align:center;color:var(--dsw-alias-label-secondary);line-height:1.6;white-space:normal}
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
.dsh-wef-banner-text{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}
.dsh-wef-body{flex:1 1 auto;min-height:0;overflow:auto;padding:6px 4px 12px;scrollbar-gutter:stable}
.dsh-wef-body[data-drop="true"]{background:var(--dsw-alias-bg-layer-2)}
.dsh-wef-row{display:flex;align-items:center;gap:4px;width:100%;box-sizing:border-box;padding:4px 6px 4px 2px;border:none;background:transparent;color:inherit;font:inherit;text-align:left;border-radius:var(--dsw-radius-sm,6px);cursor:pointer}
.dsh-wef-row:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.dsh-wef-row[data-selected="true"]{background:var(--dsw-alias-interactive-bg-selected,var(--dsw-alias-bg-layer-2))}
.dsh-wef-row[data-drop="true"]{outline:1px dashed var(--dsw-alias-brand-primary);outline-offset:-1px}
.dsh-wef-row[data-busy="true"]{opacity:.5}
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
.dsh-wef-note{margin:0;padding:3px 10px;color:var(--dsw-alias-label-tertiary);font-size:12px}
.dsh-wef-input{width:100%;box-sizing:border-box;font:inherit;font-size:12px;padding:2px 6px;border-radius:var(--dsw-radius-sm,6px);border:.5px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);outline:none}
.dsh-wef-status{flex:none;padding:6px 10px;border-top:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:12px}
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
      'files.guide': '自带文件树：新建、改名、复制、删除、拖拽移动',
      'files.shortcut': '打开「文件编辑」面板',
      'files.newFile': '新建文件',
      'files.newFolder': '新建文件夹',
      'files.rename': '重命名 / 移动',
      'files.copy': '复制',
      'files.delete': '删除',
      'files.refresh': '刷新',
      'files.open': '用编辑器打开',
      'files.more': '更多操作（重命名 / 复制 / 删除）',
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
      'files.guide': 'Its own file tree: create, rename, copy, delete, drag to move',
      'files.shortcut': 'Open the file editor panel',
      'files.newFile': 'New file',
      'files.newFolder': 'New folder',
      'files.rename': 'Rename / move',
      'files.copy': 'Copy',
      'files.delete': 'Delete',
      'files.refresh': 'Refresh',
      'files.open': 'Open in the editor',
      'files.more': 'More actions (rename / copy / delete)',
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
      trash: ['M2.8 4.6h10.4', 'M6.3 4.6V2.9h3.4v1.7', 'M4.4 4.6l.7 9.1h5.8l.7-9.1'],
      refresh: ['M13 8a5 5 0 1 1-1.7-3.7', 'M13.3 2.6v3.2h-3.2'],
      open: ['M2.5 12.5V6h6.5l-2.4 2.4', 'M6.6 3.5h6v6'],
      more: ['M3.6 8h.01', 'M8 8h.01', 'M12.4 8h.01'],
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

    /**
     * 造出本插件的三个组件（闭包持有客户端上下文，Remote 读接口在这里取）。
     * @param ctx - 客户端根上下文。
     * @returns 文档渲染器正文、页签正文、预览头部的「编辑」按钮。
     */
    function createEditor(ctx) {
      /**
       * 共用的可编辑正文：读盘、草稿、版本闸、冲突处理都在这里。
       * @param props - `{ t, sessionId, path, wrap, onToggleWrap, scrollportRef, reloadKey, variant, onLoaded, onFailed, inputActions, useSessions }`。
       * @returns 编辑区、状态条与横幅。
       */
      function EditorSurface(props) {
        const { t, sessionId, path, wrap, onToggleWrap, scrollportRef, reloadKey, variant, onLoaded, onFailed, inputActions, useSessions } = props
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

        const draftRef = React.useRef(draft)
        draftRef.current = draft
        const docRef = React.useRef(doc)
        docRef.current = doc
        const dirtyRef = React.useRef(false)
        dirtyRef.current = doc.phase === 'ready' && draft !== doc.text
        const savingRef = React.useRef(false)
        /** 文本框元素：菜单里的剪切 / 复制 / 粘贴 / 全选都要对「右键时那一块区域」下手。 */
        const areaRef = React.useRef(null)
        /** 当前会话的工作区根：发送引用时把绝对路径改写成相对路径（DSH 的 `@` 惯例）。 */
        const cwd = useSessions((state) => state.byId?.[sessionId]?.cwd)

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
        const sendToInput = () => {
          const area = areaRef.current
          const current = docRef.current
          if (area === null || current.phase !== 'ready') return
          const start = area.selectionStart ?? 0
          const end = area.selectionEnd ?? start
          const reference = lineReferenceToken(
            relativizeToCwd(current.absolutePath ?? path, cwd),
            lineNumberOf(draftRef.current, start),
            lineNumberOf(draftRef.current, end),
          )
          if (reference === null) {
            setSend({ phase: 'failed', text: t('send.failed.path') })
            return
          }
          const actions = inputActions
          if (actions === undefined || typeof actions.captureInsertion !== 'function' || typeof actions.insertText !== 'function') {
            // 会话还没起来、或输入框正被审批 / 问答占用（composer 被接管）时没有这个面。
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
            run()
          },
        }, extra?.icon === null ? null : glyph(extra?.icon ?? 'file', 14), label)

        const dirty = draft !== doc.text
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
        h('div', { className: 'dsh-we-bar' },
          h('span', {
            className: 'dsh-we-status',
            'data-tone': statusTone,
            'data-workspace-editor-status': statusTone,
          }, statusText),
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
        h('textarea', {
          // 直接把 owner 的稳定回调当 ref：包一层会让 React 每次渲染都先 detach 再 attach，
          // 而 attach 会把 scrollTop 重置回记录值 —— 打字时页面会往上跳。
          ref: typeof scrollportRef === 'function' ? scrollportRef : null,
          className: 'dsh-we-editor',
          'data-wrap': wrap ? 'true' : 'false',
          'data-workspace-editor-input': '',
          'aria-label': t('editor.label'),
          value: draft,
          wrap: wrap ? 'soft' : 'off',
          spellCheck: false,
          autoCapitalize: 'off',
          autoCorrect: 'off',
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
                relativizeToCwd(doc.absolutePath ?? path, cwd),
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
        }))
      }

      /**
       * 文档渲染器正文（入口 1 / 2）：从资源地址取出会话与路径，把 owner 的
       * `content.loaded/failed` 接上。
       * @param props - 文档正文槽位交来的 props（含 `inputActions`：本会话输入框的公开写入面）。
       * @returns 编辑器正文，或地址不可用时的说明。
       */
      function DocumentBody(props) {
        const { resourceAddress, content, wrap, scrollportRef, t, inputActions, useSessions } = props
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
          useSessions,
        })
      }

      /**
       * 编辑器页签正文（入口 3）：目标来自打开时带的 `navigation.params`，没有参数时
       * 回落到解析地址里的绝对路径。
       * @param props - 页签正文槽位交来的 props（含 `inputActions`：本会话输入框的公开写入面）。
       * @returns 编辑器正文，或目标不可用时的说明。
       */
      function PaneBody(props) {
        const { useTabInfo, sessionId, t, inputActions, useSessions } = props
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
          useSessions,
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

    /**
     * 造出「文件编辑」面板（页签类型 + 自带文件树）。
     *
     * 与「工作区文件」面板的关系：两者都是右侧栏的**页签类型**（`sidebarRightTabs.register`
     * + `sidebar.right.pane.tab`），都按目录懒加载、都订阅官方的 `workspaceFiles.changes`。
     * 差别在于这个面板自带写操作 —— 新建、改名 / 移动、复制、删除都打到本插件自己的 Host 路由
     * （官方 `workspaceFiles` 是只读的），并且**单击文件直接开本插件的编辑器页签**。
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

      /** 目录在前、同类型按名字排；后端给的是稳定名序，这里只调整展示顺序。 */
      function sortEntries(entries) {
        return [...entries].sort((left, right) => {
          const rank = (entry) => (entry.type === 'directory' ? 0 : 1)
          return rank(left) - rank(right) || (left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
        })
      }

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
        }
        const key = known[outcome.code]
        if (key !== undefined) return t(key)
        // 405 只可能是「这条路由还没注册」：静态 fallback 对非 GET/HEAD 就是这个码。
        if (outcome.status === 405) return t('files.error.route')
        return t('files.error.generic', { code: outcome.code, message: outcome.message })
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
            h('p', { className: 'dsh-wef-note' }, t('files.noRoot')))
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
        const [editor, setEditor] = React.useState(null)
        const [pending, setPending] = React.useState(null)
        const [busy, setBusy] = React.useState(null)
        const [error, setError] = React.useState(null)
        const [dropOn, setDropOn] = React.useState(null)
        /** 右键菜单：`{ path, type, x, y }`；坐标是视口坐标（菜单用 position:fixed）。 */
        const [menu, setMenu] = React.useState(null)
        const aliveRef = React.useRef(true)
        const levelsRef = React.useRef(levels)
        levelsRef.current = levels
        const pendingRef = React.useRef(pending)
        pendingRef.current = pending
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
          setLevels((prev) => ({ ...prev, [path]: { phase: 'ready', entries: sortEntries(result.value.entries), truncated: result.value.truncated } }))
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

        /** 在编辑器页签里打开一个文件（不顶掉本面板所在的页签）。 */
        const openFile = (path) => {
          const placement = paneId === undefined ? {} : { paneId }
          ctx.sidebarRight.openResource(absoluteFileAddress(path), {
            kind: EDITOR_KIND,
            ...placement,
            params: { sessionId, path },
          })
        }

        /** 点一行：目录展开 / 收起，文件直接进编辑器。 */
        const activate = (path, type) => {
          setSelected(path)
          setError(null)
          setPending(null)
          setMenu(null)
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
          setError(null)
          setMenu({ path, type, ...menuAnchorFor(event) })
        }

        /** 打开「新建」输入行：目录要顺手展开，否则输入框没地方待。 */
        const startCreate = (dir, mode) => {
          setPending(null)
          setPending(null)
          setError(null)
          setSelected(dir)
          ensureDir(dir)
          setExpanded((prev) => new Set(prev).add(dir))
          setEditor({ mode, dir })
        }

        /** 打开「重命名」输入行：预填当前名字，允许带 `/` 直接搬到子目录。 */
        const startRename = (path) => {
          setPending(null)
          setPending(null)
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
            setSelected(target)
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
          setSelected(target)
          await reloadDir(draft.dir)
          if (draft.mode === 'file') openFile(target)
        }

        /** 复制一个文件：同目录下的「xxx 副本」，重名就往后编号（Host 仍会拒绝覆盖）。 */
        const copyEntry = async (path) => {
          const dir = parentOf(path)
          const name = nameOf(path)
          const existing = new Set((levelsRef.current[dir]?.entries ?? []).map((entry) => entry.name))
          let candidate = copyNameOf(name)
          for (let index = 2; existing.has(candidate) && index < 20; index += 1) {
            const dot = name.lastIndexOf('.')
            candidate = dot <= 0 ? `${name} 副本 ${index}` : `${name.slice(0, dot)} 副本 ${index}${name.slice(dot)}`
          }
          const target = `${dir}/${candidate}`
          const outcome = await postJson(COPY_URL, { from: path, to: target }, path)
          if (outcome === null) return
          if (!outcome.ok) {
            setError(describeMutationFailure(outcome, t))
            return
          }
          setSelected(target)
          await reloadDir(dir)
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
          setSelected(to)
          await reloadDir(parentOf(from))
          if (parentOf(to) !== parentOf(from)) await reloadDir(parentOf(to))
        }

        /** 点「删除」：先取一次版本闸基线（目录再问一次条目数），再亮确认条。 */
        const armDelete = async (path, type) => {
          setError(null)
          setEditor(null)
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
          setSelected(parentOf(target.path))
          await reloadDir(parentOf(target.path))
        }

        /**
         * 一枚右键菜单项。
         * @param id - 调试锚点后缀。
         * @param icon - `ICON_PATHS` 里的图标名。
         * @param path - 这一项作用的路径。
         * @param label - 文案；`null` 表示这一项不由这个入口提供（不出现在菜单里）。
         * @param run - 点下去干什么。
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
              run()
            },
          }, glyph(icon, 14), label)
        }

        const rows = []
        const createHere = editor !== null && editor.mode !== 'rename' ? editor.dir : null
        const inputRow = (depth, draft) => h('div', {
          className: 'dsh-wef-row',
          key: `input:${draft.dir}`,
          style: { paddingLeft: `${String(6 + depth * 14)}px` },
          'data-workspace-editor-files-input-row': draft.mode,
        },
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

        const rowOf = (entry, path, depth) => {
          const isDir = entry.type === 'directory'
          const open = isDir && expanded.has(path)
          return h('div', {
            key: path,
            className: 'dsh-wef-row',
            draggable: true,
            'data-workspace-editor-files-row': path,
            'data-kind': entry.type,
            'data-selected': selected === path ? 'true' : 'false',
            'data-busy': busy === path ? 'true' : 'false',
            'data-drop': dropOn === path ? 'true' : 'false',
            style: { paddingLeft: `${String(6 + depth * 14)}px` },
            onClick: () => { activate(path, entry.type) },
            onContextMenu: (event) => { openMenu(event, path, entry.type) },
            onDragStart: (event) => {
              dragRef.current = path
              try {
                event.dataTransfer.setData('text/plain', path)
                event.dataTransfer.effectAllowed = 'move'
              } catch {
                // 个别浏览器不给写 dataTransfer；移动逻辑只依赖 dragRef，照样可用。
              }
            },
            onDragEnd: () => { dragRef.current = null; setDropOn(null) },
            onDragOver: (event) => {
              const from = dragRef.current
              if (from === null || !isDir || from === path || isInside(path, from)) return
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
              const from = dragRef.current
              dragRef.current = null
              setDropOn(null)
              if (from === null || !isDir) return
              event.preventDefault()
              void moveEntry(from, `${path}/${nameOf(from)}`)
            },
          },
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
          h('span', { className: 'dsh-wef-name' }, entry.name),
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

        /** 把一个目录的可见内容压平进 `rows`（递归，只走展开着的目录）。 */
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
          if (level.entries.length === 0 && createHere !== dir) {
            rows.push(h('p', { className: 'dsh-wef-note', key: `empty:${dir}` }, t('files.empty')))
          }
          for (const entry of level.entries) {
            const path = `${dir}/${entry.name}`
            if (editor !== null && editor.mode === 'rename' && editor.path === path) {
              rows.push(inputRow(depth, editor))
              continue
            }
            rows.push(rowOf(entry, path, depth))
            if (entry.type === 'directory' && expanded.has(path)) walk(path, depth + 1)
          }
          if (level.truncated) {
            rows.push(h('p', { className: 'dsh-wef-note', key: `truncated:${dir}` }, t('files.truncated')))
          }
        }
        walk(root, 0)

        /** 一个路径是不是目录：根永远是；其余看它父级列表里的那条记录。 */
        const isDirPath = (path) => {
          if (path === root) return true
          const entries = levels[parentOf(path)]?.entries ?? []
          return entries.some((entry) => entry.name === nameOf(path) && entry.type === 'directory')
        }
        // 工具条上的动作落在「选中的是目录 → 它自己；选中的是文件 → 它的父目录」上。
        const targetDir = selected !== null && isDirPath(selected) ? selected : parentOf(selected ?? root)

        return h('div', {
          className: 'dsh-wef-root',
          'data-workspace-editor-files': 'ready',
          'data-workspace-editor-files-root': root,
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
          }, glyph('refresh'))),
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
        h('div', {
          className: 'dsh-wef-body',
          tabIndex: 0,
          'data-drop': dropOn === root ? 'true' : 'false',
          // F2 = 重命名当前选中行（VS Code 的习惯）；Esc 收起一切浮层。输入框里的按键归输入框自己管。
          onKeyDown: (event) => {
            if (event.target?.tagName === 'INPUT') return
            if (event.key === 'F2' && selected !== null && selected !== root) {
              event.preventDefault()
              startRename(selected)
              return
            }
            if (event.key === 'Escape') {
              setMenu(null)
              setEditor(null)
              setPending(null)
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
            setDropOn(null)
            if (from === null) return
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
        menuItem('delete', 'trash', menu.path, t('files.delete'), () => { void armDelete(menu.path, menu.type) }, false, true)),
        busy !== null && h('p', { className: 'dsh-wef-status', 'data-workspace-editor-files-busy': '' }, t('files.busy')))
      }

      return { FilesPanel, FilesTree }
    }

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
    }

    return { name: 'workspace-editor', inject, apply }
  },
})
