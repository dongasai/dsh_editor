/**
 * @module @local/dsh-editor
 *
 * **工作区文件编辑器 —— Host 半边**：给 Web GUI 提供唯一一条「写工作区文件」的入口，
 * 浏览器那半边（`./client.js`）在右侧栏的文件预览里渲染一个可编辑、可保存的正文。
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
 * 2. **写入必须同时过三道闸**：Connection 信任围栏 → 会话工作区包含性检查
 *    （`ctx.fs.contains(会话根, 目标)`，越界一律 403）→ `ctx.fs` 自身的沙箱策略围栏
 *    （显式传入 `ctx.sandboxPolicy.resolve({ session })`，`read-only` 会话照样拒绝）。
 *    三道闸任一被绕过都是安全回归，不要为了「方便保存」放宽其中任何一道。
 * 3. **写入带版本闸**：客户端把「读到的版本」作为 `expectedVersion` 送上来，Host 用
 *    `{ kind: 'replaceIfVersion' }` 写入；磁盘在编辑期间变过就返回 `stale-version`，
 *    由用户显式选择「覆盖保存」。不传 `expectedVersion` 才是无条件覆盖（用户点过覆盖）。
 * 4. **不改观察状态**：这里刻意**不** `emit('fs/observed', …)`。FS 观察策略要求 `edit`
 *    前必须读过文件，人工在 GUI 里改过的文件对模型来说就是「没读过」——模型应当重新
 *    `read` 之后再改，这是正确的语义，别用一条 emit 把它「喂」成已观察。
 */

import { Buffer } from 'node:buffer'

/** 写文件路由的路径；与客户端半边拼出的 URL 必须逐字一致。 */
const WRITE_PATH = '/workspace-editor/write'

/** 一次保存的请求体上限（字节）。 */
const MAX_BODY_BYTES = 8 * 1024 * 1024

/** 单次写入的文本上限（UTF-16 码元）。 */
const MAX_CONTENT_CHARS = 4 * 1024 * 1024

/** 单次写入的墙钟上限：文件系统迟迟不返回时不让请求无限挂着。 */
const WRITE_TIMEOUT_MS = 30 * 1000

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

/** Cordis 插件名（Loader 诊断用）。 */
export const name = 'workspace-editor'

/** 硬依赖：路由载体、信任围栏、组合文件系统、沙箱策略与会话存储。 */
export const inject = ['webServer', 'connection', 'fs', 'sandboxPolicy', 'sessions']

/**
 * Host 插件正文：注册唯一一条写路由。
 * @param ctx - Host 上下文；注册是 effect，随插件卸载一起撤销。
 * @returns 无。
 */
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: WRITE_PATH,
    handler: (req, res) => route(ctx, req, res),
  }), `workspace-editor: POST ${WRITE_PATH}`)
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
 * 一条写路由的完整生命周期：围栏 → 请求校验 → 落盘 → 应答。
 * @param ctx - Host 上下文。
 * @param req - 传入请求。
 * @param res - 应答对象。
 * @returns 应答写完即返回。
 */
async function route(ctx, req, res) {
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
    input = parseWriteRequest(await readBody(req))
  } catch (error) {
    sendFailure(res, error, ctx)
    return
  }

  try {
    const outcome = await writeWorkspaceFile(ctx, input, signal)
    if (signal.aborted || res.writableEnded) return
    sendJson(res, 200, outcome)
  } catch (error) {
    if (res.writableEnded) return
    sendFailure(res, error, ctx)
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
 * 本次写入的取消信号：客户端断连，或超出墙钟上限。
 * @param req - 传入请求（这里只用来读 socket 生命周期）。
 * @param res - 应答对象；只有「应答没写完就断开」才算客户端走了。
 * @returns 组合后的取消信号。
 */
function requestLifetime(req, res) {
  const disconnect = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) disconnect.abort(new Error('client disconnected'))
  })
  return AbortSignal.any([disconnect.signal, AbortSignal.timeout(WRITE_TIMEOUT_MS)])
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
 * @returns 无。
 */
function sendFailure(res, error, ctx) {
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
  sendJson(res, 500, { code: 'write-failed', message: messageOf(error) })
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
