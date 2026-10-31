/**
 * 打包脚本：把 src/client.js 用 esbuild 编成单 IIFE 产物 client.js。
 *
 * 为什么这么编（约束 25）：宿主 `@deepseek-ai/dsh-client-modules` 的 `buildComboScript`
 * 把 profile 里**所有** client bundle 的源码直接拼成一个 classic script
 * （`source += resource.source + ';\n'`），**不按包加作用域隔离**。所以产物必须是
 * **单个 IIFE**、顶层无 const 泄漏 —— esbuild `format: 'iife'` 包一层正好满足。
 *
 * `banner: { js: ';' }` 是防拼接串号：上一个 bundle 结尾若是表达式，没这层 `;`
 * 会与本 IIFE 的 `(() => {…})()` 黏成一起被当成函数调用。原手写 client.js 第 115
 * 行 `;(() => {` 那个前置分号就是同一个防御，这里由 esbuild 统一加。
 *
 * 跑法：node scripts/build-client.mjs  （或 `npm run build`）
 */
import { build } from 'esbuild'

const result = await build({
  entryPoints: ['src/client.js'],
  bundle: true,
  format: 'iife',
  outfile: 'client.js',
  target: ['es2020'],
  banner: { js: ';' },
  logLevel: 'info',
})

console.log(`build OK: client.js（${result.errors.length} errors, ${result.warnings.length} warnings）`)
