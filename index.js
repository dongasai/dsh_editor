/**
 * @module @dongasai/dsh-editor
 *
 * **工作区文件编辑器 —— Host 半边**：给 Web GUI 提供六条工作区文件变更入口，浏览器那半边
 * （`./client.js`）在右侧栏的文件预览里渲染可编辑、可保存的正文，提供预览头部的「删除」按钮，
 * 并注册一个自带文件树的「文件编辑」工具面板。
 *
 * ## 六条路由
 *
 * - `POST /workspace-editor/write`：带版本闸的整文件写入（新建文件也走它，`mode: 'create'`）。
 * - `POST /workspace-editor/delete`：带版本闸的删除，支持文件、空目录（`rmdir`）与非空目录
 *   （`recursive: true` 才递归）。
 * - `POST /workspace-editor/mkdir`：新建单个目录（不递归建父级）。
 * - `POST /workspace-editor/rename`：重命名 / 移动（文件与目录同一套；目标必须不存在）。
 * - `POST /workspace-editor/copy`：复制文件（`COPYFILE_EXCL`，目标已存在就拒绝）。
 * - `POST /workspace-editor/upload`：把一段 base64 字节写成**新文件**（面板里粘贴系统剪贴板里的
 *   文件走它；目标必须不存在，`wx` 排他）。
 *
 * 后五条都落到 `node:fs`：`ctx.fs` 的变更面只有 `writeText` / `editText`，**没有删除、改名、
 * 新建目录、复制或写二进制的接口**。代价是 `ctx.fs` 自身的沙箱策略围栏不再自动生效，必须由本模块
 * 按同一份 `ctx.sandboxPolicy.resolve(...)` 显式补上（见约束 2）。
 *
 * ## 为什么要自己开一条 HTTP 路由
 *
 * 官方的 `@deepseek-ai/dsh-api-workspace-files` 是**只读**的
 * （"The service exposes no mutation operation."），而新增一个 Typert Remote 命名空间需要
 * 构建期生成的 `InvocationDescriptor`（客户端 `ctx.remote.$mount()` 只接受生成物），
 * 插件以 `link:` 方式装进 profile、没有构建步骤，走不通。
 * 因此这里采用官方 `dsh-host-open-in-app` 对「UI 动作需要 Host 能力」时的同款做法：
 * `ctx.webServer.register()` 注册一条精确路由，用 **Connection 的信任围栏**
 * （`ctx.connection.requestRejection(req)`：可信 Host/Origin 检查 + 浏览器认证）挡住一切
 * 非本机认证页面发来的请求。路由只发 JSON、只写文件，不返回任何可浏览的文档。
 *
 * ## 四条实现约束（改代码时别踩）
 *
 * 1. 本模块**只 import `node:` 内置模块**。插件包以 `link:` 装进 profile，模块真实路径在插件
 *    仓库内，`@deepseek-ai/*` 这类裸包名从这里解析不到（同 `@local/dsh-mcp-json` 的约束 1）；
 *    FsError 等类型改为按 `error.code` 结构化判别，不 import 官方包，也不导出 `Config`
 *    （那需要 schemastery）。
 * 2. **变更必须过三道闸**：Connection 信任围栏 → 会话工作区包含性检查
 *    （`ctx.fs.contains(会话根, 目标)`，越界一律 403）→ 沙箱策略围栏
 *    （`ctx.sandboxPolicy.resolve({ session })`，`read-only` 会话照样拒绝）。写路径的第三道闸
 *    由 `ctx.fs.writeText` 自己执行；**其余五条没有这层自动保护**（`node:fs` 绕过了 `ctx.fs`），
 *    必须走 `guardMutation()` 按 `policy.mode === 'read-only'` 自己拒绝。三道闸任一被绕过都是
 *    安全回归，不要为了「方便保存 / 方便删除」放宽其中任何一道。
 * 3. **破坏性变更都带版本闸**：写用 `{ kind: 'replaceIfVersion' }`、删在落盘前逐字比对同一个
 *    版本令牌（`expectedVersion` 来自客户端「看到的那一份」），对不上就返回 `stale-version`，
 *    由用户显式选择「覆盖保存」/「仍然删除」。改名、复制与粘贴上传不带版本闸 —— 它们防的是
 *    另一件事：**目标必须不存在**（改名预检 + 复制用 `COPYFILE_EXCL`、粘贴上传用 `writeFile` 的
 *    `wx`，都是内核级排他）。
 * 4. **不改观察状态**：这里刻意**不** `emit('fs/observed', …)`。FS 观察策略要求 `edit`
 *    前必须读过文件，人工在 GUI 里改过的文件对模型来说就是「没读过」——模型应当重新
 *    `read` 之后再改，这是正确的语义，别用一条 emit 把它「喂」成已观察。
 */

import { Buffer } from 'node:buffer'
import { constants as fsConstants } from 'node:fs'
import { copyFile, mkdir as makeDir, rename as renamePath, rm, rmdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative } from 'node:path'

/** 写文件路由的路径；与客户端半边拼出的 URL 必须逐字一致。 */
const WRITE_PATH = '/workspace-editor/write'

