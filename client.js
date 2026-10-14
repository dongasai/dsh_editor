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

    /** 删除文件路由；与 Host 半边注册的绝对路径逐字一致。 */
    const DELETE_URL = '/workspace-editor/delete'

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
.dsh-we-banner-text{flex:1 1 auto;white-space:normal;overflow-wrap:anywhere}
.dsh-we-detail{color:var(--dsw-alias-label-secondary)}
.dsh-we-editor{flex:1 1 auto;min-height:0;width:100%;box-sizing:border-box;margin:0;padding:8px 10px;border:none;outline:none;resize:none;background:transparent;color:inherit;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:inherit;line-height:1.6;tab-size:2;white-space:pre;overflow:auto}
.dsh-we-editor[data-wrap="true"]{white-space:pre-wrap;overflow-wrap:anywhere}
.dsh-we-message{flex:1 1 auto;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:12px;padding:16px 20px;text-align:center;color:var(--dsw-alias-label-secondary);line-height:1.6;white-space:normal}
.dsh-we-message-text{margin:0;overflow-wrap:anywhere}
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
      'delete.stale': '文件已变更，未删除',
      'delete.noVersion': '读不到文件状态',
      'conflict.stale': '磁盘上的文件在编辑期间变过，尚未覆盖。',
      'conflict.exists': '文件已存在，没有覆盖。',
      'conflict.message': '磁盘上的文件已被改动（可能是模型或其它工具改的），直接保存会覆盖对方的修改。',
      'changed.message': '磁盘上的文件已被改动。你的未保存修改还留着，不会被覆盖。',
      'hint.save': 'Ctrl/Cmd+S 保存',
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
      'delete.stale': 'File changed, not deleted',
      'delete.noVersion': 'File state unavailable',
      'conflict.stale': 'The file changed on disk while you were editing; nothing was overwritten.',
      'conflict.exists': 'The file already exists; nothing was overwritten.',
      'conflict.message': 'The file changed on disk (the agent or another tool may have written it). Saving now would overwrite those changes.',
      'changed.message': 'The file changed on disk. Your unsaved text is kept and will not be overwritten.',
      'hint.save': 'Ctrl/Cmd+S to save',
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
     * 造出本插件的三个组件（闭包持有客户端上下文，Remote 读接口在这里取）。
     * @param ctx - 客户端根上下文。
     * @returns 文档渲染器正文、页签正文、预览头部的「编辑」按钮。
     */
    function createEditor(ctx) {
      /**
       * 共用的可编辑正文：读盘、草稿、版本闸、冲突处理都在这里。
       * @param props - `{ t, sessionId, path, wrap, onToggleWrap, scrollportRef, reloadKey, variant, onLoaded, onFailed }`。
       * @returns 编辑区、状态条与横幅。
       */
      function EditorSurface(props) {
        const { t, sessionId, path, wrap, onToggleWrap, scrollportRef, reloadKey, variant, onLoaded, onFailed } = props
        const storageKey = `${sessionId}\u0000${path}`
        const [doc, setDoc] = React.useState({ phase: 'loading' })
        const [draft, setDraft] = React.useState('')
        const [save, setSave] = React.useState({ phase: 'idle' })
        const [conflict, setConflict] = React.useState(null)
        const [changed, setChanged] = React.useState(false)
        const [token, setToken] = React.useState(0)

        const draftRef = React.useRef(draft)
        draftRef.current = draft
        const docRef = React.useRef(doc)
        docRef.current = doc
        const dirtyRef = React.useRef(false)
        dirtyRef.current = doc.phase === 'ready' && draft !== doc.text
        const savingRef = React.useRef(false)

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

        // 「已保存」提示只亮一会儿。
        React.useEffect(() => {
          if (save.phase !== 'saved') return undefined
          const timer = setTimeout(() => { setSave({ phase: 'idle' }) }, 2500)
          return () => { clearTimeout(timer) }
        }, [save.phase])

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

        /** Ctrl/Cmd+S 保存。 */
        const onKeyDown = (event) => {
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
          onKeyDown,
        }))
      }

      /**
       * 文档渲染器正文（入口 1 / 2）：从资源地址取出会话与路径，把 owner 的
       * `content.loaded/failed` 接上。
       * @param props - 文档正文槽位交来的 props。
       * @returns 编辑器正文，或地址不可用时的说明。
       */
      function DocumentBody(props) {
        const { resourceAddress, content, wrap, scrollportRef, t } = props
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
        })
      }

      /**
       * 编辑器页签正文（入口 3）：目标来自打开时带的 `navigation.params`，没有参数时
       * 回落到解析地址里的绝对路径。
       * @param props - 页签正文槽位交来的 props。
       * @returns 编辑器正文，或目标不可用时的说明。
       */
      function PaneBody(props) {
        const { useTabInfo, sessionId, t } = props
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

    /**
     * 客户端插件正文：注册两档文档渲染器、编辑器页签类型与预览头部的「编辑」按钮。
     * @param ctx - 客户端根上下文。
     * @returns 无。
     */
    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      const { DocumentBody, PaneBody, EditAction, DeleteAction } = createEditor(ctx)
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
    }

    return { name: 'workspace-editor', inject, apply }
  },
})