/** 删除条目（文件 / 目录）路由的路径；与客户端半边拼出的 URL 必须逐字一致。 */
const DELETE_PATH = '/workspace-editor/delete'

/** 新建目录路由的路径；与客户端半边拼出的 URL 必须逐字一致。 */
const MKDIR_PATH = '/workspace-editor/mkdir'

/** 重命名 / 移动路由的路径；与客户端半边拼出的 URL 必须逐字一致。 */
const RENAME_PATH = '/workspace-editor/rename'

/** 复制文件路由的路径；与客户端半边拼出的 URL 必须逐字一致。 */
const COPY_PATH = '/workspace-editor/copy'

/** 粘贴上传（base64 → 新文件）路由的路径；与客户端半边拼出的 URL 必须逐字一致。 */
const UPLOAD_PATH = '/workspace-editor/upload'

/** 一次保存的请求体上限（字节）。 */
const MAX_BODY_BYTES = 8 * 1024 * 1024

/** 单次写入的文本上限（UTF-16 码元）。 */
const MAX_CONTENT_CHARS = 4 * 1024 * 1024

/** 单次粘贴上传的字节上限（解码后）。 */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

/**
 * 粘贴上传的 base64 字段长度上限：4 MiB 字节编码后是 `ceil(4 MiB / 3) * 4`，先按字面量拦一道，
 * 免得为了一次必然超限的请求把几 MB 的字符串解出来。
 */
const MAX_UPLOAD_BASE64_CHARS = Math.ceil(MAX_UPLOAD_BYTES / 3) * 4

/**
 * 合法 base64：整块四字符、结尾一段可带 `=` 填充。**不接受**空白与 URL-safe 变体 ——
 * 客户端由 `btoa` 产出，格式唯一，宽松解析只会把「客户端发错了」变成「写了一个乱码文件」。
 *
 * 刻意**不用正则**：`/^(?:[A-Za-z0-9+/]{4})*…$/` 这种大量词在 5.6 MB 的字符串上会把 V8 的
 * regexp 栈撑爆（抛 `RangeError: Maximum call stack size exceeded`，被 500 兜住 —— 探针里真
 * 踩过：正好 4 MiB 的那条用例）。一次线性扫描没有栈风险，也更快。
 * @param text - 待检查的字符串。
 * @returns 是否是规范 base64。
 */
function isBase64(text) {
  if (text.length % 4 !== 0) return false
  let padding = 0
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code === 61 /* '=' */) {
      padding += 1
      if (padding > 2) return false
      continue
    }
    // `=` 只能出现在结尾：填充开始之后不许再出现别的字符。
    if (padding > 0) return false
    const inAlphabet = (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
      || (code >= 48 && code <= 57) || code === 43 /* '+' */ || code === 47 /* '/' */
    if (!inAlphabet) return false
  }
  return true
}

/** 单次变更请求的墙钟上限：文件系统迟迟不返回时不让请求无限挂着（六条路由共用）。 */
const REQUEST_TIMEOUT_MS = 30 * 1000

/** 结构化 `FsErrorCode` → 线上失败码与 HTTP 状态。按 code 判别，绝不看 message。 */
const FS_FAILURES = {
  FS_STALE_VERSION: { status: 409, code: 'stale-version' },
  FS_NOT_OBSERVED: { status: 409, code: 'not-observed' },
  FS_NOT_FOUND: { status: 404, code: 'not-found' },
  FS_NOT_REGULAR_FILE: { status: 409, code: 'not-regular-file' },
  FS_NOT_DIRECTORY: { status: 409, code: 'not-directory' },
  FS_TOO_LARGE: { status: 413, code: 'too-large' },
  FS_SANDBOX_DENIED: { status: 403, code: 'denied' },
  FS_PERMISSION_DENIED: { status: 403, code: 'denied' },
  FS_NOT_TEXT: { status: 415, code: 'not-text' },
  FS_ABORTED: { status: 408, code: 'aborted' },
  FS_IO_ERROR: { status: 500, code: 'io-error' },
}

/**
 * `node:fs` 的 errno → 线上失败码与 HTTP 状态（删除 / 新建目录 / 改名 / 复制 / 粘贴上传共用）。
 * 表里没有的一律走 500，不猜（同约束 5）。
 */
const NODE_FAILURES = {
  ENOENT: { status: 404, code: 'not-found' },
  ENOTDIR: { status: 409, code: 'not-directory' },
  EISDIR: { status: 409, code: 'not-regular-file' },
  ENOTEMPTY: { status: 409, code: 'not-empty' },
  EEXIST: { status: 409, code: 'target-exists' },
  EINVAL: { status: 409, code: 'invalid-target' },
  EXDEV: { status: 409, code: 'invalid-target' },
  ENAMETOOLONG: { status: 400, code: 'bad-request' },
  EACCES: { status: 403, code: 'denied' },
  EPERM: { status: 403, code: 'denied' },
  EROFS: { status: 403, code: 'denied' },
}

/**
 * 六条变更路由：各自的路径、校验器、落盘实现，以及 500 时用的线上失败码。
 * 路由外壳（围栏 / 方法 / 媒体类型 / 生命周期 / 应答）六份共用。
 */
const ENDPOINTS = [
  { path: WRITE_PATH, failure: 'write-failed', parse: parseWriteRequest, run: writeWorkspaceFile },
  { path: DELETE_PATH, failure: 'delete-failed', parse: parseDeleteRequest, run: deleteWorkspaceEntry },
  { path: MKDIR_PATH, failure: 'mkdir-failed', parse: parseMkdirRequest, run: mkdirWorkspaceEntry },
  { path: RENAME_PATH, failure: 'rename-failed', parse: parseRenameRequest, run: renameWorkspaceEntry },
  { path: COPY_PATH, failure: 'copy-failed', parse: parseCopyRequest, run: copyWorkspaceEntry },
  { path: UPLOAD_PATH, failure: 'upload-failed', parse: parseUploadRequest, run: uploadWorkspaceFile },
]

/** Cordis 插件名（Loader 诊断用）。 */
export const name = 'workspace-editor'

/** 硬依赖：路由载体、信任围栏、组合文件系统、沙箱策略与会话存储。 */
export const inject = ['webServer', 'connection', 'fs', 'sandboxPolicy', 'sessions']

/**
 * Host 插件正文：注册六条变更路由（写 / 删 / 新建目录 / 改名 / 复制 / 粘贴上传）。
 * @param ctx - Host 上下文；注册是 effect，随插件卸载一起撤销。
 * @returns 无。
 */
export function apply(ctx) {
  for (const endpoint of ENDPOINTS) {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: endpoint.path,
      handler: (req, res) => route(ctx, req, res, endpoint),
    }), `workspace-editor: POST ${endpoint.path}`)
  }
}

/**
 * 请求级失败：带 HTTP 状态与线上失败码，`sendFailure` 直接照搬。
 */
class RequestError extends Error {
  /**
   * @param status - HTTP 状态码。
   * @param code - 线上失败码（客户端按它分支）。
   * @param message - 显示给用户的说明。
   */
  constructor(status, code, message) {
    super(message)
    this.name = 'RequestError'
    this.status = status
    this.code = code
  }
}

/**
 * 一条变更路由的完整生命周期：围栏 → 请求校验 → 落盘 → 应答。
 * @param ctx - Host 上下文。
 * @param req - 传入请求。
 * @param res - 应答对象。
 * @param endpoint - 本次请求打到的路由（校验器、落盘实现与 500 失败码）。
 * @returns 应答写完即返回。
 */
async function route(ctx, req, res, endpoint) {
  if (rejected(ctx, req, res)) return
  if (req.method !== 'POST') {
    sendMethodNotAllowed(res, 'POST')
    return
  }
  if (mediaTypeOf(req) !== 'application/json') {
    sendJson(res, 415, { code: 'unsupported-media-type', message: 'content-type must be application/json' })
    return
  }

  const signal = requestLifetime(req, res)
  let input
  try {
    input = endpoint.parse(await readBody(req))
  } catch (error) {
    sendFailure(res, error, ctx, endpoint.failure)
    return
  }

  try {
    const outcome = await endpoint.run(ctx, input, signal)
    if (signal.aborted || res.writableEnded) return
    sendJson(res, 200, outcome)
  } catch (error) {
    if (res.writableEnded) return
    sendFailure(res, error, ctx, endpoint.failure)
  }
}

/**
 * Connection 的信任围栏：不是本机可信 Host/Origin、或浏览器没认证就拒。
 * @param ctx - Host 上下文。
 * @param req - 传入请求。
 * @param res - 应答对象。
 * @returns 已经拒绝并结束应答时为 true。
 */
function rejected(ctx, req, res) {
  const rejection = ctx.connection.requestRejection(req)
  if (rejection === undefined) return false
  res.statusCode = rejection
  res.end()
  return true
}

/**
 * 本次变更的取消信号：客户端断连，或超出墙钟上限。
 * @param req - 传入请求（这里只用来读 socket 生命周期）。
 * @param res - 应答对象；只有「应答没写完就断开」才算客户端走了。
 * @returns 组合后的取消信号。
 */
function requestLifetime(req, res) {
  const disconnect = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) disconnect.abort(new Error('client disconnected'))
  })
  return AbortSignal.any([disconnect.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
}

/**
 * 解析并校验请求体。
 * @param value - 反序列化后的 JSON 值。
 * @returns 校验过的写入意图。
 * @throws {RequestError} 400 —— 任一字段类型不对或超限。
 */
function parseWriteRequest(value) {
  if (!isPlainObject(value)) throw new RequestError(400, 'bad-request', 'body must be a JSON object')
  const sessionId = requireString(value.sessionId, 'sessionId')
  const path = requireString(value.path, 'path')
  if (typeof value.content !== 'string') throw new RequestError(400, 'bad-request', 'content must be a string')
  if (value.content.length > MAX_CONTENT_CHARS) {
    throw new RequestError(413, 'too-large', `content exceeds the ${MAX_CONTENT_CHARS}-character limit`)
  }
  const mode = value.mode === undefined ? 'replace' : value.mode
  if (mode !== 'replace' && mode !== 'create') {
    throw new RequestError(400, 'bad-request', 'mode must be "replace" or "create"')
  }
  const expectedVersion = value.expectedVersion === undefined || value.expectedVersion === null
    ? undefined
    : requireString(value.expectedVersion, 'expectedVersion')
  return { sessionId, path, content: value.content, mode, expectedVersion }
}

/**
 * 解析并校验删除请求体。删除没有正文，只有「删哪个」、可选的版本闸基线与递归开关。
 * @param value - 反序列化后的 JSON 值。
 * @returns 校验过的删除意图。
 * @throws {RequestError} 400 —— 任一字段类型不对。
 */
function parseDeleteRequest(value) {
  if (!isPlainObject(value)) throw new RequestError(400, 'bad-request', 'body must be a JSON object')
  const sessionId = requireString(value.sessionId, 'sessionId')
  const path = requireString(value.path, 'path')
  const expectedVersion = value.expectedVersion === undefined || value.expectedVersion === null
    ? undefined
    : requireString(value.expectedVersion, 'expectedVersion')
  if (value.recursive !== undefined && typeof value.recursive !== 'boolean') {
    throw new RequestError(400, 'bad-request', 'recursive must be a boolean')
  }
  return { sessionId, path, expectedVersion, recursive: value.recursive === true }
}

/**
 * 解析并校验新建目录请求体。
 * @param value - 反序列化后的 JSON 值。
 * @returns 校验过的建目录意图。
 * @throws {RequestError} 400 —— 任一字段类型不对。
 */
function parseMkdirRequest(value) {
  if (!isPlainObject(value)) throw new RequestError(400, 'bad-request', 'body must be a JSON object')
  return { sessionId: requireString(value.sessionId, 'sessionId'), path: requireString(value.path, 'path') }
}

/**
 * 解析并校验改名 / 移动请求体。
 * @param value - 反序列化后的 JSON 值。
 * @returns 校验过的改名意图（源与目标）。
 * @throws {RequestError} 400 —— 任一字段类型不对。
 */
function parseRenameRequest(value) {
  if (!isPlainObject(value)) throw new RequestError(400, 'bad-request', 'body must be a JSON object')
  return {
    sessionId: requireString(value.sessionId, 'sessionId'),
    from: requireString(value.from, 'from'),
    to: requireString(value.to, 'to'),
  }
}

/**
 * 解析并校验复制请求体。
 * @param value - 反序列化后的 JSON 值。
 * @returns 校验过的复制意图（源与目标）。
 * @throws {RequestError} 400 —— 任一字段类型不对。
 */
function parseCopyRequest(value) {
  if (!isPlainObject(value)) throw new RequestError(400, 'bad-request', 'body must be a JSON object')
  return {
    sessionId: requireString(value.sessionId, 'sessionId'),
    from: requireString(value.from, 'from'),
    to: requireString(value.to, 'to'),
  }
}

/**
 * 解析并校验「粘贴上传」请求体。
 *
 * 正文走 base64：这条路传的是**任意二进制**（系统剪贴板里的文件可能是图片、压缩包、可执行文件），
 * JSON 里没有更省事的载体。目标一律按「必须不存在」处理 —— 粘贴不是保存，不覆盖任何已有文件；
 * 重名由客户端先编号，真撞车由落盘那一步的 `wx` 拒绝。
 * @param value - 反序列化后的 JSON 值。
 * @returns 校验过的上传意图（目标路径与解码后的字节）。
 * @throws {RequestError} 400 —— 字段类型不对或 base64 非法；413 —— 超过上限。
 */
function parseUploadRequest(value) {
  if (!isPlainObject(value)) throw new RequestError(400, 'bad-request', 'body must be a JSON object')
  const sessionId = requireString(value.sessionId, 'sessionId')
  const path = requireString(value.path, 'path')
  if (typeof value.data !== 'string') throw new RequestError(400, 'bad-request', 'data must be a base64 string')
  if (value.data.length > MAX_UPLOAD_BASE64_CHARS) {
    throw new RequestError(413, 'too-large', `data exceeds the ${MAX_UPLOAD_BYTES}-byte paste limit`)
  }
  if (!isBase64(value.data)) throw new RequestError(400, 'bad-request', 'data must be valid base64')
  const bytes = Buffer.from(value.data, 'base64')
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new RequestError(413, 'too-large', `data exceeds the ${MAX_UPLOAD_BYTES}-byte paste limit`)
  }
  return { sessionId, path, bytes }
}

/**
 * 真正的写操作：会话根 → 目标 → 三道闸 → 带版本闸的原子写。
 * @param ctx - Host 上下文。
 * @param input - 校验过的写入意图。
 * @param signal - 本次调用的取消信号。
 * @returns 线上成功结果（路径、创建/更新、新版本、字节数）。
 * @throws {RequestError | Error} 失败时抛出带 code 的错误，交给 `sendFailure` 映射。
 */
async function writeWorkspaceFile(ctx, input, signal) {
  const { session, workspaceRoot } = await resolveSessionRoot(ctx, input.sessionId, signal)

  // 最终路径不能是目录、符号链接或其它非普通文件：符号链接一律拒绝，避免写穿到工作区外。
  const info = await ctx.fs.lstat(input.path, { cwd: workspaceRoot }, signal)
  if (info !== undefined && info.type !== 'file') {
    throw new RequestError(409, 'not-regular-file', `cannot write "${input.path}": not a regular file (${info.type})`)
  }

  const target = await ctx.fs.resolve(input.path, { cwd: workspaceRoot, signal })
  const rootTarget = await ctx.fs.resolve(workspaceRoot, { signal })
  if (!ctx.fs.contains(rootTarget, target)) {
    throw new RequestError(403, 'outside-workspace', `cannot write "${target.displayPath}": outside the session workspace`)
  }

  const intent = input.mode === 'create'
    ? { kind: 'createIfAbsent' }
    : input.expectedVersion === undefined
      ? undefined
      : { kind: 'replaceIfVersion', version: input.expectedVersion }
  const policy = session === undefined ? ctx.sandboxPolicy.resolve() : ctx.sandboxPolicy.resolve({ session })
  const outcome = await ctx.fs.writeText(target, input.content, intent, signal, policy)
  return {
    ok: true,
    path: target.displayPath,
    operation: outcome.operation,
    version: outcome.version,
    bytes: Buffer.byteLength(input.content, 'utf8'),
  }
}

/**
 * 真正的删除：会话根 → 目标 → 三道闸 → 版本闸 → `unlink` / `rmdir` / `rm -r`。
 *
 * 与写路径的差别有两处：第三道闸要自己执行（`node:fs` 不经过 `ctx.fs`，它那层沙箱围栏不会
 * 自动生效），以及删除之前要拿同一个版本令牌比对一次。目录默认只删空的（`rmdir` 的
 * `ENOTEMPTY` 会被翻成 409 `not-empty`）；要连同内容一起删，客户端必须显式送
 * `recursive: true` —— 那是用户在面板里点过「递归删除」之后的事。
 * @param ctx - Host 上下文。
 * @param input - 校验过的删除意图。
 * @param signal - 本次调用的取消信号。
 * @returns 线上成功结果（被删掉的路径）。
 * @throws {RequestError | Error} 失败时抛出带 code 的错误，交给 `sendFailure` 映射。
 */
async function deleteWorkspaceEntry(ctx, input, signal) {
  const { workspaceRoot, target } = await guardMutation(ctx, input.sessionId, input.path, signal)

  // 先看路径本身：符号链接一律拒绝（不跟着删到工作区外），目录与普通文件之外的类型也拒绝。
  const info = await entryNoFollow(ctx, input.path, workspaceRoot, signal)
  if (info === undefined) {
    throw new RequestError(404, 'not-found', `cannot delete "${input.path}": no such entry`)
  }
  if (info.type !== 'file' && info.type !== 'directory') {
    throw new RequestError(409, 'not-regular-file', `cannot delete "${input.path}": not a file or directory (${info.type})`)
  }

  // 版本闸：与写路径同一个版本令牌；客户端送来「确认删除时看到的那一份」，对不上就停。
  // 目录的版本令牌只看它自己的直接条目（mtime/ctime），所以它盖住「目录里刚多了/少了东西」，
  // 盖不住「某个子目录内部被改了」——递归删除的残留风险写在 IMPLEMENTATION.md 里。
  const current = await ctx.fs.stat(target, signal)
  if (current === undefined) {
    throw new RequestError(404, 'not-found', `cannot delete "${target.displayPath}": no such entry`)
  }
  if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) {
    throw new RequestError(409, 'stale-version', `cannot delete "${target.displayPath}": the entry changed since it was read`)
  }

  await removeEntry(target.displayPath, ctx.fs.processPath(target), info.type === 'directory', input.recursive)
  return { ok: true, path: target.displayPath, operation: 'delete' }
}

/**
 * 新建单个目录（不递归建父级：父级不存在就 404，父级不是目录就 409）。
 * @param ctx - Host 上下文。
 * @param input - 校验过的建目录意图。
 * @param signal - 本次调用的取消信号。
 * @returns 线上成功结果（新目录路径）。
 * @throws {RequestError | Error} 失败时抛出带 code 的错误，交给 `sendFailure` 映射。
 */
async function mkdirWorkspaceEntry(ctx, input, signal) {
  const { workspaceRoot, target } = await guardMutation(ctx, input.sessionId, input.path, signal)

  const existing = await entryNoFollow(ctx, input.path, workspaceRoot, signal)
  if (existing !== undefined) {
    throw new RequestError(409, 'target-exists', `cannot create "${input.path}": it already exists (${existing.type})`)
  }
  await requireParentDirectory(ctx, input.path, workspaceRoot, signal)
  await makeEntryDirectory(target.displayPath, ctx.fs.processPath(target))
  return { ok: true, path: target.displayPath, operation: 'mkdir' }
}

/**
 * 重命名 / 移动一个文件或目录：源必须存在（且不是符号链接），目标必须不存在，两侧都在工作区内。
 *
 * 刻意**不带版本闸**：改名不改内容，用户点它的意思是「把这个名字换成那个名字」；真正要防的是
 * 「把别人的文件顶掉」，所以这里卡的是「目标必须不存在」。`fs.rename` 本身会覆盖已存在的目标，
 * 预检与它之间那个毫秒级窗口与删除同源，写在 IMPLEMENTATION.md 里。
 * @param ctx - Host 上下文。
 * @param input - 校验过的改名意图。
 * @param signal - 本次调用的取消信号。
 * @returns 线上成功结果（源与目标路径）。
 * @throws {RequestError | Error} 失败时抛出带 code 的错误，交给 `sendFailure` 映射。
 */
async function renameWorkspaceEntry(ctx, input, signal) {
  const from = await guardMutation(ctx, input.sessionId, input.from, signal)
  const info = await entryNoFollow(ctx, input.from, from.workspaceRoot, signal)
  if (info === undefined) {
    throw new RequestError(404, 'not-found', `cannot rename "${input.from}": no such entry`)
  }
  if (info.type !== 'file' && info.type !== 'directory') {
    throw new RequestError(409, 'not-regular-file', `cannot rename "${input.from}": not a file or directory (${info.type})`)
  }

  const to = await guardMutation(ctx, input.sessionId, input.to, signal)
  if (from.target.targetKey === to.target.targetKey) {
    throw new RequestError(409, 'invalid-target', `"${input.from}" and "${input.to}" are the same path`)
  }
  // 目录不能搬进自己的子树（`rename` 会给出 EINVAL，这里先判一次好给出人话）。
  const inside = relative(from.target.targetKey, to.target.targetKey)
  if (info.type === 'directory' && inside !== '' && !inside.startsWith('..') && !isAbsolute(inside)) {
    throw new RequestError(409, 'invalid-target', `cannot move "${input.from}" into itself`)
  }
  const existing = await entryNoFollow(ctx, input.to, to.workspaceRoot, signal)
  if (existing !== undefined) {
    throw new RequestError(409, 'target-exists', `cannot rename to "${input.to}": it already exists (${existing.type})`)
  }
  await requireParentDirectory(ctx, input.to, to.workspaceRoot, signal)
  await moveEntry(from.target.displayPath, from.target.targetKey, to.target.targetKey)
  return { ok: true, from: from.target.displayPath, to: to.target.displayPath, operation: 'rename' }
}

/**
 * 复制一个文件（目录不支持：递归复制没有确认 UI 承载，也不在这次的范围里）。
 *
 * 目标用 `COPYFILE_EXCL` 写：预检之外再叠一道**原子**的排他，目标已存在时由内核直接 EEXIST，
 * 不存在「检查完到写入之间被别人抢先」的窗口（这是复制比改名严格的地方）。
 * @param ctx - Host 上下文。
 * @param input - 校验过的复制意图。
 * @param signal - 本次调用的取消信号。
 * @returns 线上成功结果（源与目标路径）。
 * @throws {RequestError | Error} 失败时抛出带 code 的错误，交给 `sendFailure` 映射。
 */
async function copyWorkspaceEntry(ctx, input, signal) {
  const from = await guardMutation(ctx, input.sessionId, input.from, signal)
  const info = await entryNoFollow(ctx, input.from, from.workspaceRoot, signal)
  if (info === undefined) {
    throw new RequestError(404, 'not-found', `cannot copy "${input.from}": no such entry`)
  }
  if (info.type !== 'file') {
    throw new RequestError(409, 'not-regular-file', `cannot copy "${input.from}": not a regular file (${info.type})`)
  }

  const to = await guardMutation(ctx, input.sessionId, input.to, signal)
  if (from.target.targetKey === to.target.targetKey) {
    throw new RequestError(409, 'invalid-target', `"${input.from}" and "${input.to}" are the same path`)
  }
  await requireParentDirectory(ctx, input.to, to.workspaceRoot, signal)
  await copyEntry(from.target.displayPath, from.target.targetKey, to.target.targetKey)
  return { ok: true, from: from.target.displayPath, to: to.target.displayPath, operation: 'copy' }
}

/**
 * 把一段二进制写成工作区里的**新文件**（面板里「粘贴系统剪贴板里的文件」走它）。
 *
 * 与写路径的关系：同一套三道闸，但目标**必须不存在** —— `writeFile` 的 `wx` 是内核级排他，
 * 与复制的 `COPYFILE_EXCL` 同一性质，不存在「检查完到写入之间被别人抢先」的窗口。粘贴不是保存，
 * 所以这里没有版本闸、也不接受 `expectedVersion`。
 *
 * `ctx.fs.writeText` 只收文本（而且它会按文本编码校验 / 转换），二进制只能走 `node:fs`；因此
 * 第三道闸（沙箱策略）必须由 `guardMutation()` 自己执行，与删除 / 改名 / 新建目录 / 复制同一个
 * 前置 —— 这一步不是可选的。
 * @param ctx - Host 上下文。
 * @param input - 校验过的上传意图。
 * @param signal - 本次调用的取消信号。
 * @returns 线上成功结果（路径、字节数）。
 * @throws {RequestError | Error} 失败时抛出带 code 的错误，交给 `sendFailure` 映射。
 */
async function uploadWorkspaceFile(ctx, input, signal) {
  const { workspaceRoot, target } = await guardMutation(ctx, input.sessionId, input.path, signal)

  const existing = await entryNoFollow(ctx, input.path, workspaceRoot, signal)
  if (existing !== undefined) {
    throw new RequestError(409, 'target-exists', `cannot paste "${input.path}": it already exists (${existing.type})`)
  }
  await requireParentDirectory(ctx, input.path, workspaceRoot, signal)
  await writeEntry(target.displayPath, ctx.fs.processPath(target), input.bytes)
  return { ok: true, path: target.displayPath, operation: 'upload', bytes: input.bytes.byteLength }
}

/**
 * 变更目标的公共前置：会话根 → 路径围栏 → 沙箱策略。
 *
 * 走 `node:fs` 的五条路由都从这里过：写路径把策略交给 `ctx.fs.writeText` 自己判，这五条没有
 * 那层自动保护，所以「解析同一份 `ctx.sandboxPolicy.resolve({ session })` 并拒绝 `read-only`」
 * 必须由这里执行 —— 这是补回被绕过的那道闸，不是额外加的一层。
 * @param ctx - Host 上下文。
 * @param sessionId - 请求里的会话标识。
 * @param path - 相对工作区根或绝对的路径。
 * @param signal - 取消信号。
 * @returns 工作区根与该路径解析出的目标。
 * @throws {RequestError} 403 —— 目标不在会话工作区内，或会话沙箱是 `read-only`。
 */
async function guardMutation(ctx, sessionId, path, signal) {
  const { session, workspaceRoot } = await resolveSessionRoot(ctx, sessionId, signal)
  const target = await ctx.fs.resolve(path, { cwd: workspaceRoot, signal })
  const rootTarget = await ctx.fs.resolve(workspaceRoot, { signal })
  if (!ctx.fs.contains(rootTarget, target)) {
    throw new RequestError(403, 'outside-workspace', `"${target.displayPath}" is outside the session workspace`)
  }
  const policy = session === undefined ? ctx.sandboxPolicy.resolve() : ctx.sandboxPolicy.resolve({ session })
  if (policy.mode === 'read-only') {
    throw new RequestError(403, 'denied', `cannot change "${target.displayPath}": the session sandbox is read-only`)
  }
  return { workspaceRoot, target }
}

/**
 * 读一次路径条目，并拒绝符号链接 —— 删除 / 改名 / 复制都不跟软链，否则会穿到工作区外。
 * @param ctx - Host 上下文。
 * @param path - 待查的路径。
 * @param workspaceRoot - 相对路径的基准。
 * @param signal - 取消信号。
 * @returns `lstat` 结果（`undefined` 表示不存在），调用方自己判类型。
 * @throws {RequestError} 409 —— 该路径本身是符号链接。
 */
async function entryNoFollow(ctx, path, workspaceRoot, signal) {
  const info = await ctx.fs.lstat(path, { cwd: workspaceRoot }, signal)
  if (info !== undefined && info.type === 'symlink') {
    throw new RequestError(409, 'not-regular-file', `"${path}" is a symbolic link`)
  }
  return info
}

/**
 * 目标路径的父级必须已经存在且是目录（新建 / 改名 / 复制都不递归造中间层）。
 * @param ctx - Host 上下文。
 * @param path - 目标路径。
 * @param workspaceRoot - 相对路径的基准。
 * @param signal - 取消信号。
 * @returns 无。
 * @throws {RequestError} 404 / 409 —— 父级不存在、或不是目录。
 */
async function requireParentDirectory(ctx, path, workspaceRoot, signal) {
  const parent = dirname(path)
  if (parent === '' || parent === '.' || parent === path) return
  const info = await ctx.fs.lstat(parent, { cwd: workspaceRoot }, signal)
  if (info === undefined) {
    throw new RequestError(404, 'not-found', `cannot use "${path}": the parent directory does not exist`)
  }
  if (info.type !== 'directory') {
    throw new RequestError(409, 'not-directory', `cannot use "${path}": the parent is not a directory (${info.type})`)
  }
}

/**
 * `node:fs` 侧的实际删除：普通文件 `unlink`、目录 `rmdir` 或 `rm -r`。
 * @param displayPath - 给人看的路径（错误消息用）。
 * @param absolutePath - 执行世界的绝对路径。
 * @param directory - 目标是目录时为 true。
 * @param recursive - 目录是否连内容一起删（用户已经点过「递归删除」）。
 * @returns 删除完成即返回。
 * @throws {RequestError | Error} 已映射的 errno 抛 `RequestError`，其余抛原错误。
 */
async function removeEntry(displayPath, absolutePath, directory, recursive) {
  try {
    if (!directory) await unlink(absolutePath)
    else if (recursive) await rm(absolutePath, { recursive: true })
    else await rmdir(absolutePath)
  } catch (error) {
    throw nodeFailure(error, 'cannot delete', displayPath)
  }
}

/** 新建目录；EEXIST 由 `NODE_FAILURES` 翻成 409 `target-exists`。 */
async function makeEntryDirectory(displayPath, absolutePath) {
  try {
    await makeDir(absolutePath)
  } catch (error) {
    throw nodeFailure(error, 'cannot create', displayPath)
  }
}

/** 重命名 / 移动；覆盖已存在目标的风险由调用方的预检 + 文档承担。 */
async function moveEntry(displayPath, absolutePath, destination) {
  try {
    await renamePath(absolutePath, destination)
  } catch (error) {
    throw nodeFailure(error, 'cannot rename', displayPath)
  }
}

/** 复制文件；`COPYFILE_EXCL` 保证「目标已存在」是内核级拒绝，不是预检。 */
async function copyEntry(displayPath, absolutePath, destination) {
  try {
    await copyFile(absolutePath, destination, fsConstants.COPYFILE_EXCL)
  } catch (error) {
    throw nodeFailure(error, 'cannot copy', displayPath)
  }
}

/**
 * 写一个新文件（粘贴上传）；`wx` 保证「目标已存在」是内核级拒绝，同复制那条的性质。
 *
 * 只给 `flag`，不指定 `mode`：新建文件沿用进程 umask 的默认权限，与 `ctx.fs.writeText` 新建
 * 文件的口径一致，不在这里自造一套权限。
 */
async function writeEntry(displayPath, absolutePath, bytes) {
  try {
    await writeFile(absolutePath, bytes, { flag: 'wx' })
  } catch (error) {
    throw nodeFailure(error, 'cannot write', displayPath)
  }
}

/**
 * `node:fs` 的 errno 翻译成线上失败码。
 *
 * 这五条路由是本插件唯一不走 `ctx.fs` 的变更，抛出来的是 Node 的 `Error`（`code: 'ENOENT'`
 * 这类）而不是 `FsError`，所以在这里翻成与 `FS_FAILURES` 同一套线上码；表里没有的一律 500。
 * @param error - `node:fs` 抛出的值。
 * @param verb - 失败动作（拼错误消息用）。
 * @param displayPath - 给人看的路径。
 * @returns 已映射的 `RequestError`，或原错误（交给 500 分支）。
 */
function nodeFailure(error, verb, displayPath) {
  const errno = typeof error?.code === 'string' ? error.code : undefined
  const mapped = errno === undefined ? undefined : NODE_FAILURES[errno]
  const message = `${verb} "${displayPath}": ${messageOf(error)}`
  return mapped === undefined ? new Error(message, { cause: error }) : new RequestError(mapped.status, mapped.code, message)
}

/**
 * 用会话身份解析工作区根：活会话读内存头，冷会话读持久化头，都没有就拒绝。
 * @param ctx - Host 上下文。
 * @param sessionId - 请求里的会话标识。
 * @param signal - 取消信号。
 * @returns 活会话（可能为 undefined）与工作区根。
 * @throws {RequestError} 404 —— 这个 Host 既没有活会话也没有存档头。
 */
async function resolveSessionRoot(ctx, sessionId, signal) {
  const session = ctx.sessions.get(sessionId)
  let cwd = session?.header?.cwd
  if (cwd === undefined) {
    const stored = await ctx.get('sessionPersistence')?.stat(sessionId, { signal })
    cwd = stored?.header?.cwd
  }
  if (session === undefined && cwd === undefined) {
    throw new RequestError(404, 'unknown-session', `no session "${sessionId}" in this host`)
  }
  return { session, workspaceRoot: cwd ?? ctx.sandboxPolicy.workspaceRoot }
}

/**
 * 有界读取请求体。
 * @param req - 传入请求。
 * @returns 请求体文本。
 * @throws {RequestError} 400（非 UTF-8 JSON）或 413（超限，流已排空）。
 */
async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.byteLength
    if (size > MAX_BODY_BYTES) {
      req.resume()
      throw new RequestError(413, 'too-large', `request body exceeds the ${MAX_BODY_BYTES}-byte limit`)
    }
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks, size).toString('utf8')
  try {
    return JSON.parse(text)
  } catch {
    throw new RequestError(400, 'bad-request', 'body must be valid JSON')
  }
}

/**
 * 失败应答：已知的请求/文件系统失败照搬其码与状态，其余按 500 记录日志。
 * @param res - 应答对象。
 * @param error - 捕获到的值。
 * @param ctx - Host 上下文（打日志用）。
 * @param fallbackCode - 500 时用的线上失败码（写 `write-failed`、删 `delete-failed`、
 *   粘贴上传 `upload-failed` 等，见 `ENDPOINTS`）。
 * @returns 无。
 */
function sendFailure(res, error, ctx, fallbackCode) {
  if (error instanceof RequestError) {
    sendJson(res, error.status, { code: error.code, message: error.message })
    return
  }
  const fsCode = typeof error?.code === 'string' ? error.code : undefined
  const mapped = fsCode === undefined ? undefined : FS_FAILURES[fsCode]
  if (mapped !== undefined) {
    sendJson(res, mapped.status, { code: mapped.code, message: messageOf(error), fsCode })
    return
  }
  ctx.logger.error(error)
  sendJson(res, 500, { code: fallbackCode, message: messageOf(error) })
}

/** JSON 应答（no-store：读写结果是即时事实）。 */
function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

/** 405 并声明唯一支持的方法。 */
function sendMethodNotAllowed(res, allow) {
  res.statusCode = 405
  res.setHeader('allow', allow)
  res.end()
}

/** 请求体的媒体类型（小写、去参数）。 */
function mediaTypeOf(req) {
  return String(req.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase()
}

/** 取错误消息文本。 */
function messageOf(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

/** 非空字符串字段校验。 */
function requireString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new RequestError(400, 'bad-request', `${field} must be a non-empty string`)
  }
  return value
}

/** 普通对象判别（数组、null 都不算）。 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
