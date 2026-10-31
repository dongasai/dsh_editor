;
(() => {
  // src/client.js
  (() => {
    const PACKAGE_NAME = "@dongasai/dsh-editor";
    window.__ModuleLoader__.load({
      id: PACKAGE_NAME,
      factory(require2) {
        const React = require2("react");
        const h = React.createElement;
        const NS = "workspaceEditor";
        const WRITE_URL = "/workspace-editor/write";
        const DELETE_URL = "/workspace-editor/delete";
        const MKDIR_URL = "/workspace-editor/mkdir";
        const RENAME_URL = "/workspace-editor/rename";
        const COPY_URL = "/workspace-editor/copy";
        const UPLOAD_URL = "/workspace-editor/upload";
        const MAX_PASTE_BYTES = 4 * 1024 * 1024;
        const MAX_EDIT_CHARS = 1024 * 1024;
        const FILE_ADDRESS_PREFIX = "dsh-resource://file/";
        const DEFAULT_EXTENSIONS = [
          "txt",
          "text",
          "log",
          "json",
          "jsonc",
          "json5",
          "jsonl",
          "ndjson",
          "yaml",
          "yml",
          "toml",
          "ini",
          "cfg",
          "conf",
          "config",
          "env",
          "properties",
          "lock"
        ];
        const OPTIONAL_EXTENSIONS = [
          "md",
          "markdown",
          "mdx",
          "rst",
          "adoc",
          "tex",
          "html",
          "htm",
          "xhtml",
          "xml",
          "xsl",
          "xslt",
          "svg",
          "css",
          "scss",
          "sass",
          "less",
          "js",
          "mjs",
          "cjs",
          "jsx",
          "ts",
          "mts",
          "cts",
          "tsx",
          "vue",
          "svelte",
          "astro",
          "py",
          "pyi",
          "rb",
          "go",
          "rs",
          "java",
          "kt",
          "kts",
          "scala",
          "swift",
          "cs",
          "php",
          "c",
          "h",
          "cc",
          "cpp",
          "cxx",
          "hpp",
          "hh",
          "hxx",
          "m",
          "mm",
          "lua",
          "pl",
          "pm",
          "r",
          "jl",
          "dart",
          "ex",
          "exs",
          "erl",
          "hrl",
          "hs",
          "clj",
          "cljs",
          "sh",
          "bash",
          "zsh",
          "fish",
          "ksh",
          "ps1",
          "psm1",
          "bat",
          "cmd",
          "sql",
          "graphql",
          "gql",
          "proto",
          "csv",
          "tsv",
          "gradle",
          "groovy",
          "cmake",
          "mk",
          "diff",
          "patch",
          "asm",
          "s",
          "nim",
          "zig",
          "v"
        ];
        const EDITOR_TAB_PATTERN = "dsh-resource://workspace-editor/**";
        const DEFAULT_RENDERER_ID = "@dongasai/dsh-editor/text";
        const OPTIONAL_RENDERER_ID = "@dongasai/dsh-editor/text-option";
        const EDITOR_TAB_ID = "@dongasai/dsh-editor/tab";
        const EDITOR_KIND = "workspace-editor";
        const IMAGE_TAB_ID = "@dongasai/dsh-editor/image";
        const IMAGE_KIND = "workspace-editor-image";
        const IMAGE_TAB_PATTERN = "dsh-resource://workspace-editor-image/**";
        const drafts = /* @__PURE__ */ new Map();
        const inputTargets = /* @__PURE__ */ new Map();
        let filesClipboard = null;
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
.dsh-we-code{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;display:flex}
.dsh-we-gutter{flex:none;box-sizing:border-box;margin:0;padding:8px 8px 8px 12px;border:none;border-right:.5px solid var(--dsw-alias-border-l1);font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:inherit;line-height:1.6;tab-size:2;white-space:pre;text-align:right;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-1);overflow:hidden;overflow-y:auto;overflow-x:hidden;user-select:none;pointer-events:none;min-width:3ch;max-height:100%}
.dsh-we-code-body{position:relative;flex:1 1 auto;min-height:0;overflow:hidden}
.dsh-we-editor,.dsh-we-hl{box-sizing:border-box;margin:0;padding:8px 10px;border:none;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:inherit;line-height:1.6;tab-size:2;white-space:pre}
.dsh-we-hl{position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;pointer-events:none;user-select:none;color:var(--shiki-foreground,var(--dsw-alias-label-primary))}
.dsh-we-editor{position:absolute;top:0;left:0;width:100%;height:100%;outline:none;resize:none;background:transparent;color:transparent;-webkit-text-fill-color:transparent;caret-color:var(--dsw-alias-label-primary);overflow:auto}
.dsh-we-editor::selection{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary)) 30%,transparent)}
.dsh-we-editor[data-wrap="true"],.dsh-we-code[data-wrap="true"] .dsh-we-hl,.dsh-we-code[data-wrap="true"] .dsh-we-gutter{white-space:pre-wrap;overflow-wrap:anywhere}
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
/* \u884C\u5DE6\u4FA7\u5E38\u663E\u7684\u591A\u9009\u6846 = \u591A\u9009\u7684\u4E3B\u5165\u53E3\u3002\u9009\u4E2D\u6001\u523B\u610F\u505A**\u4E09\u91CD\u72EC\u7ACB\u4FE1\u53F7**\uFF08\u52FE\u9009\u6846\u586B\u5145 / \u884C\u80CC\u666F /
   \u5DE6\u4FA7\u8272\u6761\uFF09\uFF0C\u4E14\u52FE\u9009\u6846\u4E0E\u8272\u6761\u90FD\u5E26\u786C\u7F16\u7801\u515C\u5E95\u8272\uFF1A\u76AE\u80A4\u53EF\u4EE5\u6539 --dsw-alias-* \u8FD9\u5957\u53D8\u91CF\uFF0C\u4F46\u6539\u4E0D\u51FA\u300C\u770B\u4E0D\u89C1\u300D
   \uFF08\u771F\u8E29\u8FC7\uFF1Aorca-link \u76AE\u80A4\u4E0B --dsw-alias-interactive-bg-selected \u4E0E\u5E38\u6001\u65E0\u5DEE\u522B\uFF0C\u591A\u9009\u5B8C\u5168\u65E0\u53CD\u9988\uFF09\u3002 */
.dsh-wef-check{width:16px;height:16px;flex:none;display:inline-flex;align-items:center;justify-content:center;padding:0;margin-right:2px;border:.5px solid var(--dsw-alias-border-l2);border-radius:3px;background:var(--dsw-alias-bg-base);color:transparent;font-size:11px;line-height:14px;cursor:pointer}
.dsh-wef-check:hover{border-color:var(--dsw-alias-brand-primary,#4d6bfe)}
.dsh-wef-check[data-checked="true"]{background:var(--dsw-alias-brand-primary,#4d6bfe);border-color:var(--dsw-alias-brand-primary,#4d6bfe);color:var(--dsw-alias-bg-base,#fff)}
/* \u8868\u5934\u90A3\u9897\u5168\u9009\u6846\u7684\u300C\u534A\u9009\u300D\u6001\uFF1A\u52FE\u4E86\u4F46\u4E0D\u5168 \u2014\u2014 \u7528\u4E00\u6761\u6A2A\u7EBF\uFF0C\u4E0D\u662F\u5B9E\u5FC3\u5757\u3002 */
.dsh-wef-check[data-checked="partial"]{border-color:var(--dsw-alias-brand-primary,#4d6bfe);color:var(--dsw-alias-brand-primary,#4d6bfe);background:var(--dsw-alias-bg-base)}
/* \u5149\u6807\u884C\uFF08F2 / \u5DE5\u5177\u6761\u300C\u91CD\u547D\u540D\u9009\u4E2D\u884C\u300D\u7684\u4F5C\u7528\u5BF9\u8C61\uFF09\u5355\u72EC\u7ED9\u4E00\u6761\u865A\u7EBF\u52FE\u8FB9\uFF1A\u5B83\u548C\u300C\u52FE\u4E0A\u4E86\u300D\u662F\u4E24\u4EF6\u4E8B\uFF0C
   \u4E0D\u80FD\u5171\u7528\u540C\u4E00\u4E2A\u89C6\u89C9\uFF0C\u5426\u5219\u770B\u4E0D\u51FA F2 \u4F1A\u6539\u54EA\u4E00\u884C\u3002 */
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
`;
        const zh = {
          "viewer.title": "\u7F16\u8F91\u5668",
          "tab.title": "\u7F16\u8F91 {name}",
          "action.edit": "\u7F16\u8F91",
          "action.save": "\u4FDD\u5B58",
          "action.saving": "\u4FDD\u5B58\u4E2D\u2026",
          "action.reload": "\u91CD\u65B0\u52A0\u8F7D",
          "action.retry": "\u91CD\u8BD5",
          "action.wrap.on": "\u6362\u884C\uFF1A\u5F00",
          "action.wrap.off": "\u6362\u884C\uFF1A\u5173",
          "action.overwrite": "\u8986\u76D6\u4FDD\u5B58",
          "action.discard": "\u52A0\u8F7D\u78C1\u76D8\u7248\u672C",
          "action.keep": "\u7EE7\u7EED\u7F16\u8F91",
          "action.delete": "\u5220\u9664",
          "action.deleteConfirm": "\u786E\u8BA4\u5220\u9664",
          "action.deleteForce": "\u4ECD\u7136\u5220\u9664",
          "action.cancel": "\u53D6\u6D88",
          "editor.label": "\u6587\u4EF6\u5185\u5BB9\u7F16\u8F91\u6846",
          "status.loading": "\u8BFB\u53D6\u4E2D\u2026",
          "status.clean": "\u5DF2\u4E0E\u78C1\u76D8\u540C\u6B65",
          "status.dirty": "\u672A\u4FDD\u5B58\u7684\u4FEE\u6539",
          "status.saved": "\u5DF2\u4FDD\u5B58",
          "status.deleting": "\u5220\u9664\u4E2D\u2026",
          "status.deleted": "\u5DF2\u5220\u9664",
          "status.checking": "\u68C0\u67E5\u4E2D\u2026",
          "status.noAddress": "\u65E0\u6CD5\u89E3\u6790\u8FD9\u4E2A\u6587\u4EF6\u7684\u5730\u5740\uFF0C\u7F16\u8F91\u5668\u4E0D\u53EF\u7528\u3002",
          "error.read": "\u8BFB\u53D6\u5931\u8D25\uFF1A{message}",
          "error.notUtf8": "\u8FD9\u4E2A\u6587\u4EF6\u4E0D\u662F UTF-8 \u6587\u672C\uFF0C\u65E0\u6CD5\u5728\u9875\u9762\u91CC\u7F16\u8F91\u3002",
          "error.tooLarge": "\u6587\u4EF6\u592A\u5927\uFF08\u8D85\u8FC7 {limit}\uFF09\uFF0C\u4E0D\u9002\u5408\u5728\u9875\u9762\u91CC\u7F16\u8F91\uFF0C\u8BF7\u7528\u5176\u5B83\u5DE5\u5177\u6253\u5F00\u3002",
          "error.transport": "\u4FDD\u5B58\u8BF7\u6C42\u6CA1\u6709\u5230\u8FBE Host\uFF08\u8FDE\u63A5\u4E2D\u65AD\uFF1F\uFF09\uFF0C\u5185\u5BB9\u4ECD\u7559\u5728\u7F16\u8F91\u5668\u91CC\u3002",
          "error.save": "\u4FDD\u5B58\u5931\u8D25\uFF1A{message}",
          "error.delete": "\u5220\u9664\u5931\u8D25\uFF1A{message}",
          "error.deleteTransport": "\u5220\u9664\u8BF7\u6C42\u6CA1\u6709\u5230\u8FBE Host\uFF08\u8FDE\u63A5\u4E2D\u65AD\uFF1F\uFF09\uFF0C\u6587\u4EF6\u6CA1\u6709\u88AB\u5220\u9664\u3002",
          "error.deleteRoute": "Host \u4FA7\u8FD8\u6CA1\u6709\u8FD9\u6761\u5220\u9664\u8DEF\u7531\uFF08\u6539\u8FC7 index.js \u4E4B\u540E\u8981\u91CD\u542F Harness\uFF09\uFF0C\u6587\u4EF6\u6CA1\u6709\u88AB\u5220\u9664\u3002",
          "delete.hint": "\u5220\u9664\u540E\u65E0\u6CD5\u6062\u590D",
          "files.title": "\u6587\u4EF6\u7F16\u8F91",
          "files.guide": "\u81EA\u5E26\u6587\u4EF6\u6811\uFF1A\u65B0\u5EFA\u3001\u6539\u540D\u3001\u590D\u5236 / \u526A\u5207 / \u7C98\u8D34\uFF08\u542B\u7CFB\u7EDF\u526A\u8D34\u677F\u91CC\u7684\u6587\u4EF6\uFF09\u3001\u5220\u9664\u3001\u62D6\u62FD\u79FB\u52A8",
          "files.dropRoot": "\u653E\u5230\u8FD9\u91CC = \u642C\u5230\u5DE5\u4F5C\u533A\u6839\u76EE\u5F55\uFF1A{path}",
          "files.shortcut": "\u6253\u5F00\u300C\u6587\u4EF6\u7F16\u8F91\u300D\u9762\u677F",
          "files.newFile": "\u65B0\u5EFA\u6587\u4EF6",
          "files.newFolder": "\u65B0\u5EFA\u6587\u4EF6\u5939",
          "files.rename": "\u91CD\u547D\u540D / \u79FB\u52A8",
          "files.copy": "\u521B\u5EFA\u526F\u672C",
          "files.copyTo": "\u590D\u5236\u5230\u526A\u8D34\u677F",
          "files.cut": "\u526A\u5207",
          "files.paste": "\u7C98\u8D34",
          "files.clipboard": "\u526A\u8D34\u677F\uFF1A{name}\uFF08{mode}\uFF09",
          "files.clipboardClear": "\u6E05\u7A7A",
          "files.clipboardMode.copy": "\u590D\u5236",
          "files.clipboardMode.cut": "\u526A\u5207",
          "files.delete": "\u5220\u9664",
          "files.refresh": "\u5237\u65B0",
          "files.sort": "\u6392\u5E8F",
          "files.sort.name": "\u6309\u540D\u79F0",
          "files.sort.type": "\u6309\u7C7B\u578B",
          "files.sort.dirsFirst": "\u76EE\u5F55\u4F18\u5148",
          "files.batch.count": "\u5DF2\u9009 {count} \u9879",
          "files.check": "\u52FE\u9009\u8FD9\u4E00\u884C\uFF08\u7528\u4E8E\u6279\u91CF\u64CD\u4F5C\uFF09",
          "files.batch.copyPaths": "\u590D\u5236\u8DEF\u5F84",
          "files.batch.selectAll": "\u5168\u9009",
          "files.batch.delete": "\u5220\u9664",
          "files.batch.clear": "\u6E05\u7A7A",
          "files.batch.copied": "\u5DF2\u590D\u5236 {count} \u6761\u8DEF\u5F84",
          "files.batch.done": "\u5DF2\u5220\u9664 {count} \u9879",
          "files.batch.failed": "{failed} \u9879\u6CA1\u5220\u6210\uFF08\u5176\u4E2D {conflicted} \u9879\u5728\u786E\u8BA4\u671F\u95F4\u53D8\u8FC7\uFF09\uFF0C\u5B83\u4EEC\u8FD8\u7559\u5728\u9009\u62E9\u91CC\uFF0C\u53EF\u4EE5\u91CD\u8BD5\u3002",
          "files.batch.retry": "\u91CD\u8BD5\u5220\u9664",
          "files.confirmDeleteMany": "\u5220\u9664\u9009\u4E2D\u7684 {count} \u9879\uFF1F\u5220\u9664\u540E\u65E0\u6CD5\u6062\u590D",
          "files.confirmDeleteManyDirs": "\u5220\u9664\u9009\u4E2D\u7684 {count} \u9879\uFF08\u5176\u4E2D {dirs} \u4E2A\u76EE\u5F55\u4F1A\u8FDE\u5185\u5BB9\u4E00\u8D77\u5220\uFF09\uFF1F\u5220\u9664\u540E\u65E0\u6CD5\u6062\u590D",
          "files.open": "\u7528\u7F16\u8F91\u5668\u6253\u5F00",
          "files.more": "\u66F4\u591A\u64CD\u4F5C\uFF08\u91CD\u547D\u540D / \u590D\u5236 / \u526A\u5207 / \u7C98\u8D34 / \u5220\u9664\uFF09",
          "files.root": "\u5DE5\u4F5C\u533A",
          "files.loading": "\u8BFB\u53D6\u4E2D\u2026",
          "files.empty": "\u7A7A\u76EE\u5F55",
          "files.truncated": "\u6761\u76EE\u592A\u591A\uFF0C\u53EA\u5217\u51FA\u4E86\u524D\u9762\u8FD9\u4E9B\u3002",
          "files.noRoot": "\u8FD9\u4E2A\u4F1A\u8BDD\u8FD8\u6CA1\u6709\u5DE5\u4F5C\u533A\u6839\uFF0C\u6587\u4EF6\u7F16\u8F91\u4E0D\u53EF\u7528\u3002",
          "files.readFailed": "\u8BFB\u53D6\u5931\u8D25\uFF1A{message}",
          "files.namePlaceholder": "\u8F93\u5165\u540D\u79F0\u540E\u56DE\u8F66\uFF08\u6539\u540D\u53EF\u4EE5\u7528 a/b \u79FB\u5230\u5B50\u76EE\u5F55\uFF09",
          "files.confirmDeleteFile": "\u5220\u9664 {name}\uFF1F\u5220\u9664\u540E\u65E0\u6CD5\u6062\u590D",
          "files.confirmDeleteDir": "\u5220\u9664\u76EE\u5F55 {name}\uFF08\u542B {count} \u9879\uFF0C\u5185\u5BB9\u4F1A\u4E00\u8D77\u5220\u6389\uFF09\uFF1F",
          "files.confirmDeleteEmptyDir": "\u5220\u9664\u7A7A\u76EE\u5F55 {name}\uFF1F",
          "files.recursive": "\u9012\u5F52\u5220\u9664",
          "files.stale": "\u8FD9\u4E2A\u6761\u76EE\u5728\u786E\u8BA4\u671F\u95F4\u53D8\u8FC7\uFF0C\u6CA1\u6709\u5220\u9664\u3002",
          "files.force": "\u4ECD\u7136\u5220\u9664",
          "files.cancel": "\u53D6\u6D88",
          "files.busy": "\u5904\u7406\u4E2D\u2026",
          "files.error.exists": "\u76EE\u6807\u5DF2\u7ECF\u5B58\u5728\uFF0C\u6CA1\u6709\u8986\u76D6\u4E5F\u6CA1\u6709\u6539\u540D\u3002",
          "files.error.notEmpty": "\u76EE\u5F55\u4E0D\u662F\u7A7A\u7684\uFF0C\u8981\u8FDE\u5185\u5BB9\u4E00\u8D77\u5220\u8BF7\u70B9\u300C\u9012\u5F52\u5220\u9664\u300D\u3002",
          "files.error.outside": "\u8FD9\u4E2A\u8DEF\u5F84\u4E0D\u5728\u5F53\u524D\u4F1A\u8BDD\u7684\u5DE5\u4F5C\u533A\u5185\u3002",
          "files.error.denied": "\u5F53\u524D\u4F1A\u8BDD\u662F\u53EA\u8BFB\u6C99\u7BB1\uFF0C\u4E0D\u80FD\u6539\u6587\u4EF6\u3002",
          "files.error.notFound": "\u8DEF\u5F84\u5DF2\u7ECF\u4E0D\u5728\u4E86\uFF08\u53EF\u80FD\u88AB\u6A21\u578B\u6216\u522B\u7684\u5DE5\u5177\u52A8\u8FC7\uFF09\u3002",
          "files.error.invalid": "\u8FD9\u4E2A\u76EE\u6807\u4E0D\u5408\u6CD5\uFF08\u4F8B\u5982\u628A\u76EE\u5F55\u79FB\u8FDB\u5B83\u81EA\u5DF1\u91CC\u9762\uFF09\u3002",
          "files.error.name": "\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u4E5F\u4E0D\u80FD\u5305\u542B . \u6216 .. \u8FD9\u6837\u7684\u8DEF\u5F84\u6BB5\u3002",
          "files.error.absolute": "\u53EA\u63A5\u53D7\u76F8\u5BF9\u5F53\u524D\u76EE\u5F55\u7684\u540D\u5B57\u6216\u76F8\u5BF9\u8DEF\u5F84\u3002",
          "files.error.route": "Host \u4FA7\u8FD8\u6CA1\u6709\u8FD9\u6761\u8DEF\u7531\uFF08\u6539\u8FC7 index.js \u4E4B\u540E\u8981\u91CD\u542F Harness\uFF09\u3002",
          "files.error.transport": "\u8BF7\u6C42\u6CA1\u6709\u5230\u8FBE Host\uFF08\u8FDE\u63A5\u4E2D\u65AD\uFF1F\uFF09\uFF0C\u4EC0\u4E48\u90FD\u6CA1\u6539\u3002",
          "files.error.generic": "\u64CD\u4F5C\u5931\u8D25\uFF08{code}\uFF09\uFF1A{message}",
          "files.error.tooLarge": "\u6587\u4EF6\u592A\u5927\uFF0C\u8D85\u8FC7\u4E0A\u9650\uFF0C\u6CA1\u6709\u7C98\u8D34\u3002",
          "files.paste.empty": "\u526A\u8D34\u677F\u91CC\u6CA1\u6709\u6587\u4EF6\uFF08\u53EA\u8BFB\u5230\u6587\u672C\uFF09\u3002\u5148\u5728\u7CFB\u7EDF\u91CC\u590D\u5236\u4E00\u4E2A\u6587\u4EF6\uFF0C\u518D\u7528 Ctrl/Cmd+V \u6216\u8FD9\u4E2A\u6309\u94AE\u7C98\u8D34\u3002",
          "files.paste.denied": "\u6D4F\u89C8\u5668\u4E0D\u8BA9\u8BFB\u526A\u8D34\u677F\u3002\u628A\u9F20\u6807\u70B9\u8FDB\u8FD9\u68F5\u6811\uFF0C\u6309 Ctrl/Cmd+V \u7C98\u8D34\u6587\u4EF6\u3002",
          "files.paste.unsupported": "\u8FD9\u4E2A\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u8BFB\u526A\u8D34\u677F\u91CC\u7684\u6587\u4EF6\uFF0C\u8BF7\u6309 Ctrl/Cmd+V \u7C98\u8D34\u3002",
          "files.paste.directory": "\u300C{name}\u300D\u662F\u76EE\u5F55\uFF1A\u526A\u8D34\u677F\u7C98\u8D34\u53EA\u652F\u6301\u6587\u4EF6\uFF0C\u76EE\u5F55\u8BF7\u7528\u62D6\u62FD\u6216\u6539\u540D\u79FB\u52A8\u3002",
          "files.paste.tooLarge": "\u300C{name}\u300D\u8D85\u8FC7 {limit}\uFF0C\u6CA1\u6709\u7C98\u8D34\u3002",
          "files.paste.readFailed": "\u300C{name}\u300D\u8BFB\u4E0D\u51FA\u6765\uFF0C\u6CA1\u6709\u7C98\u8D34\u3002",
          "files.copyPath": "\u590D\u5236\u8DEF\u5F84",
          "files.copyPathRelative": "\u590D\u5236\u76F8\u5BF9\u8DEF\u5F84",
          "files.copyPath.done": "\u5DF2\u590D\u5236\uFF1A{path}",
          "files.copyPath.failed": "\u6D4F\u89C8\u5668\u4E0D\u8BA9\u5199\u526A\u8D34\u677F\uFF0C\u8DEF\u5F84\u6CA1\u6709\u590D\u5236\u3002\u624B\u52A8\u9009\u4E2D\u518D\u590D\u5236\u5427\u3002",
          "files.openTerminal": "\u5728\u7EC8\u7AEF\u6253\u5F00",
          "files.terminal.done": "\u5DF2\u5728\u7EC8\u7AEF\u6253\u5F00\uFF1A{path}",
          "files.terminal.missing": "\u8FD9\u4E2A\u90E8\u7F72\u6CA1\u6709\u4FA7\u8FB9\u680F\u7EC8\u7AEF\uFF08\u7EC8\u7AEF\u9875\u7B7E\u7C7B\u578B\u6CA1\u6CE8\u518C\uFF09\u3002",
          "files.terminal.failed": "\u6CA1\u80FD\u6253\u5F00\u7EC8\u7AEF\u9875\u7B7E\u3002",
          "files.terminal.noInput": "\u7EC8\u7AEF\u5F00\u4E86\uFF0C\u4F46\u62FF\u4E0D\u5230\u5B83\u7684\u8F93\u5165\u9762\uFF0C\u6CA1\u80FD\u5207\u5230\u8BE5\u76EE\u5F55\u3002",
          "files.terminal.timeout": "\u7EC8\u7AEF\u5F00\u4E86\uFF0C\u4F46\u7B49\u5B83\u53EF\u5199\u8D85\u65F6\uFF0C\u6CA1\u80FD\u81EA\u52A8\u5207\u5230\u8BE5\u76EE\u5F55\u3002",
          "files.batchList": "\u6279\u91CF\u5217\u76EE\u5F55 (F2)",
          "files.batchListTitle": "\u5DF2\u9009 {count} \u4E2A\u76EE\u5F55\u7684\u5185\u5BB9",
          "files.copyEntries": "\u590D\u5236\u6761\u76EE\u5217\u8868",
          "files.noEntries": "\u6CA1\u6709\u6761\u76EE",
          "files.close": "\u5173\u95ED",
          "search.placeholder": "\u641C\u7D22\u6587\u4EF6\u5185\u5BB9\u2026",
          "search.loading": "\u641C\u7D22\u4E2D\u2026",
          "search.noResults": "\u6CA1\u6709\u627E\u5230\u5339\u914D\u9879",
          "search.failed": "\u641C\u7D22\u5931\u8D25",
          "search.noSession": "\u5F53\u524D\u6CA1\u6709\u53EF\u7528\u7684\u4F1A\u8BDD\uFF0C\u8BF7\u5148\u9009\u62E9\u4E00\u4E2A\u4F1A\u8BDD\u3002",
          "image.title": "\u9884\u89C8 {name}",
          "image.alt": "\u56FE\u7247\u9884\u89C8",
          "image.loading": "\u8BFB\u53D6\u4E2D\u2026",
          "image.fit": "\u9002\u914D\u7A97\u53E3",
          "image.actual": "\u539F\u59CB\u5927\u5C0F",
          "image.meta": "{size} \xB7 {width}\xD7{height} \xB7 {type}",
          "image.size": "{bytes} \u5B57\u8282",
          "image.readFailed": "\u8BFB\u53D6\u5931\u8D25\uFF1A{message}",
          "image.decodeFailed": "\u6D4F\u89C8\u5668\u89E3\u4E0D\u5F00\u8FD9\u4E2A\u683C\u5F0F\uFF08{type}\uFF09\uFF0C\u6587\u4EF6\u672C\u8EAB\u662F\u597D\u7684\uFF1A{bytes} \u5B57\u8282\u3002",
          "image.openEditor": "\u7528\u7F16\u8F91\u5668\u6253\u5F00",
          "delete.stale": "\u6587\u4EF6\u5DF2\u53D8\u66F4\uFF0C\u672A\u5220\u9664",
          "delete.noVersion": "\u8BFB\u4E0D\u5230\u6587\u4EF6\u72B6\u6001",
          "conflict.stale": "\u78C1\u76D8\u4E0A\u7684\u6587\u4EF6\u5728\u7F16\u8F91\u671F\u95F4\u53D8\u8FC7\uFF0C\u5C1A\u672A\u8986\u76D6\u3002",
          "conflict.exists": "\u6587\u4EF6\u5DF2\u5B58\u5728\uFF0C\u6CA1\u6709\u8986\u76D6\u3002",
          "conflict.message": "\u78C1\u76D8\u4E0A\u7684\u6587\u4EF6\u5DF2\u88AB\u6539\u52A8\uFF08\u53EF\u80FD\u662F\u6A21\u578B\u6216\u5176\u5B83\u5DE5\u5177\u6539\u7684\uFF09\uFF0C\u76F4\u63A5\u4FDD\u5B58\u4F1A\u8986\u76D6\u5BF9\u65B9\u7684\u4FEE\u6539\u3002",
          "changed.message": "\u78C1\u76D8\u4E0A\u7684\u6587\u4EF6\u5DF2\u88AB\u6539\u52A8\u3002\u4F60\u7684\u672A\u4FDD\u5B58\u4FEE\u6539\u8FD8\u7559\u7740\uFF0C\u4E0D\u4F1A\u88AB\u8986\u76D6\u3002",
          "hint.save": "Ctrl/Cmd+S \u4FDD\u5B58",
          "action.cut": "\u526A\u5207",
          "action.copy": "\u590D\u5236",
          "action.paste": "\u7C98\u8D34",
          "action.selectAll": "\u5168\u9009",
          "send.menu": "\u53D1\u9001\u5230 DSH \u8F93\u5165\u6846",
          "send.menuTitle": "\u628A {token} \u63D2\u8FDB\u5BF9\u8BDD\u8F93\u5165\u6846",
          "send.sent": "\u5DF2\u63D2\u5165 {token}",
          "send.failed.input": "\u73B0\u5728\u6CA1\u6709\u53EF\u7528\u7684\u5BF9\u8BDD\u8F93\u5165\u6846\uFF08\u8FD9\u4E2A\u4F1A\u8BDD\u7684\u5BF9\u8BDD\u533A\u6CA1\u6253\u5F00\uFF0C\u6216\u6B63\u88AB\u5BA1\u6279 / \u95EE\u7B54\u5360\u7528\uFF09\u3002",
          "send.failed.busy": "\u8F93\u5165\u6846\u6B63\u5FD9\u6216\u5185\u5BB9\u521A\u53D8\u8FC7\uFF0C\u6CA1\u6709\u63D2\u5165\uFF0C\u518D\u8BD5\u4E00\u6B21\u3002",
          "send.failed.path": "\u8FD9\u4E2A\u6587\u4EF6\u7684\u8DEF\u5F84\u6CA1\u6CD5\u5B89\u5168\u5730\u8868\u793A\u6210\u5F15\u7528\u3002",
          "send.failed.clipboard": "\u6D4F\u89C8\u5668\u4E0D\u8BA9\u5199\u526A\u8D34\u677F\uFF0C\u6539\u7528 Ctrl/Cmd+C \u5427\u3002"
        };
        const en = {
          "viewer.title": "Editor",
          "tab.title": "Edit {name}",
          "action.edit": "Edit",
          "action.save": "Save",
          "action.saving": "Saving\u2026",
          "action.reload": "Reload",
          "action.retry": "Retry",
          "action.wrap.on": "Wrap: on",
          "action.wrap.off": "Wrap: off",
          "action.overwrite": "Overwrite",
          "action.discard": "Load disk version",
          "action.keep": "Keep editing",
          "action.delete": "Delete",
          "action.deleteConfirm": "Confirm delete",
          "action.deleteForce": "Delete anyway",
          "action.cancel": "Cancel",
          "editor.label": "File content editor",
          "status.loading": "Loading\u2026",
          "status.clean": "In sync with disk",
          "status.dirty": "Unsaved changes",
          "status.saved": "Saved",
          "status.deleting": "Deleting\u2026",
          "status.deleted": "Deleted",
          "status.checking": "Checking\u2026",
          "status.noAddress": "This file address cannot be parsed, so the editor is unavailable.",
          "error.read": "Read failed: {message}",
          "error.notUtf8": "This file is not UTF-8 text and cannot be edited here.",
          "error.tooLarge": "This file is too large (over {limit}) to edit here; open it with another tool.",
          "error.transport": "The save request never reached the host (connection lost?). Your text is still in the editor.",
          "error.save": "Save failed: {message}",
          "error.delete": "Delete failed: {message}",
          "error.deleteTransport": "The delete request never reached the host (connection lost?). The file was not deleted.",
          "error.deleteRoute": "The host has no delete route yet (restart the harness after changing index.js); the file was not deleted.",
          "delete.hint": "Deleting cannot be undone",
          "files.title": "File editor",
          "files.guide": "Its own file tree: create, rename, copy / cut / paste (including files from the system clipboard), delete, drag to move",
          "files.shortcut": "Open the file editor panel",
          "files.newFile": "New file",
          "files.newFolder": "New folder",
          "files.rename": "Rename / move",
          "files.copy": "Duplicate",
          "files.copyTo": "Copy to clipboard",
          "files.cut": "Cut",
          "files.paste": "Paste",
          "files.dropRoot": "Drop here to move into the workspace root: {path}",
          "files.clipboard": "Clipboard: {name} ({mode})",
          "files.clipboardClear": "Clear",
          "files.clipboardMode.copy": "copy",
          "files.clipboardMode.cut": "cut",
          "files.delete": "Delete",
          "files.refresh": "Refresh",
          "files.sort": "Sort",
          "files.sort.name": "By name",
          "files.sort.type": "By type",
          "files.sort.dirsFirst": "Folders first",
          "files.batch.count": "{count} selected",
          "files.check": "Select this row (for batch actions)",
          "files.batch.copyPaths": "Copy paths",
          "files.batch.selectAll": "Select all",
          "files.batch.delete": "Delete",
          "files.batch.clear": "Clear",
          "files.batch.copied": "Copied {count} paths",
          "files.batch.done": "Deleted {count} entries",
          "files.batch.failed": "{failed} entries were not deleted ({conflicted} of them changed on disk). They stay selected, so you can retry.",
          "files.batch.retry": "Retry delete",
          "files.confirmDeleteMany": "Delete the {count} selected entries? This cannot be undone",
          "files.confirmDeleteManyDirs": "Delete the {count} selected entries ({dirs} folders go with their contents)? This cannot be undone",
          "files.open": "Open in the editor",
          "files.more": "More actions (rename / copy / cut / paste / delete)",
          "files.root": "Workspace",
          "files.loading": "Loading\u2026",
          "files.empty": "Empty folder",
          "files.truncated": "Too many entries; only the first ones are listed.",
          "files.noRoot": "This session has no workspace root yet, so the file editor is unavailable.",
          "files.readFailed": "Read failed: {message}",
          "files.namePlaceholder": "Type a name and press Enter (a/b moves into a subfolder)",
          "files.confirmDeleteFile": "Delete {name}? This cannot be undone",
          "files.confirmDeleteDir": "Delete folder {name} (holds {count} entries, all of them go)?",
          "files.confirmDeleteEmptyDir": "Delete empty folder {name}?",
          "files.recursive": "Delete recursively",
          "files.stale": "This entry changed while you were confirming; nothing was deleted.",
          "files.force": "Delete anyway",
          "files.cancel": "Cancel",
          "files.busy": "Working\u2026",
          "files.error.exists": "The target already exists; nothing was overwritten or renamed.",
          "files.error.notEmpty": 'The folder is not empty; use "Delete recursively" to remove its contents too.',
          "files.error.outside": "That path is outside this session's workspace.",
          "files.error.denied": "This session is a read-only sandbox; files cannot be changed.",
          "files.error.notFound": "The path is gone (the agent or another tool may have moved it).",
          "files.error.invalid": "That target is not allowed (moving a folder into itself, for example).",
          "files.error.name": "The name cannot be empty or contain . / .. path segments.",
          "files.error.absolute": "Only a name or a relative path inside the current folder is accepted.",
          "files.error.route": "The host has no such route yet (restart the harness after changing index.js).",
          "files.error.transport": "The request never reached the host (connection lost?). Nothing changed.",
          "files.error.generic": "Operation failed ({code}): {message}",
          "files.error.tooLarge": "The file is too large; nothing was pasted.",
          "files.paste.empty": "The clipboard holds no files (only text). Copy a file in your system first, then paste with Ctrl/Cmd+V or this button.",
          "files.paste.denied": "The browser refused clipboard access. Click inside the tree and press Ctrl/Cmd+V to paste files.",
          "files.paste.unsupported": "This browser cannot read files from the clipboard; press Ctrl/Cmd+V to paste.",
          "files.paste.directory": '"{name}" is a folder: clipboard paste only handles files; move folders by dragging or renaming.',
          "files.paste.tooLarge": '"{name}" is over {limit}; nothing was pasted.',
          "files.paste.readFailed": '"{name}" could not be read; nothing was pasted.',
          "files.copyPath": "Copy path",
          "files.copyPathRelative": "Copy relative path",
          "files.copyPath.done": "Copied: {path}",
          "files.copyPath.failed": "The browser refused clipboard access; the path was not copied.",
          "files.openTerminal": "Open in terminal",
          "files.terminal.done": "Opened in the terminal: {path}",
          "files.terminal.missing": "This deployment has no sidebar terminal (no terminal tab type is registered).",
          "files.terminal.failed": "The terminal tab could not be opened.",
          "files.terminal.noInput": "The terminal opened, but its input was unavailable; the directory was not entered.",
          "files.terminal.timeout": "The terminal opened, but it did not become writable in time; the directory was not entered.",
          "image.title": "Preview {name}",
          "image.alt": "Image preview",
          "image.loading": "Loading\u2026",
          "image.fit": "Fit to window",
          "image.actual": "Actual size",
          "image.meta": "{size} \xB7 {width}\xD7{height} \xB7 {type}",
          "image.size": "{bytes} bytes",
          "image.readFailed": "Read failed: {message}",
          "image.decodeFailed": "The browser cannot decode this format ({type}); the file itself is fine: {bytes} bytes.",
          "image.openEditor": "Open in the editor",
          "delete.stale": "File changed, not deleted",
          "delete.noVersion": "File state unavailable",
          "conflict.stale": "The file changed on disk while you were editing; nothing was overwritten.",
          "conflict.exists": "The file already exists; nothing was overwritten.",
          "conflict.message": "The file changed on disk (the agent or another tool may have written it). Saving now would overwrite those changes.",
          "changed.message": "The file changed on disk. Your unsaved text is kept and will not be overwritten.",
          "hint.save": "Ctrl/Cmd+S to save",
          "action.cut": "Cut",
          "action.copy": "Copy",
          "action.paste": "Paste",
          "action.selectAll": "Select all",
          "send.menu": "Send to the DSH input",
          "send.menuTitle": "Insert {token} into the chat input",
          "send.sent": "Inserted {token}",
          "send.failed.input": "No chat input is available right now (this session's conversation area is closed, or an approval / question is holding the composer).",
          "send.failed.busy": "The input is busy or just changed; nothing was inserted. Try again.",
          "send.failed.path": "This file path cannot be represented as a reference safely.",
          "send.failed.clipboard": "The browser refused clipboard access; use Ctrl/Cmd+C instead.",
          "files.batchList": "Batch list directories (F2)",
          "files.batchListTitle": "Contents of {count} selected directories",
          "files.copyEntries": "Copy entries",
          "files.noEntries": "No entries",
          "files.close": "Close",
          "search.placeholder": "Search file contents\u2026",
          "search.loading": "Searching\u2026",
          "search.noResults": "No matches found",
          "search.failed": "Search failed",
          "search.noSession": "No available session. Please select a session first."
        };
        function addressParts(address) {
          const end = address.search(/[?#]/u);
          return (end === -1 ? address.slice(FILE_ADDRESS_PREFIX.length) : address.slice(FILE_ADDRESS_PREFIX.length, end)).split("/");
        }
        function decodeSegments(segments) {
          try {
            return segments.map((segment) => decodeURIComponent(segment));
          } catch {
            return null;
          }
        }
        function parseSessionFileAddress(address) {
          if (typeof address !== "string" || !address.startsWith(FILE_ADDRESS_PREFIX)) return null;
          const parts = addressParts(address);
          if (parts[0] !== "session") return null;
          const id = parts[1];
          const segments = parts.slice(2);
          if (id === void 0 || id === "" || segments.length === 0) return null;
          const decoded = decodeSegments(segments);
          if (decoded === null) return null;
          return { sessionId: decodeURIComponent(id), path: decoded.join("/") };
        }
        function absoluteFileAddress(path) {
          const normalized = path.replace(/\\/gu, "/");
          const unc = normalized.startsWith("//");
          const stripped = normalized.replace(/^\/+/u, "");
          const encoded = stripped.split("/").map((segment) => encodeURIComponent(segment).replace(/%3A/giu, ":")).join("/");
          return `${FILE_ADDRESS_PREFIX}absolute/${unc ? "/" : ""}${encoded}`;
        }
        function fileNameOf(address) {
          if (typeof address !== "string" || address === "") return "";
          const parts = addressParts(address);
          const decoded = decodeSegments(parts);
          const last = (decoded ?? parts).filter((segment) => segment !== "").pop() ?? "";
          return last;
        }
        function sizeLabel(chars) {
          return chars >= 1024 * 1024 ? `${String(Math.round(chars / 1024 / 1024))} MiB` : `${String(Math.max(1, Math.round(chars / 1024)))} KiB`;
        }
        function describeFailure(failure, t) {
          if (failure.code === "not-utf8") return t("error.notUtf8");
          if (failure.code === "too-large") return t("error.tooLarge", { limit: sizeLabel(MAX_EDIT_CHARS) });
          return t("error.read", { message: failure.message });
        }
        function paneTarget(tab, fallbackSessionId) {
          const params = tab?.navigation?.params;
          if (params !== null && typeof params === "object" && typeof params.path === "string" && params.path !== "") {
            const id = typeof params.sessionId === "string" && params.sessionId !== "" ? params.sessionId : fallbackSessionId;
            return id === void 0 || id === "" ? null : { sessionId: id, path: params.path };
          }
          const address = tab?.navigation?.address ?? tab?.contentId;
          if (typeof address !== "string" || !address.startsWith(FILE_ADDRESS_PREFIX)) return null;
          const parts = addressParts(address);
          if (parts[0] !== "absolute" || fallbackSessionId === void 0 || fallbackSessionId === "") return null;
          const segments = decodeSegments(parts.slice(1));
          if (segments === null) return null;
          const kept = segments.filter((segment) => segment !== "");
          if (kept.length === 0) return null;
          return { sessionId: fallbackSessionId, path: `/${kept.join("/")}` };
        }
        function relativizeToCwd(path, cwd) {
          if (typeof cwd !== "string" || cwd === "") return path;
          const root = cwd.replace(/[/\\]+$/u, "");
          if (path.startsWith(`${root}/`) || path.startsWith(`${root}\\`)) return path.slice(root.length + 1);
          return path;
        }
        function shortenPath(text, max) {
          const value = String(text ?? "");
          const limit = typeof max === "number" && max > 1 ? Math.floor(max) : 48;
          if (value.length <= limit) return value;
          return `\u2026${value.slice(-(limit - 1))}`;
        }
        function lineNumberOf(text, offset) {
          let line = 1;
          const limit = Math.min(Math.max(offset, 0), text.length);
          for (let index = 0; index < limit; index += 1) {
            if (text.charCodeAt(index) === 10) line += 1;
          }
          return line;
        }
        function lineReferenceToken(path, startLine, endLine) {
          if (path === "") return null;
          if (startLine < 1 || endLine < startLine) return null;
          if (/[\u0000-\u001f\u007f-\u009f"]/u.test(path)) return null;
          const lines = endLine > startLine ? `#L${String(startLine)}-${String(endLine)}` : `#L${String(startLine)}`;
          return /\s/u.test(path) ? `@"${path}"${lines}` : `@${path}${lines}`;
        }
        function menuAnchorFor(event) {
          const fromPointer = event.type === "contextmenu" || (event.button ?? 0) === 2;
          const rect = fromPointer || typeof event.currentTarget?.getBoundingClientRect !== "function" ? null : event.currentTarget.getBoundingClientRect();
          const height = typeof window === "undefined" ? 0 : window.innerHeight;
          const raw = rect === null ? { x: event.clientX ?? 0, y: event.clientY ?? 0 } : { x: rect.left, y: rect.bottom };
          return { x: raw.x, y: height > 0 ? Math.min(raw.y, Math.max(0, height - 220)) : raw.y };
        }
        function sessionCwd(ctx, sessionId) {
          try {
            const cwd = ctx.sessions?.list?.getSnapshot?.()?.byId?.[sessionId]?.cwd;
            return typeof cwd === "string" && cwd !== "" ? cwd : void 0;
          } catch {
            return void 0;
          }
        }
        async function writeClipboard(text) {
          try {
            await navigator.clipboard.writeText(text);
            return true;
          } catch {
          }
          try {
            const area = document.createElement("textarea");
            area.value = text;
            area.setAttribute("readonly", "");
            area.style.position = "fixed";
            area.style.opacity = "0";
            document.body.appendChild(area);
            area.select();
            const written = document.execCommand("copy");
            area.remove();
            return written;
          } catch {
            return false;
          }
        }
        async function readClipboard() {
          try {
            return await navigator.clipboard.readText();
          } catch {
            return void 0;
          }
        }
        const PASTE_EXTENSIONS = {
          "image/png": "png",
          "image/jpeg": "jpg",
          "image/jpg": "jpg",
          "image/gif": "gif",
          "image/webp": "webp",
          "image/bmp": "bmp",
          "image/avif": "avif",
          "image/svg+xml": "svg",
          "image/tiff": "tiff",
          "application/pdf": "pdf",
          "application/zip": "zip",
          "application/gzip": "gz",
          "application/x-tar": "tar",
          "application/json": "json",
          "application/octet-stream": "bin",
          "text/plain": "txt",
          "text/csv": "csv",
          "text/markdown": "md",
          "text/html": "html"
        };
        function base64OfBytes(bytes) {
          let latin1 = "";
          for (let offset = 0; offset < bytes.length; offset += 32768) {
            latin1 += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
          }
          return btoa(latin1);
        }
        function pastedNameFor(type, index, now) {
          const extension = PASTE_EXTENSIONS[type] ?? "bin";
          const at = now ?? /* @__PURE__ */ new Date();
          const pad = (value) => String(value).padStart(2, "0");
          const stamp = `${String(at.getFullYear())}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
          return `pasted-${stamp}${index > 1 ? `-${String(index)}` : ""}.${extension}`;
        }
        const IMAGE_MEDIA_TYPES = {
          png: "image/png",
          apng: "image/apng",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          jfif: "image/jpeg",
          gif: "image/gif",
          webp: "image/webp",
          bmp: "image/bmp",
          ico: "image/x-icon",
          svg: "image/svg+xml",
          avif: "image/avif",
          tif: "image/tiff",
          tiff: "image/tiff",
          heic: "image/heic",
          heif: "image/heif"
        };
        function imageMediaTypeOf(path) {
          const name = String(path).replaceAll("\\", "/");
          const cut = name.lastIndexOf("/");
          const file = (cut === -1 ? name : name.slice(cut + 1)).toLowerCase();
          const dot = file.lastIndexOf(".");
          if (dot <= 0) return void 0;
          return IMAGE_MEDIA_TYPES[file.slice(dot + 1)];
        }
        function shellQuotePath(path) {
          return `'${path.split("'").join("'\\''")}'`;
        }
        function clipboardFilesOf(dataTransfer) {
          const files = [];
          const directories = [];
          const items = dataTransfer?.items;
          if (items != null && items.length > 0) {
            for (const item of items) {
              if (item.kind !== "file") continue;
              let entry = null;
              try {
                entry = typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null;
              } catch {
                entry = null;
              }
              if (entry?.isDirectory === true) {
                directories.push(typeof entry.name === "string" ? entry.name : "");
                continue;
              }
              const file = typeof item.getAsFile === "function" ? item.getAsFile() : null;
              if (file != null) files.push(file);
            }
            if (files.length > 0 || directories.length > 0) return { files, directories };
          }
          const list = dataTransfer?.files;
          if (list != null) for (const file of list) files.push(file);
          return { files, directories };
        }
        const ICON_PATHS = {
          chevronOpen: ["M4.6 6.4 8 9.8l3.4-3.4"],
          chevronClosed: ["M6.4 4.6 9.8 8l-3.4 3.4"],
          folder: ["M1.8 4.2h4.1l1.4 1.9h6.9v7.7H1.8z"],
          file: ["M3.8 1.8h5.1l3.3 3.3v9.1H3.8z", "M8.7 1.9v3.4h3.4"],
          newFile: ["M3.8 1.8h5.1l3.3 3.3v9.1H3.8z", "M8.7 1.9v3.4h3.4", "M8 9.6v3", "M6.5 11.1h3"],
          newFolder: ["M1.8 4.2h4.1l1.4 1.9h6.9v7.7H1.8z", "M8 8.6v3", "M6.5 10.1h3"],
          rename: ["M2.2 13.8l.9-3 7.4-7.4 2.1 2.1-7.4 7.4z"],
          copy: ["M5.6 1.8h6.6v9.4H5.6z", "M3.8 4.8v9.4h6.6"],
          cut: [
            "M5.3 3.2 10.4 10.1",
            "M10.7 3.2 5.6 10.1",
            "M2.8 11.7a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0",
            "M10 11.7a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0"
          ],
          paste: ["M4.6 3.8h6.8v9.6H4.6z", "M6.6 3.8V2.4h2.8v1.4", "M6.4 7.2h3.2", "M6.4 9.6h3.2"],
          path: ["M5.6 3 10.4 13", "M3.2 6.2h.01", "M12.8 9.8h.01"],
          terminal: ["M2.6 3.4 6.4 7.8 2.6 12.2", "M8.6 12.4h4.8"],
          image: ["M2.4 3.6h11.2v8.8H2.4z", "M2.4 10.6 5.8 7.6l2.4 2 2.2-1.8 3.2 2.8", "M10.8 6.2h.01"],
          trash: ["M2.8 4.6h10.4", "M6.3 4.6V2.9h3.4v1.7", "M4.4 4.6l.7 9.1h5.8l.7-9.1"],
          refresh: ["M13 8a5 5 0 1 1-1.7-3.7", "M13.3 2.6v3.2h-3.2"],
          open: ["M2.5 12.5V6h6.5l-2.4 2.4", "M6.6 3.5h6v6"],
          more: ["M3.6 8h.01", "M8 8h.01", "M12.4 8h.01"],
          sort: ["M4.4 3.2v9.6", "M2.4 5.2 4.4 3.2 6.4 5.2", "M11.6 12.8V3.2", "M9.6 10.8l2 2 2-2"],
          send: ["M2.2 8h9.4", "M8.4 4.4 11.8 8l-3.4 3.6"]
        };
        function glyph(name, size) {
          const paths = ICON_PATHS[name] ?? ICON_PATHS.file;
          const edge = size ?? 16;
          return h("svg", {
            width: edge,
            height: edge,
            viewBox: "0 0 16 16",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "1.2",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            "aria-hidden": "true",
            focusable: "false"
          }, paths.map((d) => h("path", { key: d, d })));
        }
        const HIGHLIGHT_MAX_CHARS = 256 * 1024;
        const HIGHLIGHT_MAX_TOKENS = 2e4;
        const HIGHLIGHT_NAME_BY_TYPE = {
          com: "dsh-we-com",
          exp: "dsh-we-exp",
          fn: "dsh-we-fn",
          kw: "dsh-we-kw",
          lnk: "dsh-we-lnk",
          num: "dsh-we-num",
          pun: "dsh-we-pun",
          str: "dsh-we-str",
          var: "dsh-we-var"
        };
        const HIGHLIGHT_NAMES = Object.values(HIGHLIGHT_NAME_BY_TYPE);
        const RE_NUMBER = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.[\d_]*)?(?:[eE][+-]?\d+)?)[uUlLfFn]*/u;
        const RE_STRING_DQ = /"(?:[^"\\\n]|\\.)*"/u;
        const RE_STRING_SQ = /'(?:[^'\\\n]|\\.)*'/u;
        const RE_PUNCT = /[-{}\[\]();,.:?!+*\/%&|^<>=~]+/u;
        const RE_COMMENT_BLOCK = /\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//u;
        const RE_COMMENT_SLASH = /\/\/[^\n]*/u;
        const RE_COMMENT_HASH = /#[^\n]*/u;
        const KEYWORDS_JS = [
          "abstract",
          "any",
          "as",
          "asserts",
          "async",
          "await",
          "bigint",
          "boolean",
          "break",
          "case",
          "catch",
          "class",
          "const",
          "continue",
          "debugger",
          "declare",
          "default",
          "delete",
          "do",
          "else",
          "enum",
          "export",
          "extends",
          "false",
          "finally",
          "for",
          "from",
          "function",
          "get",
          "if",
          "implements",
          "import",
          "in",
          "infer",
          "instanceof",
          "interface",
          "is",
          "keyof",
          "let",
          "namespace",
          "never",
          "new",
          "null",
          "number",
          "object",
          "of",
          "out",
          "override",
          "package",
          "private",
          "protected",
          "public",
          "readonly",
          "return",
          "satisfies",
          "set",
          "static",
          "string",
          "super",
          "switch",
          "symbol",
          "this",
          "throw",
          "true",
          "try",
          "type",
          "typeof",
          "undefined",
          "unique",
          "unknown",
          "var",
          "void",
          "while",
          "with",
          "yield"
        ];
        const KEYWORDS_C = [
          "abstract",
          "assert",
          "auto",
          "boolean",
          "break",
          "byte",
          "case",
          "catch",
          "char",
          "class",
          "const",
          "constexpr",
          "continue",
          "default",
          "delete",
          "do",
          "double",
          "else",
          "enum",
          "explicit",
          "export",
          "extends",
          "extern",
          "false",
          "final",
          "finally",
          "float",
          "for",
          "friend",
          "goto",
          "if",
          "implements",
          "import",
          "inline",
          "instanceof",
          "int",
          "interface",
          "internal",
          "is",
          "label",
          "long",
          "namespace",
          "native",
          "new",
          "null",
          "nullptr",
          "operator",
          "override",
          "package",
          "private",
          "protected",
          "public",
          "readonly",
          "record",
          "register",
          "return",
          "sealed",
          "short",
          "signed",
          "sizeof",
          "static",
          "strictfp",
          "struct",
          "super",
          "switch",
          "synchronized",
          "template",
          "this",
          "throw",
          "throws",
          "transient",
          "true",
          "try",
          "typedef",
          "typename",
          "typeof",
          "union",
          "unsigned",
          "using",
          "var",
          "virtual",
          "void",
          "volatile",
          "while"
        ];
        const KEYWORDS_GO = [
          "break",
          "case",
          "chan",
          "const",
          "continue",
          "default",
          "defer",
          "else",
          "fallthrough",
          "false",
          "for",
          "func",
          "go",
          "goto",
          "if",
          "import",
          "interface",
          "iota",
          "map",
          "nil",
          "package",
          "range",
          "return",
          "select",
          "struct",
          "switch",
          "true",
          "type",
          "var"
        ];
        const KEYWORDS_RUST = [
          "as",
          "async",
          "await",
          "break",
          "const",
          "continue",
          "crate",
          "dyn",
          "else",
          "enum",
          "extern",
          "false",
          "fn",
          "for",
          "if",
          "impl",
          "in",
          "let",
          "loop",
          "match",
          "mod",
          "move",
          "mut",
          "pub",
          "ref",
          "return",
          "self",
          "Self",
          "static",
          "struct",
          "super",
          "trait",
          "true",
          "type",
          "unsafe",
          "use",
          "where",
          "while"
        ];
        const KEYWORDS_RUBY = [
          "alias",
          "and",
          "begin",
          "break",
          "case",
          "class",
          "def",
          "defined",
          "do",
          "else",
          "elsif",
          "end",
          "ensure",
          "false",
          "for",
          "if",
          "in",
          "module",
          "next",
          "nil",
          "not",
          "or",
          "redo",
          "rescue",
          "retry",
          "return",
          "self",
          "super",
          "then",
          "true",
          "undef",
          "unless",
          "until",
          "when",
          "while",
          "yield"
        ];
        const KEYWORDS_LUA = [
          "and",
          "break",
          "do",
          "else",
          "elseif",
          "end",
          "false",
          "for",
          "function",
          "goto",
          "if",
          "in",
          "local",
          "nil",
          "not",
          "or",
          "repeat",
          "return",
          "then",
          "true",
          "until",
          "while"
        ];
        const KEYWORDS_PY = [
          "False",
          "None",
          "True",
          "and",
          "as",
          "assert",
          "async",
          "await",
          "break",
          "class",
          "continue",
          "def",
          "del",
          "elif",
          "else",
          "except",
          "finally",
          "for",
          "from",
          "global",
          "if",
          "import",
          "in",
          "is",
          "lambda",
          "nonlocal",
          "not",
          "or",
          "pass",
          "raise",
          "return",
          "try",
          "while",
          "with",
          "yield"
        ];
        const KEYWORDS_SH = [
          "case",
          "do",
          "done",
          "elif",
          "else",
          "esac",
          "fi",
          "for",
          "function",
          "if",
          "in",
          "local",
          "return",
          "select",
          "then",
          "time",
          "until",
          "while"
        ];
        const KEYWORDS_SQL = [
          "add",
          "all",
          "alter",
          "and",
          "any",
          "as",
          "asc",
          "begin",
          "between",
          "by",
          "case",
          "cast",
          "check",
          "column",
          "commit",
          "constraint",
          "create",
          "cross",
          "database",
          "default",
          "delete",
          "desc",
          "distinct",
          "drop",
          "else",
          "end",
          "except",
          "exists",
          "false",
          "foreign",
          "from",
          "full",
          "group",
          "having",
          "if",
          "in",
          "index",
          "inner",
          "insert",
          "intersect",
          "into",
          "is",
          "join",
          "key",
          "left",
          "like",
          "limit",
          "not",
          "null",
          "offset",
          "on",
          "or",
          "order",
          "outer",
          "primary",
          "references",
          "right",
          "rollback",
          "select",
          "set",
          "table",
          "then",
          "true",
          "union",
          "unique",
          "update",
          "values",
          "view",
          "when",
          "where",
          "with"
        ];
        function keywordSource(words, foldCase) {
          const parts = [...words].sort((a, b) => b.length - a.length);
          const body = parts.map((word) => foldCase === true ? foldWordCase(word) : word).join("|");
          return `(?:${body})\\b`;
        }
        function foldWordCase(word) {
          return word.replace(/[A-Za-z]/gu, (ch) => ch === ch.toLowerCase() ? `[${ch}${ch.toUpperCase()}]` : `[${ch}${ch.toLowerCase()}]`);
        }
        function clikeRules(keywords, extra) {
          return [
            ["com", RE_COMMENT_BLOCK],
            ["com", RE_COMMENT_SLASH],
            ["str", /`(?:[^`\\]|\\.)*`/u],
            ["str", RE_STRING_DQ],
            ["str", RE_STRING_SQ],
            ["num", RE_NUMBER],
            ...extra ?? [],
            ["fn", /@[\w$.]+/u],
            ["kw", new RegExp(keywordSource(keywords), "u")],
            ["fn", /[A-Za-z_$][\w$]*(?=\s*\()/u],
            ["var", /[A-Za-z_$][\w$]*(?=\s*[:=])/u],
            ["pun", RE_PUNCT]
          ];
        }
        const RULES_JSON = [
          ["com", RE_COMMENT_SLASH],
          ["com", RE_COMMENT_BLOCK],
          ["var", /"(?:[^"\\\n]|\\.)*"(?=\s*:)/u],
          ["str", RE_STRING_DQ],
          ["str", RE_STRING_SQ],
          ["num", /\b(?:true|false|null)\b/u],
          ["num", RE_NUMBER],
          ["pun", RE_PUNCT]
        ];
        const RULES_HTML = [
          ["com", /<!--[\s\S]*?-->/u],
          ["kw", /<![A-Za-z][^>]*>/u],
          ["kw", /<\/?[A-Za-z][\w:.-]*/u],
          ["var", /[\w:.-]+(?=\s*=)/u],
          ["str", RE_STRING_DQ],
          ["str", RE_STRING_SQ],
          ["num", /&#?\w+;/u],
          ["pun", RE_PUNCT]
        ];
        const RULES_CSS = [
          ["com", RE_COMMENT_BLOCK],
          ["str", RE_STRING_DQ],
          ["str", RE_STRING_SQ],
          ["kw", /@[\w-]+/u],
          ["kw", /!(?:important|default)\b/u],
          ["var", /--[\w-]+/u],
          ["num", /#[0-9a-fA-F]{3,8}\b/u],
          ["num", /\b\d[\d.]*(?:[a-z%]{0,8})?/u],
          ["fn", /[\w-]+(?=\s*:)/u],
          ["pun", RE_PUNCT]
        ];
        const RULES_MARKDOWN = [
          ["com", /<!--[\s\S]*?-->/u],
          ["str", /`[^`\n]*`/u],
          ["lnk", /!?\[[^\]\n]*\]\([^)\n]*\)/u],
          ["lnk", /<https?:\/\/[^>\s]*>/u],
          ["kw", /```[^\n]*/u],
          ["fn", /\*\*[^\n]+?\*\*/u],
          ["kw", /#{1,6}[^\n]*/u]
        ];
        const RULES_YAML = [
          ["com", RE_COMMENT_HASH],
          ["str", RE_STRING_DQ],
          ["str", RE_STRING_SQ],
          ["kw", /-{3,}|\.{3}/u],
          ["var", /[&*][\w-]+/u],
          ["var", /!!?[\w:./-]+/u],
          ["num", /\b(?:true|false|null|yes|no|on|off|True|False|Null)\b|~/u],
          ["num", RE_NUMBER],
          ["fn", /(?:^|\n)[ \t]*-?[ \t]*[\w$./-]+(?=\s*:)/u],
          ["pun", /[{}\[\],:|>-]+/u]
        ];
        const RULES_INI = [
          ["com", /[;#][^\n]*/u],
          ["kw", /\[[^\]\n]*\]/u],
          ["str", RE_STRING_DQ],
          ["str", RE_STRING_SQ],
          ["num", /\b(?:true|false|yes|no|on|off)\b/u],
          ["num", RE_NUMBER],
          ["fn", /(?:^|\n)[ \t]*[\w.$-]+(?=\s*[=:])/u],
          ["pun", /[,=.]+/u]
        ];
        const RULES_PY = [
          ["com", RE_COMMENT_HASH],
          ["str", /(?:[rRbBuUfF]{0,2})?"""[\s\S]*?"""/u],
          ["str", /(?:[rRbBuUfF]{0,2})?'''[\s\S]*?'''/u],
          ["str", /(?:[rRbBuUfF]{0,2})?"(?:[^"\\\n]|\\.)*"/u],
          ["str", /(?:[rRbBuUfF]{0,2})?'(?:[^'\\\n]|\\.)*'/u],
          ["fn", /@[\w.]+/u],
          ["num", RE_NUMBER],
          ["kw", new RegExp(keywordSource(KEYWORDS_PY), "u")],
          ["fn", /[A-Za-z_]\w*(?=\s*\()/u],
          ["pun", RE_PUNCT]
        ];
        const RULES_SH = [
          ["com", RE_COMMENT_HASH],
          ["str", RE_STRING_SQ],
          ["str", /"(?:[^"\\$\n]|\\.)*"/u],
          ["var", /\$(?:\{[^}\n]*\}|[\w@*#?$!-]+)/u],
          ["kw", new RegExp(keywordSource(KEYWORDS_SH), "u")],
          ["num", RE_NUMBER],
          ["var", /(?:^|\s)--?[A-Za-z][\w-]*/u],
          ["pun", RE_PUNCT]
        ];
        const RULES_SQL = [
          ["com", /--[^\n]*/u],
          ["com", RE_COMMENT_BLOCK],
          ["str", /'(?:[^']|'')*'/u],
          ["str", RE_STRING_DQ],
          ["num", RE_NUMBER],
          ["kw", new RegExp(keywordSource(KEYWORDS_SQL, true), "u")],
          ["pun", RE_PUNCT]
        ];
        const RULES_DIFF = [
          ["com", /(?:^|\n)(?:diff|index|new file|deleted file|similarity index|rename (?:from|to)|old mode|new mode)[^\n]*/u],
          ["com", /(?:^|\n)(?:\+\+\+|---)[^\n]*/u],
          ["var", /(?:^|\n)@@[^\n]*/u],
          ["str", /(?:^|\n)\+[^\n]*/u],
          ["kw", /(?:^|\n)-[^\n]*/u]
        ];
        const LANGUAGE_BY_EXTENSION = new Map(Object.entries({
          js: "js",
          mjs: "js",
          cjs: "js",
          jsx: "js",
          ts: "ts",
          mts: "ts",
          cts: "ts",
          tsx: "ts",
          json: "json",
          jsonc: "json",
          json5: "json",
          jsonl: "json",
          ndjson: "json",
          html: "html",
          htm: "html",
          xhtml: "html",
          xml: "html",
          xsl: "html",
          xslt: "html",
          svg: "html",
          vue: "html",
          svelte: "html",
          astro: "html",
          css: "css",
          scss: "css",
          sass: "css",
          less: "css",
          md: "markdown",
          markdown: "markdown",
          mdx: "markdown",
          yaml: "yaml",
          yml: "yaml",
          ini: "ini",
          cfg: "ini",
          conf: "ini",
          config: "ini",
          env: "ini",
          properties: "ini",
          toml: "ini",
          lock: "ini",
          py: "python",
          pyi: "python",
          pyw: "python",
          sh: "shell",
          bash: "shell",
          zsh: "shell",
          fish: "shell",
          ksh: "shell",
          ps1: "shell",
          psm1: "shell",
          bat: "shell",
          cmd: "shell",
          sql: "sql",
          diff: "diff",
          patch: "diff",
          c: "c",
          h: "c",
          cc: "c",
          cpp: "c",
          cxx: "c",
          hpp: "c",
          hh: "c",
          hxx: "c",
          m: "c",
          mm: "c",
          java: "c",
          kt: "c",
          kts: "c",
          scala: "c",
          swift: "c",
          cs: "c",
          dart: "c",
          php: "php",
          proto: "c",
          graphql: "c",
          gql: "c",
          hs: "c",
          clj: "c",
          cljs: "c",
          nim: "c",
          zig: "c",
          v: "c",
          asm: "c",
          s: "c",
          gradle: "c",
          groovy: "c",
          cmake: "c",
          mk: "c",
          tex: "c",
          go: "go",
          rs: "rust",
          rb: "ruby",
          rake: "ruby",
          gemspec: "ruby",
          pl: "ruby",
          pm: "ruby",
          r: "ruby",
          jl: "ruby",
          ex: "ruby",
          exs: "ruby",
          erl: "ruby",
          hrl: "ruby",
          lua: "lua"
        }));
        const CLIKE_KEYWORDS = {
          c: KEYWORDS_C,
          go: KEYWORDS_GO,
          js: KEYWORDS_JS,
          lua: KEYWORDS_LUA,
          php: KEYWORDS_C,
          ruby: KEYWORDS_RUBY,
          rust: KEYWORDS_RUST,
          ts: KEYWORDS_JS
        };
        const CLIKE_EXTRA = {
          php: [
            ["var", /\$[A-Za-z_]\w*/u],
            ["com", RE_COMMENT_HASH]
          ],
          rust: [["exp", /'[A-Za-z_]\w*/u]]
        };
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
          yaml: RULES_YAML
        };
        const scanners = /* @__PURE__ */ new Map();
        function languageOfPath(path) {
          if (typeof path !== "string" || path === "") return null;
          const name = path.replace(/\\/gu, "/").split("/").pop() ?? "";
          const dot = name.lastIndexOf(".");
          if (dot === -1) return null;
          return LANGUAGE_BY_EXTENSION.get(name.slice(dot + 1).toLowerCase()) ?? null;
        }
        function normalizeNewlines(text) {
          return text.replace(/\r\n?/gu, "\n");
        }
        function needsTrailingLine(source) {
          return source === "" || source.endsWith("\n");
        }
        function highlightRegistry() {
          const namespace = globalThis.CSS;
          return namespace === void 0 || namespace === null ? void 0 : namespace.highlights;
        }
        function highlightSupported() {
          return typeof Highlight === "function" && highlightRegistry() !== void 0;
        }
        function makeScanner(rules) {
          const pattern = new RegExp(rules.map((rule) => `(${rule[1].source})`).join("|"), "gu");
          const types = rules.map((rule) => rule[0]);
          return (text) => {
            const tokens = [];
            let last = 0;
            let match;
            pattern.lastIndex = 0;
            while ((match = pattern.exec(text)) !== null) {
              if (match[0] === "") {
                pattern.lastIndex += 1;
                continue;
              }
              for (let index = 0; index < types.length; index += 1) {
                if (match[index + 1] === void 0) continue;
                if (match.index > last) tokens.push({ type: null, text: text.slice(last, match.index) });
                tokens.push({ type: types[index], text: match[0] });
                last = match.index + match[0].length;
                break;
              }
            }
            if (last < text.length) tokens.push({ type: null, text: text.slice(last) });
            return tokens;
          };
        }
        function scannerFor(language) {
          const cached = scanners.get(language);
          if (cached !== void 0) return cached;
          const extra = CLIKE_EXTRA[language];
          const clikeKeywords = CLIKE_KEYWORDS[language];
          const rules = RULES_BY_LANGUAGE[language] ?? (clikeKeywords === void 0 ? void 0 : clikeRules(clikeKeywords, extra));
          const scan = rules === void 0 ? null : makeScanner(rules);
          scanners.set(language, scan);
          return scan;
        }
        function tokenize(text, language) {
          const source = normalizeNewlines(text);
          if (language === null || source.length > HIGHLIGHT_MAX_CHARS) return null;
          if (source === "") return [];
          const scan = scannerFor(language);
          if (scan === null) return null;
          const tokens = scan(source);
          return tokens.length > HIGHLIGHT_MAX_TOKENS ? null : tokens;
        }
        const HIGHLIGHT_API_SUPPORTED = highlightSupported();
        const highlightSources = /* @__PURE__ */ new Map();
        let highlightSourceSeq = 0;
        function nextHighlightSourceId() {
          highlightSourceSeq += 1;
          return `we-hl-${String(highlightSourceSeq)}`;
        }
        function applyHighlights(id, scope, tokens) {
          const registry = highlightRegistry();
          if (registry === void 0) return false;
          const first = scope === null ? null : scope.firstChild;
          const node = first !== null && first.nodeType === 3 ? first : null;
          highlightSources.set(id, { node, tokens });
          rebuildHighlights(registry);
          return true;
        }
        function releaseHighlights(id) {
          if (!highlightSources.delete(id)) return;
          const registry = highlightRegistry();
          if (registry !== void 0) rebuildHighlights(registry);
        }
        function rebuildHighlights(registry) {
          for (const name of HIGHLIGHT_NAMES) registry.delete(name);
          const grouped = /* @__PURE__ */ new Map();
          for (const source of highlightSources.values()) {
            if (source.tokens === null || source.node === null) continue;
            let offset = 0;
            for (const token of source.tokens) {
              const end = offset + token.text.length;
              if (token.type !== null) {
                const range = document.createRange();
                range.setStart(source.node, offset);
                range.setEnd(source.node, end);
                const list = grouped.get(token.type);
                if (list === void 0) grouped.set(token.type, [range]);
                else list.push(range);
              }
              offset = end;
            }
          }
          for (const [type, ranges] of grouped) {
            registry.set(HIGHLIGHT_NAME_BY_TYPE[type], new Highlight(...ranges));
          }
        }
        function InputSink(props) {
          const { sessionId, inputActions, session } = props;
          const id = typeof sessionId === "string" && sessionId !== "" ? sessionId : session?.sessionId;
          React.useEffect(() => {
            if (typeof id !== "string" || id === "" || inputActions === void 0) return void 0;
            inputTargets.set(id, inputActions);
            return () => {
              if (inputTargets.get(id) === inputActions) inputTargets.delete(id);
            };
          }, [id, inputActions]);
          return null;
        }
        function createEditor(ctx) {
          function EditorSurface(props) {
            const { t, sessionId, path, wrap, onToggleWrap, scrollportRef, reloadKey, variant, onLoaded, onFailed, inputActions } = props;
            const storageKey = `${sessionId}\0${path}`;
            const [doc, setDoc] = React.useState({ phase: "loading" });
            const [draft, setDraft] = React.useState("");
            const [save, setSave] = React.useState({ phase: "idle" });
            const [conflict, setConflict] = React.useState(null);
            const [changed, setChanged] = React.useState(false);
            const [token, setToken] = React.useState(0);
            const [menu, setMenu] = React.useState(null);
            const [send, setSend] = React.useState({ phase: "idle" });
            const { notice, showNotice, dismissNotice } = useNotice();
            const draftRef = React.useRef(draft);
            draftRef.current = draft;
            const docRef = React.useRef(doc);
            docRef.current = doc;
            const dirtyRef = React.useRef(false);
            dirtyRef.current = doc.phase === "ready" && draft !== doc.text;
            const savingRef = React.useRef(false);
            const areaRef = React.useRef(null);
            const hlRef = React.useRef(null);
            const highlightId = React.useRef("");
            if (highlightId.current === "") highlightId.current = nextHighlightSourceId();
            const language = React.useMemo(() => languageOfPath(path), [path]);
            const highlightText = React.useMemo(() => normalizeNewlines(draft), [draft]);
            const lineNumbersText = React.useMemo(() => {
              if (highlightText === "") return "1";
              const lines = highlightText.split("\n");
              if (lines.length === 0) return "1";
              let out = "";
              for (let i = 1; i <= lines.length; i += 1) {
                out += String(i);
                if (i < lines.length) out += "\n";
              }
              if (needsTrailingLine(highlightText)) {
                out += "\n" + String(lines.length + 1);
              }
              return out;
            }, [highlightText]);
            const tokens = React.useMemo(() => {
              if (!HIGHLIGHT_API_SUPPORTED) return null;
              try {
                return tokenize(draft, language);
              } catch {
                return null;
              }
            }, [draft, language]);
            const syncHighlight = React.useCallback(() => {
              const area = areaRef.current;
              const layer = hlRef.current;
              if (area === null || layer === null) return;
              const width = `${String(area.clientWidth)}px`;
              if (layer.style.width !== width) layer.style.width = width;
              layer.scrollTop = area.scrollTop;
              layer.scrollLeft = area.scrollLeft;
            }, []);
            const attachArea = React.useCallback((node) => {
              areaRef.current = node;
              if (typeof scrollportRef === "function") scrollportRef(node);
            }, [scrollportRef]);
            const gutterRef = React.useRef(null);
            const syncGutter = React.useCallback(() => {
              const area = areaRef.current;
              const gutter = gutterRef.current;
              if (area === null || gutter === null) return;
              if (gutter.scrollTop !== area.scrollTop) {
                gutter.scrollTop = area.scrollTop;
              }
            }, []);
            React.useLayoutEffect(() => {
              syncHighlight();
              syncGutter();
            });
            React.useLayoutEffect(() => {
              try {
                applyHighlights(highlightId.current, hlRef.current, tokens);
              } catch {
                releaseHighlights(highlightId.current);
              }
            }, [tokens]);
            React.useEffect(() => () => {
              releaseHighlights(highlightId.current);
            }, []);
            React.useEffect(() => {
              const area = areaRef.current;
              if (area === null || typeof ResizeObserver !== "function") return void 0;
              const observer = new ResizeObserver(() => {
                syncHighlight();
                syncGutter();
              });
              observer.observe(area, { box: "content-box" });
              return () => {
                observer.disconnect();
              };
            }, [syncHighlight, syncGutter]);
            React.useEffect(() => {
              const controller = new AbortController();
              let cancelled = false;
              void (async () => {
                const result = await ctx.remote.workspaceFiles.readBytes(sessionId, path, {}, controller.signal);
                if (cancelled) return;
                if (!result.ok) {
                  if (onFailed !== void 0) onFailed();
                  const failure = describeFailure({ code: result.error.code, message: result.error.message }, t);
                  setDoc((prev) => prev.phase === "ready" ? { ...prev, notice: failure } : { phase: "failed", code: result.error.code, message: failure });
                  return;
                }
                const value = result.value;
                let text;
                try {
                  text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(value.data);
                } catch {
                  if (onFailed !== void 0) onFailed();
                  setDoc((prev) => prev.phase === "ready" ? { ...prev, notice: t("error.notUtf8") } : { phase: "failed", code: "not-utf8", message: t("error.notUtf8") });
                  return;
                }
                if (text.length > MAX_EDIT_CHARS) {
                  if (onFailed !== void 0) onFailed();
                  const message = t("error.tooLarge", { limit: sizeLabel(MAX_EDIT_CHARS) });
                  setDoc((prev) => prev.phase === "ready" ? { ...prev, notice: message } : { phase: "failed", code: "too-large", message });
                  return;
                }
                if (onLoaded !== void 0) onLoaded(value.version);
                if (dirtyRef.current) {
                  setDoc((prev) => prev.phase === "ready" ? { ...prev, diskVersion: value.version } : prev);
                  setChanged(true);
                  return;
                }
                const stash = drafts.get(storageKey);
                setDoc({
                  phase: "ready",
                  text: stash === void 0 ? text : stash.text,
                  version: stash === void 0 ? value.version : stash.version,
                  diskVersion: value.version,
                  absolutePath: value.absolutePath,
                  notice: null
                });
                setDraft(stash === void 0 ? text : stash.text);
                setSave({ phase: "idle" });
                setConflict(null);
                setChanged(false);
              })().catch((error) => {
                if (cancelled) return;
                const message = error instanceof Error ? error.message : String(error);
                if (onFailed !== void 0) onFailed();
                setDoc((prev) => prev.phase === "ready" ? { ...prev, notice: t("error.read", { message }) } : { phase: "failed", code: "read-failed", message: t("error.read", { message }) });
              });
              return () => {
                cancelled = true;
                controller.abort();
              };
            }, [reloadKey, token, storageKey]);
            React.useEffect(() => () => {
              if (dirtyRef.current) drafts.set(storageKey, { text: draftRef.current, version: docRef.current.version });
              else drafts.delete(storageKey);
            }, [storageKey]);
            React.useEffect(() => {
              if (save.phase !== "saved" && send.phase !== "sent") return void 0;
              const timer = setTimeout(() => {
                setSave((prev) => prev.phase === "saved" ? { phase: "idle" } : prev);
                setSend({ phase: "idle" });
              }, 2500);
              return () => {
                clearTimeout(timer);
              };
            }, [save.phase, send.phase]);
            const saveNow = async (force) => {
              const current = docRef.current;
              if (current.phase !== "ready" || savingRef.current) return;
              const body = { sessionId, path, content: draftRef.current };
              if (!force && current.version !== void 0) body.expectedVersion = current.version;
              savingRef.current = true;
              setSave({ phase: "saving" });
              let response;
              try {
                response = await fetch(WRITE_URL, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(body)
                });
              } catch {
                savingRef.current = false;
                setSave({ phase: "failed", message: t("error.transport") });
                return;
              }
              let payload = null;
              try {
                payload = await response.json();
              } catch {
                payload = null;
              }
              savingRef.current = false;
              if (!response.ok) {
                const code = typeof payload?.code === "string" ? payload.code : "write-failed";
                const message = typeof payload?.message === "string" ? payload.message : `HTTP ${String(response.status)}`;
                if (code === "stale-version" || code === "not-observed") {
                  setConflict({ code, message });
                  setSave({ phase: "idle" });
                  return;
                }
                setSave({ phase: "failed", message: t("error.save", { message }) });
                return;
              }
              drafts.delete(storageKey);
              setDoc({
                phase: "ready",
                text: draftRef.current,
                version: payload?.version ?? current.version,
                diskVersion: payload?.version ?? current.diskVersion,
                absolutePath: current.absolutePath,
                notice: null
              });
              setConflict(null);
              setChanged(false);
              setSave({ phase: "saved" });
            };
            const discard = () => {
              drafts.delete(storageKey);
              setConflict(null);
              setChanged(false);
              setDraft(docRef.current.phase === "ready" ? docRef.current.text : "");
              setToken((value) => value + 1);
            };
            const selectedText = () => {
              const area = areaRef.current;
              if (area === null) return "";
              return area.value.slice(area.selectionStart ?? 0, area.selectionEnd ?? 0);
            };
            const replaceSelection = (text) => {
              const area = areaRef.current;
              if (area === null) return;
              const start = area.selectionStart ?? 0;
              const end = area.selectionEnd ?? start;
              area.setRangeText(text, start, end, "end");
              area.focus();
              setDraft(area.value);
              setSave((prev) => prev.phase === "saving" ? prev : { phase: "idle" });
            };
            const cutSelection = async () => {
              const text = selectedText();
              if (text === "") return;
              if (!await writeClipboard(text)) {
                setSend({ phase: "failed", text: t("send.failed.clipboard") });
                return;
              }
              replaceSelection("");
            };
            const copySelection = async () => {
              const text = selectedText();
              if (text === "") return;
              if (!await writeClipboard(text)) setSend({ phase: "failed", text: t("send.failed.clipboard") });
            };
            const pasteSelection = async () => {
              const text = await readClipboard();
              if (text === void 0 || text === "") return;
              replaceSelection(text);
            };
            const selectAll = () => {
              const area = areaRef.current;
              if (area === null) return;
              area.focus();
              area.select();
            };
            const copyEditorPath = async (relative) => {
              const outcome = await copyPathToClipboard(doc.absolutePath ?? path, relative, sessionCwd(ctx, sessionId), t);
              if (!outcome.ok) {
                showNotice(outcome.text, "error", true);
                return;
              }
              showNotice(t("files.copyPath.done", { path: outcome.text }), "ok");
            };
            const openEditorTerminal = async (element) => {
              const file = doc.absolutePath ?? path;
              await openTerminalAt(ctx, directoryOfFile(file, sessionCwd(ctx, sessionId)), element, t, (result) => {
                if (result.ok === true) {
                  showNotice(t("files.terminal.done", { path: result.dir }), "ok");
                  return;
                }
                showNotice(t(result.key), "error", true);
              });
            };
            const sendToInput = () => {
              const area = areaRef.current;
              const current = docRef.current;
              if (area === null || current.phase !== "ready") return;
              const start = area.selectionStart ?? 0;
              const end = area.selectionEnd ?? start;
              const reference = lineReferenceToken(
                relativizeToCwd(current.absolutePath ?? path, sessionCwd(ctx, sessionId)),
                lineNumberOf(draftRef.current, start),
                lineNumberOf(draftRef.current, end)
              );
              if (reference === null) {
                setSend({ phase: "failed", text: t("send.failed.path") });
                return;
              }
              const actions = inputActions ?? inputTargets.get(sessionId);
              if (actions === void 0 || typeof actions.captureInsertion !== "function" || typeof actions.insertText !== "function") {
                setSend({ phase: "failed", text: t("send.failed.input") });
                return;
              }
              if (!actions.insertText(`${reference} `, actions.captureInsertion())) {
                setSend({ phase: "failed", text: t("send.failed.busy") });
                return;
              }
              setSave((prev) => prev.phase === "saved" ? { phase: "idle" } : prev);
              setSend({ phase: "sent", text: t("send.sent", { token: reference }) });
            };
            const onKeyDown = (event) => {
              if (event.key === "Escape" && menu !== null) {
                event.preventDefault();
                setMenu(null);
                return;
              }
              if (event.key === "s" && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
                event.preventDefault();
                void saveNow(false);
              }
            };
            if (doc.phase === "loading") {
              return h(
                "div",
                { className: `dsh-we-root ${variant}`, "data-workspace-editor": "loading" },
                h("style", null, CSS),
                h(
                  "div",
                  { className: "dsh-we-message" },
                  h("p", { className: "dsh-we-message-text" }, t("status.loading"))
                )
              );
            }
            if (doc.phase === "failed") {
              return h(
                "div",
                { className: `dsh-we-root ${variant}`, "data-workspace-editor": "failed" },
                h("style", null, CSS),
                h(
                  "div",
                  { className: "dsh-we-message" },
                  h("p", { className: "dsh-we-message-text", "data-workspace-editor-error": doc.code }, doc.message),
                  h("button", {
                    type: "button",
                    className: "dsh-we-button",
                    "data-workspace-editor-retry": "",
                    onClick: () => {
                      setToken((value) => value + 1);
                    }
                  }, t("action.retry"))
                )
              );
            }
            const sendMenuItem = (id, label, run, extra) => h("button", {
              key: id,
              type: "button",
              className: "dsh-wef-menu-item",
              disabled: extra?.disabled === true,
              title: extra?.title,
              "data-workspace-editor-send-item": id,
              "data-disabled": extra?.disabled === true ? "true" : "false",
              onClick: (event) => {
                event.stopPropagation();
                setMenu(null);
                run(event);
              }
            }, extra?.icon === null ? null : glyph(extra?.icon ?? "file", 14), label);
            const dirty = draft !== doc.text;
            const highlightTone = !HIGHLIGHT_API_SUPPORTED ? "unsupported" : language === null ? "plain" : tokens === null ? "over-limit" : "on";
            const statusTone = save.phase === "saved" ? "saved" : dirty ? "dirty" : "clean";
            const statusText = save.phase === "saving" ? t("action.saving") : save.phase === "saved" ? t("status.saved") : dirty ? t("status.dirty") : t("status.clean");
            return h(
              "div",
              {
                className: `dsh-we-root ${variant}`,
                "data-workspace-editor": "ready",
                "data-workspace-editor-path": doc.absolutePath ?? ""
              },
              h("style", null, CSS),
              conflict !== null && h(
                "p",
                {
                  className: "dsh-we-banner",
                  "data-tone": "warn",
                  "data-workspace-editor-conflict": conflict.code
                },
                h(
                  "span",
                  { className: "dsh-we-banner-text" },
                  t(conflict.code === "not-observed" ? "conflict.exists" : "conflict.stale"),
                  " ",
                  t("conflict.message"),
                  " ",
                  h("span", { className: "dsh-we-detail", "data-workspace-editor-conflict-detail": "" }, conflict.message)
                ),
                h("button", {
                  type: "button",
                  className: "dsh-we-button",
                  "data-workspace-editor-conflict-reload": "",
                  onClick: discard
                }, t("action.discard")),
                h("button", {
                  type: "button",
                  className: "dsh-we-button",
                  "data-primary": "true",
                  "data-workspace-editor-overwrite": "",
                  onClick: () => {
                    void saveNow(true);
                  }
                }, t("action.overwrite"))
              ),
              conflict === null && changed && h(
                "p",
                {
                  className: "dsh-we-banner",
                  "data-tone": "warn",
                  "data-workspace-editor-changed": ""
                },
                h("span", { className: "dsh-we-banner-text" }, t("changed.message")),
                h("button", {
                  type: "button",
                  className: "dsh-we-button",
                  "data-workspace-editor-changed-reload": "",
                  onClick: discard
                }, t("action.discard")),
                h("button", {
                  type: "button",
                  className: "dsh-we-button",
                  "data-workspace-editor-changed-keep": "",
                  onClick: () => {
                    setChanged(false);
                  }
                }, t("action.keep"))
              ),
              save.phase === "failed" && h("p", {
                className: "dsh-we-banner",
                "data-tone": "error",
                "data-workspace-editor-save-error": ""
              }, h("span", { className: "dsh-we-banner-text" }, save.message)),
              send.phase === "sent" && h("p", {
                className: "dsh-we-banner",
                "data-tone": "success",
                "data-workspace-editor-send": "sent"
              }, h("span", { className: "dsh-we-banner-text" }, send.text)),
              send.phase === "failed" && h("p", {
                className: "dsh-we-banner",
                "data-tone": "error",
                "data-workspace-editor-send": "failed"
              }, h("span", { className: "dsh-we-banner-text" }, send.text)),
              doc.notice != null && h("p", {
                className: "dsh-we-banner",
                "data-tone": "warn",
                "data-workspace-editor-notice": ""
              }, h("span", { className: "dsh-we-banner-text" }, doc.notice)),
              notice !== null && h(
                "p",
                {
                  className: "dsh-we-banner",
                  "data-tone": notice.tone,
                  "data-workspace-editor-action-notice": ""
                },
                h("span", { className: "dsh-we-banner-text" }, notice.text),
                h("button", {
                  type: "button",
                  className: "dsh-we-button",
                  "data-workspace-editor-action-notice-dismiss": "",
                  onClick: () => {
                    dismissNotice();
                  }
                }, t("action.cancel"))
              ),
              h(
                "div",
                { className: "dsh-we-bar" },
                h("span", {
                  className: "dsh-we-status",
                  "data-tone": statusTone,
                  "data-workspace-editor-status": statusTone
                }, statusText),
                // 路径：与右键「复制相对路径」**同一份口径**（`relativizeToCwd` + `sessionCwd`），
                // 所以工作区外的文件自动回退成绝对路径、拿不到 cwd 时原样显示。
                // 显示宽度不够时从头部截断（保住文件名），完整绝对路径在 `title` 与锚点属性上。
                h("span", {
                  className: "dsh-we-status-path",
                  title: doc.absolutePath ?? path,
                  "data-workspace-editor-status-path": doc.absolutePath ?? path
                }, shortenPath(relativizeToCwd(doc.absolutePath ?? path, sessionCwd(ctx, sessionId)))),
                h("span", { className: "dsh-we-spacer" }),
                h("span", { className: "dsh-we-hint", "data-workspace-editor-hint": "" }, t("hint.save")),
                onToggleWrap !== void 0 && h("button", {
                  type: "button",
                  className: "dsh-we-button",
                  "data-workspace-editor-wrap": wrap ? "true" : "false",
                  onClick: onToggleWrap
                }, t(wrap ? "action.wrap.on" : "action.wrap.off")),
                h("button", {
                  type: "button",
                  className: "dsh-we-button",
                  "data-workspace-editor-reload": "",
                  disabled: save.phase === "saving",
                  onClick: discard
                }, t("action.reload")),
                h("button", {
                  type: "button",
                  className: "dsh-we-button",
                  "data-primary": dirty ? "true" : "false",
                  "data-workspace-editor-save": "",
                  disabled: !dirty || save.phase === "saving",
                  onClick: () => {
                    void saveNow(false);
                  }
                }, t("action.save"))
              ),
              h(
                "div",
                {
                  className: "dsh-we-code",
                  "data-wrap": wrap ? "true" : "false",
                  "data-workspace-editor-language": language ?? ""
                },
                h("pre", {
                  className: "dsh-we-gutter",
                  "aria-hidden": "true",
                  ref: gutterRef
                }, lineNumbersText),
                h(
                  "div",
                  { className: "dsh-we-code-body" },
                  // 高亮层在**下**、textarea 在**上**：textarea 的字是透明的（只留光标与选区），
                  // 看得见的字形全部来自这一层。`aria-hidden` 免得读屏把正文念两遍。
                  h(
                    "pre",
                    {
                      className: "dsh-we-hl",
                      "aria-hidden": "true",
                      "data-workspace-editor-highlight": highlightTone,
                      ref: hlRef
                    },
                    // 正文就是**一个文本节点**：上色交给 Custom Highlight API（Range + `::highlight()`），
                    // 一个 span 都不加 —— 每次按键重建几千个 span 的代价实测会让打字掉帧（见 applyHighlights）。
                    // 末尾那个 `<br>` 是给 textarea 的「结尾空行」补行盒的（见 needsTrailingLine）。
                    highlightText,
                    needsTrailingLine(highlightText) ? h("br") : null
                  ),
                  h("textarea", {
                    ref: attachArea,
                    className: "dsh-we-editor",
                    "data-wrap": wrap ? "true" : "false",
                    "data-workspace-editor-input": "",
                    "aria-label": t("editor.label"),
                    value: draft,
                    wrap: wrap ? "soft" : "off",
                    spellCheck: false,
                    autoCapitalize: "off",
                    autoCorrect: "off",
                    onScroll: (event) => {
                      syncHighlight();
                      syncGutter();
                    },
                    onChange: (event) => {
                      setDraft(event.target.value);
                      setSave((prev) => prev.phase === "saving" ? prev : { phase: "idle" });
                    },
                    onContextMenu: (event) => {
                      event.preventDefault();
                      areaRef.current = event.currentTarget;
                      const start = event.currentTarget.selectionStart ?? 0;
                      const end = event.currentTarget.selectionEnd ?? start;
                      setMenu({
                        ...menuAnchorFor(event),
                        // 引用在右键那一刻就算好：点菜单不会动选区，但先算一次能让菜单项的
                        // title 直接显示「将要插入什么」，发送时也不必再猜选区。
                        token: lineReferenceToken(
                          relativizeToCwd(doc.absolutePath ?? path, sessionCwd(ctx, sessionId)),
                          lineNumberOf(draft, start),
                          lineNumberOf(draft, end)
                        )
                      });
                    },
                    onKeyDown
                  })
                )
              ),
              menu !== null && h("div", {
                className: "dsh-wef-backdrop",
                "data-workspace-editor-send-backdrop": "",
                onClick: () => {
                  setMenu(null);
                },
                onContextMenu: (event) => {
                  event.preventDefault();
                  setMenu(null);
                }
              }),
              menu !== null && h(
                "div",
                {
                  className: "dsh-wef-menu",
                  style: { left: `${String(menu.x)}px`, top: `${String(menu.y)}px` },
                  "data-workspace-editor-send-menu": menu.token ?? ""
                },
                sendMenuItem("cut", t("action.cut"), () => {
                  void cutSelection();
                }, { icon: null }),
                sendMenuItem("copy", t("action.copy"), () => {
                  void copySelection();
                }, { icon: null }),
                sendMenuItem("paste", t("action.paste"), () => {
                  void pasteSelection();
                }, { icon: null }),
                sendMenuItem("selectAll", t("action.selectAll"), selectAll, { icon: null }),
                h("div", { className: "dsh-wef-menu-sep", key: "sep" }),
                sendMenuItem("send", t("send.menu"), sendToInput, {
                  icon: "send",
                  disabled: menu.token === null,
                  title: menu.token === null ? t("send.failed.path") : t("send.menuTitle", { token: menu.token })
                }),
                h("div", { className: "dsh-wef-menu-sep", key: "sep-paths" }),
                sendMenuItem("copy-path", t("files.copyPath"), () => {
                  void copyEditorPath(false);
                }, { icon: "path" }),
                sendMenuItem("copy-path-relative", t("files.copyPathRelative"), () => {
                  void copyEditorPath(true);
                }, { icon: "path" }),
                sendMenuItem("open-terminal", t("files.openTerminal"), (event) => {
                  void openEditorTerminal(event?.currentTarget ?? null);
                }, { icon: "terminal" })
              )
            );
          }
          function DocumentBody(props) {
            const { resourceAddress, content, wrap, scrollportRef, t, inputActions } = props;
            const request = content !== void 0 && content !== null && content.kind === "renderer" ? content : null;
            const file = React.useMemo(() => parseSessionFileAddress(resourceAddress), [resourceAddress]);
            if (file === null || request === null) {
              return h(
                "div",
                { className: "dsh-we-root dsh-we-fill", "data-workspace-editor": "unavailable" },
                h("style", null, CSS),
                h(
                  "div",
                  { className: "dsh-we-message" },
                  h("p", { className: "dsh-we-message-text" }, t("status.noAddress"))
                )
              );
            }
            return h(EditorSurface, {
              t,
              sessionId: file.sessionId,
              path: file.path,
              wrap: wrap === true,
              scrollportRef,
              reloadKey: `r${String(request.revision)}`,
              variant: "dsh-we-fill",
              onLoaded: (version) => {
                request.loaded(version);
              },
              onFailed: () => {
                request.failed();
              },
              inputActions
            });
          }
          function PaneBody(props) {
            const { useTabInfo, sessionId, t, inputActions } = props;
            let tab = null;
            try {
              if (typeof useTabInfo === "function") {
                const info = useTabInfo();
                tab = info?.tab ?? null;
              }
            } catch {
              tab = null;
            }
            const [wrap, setWrap] = React.useState(true);
            const target = React.useMemo(() => paneTarget(tab, sessionId), [tab, sessionId]);
            if (target === null) {
              return h(
                "div",
                { className: "dsh-we-root dsh-we-pane", "data-workspace-editor": "unavailable" },
                h("style", null, CSS),
                h(
                  "div",
                  { className: "dsh-we-message" },
                  h("p", { className: "dsh-we-message-text" }, t("status.noAddress"))
                )
              );
            }
            return h(EditorSurface, {
              t,
              sessionId: target.sessionId,
              path: target.path,
              wrap,
              onToggleWrap: () => {
                setWrap((value) => !value);
              },
              scrollportRef: null,
              reloadKey: "tab",
              variant: "dsh-we-pane",
              inputActions
            });
          }
          function EditAction(props) {
            const { absolutePath, sessionId, t } = props;
            if (typeof absolutePath !== "string" || absolutePath === "") return null;
            if (imageMediaTypeOf(absolutePath) !== void 0) return null;
            const open = (event) => {
              const target = ctx.sidebarRight.commandTarget(event.currentTarget);
              const owner = target?.sessionId ?? sessionId;
              const placement = target?.tabId === void 0 ? target?.paneId === void 0 ? {} : { paneId: target.paneId } : { replaceTab: target.tabId };
              ctx.sidebarRight.openResource(absoluteFileAddress(absolutePath), {
                kind: EDITOR_KIND,
                ...placement,
                params: { sessionId: owner, path: absolutePath }
              });
            };
            return h("button", {
              type: "button",
              className: "dsh-we-open",
              "data-workspace-editor-open": "",
              title: t("action.edit"),
              onClick: open
            }, "\u270E", h("span", null, t("action.edit")));
          }
          function DeleteAction(props) {
            const { absolutePath, sessionId, t } = props;
            const [state, setState] = React.useState({ phase: "idle" });
            const pendingRef = React.useRef(null);
            const statRef = React.useRef(null);
            const busyRef = React.useRef(false);
            const aliveRef = React.useRef(true);
            React.useEffect(() => () => {
              aliveRef.current = false;
              statRef.current?.abort();
            }, []);
            React.useEffect(() => {
              if (state.phase !== "confirm" && state.phase !== "stale") return void 0;
              const timer = setTimeout(() => {
                if (!aliveRef.current) return;
                pendingRef.current = null;
                setState({ phase: "idle" });
              }, 8e3);
              return () => {
                clearTimeout(timer);
              };
            }, [state.phase]);
            if (typeof absolutePath !== "string" || absolutePath === "") return null;
            const arm = (event) => {
              if (busyRef.current) return;
              const target = ctx.sidebarRight.commandTarget(event.currentTarget);
              const owner = target?.sessionId ?? sessionId;
              const slot = { sessionId: owner, version: void 0, detail: null, target };
              pendingRef.current = slot;
              statRef.current?.abort();
              const controller = new AbortController();
              statRef.current = controller;
              setState({ phase: "confirm", checked: false, version: void 0, detail: null });
              if (typeof owner !== "string" || owner === "") {
                setState({ phase: "failed", text: t("delete.noVersion"), detail: null });
                return;
              }
              void (async () => {
                let result;
                try {
                  result = await ctx.remote.workspaceFiles.stat(owner, absolutePath, controller.signal);
                } catch (error) {
                  result = { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
                }
                if (!aliveRef.current || controller.signal.aborted || pendingRef.current !== slot) return;
                if (result.ok) slot.version = result.value.version;
                else slot.detail = result.error.message;
                setState((prev) => prev.phase === "confirm" ? { ...prev, checked: true, version: slot.version, detail: slot.detail } : prev);
              })();
            };
            const reset = () => {
              statRef.current?.abort();
              pendingRef.current = null;
              setState({ phase: "idle" });
            };
            const remove = async (force) => {
              const slot = pendingRef.current;
              if (slot === null || busyRef.current) return;
              const body = { sessionId: slot.sessionId, path: absolutePath };
              if (!force && slot.version !== void 0) body.expectedVersion = slot.version;
              busyRef.current = true;
              setState({ phase: "deleting" });
              let response;
              try {
                response = await fetch(DELETE_URL, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(body)
                });
              } catch {
                busyRef.current = false;
                if (!aliveRef.current) return;
                setState({ phase: "failed", text: t("error.deleteTransport"), detail: null });
                return;
              }
              let payload = null;
              try {
                payload = await response.json();
              } catch {
                payload = null;
              }
              busyRef.current = false;
              if (!aliveRef.current) return;
              if (!response.ok) {
                const code = typeof payload?.code === "string" ? payload.code : "delete-failed";
                const message = typeof payload?.message === "string" ? payload.message : `HTTP ${String(response.status)}`;
                if (response.status === 405 && payload === null) {
                  setState({ phase: "failed", text: t("error.deleteRoute"), detail: null });
                  return;
                }
                setState(code === "stale-version" ? { phase: "stale", text: t("delete.stale"), detail: message } : { phase: "failed", text: t("error.delete", { message }), detail: message });
                return;
              }
              drafts.delete(`${slot.sessionId}\0${absolutePath}`);
              let closed = "unavailable";
              try {
                if (slot.target !== void 0) closed = ctx.sidebarRight.closeTarget(slot.target);
              } catch {
                closed = "unavailable";
              }
              pendingRef.current = null;
              if (closed !== "closed") setState({ phase: "deleted", text: t("status.deleted"), detail: null });
            };
            const note = (text, title, tone, extra) => h("span", {
              className: "dsh-we-note",
              title: title ?? text,
              "data-tone": tone,
              "data-workspace-editor-delete-note": state.phase,
              ...extra
            }, text);
            const checking = state.phase === "confirm" && state.checked !== true;
            const gated = state.phase === "confirm" && state.checked === true && state.version !== void 0;
            const forced = state.phase === "stale" || state.phase === "confirm" && state.checked === true && state.version === void 0;
            const label = state.phase === "idle" ? t("action.delete") : state.phase === "deleting" ? t("status.deleting") : checking ? t("status.checking") : t(gated ? "action.deleteConfirm" : "action.deleteForce");
            return h(
              React.Fragment,
              null,
              h("style", null, CSS),
              state.phase === "confirm" && note(t("delete.hint"), null, null, {}),
              state.phase === "confirm" && state.detail !== null && note(t("delete.noVersion"), state.detail, "warn", {}),
              state.phase === "stale" && note(state.text, state.detail, "warn", {}),
              state.phase === "failed" && note(state.text, state.detail, "error", { "data-workspace-editor-delete-error": "" }),
              state.phase === "deleted" && note(state.text, null, null, {}),
              state.phase !== "failed" && state.phase !== "deleted" && h("button", {
                type: "button",
                className: "dsh-we-open",
                "data-danger": state.phase === "idle" ? "false" : "true",
                "data-workspace-editor-delete": state.phase,
                "data-workspace-editor-delete-go": checking ? "pending" : gated ? "gated" : "force",
                disabled: state.phase === "deleting" || checking,
                onClick: state.phase === "deleting" || checking ? null : state.phase === "idle" ? arm : () => {
                  void remove(forced);
                }
              }, "\u{1F5D1}\uFE0E ", label),
              // 取消 / 失败 / 已删除都停在原地：失败态也给一个出口，不能只剩一条错误文字。
              (state.phase === "confirm" || state.phase === "stale" || state.phase === "failed") && h("button", {
                type: "button",
                className: "dsh-we-open",
                "data-workspace-editor-delete-cancel": "",
                onClick: reset
              }, t("action.cancel"))
            );
          }
          return { DocumentBody, PaneBody, EditAction, DeleteAction };
        }
        const FILES_TAB_ID = "@dongasai/dsh-editor/files";
        const FILES_KIND = "workspace-editor-files";
        const WATCH_DEBOUNCE_MS = 120;
        const NOTICE_MS = 6e3;
        const TERMINAL_KIND = "terminal";
        const TERMINAL_TAB_MS = 2e3;
        const TERMINAL_READY_MS = 15e3;
        function useNotice() {
          const [notice, setNotice] = React.useState(null);
          const timer = React.useRef(null);
          const alive = React.useRef(true);
          React.useEffect(() => () => {
            alive.current = false;
            if (timer.current !== null) clearTimeout(timer.current);
          }, []);
          const dismissNotice = React.useCallback(() => {
            if (timer.current !== null) clearTimeout(timer.current);
            timer.current = null;
            setNotice(null);
          }, []);
          const showNotice = React.useCallback((text, tone, sticky) => {
            if (!alive.current) return;
            if (timer.current !== null) clearTimeout(timer.current);
            timer.current = null;
            setNotice({ text, tone });
            if (sticky !== true) {
              timer.current = setTimeout(() => {
                timer.current = null;
                if (alive.current) setNotice(null);
              }, NOTICE_MS);
            }
          }, []);
          return { notice, showNotice, dismissNotice };
        }
        function copyPathText(path, relative, cwd) {
          if (relative !== true) return path;
          if (typeof cwd !== "string" || cwd === "") return path;
          return path === cwd.replace(/[/\\]+$/u, "") ? "." : relativizeToCwd(path, cwd);
        }
        async function copyPathToClipboard(path, relative, cwd, t) {
          const text = copyPathText(path, relative, cwd);
          if (await writeClipboard(text)) return { ok: true, text };
          return { ok: false, text: t("files.copyPath.failed") };
        }
        function directoryOfFile(path, cwd) {
          const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
          if (cut > 0) return path.slice(0, cut);
          if (cut === 0) return "/";
          return typeof cwd === "string" && cwd !== "" ? cwd : ".";
        }
        function tabsOfSession(ctx, sessionId) {
          try {
            return ctx.sidebarRight.tabsIn(sessionId) ?? [];
          } catch {
            return [];
          }
        }
        async function waitForTerminalTab(ctx, sessionId, before) {
          const until = Date.now() + TERMINAL_TAB_MS;
          for (; ; ) {
            const active = (() => {
              try {
                return ctx.sidebarRight.active();
              } catch {
                return void 0;
              }
            })();
            if (active !== void 0 && active.kind === TERMINAL_KIND && !before.has(active.id)) return active;
            const found = tabsOfSession(ctx, sessionId).find((tab) => tab.kind === TERMINAL_KIND && !before.has(tab.id));
            if (found !== void 0) return found;
            if (Date.now() >= until) return void 0;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }
        function sendCdInto(terminals, sessionId, tab, dir, report) {
          const view = (() => {
            try {
              return terminals.view(sessionId, tab.id, tab.contentId, void 0, void 0);
            } catch {
              return void 0;
            }
          })();
          if (view === void 0 || view.state === void 0) {
            report({ ok: false, key: "files.terminal.noInput" });
            return;
          }
          const command = `cd ${shellQuotePath(dir)}\r`;
          let settled = false;
          let unsubscribe = () => {
          };
          let timer = null;
          const finish = (after) => {
            if (settled) return;
            settled = true;
            if (timer !== null) clearTimeout(timer);
            try {
              unsubscribe();
            } catch {
            }
            if (after !== void 0) after();
          };
          const onChange = () => {
            let state;
            try {
              state = view.state.getSnapshot();
            } catch {
              return;
            }
            if (state?.writable === true) {
              try {
                view.write(command);
              } catch {
                finish(() => {
                  report({ ok: false, key: "files.terminal.noInput" });
                });
                return;
              }
              finish(() => {
                report({ ok: true, dir });
              });
              return;
            }
            if (state?.phase === "failed" || state?.phase === "closed") finish();
          };
          timer = setTimeout(() => {
            finish(() => {
              report({ ok: false, key: "files.terminal.timeout" });
            });
          }, TERMINAL_READY_MS);
          try {
            unsubscribe = view.state.subscribe(onChange);
          } catch {
            finish();
            return;
          }
          onChange();
        }
        async function openTerminalAt(ctx, dir, element, t, report) {
          const registered = (() => {
            try {
              return ctx.sidebarRightTabs.entries().some((entry) => entry.kind === TERMINAL_KIND);
            } catch {
              return false;
            }
          })();
          if (!registered) {
            report({ ok: false, key: "files.terminal.missing" });
            return;
          }
          const target = (() => {
            try {
              return ctx.sidebarRight.commandTarget(element ?? null);
            } catch {
              return void 0;
            }
          })();
          if (target === void 0) {
            report({ ok: false, key: "files.terminal.failed" });
            return;
          }
          const before = new Set(tabsOfSession(ctx, target.sessionId).map((tab2) => tab2.id));
          try {
            ctx.sidebarRight.openTabFromTarget(TERMINAL_KIND, target);
          } catch {
            report({ ok: false, key: "files.terminal.failed" });
            return;
          }
          const tab = await waitForTerminalTab(ctx, target.sessionId, before);
          if (tab === void 0) {
            report({ ok: false, key: "files.terminal.failed" });
            return;
          }
          try {
            ctx.sidebarRight.focus(tab.id);
          } catch {
          }
          const terminals = ctx.get("webTerminals");
          if (terminals === void 0 || typeof terminals.view !== "function") {
            report({ ok: false, key: "files.terminal.noInput" });
            return;
          }
          sendCdInto(terminals, target.sessionId, tab, dir, report);
        }
        let pluginInfoValue = null;
        let pluginInfoInFlight = null;
        function pluginInfo(ctx) {
          if (pluginInfoValue !== null) return Promise.resolve(pluginInfoValue);
          if (pluginInfoInFlight === null) {
            pluginInfoInFlight = readPluginInfo(ctx).then((value) => {
              pluginInfoInFlight = null;
              pluginInfoValue = value;
              return value;
            });
          }
          return pluginInfoInFlight;
        }
        async function readPluginInfo(ctx) {
          try {
            const manager = ctx.get("remote.pluginManager");
            const result = await manager?.listBundles?.();
            if (result?.ok !== true || !Array.isArray(result.value)) return null;
            const row = result.value.find((item) => item?.name === PACKAGE_NAME);
            if (row === void 0) return null;
            return {
              title: pluginText(ctx, row.meta?.title),
              version: typeof row.version === "string" && row.version !== "" ? row.version : null,
              description: pluginText(ctx, row.meta?.description)
            };
          } catch {
            return null;
          }
        }
        function pluginText(ctx, text) {
          if (text === void 0 || text === null) return null;
          try {
            const resolved = ctx.locale.resolveText(text);
            return typeof resolved === "string" && resolved !== "" ? resolved : null;
          } catch {
            return typeof text === "string" && text !== "" ? text : null;
          }
        }
        function createImageBody(ctx) {
          function ImageBody(props) {
            const { useTabInfo, sessionId, t } = props;
            const { tab } = useTabInfo();
            const target = React.useMemo(() => paneTarget(tab, sessionId), [tab, sessionId]);
            const owner = target === null ? sessionId : target.sessionId;
            const path = target === null ? "" : target.path;
            const [state, setState] = React.useState({ phase: "loading" });
            const [fit, setFit] = React.useState(true);
            const [menu, setMenu] = React.useState(null);
            const [token, setToken] = React.useState(0);
            const { notice, showNotice, dismissNotice } = useNotice();
            const urlRef = React.useRef(null);
            const release = () => {
              if (urlRef.current !== null) {
                try {
                  URL.revokeObjectURL(urlRef.current);
                } catch {
                }
                urlRef.current = null;
              }
            };
            React.useEffect(() => {
              if (path === "") return void 0;
              const controller = new AbortController();
              let cancelled = false;
              release();
              setState({ phase: "loading" });
              void (async () => {
                let result;
                try {
                  result = await ctx.remote.workspaceFiles.readBytes(owner, path, {}, controller.signal);
                } catch (error) {
                  if (!cancelled) {
                    const message = error instanceof Error ? error.message : String(error);
                    setState({ phase: "failed", code: "transport", message: t("image.readFailed", { message }) });
                  }
                  return;
                }
                if (cancelled) return;
                if (!result.ok) {
                  setState({ phase: "failed", code: result.error.code, message: t("image.readFailed", { message: result.error.message }) });
                  return;
                }
                const type = imageMediaTypeOf(path) ?? "application/octet-stream";
                let url;
                try {
                  url = URL.createObjectURL(new Blob([result.value.data], { type }));
                } catch (error) {
                  const message = error instanceof Error ? error.message : String(error);
                  setState({ phase: "failed", code: "blob", message: t("image.readFailed", { message }) });
                  return;
                }
                urlRef.current = url;
                setState({ phase: "ready", url, type, bytes: result.value.data.byteLength, width: 0, height: 0 });
              })();
              return () => {
                cancelled = true;
                controller.abort();
              };
            }, [owner, path, token]);
            React.useEffect(() => () => {
              release();
            }, []);
            const openEditor = () => {
              ctx.sidebarRight.openResource(absoluteFileAddress(path), {
                kind: EDITOR_KIND,
                params: { sessionId: owner, path }
              });
            };
            const menuButton = (id, icon, label, run) => h("button", {
              key: id,
              type: "button",
              className: "dsh-wef-menu-item",
              "data-workspace-editor-image-item": id,
              onClick: (event) => {
                event.stopPropagation();
                setMenu(null);
                run(event);
              }
            }, glyph(icon, 14), label);
            if (target === null) {
              return h(
                "div",
                { className: "dsh-we-root dsh-we-pane", "data-workspace-editor-image": "unavailable" },
                h("style", null, CSS),
                h(
                  "div",
                  { className: "dsh-we-message" },
                  h("p", { className: "dsh-we-message-text" }, t("status.noAddress"))
                )
              );
            }
            const meta = state.phase === "ready" ? state.width > 0 ? t("image.meta", {
              size: t("image.size", { bytes: state.bytes }),
              width: state.width,
              height: state.height,
              type: state.type
            }) : `${t("image.size", { bytes: state.bytes })} \xB7 ${state.type}` : null;
            return h(
              "div",
              {
                className: "dsh-we-root dsh-we-pane",
                "data-workspace-editor-image": state.phase,
                "data-workspace-editor-image-path": path,
                onContextMenu: (event) => {
                  if (state.phase !== "ready") return;
                  event.preventDefault();
                  setMenu({ ...menuAnchorFor(event) });
                }
              },
              h("style", null, CSS),
              h(
                "div",
                { className: "dsh-we-bar" },
                h("span", { className: "dsh-we-status", "data-workspace-editor-image-meta": "" }, meta ?? t("image.loading")),
                // 与编辑器状态条同一份口径、同一个锚点（约束 16：跨面同理）；cwd 用 `owner` ——
                // 与这面那三个菜单动作一致，跨会话查看时相对路径才不会被算错。
                h("span", {
                  className: "dsh-we-status-path",
                  title: path,
                  "data-workspace-editor-status-path": path
                }, shortenPath(relativizeToCwd(path, sessionCwd(ctx, owner)))),
                h("span", { className: "dsh-we-spacer" }),
                state.phase === "ready" && h("button", {
                  type: "button",
                  className: "dsh-we-button",
                  "data-workspace-editor-image-fit": fit ? "true" : "false",
                  onClick: () => {
                    setFit((value) => !value);
                  }
                }, t(fit ? "image.actual" : "image.fit")),
                state.phase === "ready" && h("button", {
                  type: "button",
                  className: "dsh-we-button",
                  "data-workspace-editor-image-editor": "",
                  onClick: openEditor
                }, t("image.openEditor")),
                state.phase === "failed" && h("button", {
                  type: "button",
                  className: "dsh-we-button",
                  "data-workspace-editor-image-retry": "",
                  onClick: () => {
                    setToken((value) => value + 1);
                  }
                }, t("action.retry"))
              ),
              notice !== null && h(
                "p",
                {
                  className: "dsh-we-banner",
                  "data-tone": notice.tone,
                  "data-workspace-editor-image-notice": ""
                },
                h("span", { className: "dsh-we-banner-text" }, notice.text),
                h("button", {
                  type: "button",
                  className: "dsh-we-button",
                  "data-workspace-editor-image-notice-dismiss": "",
                  onClick: () => {
                    dismissNotice();
                  }
                }, t("action.cancel"))
              ),
              state.phase === "failed" && h(
                "div",
                { className: "dsh-we-message", "data-workspace-editor-image-error": state.code },
                h("p", { className: "dsh-we-message-text" }, state.message)
              ),
              state.phase === "ready" && h(
                "div",
                {
                  className: "dsh-wi-body",
                  "data-fit": fit ? "true" : "false"
                },
                h("img", {
                  className: "dsh-wi-image",
                  src: state.url,
                  alt: t("image.alt"),
                  draggable: false,
                  onLoad: (event) => {
                    const width = event.currentTarget.naturalWidth;
                    const height = event.currentTarget.naturalHeight;
                    setState((prev) => prev.phase === "ready" ? { ...prev, width, height } : prev);
                  },
                  onError: () => {
                    setState((prev) => prev.phase === "ready" ? { ...prev, phase: "undecodable" } : prev);
                  }
                })
              ),
              state.phase === "undecodable" && h(
                "div",
                { className: "dsh-we-message" },
                h(
                  "p",
                  { className: "dsh-we-message-text", "data-workspace-editor-image-undecodable": state.type },
                  t("image.decodeFailed", { type: state.type, bytes: state.bytes })
                ),
                h(
                  "div",
                  { className: "dsh-we-message-text" },
                  h("button", {
                    type: "button",
                    className: "dsh-we-button",
                    "data-workspace-editor-image-retry": "",
                    onClick: () => {
                      setToken((value) => value + 1);
                    }
                  }, t("action.retry")),
                  " ",
                  h("button", {
                    type: "button",
                    className: "dsh-we-button",
                    "data-workspace-editor-image-editor": "",
                    onClick: openEditor
                  }, t("image.openEditor"))
                )
              ),
              menu !== null && h("div", {
                className: "dsh-wef-backdrop",
                "data-workspace-editor-image-backdrop": "",
                onClick: () => {
                  setMenu(null);
                },
                onContextMenu: (event) => {
                  event.preventDefault();
                  setMenu(null);
                }
              }),
              menu !== null && h(
                "div",
                {
                  className: "dsh-wef-menu",
                  style: { left: `${String(menu.x)}px`, top: `${String(menu.y)}px` },
                  "data-workspace-editor-image-menu": path
                },
                menuButton("copy-path", "path", t("files.copyPath"), () => {
                  void (async () => {
                    const outcome = await copyPathToClipboard(path, false, sessionCwd(ctx, owner), t);
                    showNotice(outcome.ok ? t("files.copyPath.done", { path: outcome.text }) : outcome.text, outcome.ok ? "ok" : "error", outcome.ok !== true);
                  })();
                }),
                menuButton("copy-path-relative", "path", t("files.copyPathRelative"), () => {
                  void (async () => {
                    const outcome = await copyPathToClipboard(path, true, sessionCwd(ctx, owner), t);
                    showNotice(outcome.ok ? t("files.copyPath.done", { path: outcome.text }) : outcome.text, outcome.ok ? "ok" : "error", outcome.ok !== true);
                  })();
                }),
                menuButton("open-terminal", "terminal", t("files.openTerminal"), (event) => {
                  void openTerminalAt(ctx, directoryOfFile(path, sessionCwd(ctx, owner)), event?.currentTarget ?? null, t, (result) => {
                    showNotice(result.ok === true ? t("files.terminal.done", { path: result.dir }) : t(result.key), result.ok === true ? "ok" : "error", result.ok !== true);
                  });
                })
              )
            );
          }
          return { ImageBody };
        }
        function createFilesPanel(ctx, options = {}) {
          const { openBatchList = () => {
          } } = options;
          function parentOf(path) {
            const cut = path.lastIndexOf("/");
            return cut <= 0 ? path : path.slice(0, cut);
          }
          function nameOf(path) {
            const cut = path.lastIndexOf("/");
            return cut === -1 ? path : path.slice(cut + 1);
          }
          function isInside(inner, outer) {
            return inner === outer || inner.startsWith(`${outer}/`);
          }
          function copyNameOf(name) {
            const dot = name.lastIndexOf(".");
            if (dot <= 0) return `${name} \u526F\u672C`;
            return `${name.slice(0, dot)} \u526F\u672C${name.slice(dot)}`;
          }
          const TREE_SORT_KEYS = ["name", "type"];
          const DEFAULT_TREE_SORT = { key: "name", dirsFirst: true };
          const TREE_CHAIN_MAX = 32;
          const TREE_PRELOAD_BUDGET = 64;
          function extensionOf(name) {
            const dot = name.lastIndexOf(".");
            return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
          }
          function isHiddenName(name) {
            return name.startsWith(".");
          }
          function compareTreeNames(left, right) {
            const a = left.toLowerCase();
            const b = right.toLowerCase();
            if (a !== b) return a < b ? -1 : 1;
            if (left === right) return 0;
            return left < right ? -1 : 1;
          }
          function sortEntries(entries, sort) {
            const spec = sort === void 0 ? DEFAULT_TREE_SORT : sort;
            const dirsFirst = spec.dirsFirst !== false;
            return [...entries].sort((left, right) => {
              if (dirsFirst) {
                const diff = (left.type === "directory" ? 0 : 1) - (right.type === "directory" ? 0 : 1);
                if (diff !== 0) return diff;
              }
              if (spec.key === "type") {
                const diff = compareTreeNames(extensionOf(left.name), extensionOf(right.name));
                if (diff !== 0) return diff;
              }
              return compareTreeNames(left.name, right.name);
            });
          }
          function foldLevel(dir, entries, lookup) {
            const rows = [];
            for (const entry of entries) {
              const head = `${dir}/${entry.name}`;
              const chain = [head];
              if (entry.type === "directory") {
                let current = head;
                while (chain.length < TREE_CHAIN_MAX) {
                  const children = lookup(current);
                  if (children === void 0) break;
                  const real = children.filter((child) => !isHiddenName(child.name));
                  if (real.length !== 1 || real[0].type !== "directory") break;
                  current = `${current}/${real[0].name}`;
                  chain.push(current);
                }
              }
              rows.push({ path: chain[chain.length - 1], entry, chain });
            }
            return rows;
          }
          function chainCandidates(dir, entries, lookup) {
            const wanted = [];
            for (const entry of entries) {
              if (entry.type !== "directory") continue;
              let current = `${dir}/${entry.name}`;
              while (wanted.length < TREE_CHAIN_MAX) {
                const children = lookup(current);
                if (children !== void 0) {
                  const real = children.filter((child) => !isHiddenName(child.name));
                  if (real.length !== 1 || real[0].type !== "directory") break;
                  current = `${current}/${real[0].name}`;
                  continue;
                }
                if (!wanted.includes(current)) wanted.push(current);
                break;
              }
            }
            return wanted;
          }
          function rangeSelection(paths, anchor, target) {
            const from = paths.indexOf(anchor);
            const to = paths.indexOf(target);
            if (from === -1 || to === -1) return /* @__PURE__ */ new Set([target]);
            return new Set(paths.slice(Math.min(from, to), Math.max(from, to) + 1));
          }
          function pruneForBatchDelete(selected, root) {
            const depthOf = (path) => path.split("/").length;
            const kept = [];
            const ordered = [...selected].sort((left, right) => depthOf(left) - depthOf(right) || compareTreeNames(left, right));
            for (const path of ordered) {
              if (path === root) continue;
              const covered = kept.some((outer) => path === outer || path.startsWith(`${outer}/`));
              if (covered) continue;
              kept.push(path);
            }
            return kept;
          }
          function describeMutationFailure(outcome, t) {
            const known = {
              "target-exists": "files.error.exists",
              "not-empty": "files.error.notEmpty",
              "outside-workspace": "files.error.outside",
              denied: "files.error.denied",
              "not-found": "files.error.notFound",
              "invalid-target": "files.error.invalid",
              "too-large": "files.error.tooLarge"
            };
            const key = known[outcome.code];
            if (key !== void 0) return t(key);
            if (outcome.status === 405) return t("files.error.route");
            return t("files.error.generic", { code: outcome.code, message: outcome.message });
          }
          function FilesFooter() {
            const [info, setInfo] = React.useState(null);
            React.useEffect(() => {
              let alive = true;
              void pluginInfo(ctx).then((value) => {
                if (alive) setInfo(value);
              });
              return () => {
                alive = false;
              };
            }, []);
            const version = info === null ? null : info.version;
            const title = info === null || info.title === null ? PACKAGE_NAME : info.title;
            return h("p", {
              className: "dsh-wef-plugin",
              title: info !== null && info.description !== null ? info.description : `${PACKAGE_NAME}${version === null ? "" : ` v${version}`}`,
              "data-workspace-editor-files-plugin": PACKAGE_NAME,
              "data-workspace-editor-files-version": version ?? ""
            }, version === null ? title : `${title} \xB7 v${version}`);
          }
          function FilesPanel(props) {
            const { sessionId, useSessions, t } = props;
            const cwd = useSessions((state) => state.byId?.[sessionId]?.cwd);
            const root = typeof cwd === "string" && cwd !== "" ? cwd.replace(/[/\\]+$/, "") : null;
            if (root === null) {
              return h(
                "div",
                { className: "dsh-wef-root", "data-workspace-editor-files": "no-root" },
                h("style", null, CSS),
                h("p", { className: "dsh-wef-note" }, t("files.noRoot")),
                h("div", { className: "dsh-wef-gap" }),
                h(FilesFooter, null)
              );
            }
            return h(FilesTree, { ...props, root, key: `${sessionId}\0${root}` });
          }
          function FilesTree(props) {
            const { sessionId, root, useTabInfo, t } = props;
            let tab = null;
            try {
              if (typeof useTabInfo === "function") {
                const info = useTabInfo();
                tab = info?.tab ?? null;
              }
            } catch {
              tab = null;
            }
            const paneId = tab?.panel?.id;
            const [levels, setLevels] = React.useState({});
            const [expanded, setExpanded] = React.useState(() => /* @__PURE__ */ new Set([root]));
            const [selected, setSelected] = React.useState(root);
            const [selection, setSelection] = React.useState(() => /* @__PURE__ */ new Set());
            const [sort, setSort] = React.useState(DEFAULT_TREE_SORT);
            const [sortOpen, setSortOpen] = React.useState(null);
            const [batch, setBatch] = React.useState(null);
            const [batchFailed, setBatchFailed] = React.useState(null);
            const [editor, setEditor] = React.useState(null);
            const [pending, setPending] = React.useState(null);
            const [busy, setBusy] = React.useState(null);
            const [error, setError] = React.useState(null);
            const { notice, showNotice, dismissNotice } = useNotice();
            const [dropOn, setDropOn] = React.useState(null);
            const [dragging, setDragging] = React.useState(null);
            const [menu, setMenu] = React.useState(null);
            const [clipboard, setClipboard] = React.useState(filesClipboard);
            const bodyRef = React.useRef(null);
            const aliveRef = React.useRef(true);
            const levelsRef = React.useRef(levels);
            levelsRef.current = levels;
            const pendingRef = React.useRef(pending);
            pendingRef.current = pending;
            const batchRef = React.useRef(batch);
            batchRef.current = batch;
            const preloaded = React.useRef(/* @__PURE__ */ new Set());
            const controllerRef = React.useRef(null);
            if (controllerRef.current === null) controllerRef.current = new AbortController();
            const generations = React.useRef(/* @__PURE__ */ new Map());
            const watchers = React.useRef(/* @__PURE__ */ new Map());
            const reloadTimers = React.useRef(/* @__PURE__ */ new Map());
            const dragRef = React.useRef(null);
            const reloadRef = React.useRef(null);
            React.useEffect(() => () => {
              aliveRef.current = false;
              controllerRef.current?.abort();
              for (const timer of reloadTimers.current.values()) clearTimeout(timer);
              for (const stop of watchers.current.values()) void stop();
              watchers.current.clear();
            }, []);
            const reloadDir = async (path) => {
              const generation = (generations.current.get(path) ?? 0) + 1;
              generations.current.set(path, generation);
              setLevels((prev) => ({ ...prev, [path]: { ...prev[path], phase: prev[path]?.entries === void 0 ? "loading" : "ready" } }));
              let result;
              try {
                result = await ctx.remote.workspaceFiles.list(sessionId, path, controllerRef.current.signal);
              } catch (failure) {
                result = { ok: false, error: { message: failure instanceof Error ? failure.message : String(failure) } };
              }
              if (!aliveRef.current || controllerRef.current.signal.aborted) return;
              if (generations.current.get(path) !== generation) return;
              if (!result.ok) {
                setLevels((prev) => ({ ...prev, [path]: { phase: "failed", message: result.error.message } }));
                return;
              }
              setLevels((prev) => ({ ...prev, [path]: { phase: "ready", entries: result.value.entries, truncated: result.value.truncated } }));
            };
            reloadRef.current = reloadDir;
            const scheduleReload = (path) => {
              const timers = reloadTimers.current;
              if (timers.has(path)) clearTimeout(timers.get(path));
              timers.set(path, setTimeout(() => {
                timers.delete(path);
                if (aliveRef.current) void reloadRef.current(path);
              }, WATCH_DEBOUNCE_MS));
            };
            const watchDir = (path) => {
              if (watchers.current.has(path)) return;
              const stream = ctx.remote.$stream({
                name: `workspace-editor-files ${path}`,
                open: (signal) => ctx.remote.workspaceFiles.changes(sessionId, path, signal),
                ended: () => new Error(`workspace-editor-files: watch ended (${path})`)
              });
              const task = (async () => {
                try {
                  for await (const item of stream) {
                    if (item.value.kind === "ready") {
                      item.accept();
                      continue;
                    }
                    scheduleReload(path);
                  }
                } catch {
                }
              })();
              watchers.current.set(path, () => {
                void stream.dispose().then(() => task);
              });
            };
            const ensureDir = (path) => {
              const level = levelsRef.current[path];
              if (level === void 0 || level.phase === "failed") void reloadDir(path);
              watchDir(path);
            };
            React.useEffect(() => {
              ensureDir(root);
            }, [root]);
            const preloadDir = async (path) => {
              if (levelsRef.current[path] !== void 0) return;
              await reloadDir(path);
            };
            React.useEffect(() => {
              const lookup = (path) => levelsRef.current[path]?.entries;
              const wanted = [];
              const visit = (dir) => {
                const level = levelsRef.current[dir];
                if (level === void 0 || level.phase !== "ready") return;
                for (const path of chainCandidates(dir, level.entries, lookup)) {
                  if (!wanted.includes(path)) wanted.push(path);
                }
                for (const entry of level.entries) {
                  const child = `${dir}/${entry.name}`;
                  if (entry.type === "directory" && expanded.has(child)) visit(child);
                }
              };
              visit(root);
              for (const path of wanted) {
                if (preloaded.current.size >= TREE_PRELOAD_BUDGET) break;
                if (preloaded.current.has(path)) continue;
                preloaded.current.add(path);
                void preloadDir(path);
              }
            }, [levels, expanded, root]);
            const postJson = async (url, body, path) => {
              setBusy(path ?? null);
              let response;
              try {
                response = await fetch(url, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ sessionId, ...body })
                });
              } catch {
                if (aliveRef.current) {
                  setBusy(null);
                  setError(t("files.error.transport"));
                }
                return null;
              }
              let payload = null;
              try {
                payload = await response.json();
              } catch {
                payload = null;
              }
              if (!aliveRef.current) return null;
              setBusy(null);
              if (response.ok) return { ok: true, payload };
              return {
                ok: false,
                status: response.status,
                code: typeof payload?.code === "string" ? payload.code : "request-failed",
                message: typeof payload?.message === "string" ? payload.message : `HTTP ${String(response.status)}`
              };
            };
            const toggle = (path) => {
              ensureDir(path);
              setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(path)) next.delete(path);
                else next.add(path);
                return next;
              });
            };
            const openFile = (path) => {
              const placement = paneId === void 0 ? {} : { paneId };
              const kind = imageMediaTypeOf(path) === void 0 ? EDITOR_KIND : IMAGE_KIND;
              ctx.sidebarRight.openResource(absoluteFileAddress(path), {
                kind,
                ...placement,
                params: { sessionId, path }
              });
            };
            const focusPath = (path) => {
              setSelected(path);
              setSelection(/* @__PURE__ */ new Set());
            };
            const toggleSelection = (path) => {
              setError(null);
              setPending(null);
              setBatch(null);
              setBatchFailed(null);
              setMenu(null);
              setSortOpen(null);
              bodyRef.current?.focus({ preventScroll: true });
              setSelected(path);
              setSelection((prev) => {
                const next = new Set(prev);
                if (next.has(path)) next.delete(path);
                else next.add(path);
                return next;
              });
            };
            const activate = (path, type, event) => {
              setError(null);
              setPending(null);
              setBatch(null);
              setBatchFailed(null);
              setMenu(null);
              setSortOpen(null);
              bodyRef.current?.focus({ preventScroll: true });
              if (event !== void 0 && (event.ctrlKey || event.metaKey)) {
                toggleSelection(path);
                return;
              }
              if (event !== void 0 && event.shiftKey) {
                setSelection(rangeSelection(visiblePaths, selected, path));
                setSelected(path);
                return;
              }
              focusPath(path);
              if (type === "directory") toggle(path);
              else openFile(path);
            };
            const openMenu = (event, path, type) => {
              event.preventDefault();
              event.stopPropagation();
              setSelected(path);
              setSortOpen(null);
              setError(null);
              setMenu({ path, type, ...menuAnchorFor(event) });
            };
            const startCreate = (dir, mode) => {
              setPending(null);
              setBatch(null);
              setBatchFailed(null);
              setError(null);
              focusPath(dir);
              ensureDir(dir);
              setExpanded((prev) => new Set(prev).add(dir));
              setEditor({ mode, dir });
            };
            const startRename = (path) => {
              setPending(null);
              setBatch(null);
              setBatchFailed(null);
              setError(null);
              setEditor({ mode: "rename", dir: parentOf(path), path });
            };
            const submitEditor = async (draft, raw) => {
              if (draft.done === true) return;
              draft.done = true;
              const value = String(raw ?? "").trim();
              setEditor(null);
              if (value === "") return;
              if (value.startsWith("/")) {
                setError(t("files.error.absolute"));
                return;
              }
              const segments = value.split("/");
              if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
                setError(t("files.error.name"));
                return;
              }
              const target = `${draft.dir}/${value}`;
              if (draft.mode === "rename") {
                if (target === draft.path) return;
                const outcome2 = await postJson(RENAME_URL, { from: draft.path, to: target }, draft.path);
                if (outcome2 === null) return;
                if (!outcome2.ok) {
                  setError(describeMutationFailure(outcome2, t));
                  return;
                }
                focusPath(target);
                await reloadDir(draft.dir);
                if (parentOf(target) !== draft.dir) await reloadDir(parentOf(target));
                return;
              }
              const outcome = draft.mode === "folder" ? await postJson(MKDIR_URL, { path: target }, target) : await postJson(WRITE_URL, { path: target, content: "", mode: "create" }, target);
              if (outcome === null) return;
              if (!outcome.ok) {
                setError(describeMutationFailure(outcome, t));
                return;
              }
              focusPath(target);
              await reloadDir(draft.dir);
              if (draft.mode === "file") openFile(target);
            };
            const uniqueNameIn = (dir, preferred) => {
              const taken = new Set((levelsRef.current[dir]?.entries ?? []).map((entry) => entry.name));
              if (!taken.has(preferred)) return preferred;
              const dot = preferred.lastIndexOf(".");
              const stem = dot <= 0 ? preferred : preferred.slice(0, dot);
              const tail = dot <= 0 ? "" : preferred.slice(dot);
              for (let index = 2; index < 20; index += 1) {
                const candidate = `${stem} ${String(index)}${tail}`;
                if (!taken.has(candidate)) return candidate;
              }
              return preferred;
            };
            const copyEntry = async (path) => {
              const dir = parentOf(path);
              const target = `${dir}/${uniqueNameIn(dir, copyNameOf(nameOf(path)))}`;
              const outcome = await postJson(COPY_URL, { from: path, to: target }, path);
              if (outcome === null) return;
              if (!outcome.ok) {
                setError(describeMutationFailure(outcome, t));
                return;
              }
              focusPath(target);
              await reloadDir(dir);
            };
            const notify = (text, tone, sticky) => {
              if (!aliveRef.current) return;
              showNotice(text, tone, sticky);
            };
            const copyPath = async (path, relative) => {
              const outcome = await copyPathToClipboard(path, relative, root, t);
              if (!outcome.ok) {
                notify(outcome.text, "error", true);
                return;
              }
              notify(t("files.copyPath.done", { path: outcome.text }), "ok");
            };
            const openInTerminal = async (path, element) => {
              const dir = isDirPath(path) ? path : parentOf(path);
              await openTerminalAt(ctx, dir, element, t, (result) => {
                if (result.ok === true) {
                  notify(t("files.terminal.done", { path: result.dir }), "ok");
                  return;
                }
                notify(t(result.key), "error", true);
              });
            };
            const armClipboard = (next) => {
              filesClipboard = next;
              setClipboard(next);
            };
            const copyToClipboard = (path) => {
              setError(null);
              armClipboard({ mode: "copy", path, name: nameOf(path) });
            };
            const cutToClipboard = (path) => {
              setError(null);
              armClipboard({ mode: "cut", path, name: nameOf(path) });
            };
            const pasteClipboardInto = async (dir) => {
              const clip = filesClipboard;
              if (clip === null) return;
              ensureDir(dir);
              setExpanded((prev) => new Set(prev).add(dir));
              if (clip.mode === "cut") {
                const moved = `${dir}/${clip.name}`;
                if (moved === clip.path) {
                  focusPath(moved);
                  return;
                }
                const outcome2 = await postJson(RENAME_URL, { from: clip.path, to: moved }, clip.path);
                if (outcome2 === null) return;
                if (!outcome2.ok) {
                  setError(describeMutationFailure(outcome2, t));
                  return;
                }
                armClipboard(null);
                focusPath(moved);
                await reloadDir(parentOf(clip.path));
                if (dir !== parentOf(clip.path)) await reloadDir(dir);
                return;
              }
              const target = `${dir}/${uniqueNameIn(dir, clip.name)}`;
              const outcome = await postJson(COPY_URL, { from: clip.path, to: target }, clip.path);
              if (outcome === null) return;
              if (!outcome.ok) {
                setError(describeMutationFailure(outcome, t));
                return;
              }
              focusPath(target);
              await reloadDir(dir);
            };
            const uploadInto = async (dir, files) => {
              ensureDir(dir);
              setExpanded((prev) => new Set(prev).add(dir));
              let last = null;
              let failure = null;
              for (const file of files) {
                if (file.size > MAX_PASTE_BYTES) {
                  failure = t("files.paste.tooLarge", { name: file.name, limit: "4 MiB" });
                  continue;
                }
                let data;
                try {
                  data = base64OfBytes(new Uint8Array(await file.arrayBuffer()));
                } catch {
                  failure = t("files.paste.readFailed", { name: file.name });
                  continue;
                }
                const name = uniqueNameIn(dir, file.name === "" ? pastedNameFor(file.type, 1) : file.name);
                const target = `${dir}/${name}`;
                const outcome = await postJson(UPLOAD_URL, { path: target, data }, target);
                if (outcome === null) return;
                if (!outcome.ok) {
                  failure = describeMutationFailure(outcome, t);
                  continue;
                }
                last = target;
              }
              if (last !== null) focusPath(last);
              await reloadDir(dir);
              if (failure !== null) setError(failure);
            };
            const pasteInto = async (dir) => {
              setError(null);
              if (filesClipboard !== null) {
                await pasteClipboardInto(dir);
                return;
              }
              if (navigator.clipboard?.read === void 0) {
                setError(t("files.paste.unsupported"));
                return;
              }
              let items;
              try {
                items = await navigator.clipboard.read();
              } catch {
                setError(t("files.paste.denied"));
                return;
              }
              const files = [];
              let index = 0;
              for (const item of items) {
                const type = item.types.find((value) => !value.startsWith("text/"));
                if (type === void 0) continue;
                index += 1;
                const blob = await item.getType(type);
                files.push(new File([blob], pastedNameFor(type, index), { type }));
              }
              if (files.length === 0) {
                setError(t("files.paste.empty"));
                return;
              }
              await uploadInto(dir, files);
            };
            const moveEntry = async (from, to) => {
              if (from === to || isInside(to, from)) return;
              const outcome = await postJson(RENAME_URL, { from, to }, from);
              if (outcome === null) return;
              if (!outcome.ok) {
                setError(describeMutationFailure(outcome, t));
                return;
              }
              focusPath(to);
              await reloadDir(parentOf(from));
              if (parentOf(to) !== parentOf(from)) await reloadDir(parentOf(to));
            };
            const armDelete = async (path, type) => {
              setError(null);
              setEditor(null);
              setBatch(null);
              setBatchFailed(null);
              setBusy(path);
              const signal = controllerRef.current.signal;
              let version;
              try {
                const stat = await ctx.remote.workspaceFiles.stat(sessionId, path, signal);
                if (stat.ok) version = stat.value.version;
              } catch {
                version = void 0;
              }
              let count = 0;
              if (type === "directory") {
                try {
                  const listing = await ctx.remote.workspaceFiles.list(sessionId, path, signal);
                  if (listing.ok) count = listing.value.entries.length;
                } catch {
                  count = 0;
                }
              }
              if (!aliveRef.current) return;
              setBusy(null);
              setPending({ path, type, version, count, stale: false });
            };
            const runDelete = async (recursive) => {
              const target = pendingRef.current;
              if (target === null) return;
              const body = { path: target.path };
              if (target.version !== void 0 && !target.stale) body.expectedVersion = target.version;
              if (target.type === "directory") body.recursive = recursive;
              const outcome = await postJson(DELETE_URL, body, target.path);
              if (outcome === null) return;
              if (!outcome.ok) {
                if (outcome.code === "stale-version") {
                  setPending({ ...target, stale: true });
                  return;
                }
                if (outcome.code === "not-empty") {
                  setPending({ ...target, count: Math.max(target.count, 1), stale: false, version: void 0 });
                  return;
                }
                setError(describeMutationFailure(outcome, t));
                return;
              }
              setPending(null);
              focusPath(parentOf(target.path));
              await reloadDir(parentOf(target.path));
            };
            const armBatchDelete = async () => {
              const targets = pruneForBatchDelete(selection, root);
              if (targets.length === 0) return;
              setError(null);
              setEditor(null);
              setPending(null);
              setMenu(null);
              setBatchFailed(null);
              const signal = controllerRef.current.signal;
              const items = [];
              for (const path of targets) {
                const type = isDirPath(path) ? "directory" : "file";
                setBusy(path);
                let version;
                try {
                  const stat = await ctx.remote.workspaceFiles.stat(sessionId, path, signal);
                  if (stat.ok) version = stat.value.version;
                } catch {
                  version = void 0;
                }
                if (!aliveRef.current) return;
                items.push({ path, type, version });
              }
              setBusy(null);
              setBatch({ items });
            };
            const runBatchDelete = async () => {
              const armed = batchRef.current;
              if (armed === null) return;
              const failed = [];
              const parents = /* @__PURE__ */ new Set();
              for (const item of armed.items) {
                const body = { path: item.path };
                if (item.version !== void 0) body.expectedVersion = item.version;
                if (item.type === "directory") body.recursive = true;
                const outcome = await postJson(DELETE_URL, body, item.path);
                if (outcome === null) return;
                parents.add(parentOf(item.path));
                if (!outcome.ok) failed.push({ path: item.path, code: outcome.code });
              }
              setBatch(null);
              for (const dir of parents) await reloadDir(dir);
              if (failed.length === 0) {
                setSelection(/* @__PURE__ */ new Set());
                setSelected(root);
                setBatchFailed(null);
                notify(t("files.batch.done", { count: armed.items.length }), "ok");
                return;
              }
              setSelection(new Set(failed.map((item) => item.path)));
              setBatchFailed({ failed: failed.length, conflicted: failed.filter((item) => item.code === "stale-version").length });
            };
            const copySelectionPaths = async () => {
              const paths = [...selection].sort(compareTreeNames);
              if (paths.length === 0) return;
              const ok = await writeClipboard(paths.map((path) => copyPathText(path, false, root)).join("\n"));
              if (!ok) {
                notify(t("files.copyPath.failed"), "error", true);
                return;
              }
              notify(t("files.batch.copied", { count: paths.length }), "ok");
            };
            const menuItem = (id, icon, path, label, run, hidden, danger) => {
              if (hidden) return null;
              return h("button", {
                key: id,
                type: "button",
                className: "dsh-wef-menu-item",
                "data-danger": danger === true ? "true" : "false",
                "data-workspace-editor-files-menu-item": id,
                "data-workspace-editor-files-menu-path": path,
                onClick: (event) => {
                  event.stopPropagation();
                  setMenu(null);
                  run(event);
                }
              }, glyph(icon, 14), label);
            };
            const rows = [];
            const createHere = editor !== null && editor.mode !== "rename" ? editor.dir : null;
            const inputRow = (depth, draft) => h(
              "div",
              {
                className: "dsh-wef-row",
                key: `input:${draft.dir}`,
                style: { paddingLeft: `${String(2 + depth * 14)}px` },
                "data-workspace-editor-files-input-row": draft.mode
              },
              // 与真实行对齐：先让出多选框那一段宽度，再让出箭头那一段。
              h("span", { className: "dsh-wef-check-gap" }),
              h("span", { className: "dsh-wef-spacer" }),
              h("span", { className: "dsh-wef-glyph" }, glyph(draft.mode === "folder" ? "folder" : "file", 14)),
              h("input", {
                className: "dsh-wef-input",
                "data-workspace-editor-files-input": draft.mode,
                defaultValue: draft.mode === "rename" ? nameOf(draft.path) : "",
                placeholder: t("files.namePlaceholder"),
                spellCheck: false,
                autoFocus: true,
                onKeyDown: (event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void submitEditor(draft, event.currentTarget.value);
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setEditor(null);
                  }
                },
                onBlur: (event) => {
                  void submitEditor(draft, event.currentTarget.value);
                }
              })
            );
            const rowOf = (item, depth) => {
              const { path, entry, chain } = item;
              const isDir = entry.type === "directory";
              const open = isDir && expanded.has(path);
              const label = chain.length > 1 ? chain.map(nameOf).join("/") : entry.name;
              const dropDir = isDir ? path : parentOf(path);
              const dropBlocked = (from) => from === path || dropDir === parentOf(from) || isDir && isInside(path, from);
              return h(
                "div",
                {
                  key: path,
                  className: "dsh-wef-row",
                  draggable: true,
                  "data-workspace-editor-files-row": path,
                  "data-kind": entry.type,
                  "data-selected": selection.has(path) ? "true" : "false",
                  "data-anchor": selected === path ? "true" : "false",
                  "data-hidden": isHiddenName(entry.name) ? "true" : "false",
                  "data-chain": chain.length > 1 ? chain.slice(1).map(nameOf).join("/") : void 0,
                  "data-busy": busy === path ? "true" : "false",
                  "data-drop": dropOn === path ? "true" : "false",
                  style: { paddingLeft: `${String(2 + depth * 14)}px` },
                  onClick: (event) => {
                    activate(path, entry.type, event);
                  },
                  onContextMenu: (event) => {
                    openMenu(event, path, entry.type);
                  },
                  onDragStart: (event) => {
                    dragRef.current = path;
                    setDragging(path);
                    try {
                      event.dataTransfer.setData("text/plain", path);
                      event.dataTransfer.effectAllowed = "move";
                    } catch {
                    }
                  },
                  onDragEnd: () => {
                    dragRef.current = null;
                    setDragging(null);
                    setDropOn(null);
                  },
                  onDragOver: (event) => {
                    event.stopPropagation();
                    const from = dragRef.current;
                    if (from === null || dropBlocked(from)) {
                      if (dropOn !== null) setDropOn(null);
                      return;
                    }
                    event.preventDefault();
                    try {
                      event.dataTransfer.dropEffect = "move";
                    } catch {
                    }
                    if (dropOn !== path) setDropOn(path);
                  },
                  onDragLeave: () => {
                    if (dropOn === path) setDropOn(null);
                  },
                  onDrop: (event) => {
                    event.stopPropagation();
                    const from = dragRef.current;
                    dragRef.current = null;
                    setDragging(null);
                    setDropOn(null);
                    if (from === null || dropBlocked(from)) return;
                    event.preventDefault();
                    void moveEntry(from, `${dropDir}/${nameOf(from)}`);
                  }
                },
                // 多选框：常显，不靠悬停、也不要求用户知道 Ctrl+点。点它 = 切换这一行的选中，
                // 与 Ctrl/Cmd+点 走同一个 `toggleSelection`（约束 16：一套实现、多个入口）。
                h("button", {
                  type: "button",
                  className: "dsh-wef-check",
                  tabIndex: -1,
                  title: t("files.check"),
                  "aria-label": t("files.check"),
                  "aria-pressed": selection.has(path) ? "true" : "false",
                  "data-checked": selection.has(path) ? "true" : "false",
                  "data-workspace-editor-files-check": path,
                  onClick: (event) => {
                    event.stopPropagation();
                    toggleSelection(path);
                  }
                  // 字形用文本而不是 SVG：未勾选时 `color:transparent` 把它藏掉，勾上才显出来。
                }, selection.has(path) ? "\u2713" : ""),
                isDir ? h("button", {
                  type: "button",
                  className: "dsh-wef-caret",
                  tabIndex: -1,
                  "aria-label": open ? "collapse" : "expand",
                  onClick: (event) => {
                    event.stopPropagation();
                    toggle(path);
                  }
                }, glyph(open ? "chevronOpen" : "chevronClosed", 14)) : h("span", { className: "dsh-wef-spacer" }),
                h("span", { className: "dsh-wef-glyph" }, glyph(isDir ? "folder" : "file", 14)),
                h("span", { className: "dsh-wef-name" }, label),
                h(
                  "span",
                  { className: "dsh-wef-actions" },
                  isDir && h("button", {
                    type: "button",
                    className: "dsh-wef-tool",
                    title: t("files.newFile"),
                    "data-workspace-editor-files-new-file": path,
                    onClick: (event) => {
                      event.stopPropagation();
                      startCreate(path, "file");
                    }
                  }, glyph("newFile", 14)),
                  isDir && h("button", {
                    type: "button",
                    className: "dsh-wef-tool",
                    title: t("files.newFolder"),
                    "data-workspace-editor-files-new-folder": path,
                    onClick: (event) => {
                      event.stopPropagation();
                      startCreate(path, "folder");
                    }
                  }, glyph("newFolder", 14)),
                  h("button", {
                    type: "button",
                    className: "dsh-wef-tool",
                    title: t("files.rename"),
                    "data-workspace-editor-files-rename": path,
                    onClick: (event) => {
                      event.stopPropagation();
                      startRename(path);
                    }
                  }, glyph("rename", 14)),
                  !isDir && h("button", {
                    type: "button",
                    className: "dsh-wef-tool",
                    title: t("files.copy"),
                    "data-workspace-editor-files-copy": path,
                    onClick: (event) => {
                      event.stopPropagation();
                      void copyEntry(path);
                    }
                  }, glyph("copy", 14)),
                  h("button", {
                    type: "button",
                    className: "dsh-wef-tool",
                    title: t("files.delete"),
                    "data-workspace-editor-files-delete": path,
                    onClick: (event) => {
                      event.stopPropagation();
                      void armDelete(path, entry.type);
                    }
                  }, glyph("trash", 14))
                ),
                // 常显的「⋯」：悬停图标对不熟悉的人太难发现，每行留一个不用悬停就能点的入口。
                h("button", {
                  type: "button",
                  className: "dsh-wef-more",
                  title: t("files.more"),
                  "data-workspace-editor-files-more": path,
                  onClick: (event) => {
                    openMenu(event, path, entry.type);
                  }
                }, glyph("more", 14))
              );
            };
            const visiblePaths = [];
            const walk = (dir, depth) => {
              const level = levels[dir];
              if (level === void 0 || level.phase === "loading") {
                rows.push(h("p", { className: "dsh-wef-note", key: `loading:${dir}` }, t("files.loading")));
                return;
              }
              if (level.phase === "failed") {
                rows.push(h("p", { className: "dsh-wef-note", key: `failed:${dir}` }, t("files.readFailed", { message: level.message })));
                return;
              }
              if (createHere === dir) rows.push(inputRow(depth, editor));
              const items = foldLevel(dir, sortEntries(level.entries, sort), (path) => levels[path]?.entries);
              if (items.length === 0 && createHere !== dir) {
                rows.push(h("p", { className: "dsh-wef-note", key: `empty:${dir}` }, t("files.empty")));
              }
              for (const item of items) {
                const path = item.path;
                visiblePaths.push(path);
                if (editor !== null && editor.mode === "rename" && editor.path === path) {
                  rows.push(inputRow(depth, editor));
                  continue;
                }
                rows.push(rowOf(item, depth));
                if (item.entry.type === "directory" && expanded.has(path)) walk(path, depth + 1);
              }
              if (level.truncated) {
                rows.push(h("p", { className: "dsh-wef-note", key: `truncated:${dir}` }, t("files.truncated")));
              }
            };
            walk(root, 0);
            const allVisibleSelected = visiblePaths.length > 0 && visiblePaths.every((path) => selection.has(path));
            const isDirPath = (path) => {
              if (path === root) return true;
              const entries = levels[parentOf(path)]?.entries ?? [];
              return entries.some((entry) => entry.name === nameOf(path) && entry.type === "directory");
            };
            const hasSelectedDirectory = [...selection].some((path) => isDirPath(path));
            const targetDir = selected !== null && isDirPath(selected) ? selected : parentOf(selected ?? root);
            const onPasteEvent = (event) => {
              if (event.target?.tagName === "INPUT") return;
              if (filesClipboard !== null) {
                event.preventDefault();
                void pasteClipboardInto(targetDir);
                return;
              }
              const { files, directories } = clipboardFilesOf(event.clipboardData);
              if (files.length === 0) {
                if (directories.length > 0) {
                  event.preventDefault();
                  setError(t("files.paste.directory", { name: directories[0] }));
                }
                return;
              }
              event.preventDefault();
              void uploadInto(targetDir, files);
            };
            return h(
              "div",
              {
                className: "dsh-wef-root",
                "data-workspace-editor-files": "ready",
                "data-workspace-editor-files-root": root,
                onPaste: onPasteEvent
              },
              h("style", null, CSS),
              h(
                "div",
                { className: "dsh-wef-bar" },
                h("span", { className: "dsh-wef-path", title: targetDir }, targetDir),
                h("span", { className: "dsh-wef-spacer" }),
                h("button", {
                  type: "button",
                  className: "dsh-wef-tool",
                  title: t("files.newFile"),
                  "data-workspace-editor-files-new-file": targetDir,
                  disabled: busy !== null,
                  onClick: () => {
                    startCreate(targetDir, "file");
                  }
                }, glyph("newFile")),
                h("button", {
                  type: "button",
                  className: "dsh-wef-tool",
                  title: t("files.newFolder"),
                  "data-workspace-editor-files-new-folder": targetDir,
                  disabled: busy !== null,
                  onClick: () => {
                    startCreate(targetDir, "folder");
                  }
                }, glyph("newFolder")),
                h("button", {
                  type: "button",
                  className: "dsh-wef-tool",
                  title: t("files.paste"),
                  "data-workspace-editor-files-paste": targetDir,
                  disabled: busy !== null,
                  onClick: () => {
                    void pasteInto(targetDir);
                  }
                }, glyph("paste")),
                h("button", {
                  type: "button",
                  className: "dsh-wef-tool",
                  title: t("files.rename"),
                  "data-workspace-editor-files-rename-selected": "",
                  disabled: busy !== null || selected === null || selected === root,
                  onClick: () => {
                    startRename(selected);
                  }
                }, glyph("rename")),
                h("button", {
                  type: "button",
                  className: "dsh-wef-tool",
                  title: t("files.refresh"),
                  "data-workspace-editor-files-refresh": "",
                  disabled: busy !== null,
                  onClick: () => {
                    void reloadDir(targetDir);
                  }
                }, glyph("refresh")),
                // 排序入口：只改渲染顺序，不重新读盘（`levels` 里存的是原始顺序）。
                h("button", {
                  type: "button",
                  className: "dsh-wef-tool",
                  title: t("files.sort"),
                  "data-workspace-editor-files-sort": sort.key,
                  "data-workspace-editor-files-sort-dirs": sort.dirsFirst === false ? "off" : "on",
                  onClick: (event) => {
                    event.stopPropagation();
                    setMenu(null);
                    setSortOpen((prev) => prev === null ? menuAnchorFor(event) : null);
                  }
                }, glyph("sort"))
              ),
              // 批量列目录按钮（有多选、且勾选里至少有一个目录时才出现）。
              //
              // 这里传 `[...selection]`（路径数组），不是 `selection` 本身：`openBatchList` 内部是
              // `for (const path of selectedPaths)` 逐个 `ctx.fs.stat(path)`，塞进去一个 Set 会让
              // 每个元素都是 Set、stat 当场抛错，整条功能静默失效。
              selection.size >= 1 && hasSelectedDirectory && h("button", {
                type: "button",
                className: "dsh-wef-tool",
                title: t("files.batchList"),
                "data-workspace-editor-files-batch-list": "",
                onClick: (event) => {
                  event.stopPropagation();
                  openBatchList([...selection]);
                }
              }, glyph("list")),
              // 批量条：**勾了至少一项就出现**（勾选框是主入口，只勾一个也得拿到批量操作）。
              // 最左那颗是全选框，与每行的勾选框纵向对齐 —— 多选相关的东西全部靠左，不跑到右边。
              selection.size >= 1 && h(
                "div",
                {
                  className: "dsh-wef-batch",
                  "data-workspace-editor-files-batch": String(selection.size)
                },
                h("button", {
                  type: "button",
                  className: "dsh-wef-check",
                  title: t("files.batch.selectAll"),
                  "aria-label": t("files.batch.selectAll"),
                  "aria-pressed": allVisibleSelected ? "true" : "false",
                  "data-checked": allVisibleSelected ? "true" : "partial",
                  "data-workspace-editor-files-batch-all": "",
                  onClick: () => {
                    setSelection(allVisibleSelected ? /* @__PURE__ */ new Set() : new Set(visiblePaths));
                  }
                  // 全选框永远画得出来：全选是 ✓，半选是一条横线。
                }, allVisibleSelected ? "\u2713" : "\u2212"),
                h("span", { className: "dsh-wef-batch-text" }, t("files.batch.count", { count: selection.size })),
                h("span", { className: "dsh-wef-batch-fill" }),
                h("button", {
                  type: "button",
                  className: "dsh-we-open",
                  "data-workspace-editor-files-batch-copy": "",
                  onClick: () => {
                    void copySelectionPaths();
                  }
                }, t("files.batch.copyPaths")),
                h("button", {
                  type: "button",
                  className: "dsh-we-open",
                  "data-danger": "true",
                  "data-workspace-editor-files-batch-delete": "",
                  disabled: busy !== null,
                  onClick: () => {
                    void armBatchDelete();
                  }
                }, t("files.batch.delete")),
                h("button", {
                  type: "button",
                  className: "dsh-we-open",
                  "data-workspace-editor-files-batch-clear": "",
                  onClick: () => {
                    setSelection(/* @__PURE__ */ new Set());
                  }
                }, t("files.batch.clear"))
              ),
              error !== null && h(
                "p",
                {
                  className: "dsh-wef-banner",
                  "data-tone": "error",
                  "data-workspace-editor-files-error": ""
                },
                h("span", { className: "dsh-wef-banner-text" }, error),
                h("button", {
                  type: "button",
                  className: "dsh-we-open",
                  "data-workspace-editor-files-dismiss": "",
                  onClick: () => {
                    setError(null);
                  }
                }, t("files.cancel"))
              ),
              notice !== null && h(
                "p",
                {
                  className: "dsh-wef-banner",
                  "data-tone": notice.tone,
                  "data-workspace-editor-files-notice": ""
                },
                h("span", { className: "dsh-wef-banner-text" }, notice.text),
                h("button", {
                  type: "button",
                  className: "dsh-we-open",
                  "data-workspace-editor-files-notice-dismiss": "",
                  onClick: () => {
                    dismissNotice();
                  }
                }, t("files.cancel"))
              ),
              pending !== null && h(
                "p",
                {
                  className: "dsh-wef-banner",
                  "data-tone": "warn",
                  "data-workspace-editor-files-confirm": pending.type
                },
                h(
                  "span",
                  { className: "dsh-wef-banner-text" },
                  pending.type === "directory" ? t(pending.count > 0 ? "files.confirmDeleteDir" : "files.confirmDeleteEmptyDir", { name: nameOf(pending.path), count: pending.count }) : t("files.confirmDeleteFile", { name: nameOf(pending.path) }),
                  pending.stale ? ` ${t("files.stale")}` : ""
                ),
                h("button", {
                  type: "button",
                  className: "dsh-we-open",
                  "data-danger": "true",
                  "data-workspace-editor-files-confirm-go": pending.type === "directory" && pending.count > 0 ? "recursive" : "plain",
                  disabled: busy !== null,
                  onClick: () => {
                    void runDelete(pending.stale || pending.type === "directory" && pending.count > 0);
                  }
                }, pending.stale ? t("files.force") : pending.type === "directory" && pending.count > 0 ? t("files.recursive") : t("files.delete")),
                h("button", {
                  type: "button",
                  className: "dsh-we-open",
                  "data-workspace-editor-files-confirm-cancel": "",
                  onClick: () => {
                    setPending(null);
                  }
                }, t("files.cancel"))
              ),
              // 批量删除的确认条：与单条确认条同一处渲染，两者互斥（`armBatchDelete` 会先清 `pending`）。
              batch !== null && h(
                "p",
                {
                  className: "dsh-wef-banner",
                  "data-tone": "warn",
                  "data-workspace-editor-files-batch-confirm": String(batch.items.length)
                },
                h(
                  "span",
                  { className: "dsh-wef-banner-text" },
                  t(batch.items.some((item) => item.type === "directory") ? "files.confirmDeleteManyDirs" : "files.confirmDeleteMany", {
                    count: batch.items.length,
                    dirs: batch.items.filter((item) => item.type === "directory").length
                  })
                ),
                h("button", {
                  type: "button",
                  className: "dsh-we-open",
                  "data-danger": "true",
                  "data-workspace-editor-files-batch-confirm-go": "",
                  disabled: busy !== null,
                  onClick: () => {
                    void runBatchDelete();
                  }
                }, t("files.delete")),
                h("button", {
                  type: "button",
                  className: "dsh-we-open",
                  "data-workspace-editor-files-batch-confirm-cancel": "",
                  onClick: () => {
                    setBatch(null);
                  }
                }, t("files.cancel"))
              ),
              // 批量删除部分失败：失败项还在选择里，这条横幅给一条明确的出路（重试会重新取版本基线）。
              batchFailed !== null && h(
                "p",
                {
                  className: "dsh-wef-banner",
                  "data-tone": "error",
                  "data-workspace-editor-files-batch-failed": String(batchFailed.failed)
                },
                h(
                  "span",
                  { className: "dsh-wef-banner-text" },
                  t("files.batch.failed", { failed: batchFailed.failed, conflicted: batchFailed.conflicted })
                ),
                h("button", {
                  type: "button",
                  className: "dsh-we-open",
                  "data-workspace-editor-files-batch-retry": "",
                  disabled: busy !== null,
                  onClick: () => {
                    void armBatchDelete();
                  }
                }, t("files.batch.retry")),
                h("button", {
                  type: "button",
                  className: "dsh-we-open",
                  "data-workspace-editor-files-batch-failed-dismiss": "",
                  onClick: () => {
                    setBatchFailed(null);
                  }
                }, t("files.cancel"))
              ),
              // 「工作区根」落点条：**根目录自己没有行**，长列表里正文底部可能压根没有空白可拖，
              // 于是「搬到根」变成做不到的事（用户真反馈过）。所以一开始拖就亮这一条，松开即搬到根；
              // 拖的东西本来就在根下时不亮（那是空操作，亮出来只会误导）。
              dragging !== null && parentOf(dragging) !== root && h(
                "p",
                {
                  className: "dsh-wef-banner",
                  "data-tone": dropOn === root ? "ok" : "warn",
                  "data-workspace-editor-files-drop-root": root,
                  // 它自己就是落点：被行盖住时不必指望空白处，指针进到条上就是「搬到根」。
                  onDragOver: (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (dropOn !== root) setDropOn(root);
                  },
                  onDragLeave: () => {
                    if (dropOn === root) setDropOn(null);
                  },
                  onDrop: (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const from = dragRef.current;
                    dragRef.current = null;
                    setDragging(null);
                    setDropOn(null);
                    if (from === null || parentOf(from) === root) return;
                    void moveEntry(from, `${root}/${nameOf(from)}`);
                  }
                },
                h("span", { className: "dsh-wef-banner-text" }, t("files.dropRoot", { path: root }))
              ),
              h("div", {
                className: "dsh-wef-body",
                tabIndex: 0,
                ref: bodyRef,
                "data-drop": dropOn === root ? "true" : "false",
                // 点空白处收掉选区与浮层；点行 / 点按钮不算（`target === currentTarget` 才是真·空白）。
                onClick: (event) => {
                  if (event.target !== event.currentTarget) return;
                  setSelection(/* @__PURE__ */ new Set());
                  setMenu(null);
                  setSortOpen(null);
                },
                // F2 = 重命名当前选中行（VS Code 的习惯）；Ctrl/Cmd+C/X = 把选中行放进内部剪贴板
                // （Ctrl/Cmd+V 走 `paste` 事件，见根节点上的 onPaste）；Esc 收起一切浮层。
                // 输入框里的按键归输入框自己管。
                onKeyDown: (event) => {
                  if (event.target?.tagName === "INPUT") return;
                  if (event.key === "F2" && selected !== null && selected !== root) {
                    event.preventDefault();
                    startRename(selected);
                    return;
                  }
                  if ((event.ctrlKey || event.metaKey) && (event.key === "c" || event.key === "x")) {
                    if (selected === null || selected === root) return;
                    const directory = isDirPath(selected);
                    if (event.key === "c" && directory) return;
                    event.preventDefault();
                    if (event.key === "c") copyToClipboard(selected);
                    else cutToClipboard(selected);
                    return;
                  }
                  if ((event.ctrlKey || event.metaKey) && event.key === "a") {
                    event.preventDefault();
                    setSelection(new Set(visiblePaths));
                    return;
                  }
                  if (event.key === "Escape") {
                    setMenu(null);
                    setEditor(null);
                    setPending(null);
                    setBatch(null);
                    setSortOpen(null);
                    setSelection(/* @__PURE__ */ new Set());
                  }
                },
                onDragOver: (event) => {
                  const from = dragRef.current;
                  if (from === null || parentOf(from) === root) return;
                  event.preventDefault();
                  if (dropOn !== root) setDropOn(root);
                },
                onDragLeave: () => {
                  if (dropOn === root) setDropOn(null);
                },
                onDrop: (event) => {
                  const from = dragRef.current;
                  dragRef.current = null;
                  setDragging(null);
                  setDropOn(null);
                  if (from === null || parentOf(from) === root) return;
                  event.preventDefault();
                  void moveEntry(from, `${root}/${nameOf(from)}`);
                }
              }, rows),
              menu !== null && h("div", {
                className: "dsh-wef-backdrop",
                "data-workspace-editor-files-menu-backdrop": "",
                onClick: () => {
                  setMenu(null);
                },
                onContextMenu: (event) => {
                  event.preventDefault();
                  setMenu(null);
                }
              }),
              menu !== null && h(
                "div",
                {
                  className: "dsh-wef-menu",
                  style: { left: `${String(menu.x)}px`, top: `${String(menu.y)}px` },
                  "data-workspace-editor-files-menu": menu.path
                },
                menuItem("new-file", "newFile", menu.path, null, () => {
                  startCreate(menu.path, "file");
                }, menu.type === "file"),
                menuItem("new-folder", "newFolder", menu.path, null, () => {
                  startCreate(menu.path, "folder");
                }, menu.type === "file"),
                menuItem("open", "open", menu.path, t("files.open"), () => {
                  openFile(menu.path);
                }, menu.type !== "file"),
                h("div", { className: "dsh-wef-menu-sep", key: "sep" }),
                menuItem("rename", "rename", menu.path, t("files.rename"), () => {
                  startRename(menu.path);
                }, false),
                menuItem("copy", "copy", menu.path, t("files.copy"), () => {
                  void copyEntry(menu.path);
                }, menu.type !== "file"),
                menuItem("copy-to", "copy", menu.path, t("files.copyTo"), () => {
                  copyToClipboard(menu.path);
                }, menu.type !== "file"),
                menuItem("cut-to", "cut", menu.path, t("files.cut"), () => {
                  cutToClipboard(menu.path);
                }, false),
                menuItem("paste", "paste", menu.path, t("files.paste"), () => {
                  void pasteInto(menu.path);
                }, menu.type !== "directory"),
                h("div", { className: "dsh-wef-menu-sep", key: "sep-paths" }),
                menuItem("copy-path", "path", menu.path, t("files.copyPath"), () => {
                  void copyPath(menu.path, false);
                }, false),
                menuItem("copy-path-relative", "path", menu.path, t("files.copyPathRelative"), () => {
                  void copyPath(menu.path, true);
                }, false),
                menuItem("open-terminal", "terminal", menu.path, t("files.openTerminal"), (event) => {
                  void openInTerminal(menu.path, event?.currentTarget ?? null);
                }, false),
                menuItem("delete", "trash", menu.path, t("files.delete"), () => {
                  void armDelete(menu.path, menu.type);
                }, false, true)
              ),
              // 排序菜单：与行菜单同一套外观，位置来自按钮的视口坐标（`menuAnchorFor`）。
              sortOpen !== null && h("div", {
                className: "dsh-wef-backdrop",
                "data-workspace-editor-files-sort-backdrop": "",
                onClick: () => {
                  setSortOpen(null);
                },
                onContextMenu: (event) => {
                  event.preventDefault();
                  setSortOpen(null);
                }
              }),
              sortOpen !== null && h(
                "div",
                {
                  className: "dsh-wef-menu",
                  style: { left: `${String(sortOpen.x)}px`, top: `${String(sortOpen.y)}px` },
                  "data-workspace-editor-files-sort-menu": sort.key
                },
                ...TREE_SORT_KEYS.map((key) => h(
                  "button",
                  {
                    key,
                    type: "button",
                    className: "dsh-wef-menu-item",
                    "data-workspace-editor-files-sort-key": key,
                    "data-active": sort.key === key ? "true" : "false",
                    onClick: () => {
                      setSort({ ...sort, key });
                      setSortOpen(null);
                    }
                  },
                  h("span", { className: "dsh-wef-menu-check" }, sort.key === key ? "\u2713" : ""),
                  t(key === "type" ? "files.sort.type" : "files.sort.name")
                )),
                h("div", { className: "dsh-wef-menu-sep", key: "sort-sep" }),
                h(
                  "button",
                  {
                    key: "sort-dirs",
                    type: "button",
                    className: "dsh-wef-menu-item",
                    "data-workspace-editor-files-sort-dirs-first": sort.dirsFirst === false ? "off" : "on",
                    onClick: () => {
                      setSort({ ...sort, dirsFirst: sort.dirsFirst === false });
                      setSortOpen(null);
                    }
                  },
                  h("span", { className: "dsh-wef-menu-check" }, sort.dirsFirst === false ? "" : "\u2713"),
                  t("files.sort.dirsFirst")
                )
              ),
              busy !== null && h("p", { className: "dsh-wef-status", "data-workspace-editor-files-busy": "" }, t("files.busy")),
              // 剪贴板横幅：不是「正在处理」，而是「贴的时候会贴什么」，所以单独一行、带一个清空按钮。
              clipboard !== null && h(
                "p",
                {
                  className: "dsh-wef-clip",
                  "data-workspace-editor-files-clipboard": clipboard.path,
                  "data-workspace-editor-files-clipboard-mode": clipboard.mode
                },
                h(
                  "span",
                  { className: "dsh-wef-clip-name" },
                  t("files.clipboard", {
                    name: clipboard.name,
                    mode: t(clipboard.mode === "cut" ? "files.clipboardMode.cut" : "files.clipboardMode.copy")
                  })
                ),
                h("button", {
                  type: "button",
                  className: "dsh-we-open",
                  "data-workspace-editor-files-clipboard-clear": "",
                  onClick: () => {
                    armClipboard(null);
                  }
                }, t("files.clipboardClear"))
              ),
              h(FilesFooter, null)
            );
          }
          return { FilesPanel, FilesTree };
        }
        function createBatchListDialog(ctx) {
          const t = ctx.locale.bind(NS);
          let dialogState = {
            directories: [],
            // 选中的目录列表
            contents: [],
            // 每个目录的内容 [{ directory, entries, count }]
            loading: false,
            error: null
          };
          async function openBatchList(selectedPaths) {
            const dirs = [];
            for (const path of selectedPaths) {
              try {
                const info = await ctx.fs.stat(path);
                if (info?.type === "directory") {
                  const parts = path.split("/");
                  const name = parts[parts.length - 1];
                  if (!name.startsWith(".")) {
                    dirs.push(path);
                  }
                }
              } catch (err) {
                ctx.logger.warn("batch list stat failed:", path, err);
              }
            }
            if (dirs.length === 0) {
              return;
            }
            dialogState = {
              directories: dirs,
              contents: [],
              loading: true,
              error: null
            };
            try {
              const sessionId = ctx.sessions.getActiveId?.() || ctx.sessions.list.getSnapshot()?.[0]?.id;
              if (!sessionId) {
                throw new Error(t("search.noSession"));
              }
              const response = await fetch(LIST_BATCH_PATH, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  sessionId,
                  paths: dirs.slice(0, 50)
                })
              });
              const data = await response.json();
              if (!response.ok || !data.ok) {
                throw new Error(data.message || t("files.batchListFailed"));
              }
              dialogState = {
                ...dialogState,
                contents: data.directories || [],
                loading: false
              };
            } catch (err) {
              dialogState = { ...dialogState, loading: false, error: err.message };
              ctx.logger.error("batch list failed:", err);
            }
          }
          function closeBatchList() {
            dialogState = {
              directories: [],
              contents: [],
              loading: false,
              error: null
            };
          }
          async function copyToClipboard() {
            const lines = dialogState.contents.map(
              (d) => `${d.displayName}/
${d.entries.map((e) => `  ${e}`).join("\n")}`
            );
            const text = lines.join("\n\n");
            try {
              await navigator.clipboard.writeText(text);
              ctx.notice.show?.("Copied to clipboard");
            } catch (err) {
              ctx.logger.error("copy failed:", err);
            }
          }
          function BatchListDialogContent() {
            if (dialogState.directories.length === 0) return null;
            return h(
              "div",
              { className: "dsh-web-batch-list-dialog-overlay" },
              h("div", { className: "dsh-web-batch-list-dialog-backdrop", onClick: closeBatchList }),
              h(
                "div",
                { className: "dsh-web-batch-list-dialog" },
                h(
                  "div",
                  { className: "dsh-web-batch-list-header" },
                  h("h3", {}, t("files.batchListTitle", { count: dialogState.directories.length })),
                  h("button", {
                    className: "dsh-web-batch-list-close",
                    onClick: (e) => {
                      e.stopPropagation();
                      closeBatchList();
                    }
                  }, "\xD7")
                ),
                h(
                  "div",
                  { className: "dsh-web-batch-list-body" },
                  dialogState.loading && h("div", { className: "dsh-web-batch-list-loading" }, t("files.loading")),
                  dialogState.error && h("div", { className: "dsh-web-batch-list-error" }, dialogState.error),
                  !dialogState.loading && !dialogState.error && h("div", { className: "dsh-web-batch-list-empty" }, t("files.noEntries")),
                  ...dialogState.contents.map(
                    (dir, i) => h(
                      "div",
                      { key: i, className: "dsh-web-batch-list-dir" },
                      h("div", { className: "dsh-web-batch-list-dir-name" }, dir.displayName),
                      h(
                        "ul",
                        { className: "dsh-web-batch-list-entries" },
                        dir.entries.map(
                          (entry) => h("li", { key: entry }, entry)
                        )
                      )
                    )
                  )
                ),
                h(
                  "div",
                  { className: "dsh-web-batch-list-footer" },
                  h("button", {
                    className: "dsh-web-batch-list-copy",
                    onClick: (e) => {
                      e.stopPropagation();
                      copyToClipboard();
                    }
                  }, t("files.copyEntries")),
                  h("button", {
                    className: "dsh-web-batch-list-close-btn",
                    onClick: (e) => {
                      e.stopPropagation();
                      closeBatchList();
                    }
                  }, t("files.close"))
                )
              )
            );
          }
          return { BatchListDialogContent, openBatchList, closeBatchList };
        }
        const SEARCH_PATH = "/workspace-editor/search";
        const LIST_BATCH_PATH = "/workspace-editor/list-batch";
        const SEARCH_PREVIEW_LINES = 3;
        function findLineIndex(content, lineNo) {
          const lines = content.split("\n");
          let index = 0;
          for (let i = 1; i < lineNo && i <= lines.length; i++) {
            index += lines[i - 1].length + 1;
          }
          return index;
        }
        function createSearchPanel(ctx) {
          const t = ctx.locale.bind(NS);
          let state = {
            pattern: "",
            // 搜索关键词
            caseSensitive: false,
            // 区分大小写
            onlyFilenames: false,
            // 仅文件名匹配
            results: [],
            // 搜索结果 [{ path, matches }]
            loading: false,
            error: null,
            panelOpen: false
          };
          function openSearchPanel() {
            state = { ...state, panelOpen: true, pattern: "", results: [], error: null, loading: false };
          }
          function closeSearchPanel() {
            state = { ...state, panelOpen: false, pattern: "", results: [], error: null, loading: false };
          }
          async function executeSearch() {
            if (!state.pattern.trim()) return;
            state = { ...state, loading: true, error: null };
            try {
              const sessionId = ctx.sessions.getActiveId?.() || ctx.sessions.list.getSnapshot()?.[0]?.id;
              if (!sessionId) {
                throw new Error(t("search.noSession"));
              }
              const response = await fetch(SEARCH_PATH, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  sessionId,
                  pattern: state.pattern,
                  caseSensitive: state.caseSensitive
                  // 注意：这里不支持 pathPrefix，搜索整个工作区
                })
              });
              const data = await response.json();
              if (!response.ok || !data.ok) {
                throw new Error(data.message || t("search.failed"));
              }
              state = {
                ...state,
                results: data.results || [],
                loading: false
              };
            } catch (err) {
              state = { ...state, loading: false, error: err.message };
              ctx.logger.error("search failed:", err);
            }
          }
          function openResult(path, lineNo) {
            const address = FILE_ADDRESS_PREFIX + encodeURIComponent(path);
            const paneId = `${EDITOR_TAB_ID}-${path}-${lineNo}`;
            ctx.sidebarRight.openTabFromTarget(
              EDITOR_KIND,
              ctx.sidebarRight.commandTarget(document.activeElement),
              { address, paneId, replaceTab: false }
            );
          }
          function ResultRow(props) {
            const { result, onClick } = props;
            return h(
              "div",
              {
                className: "dsh-wes-result-row",
                onClick: () => onClick(result.path)
              },
              h("div", { className: "dsh-wes-file-header" }, result.path),
              ...result.matches.slice(0, SEARCH_PREVIEW_LINES).map(
                (m, i) => h(
                  "div",
                  {
                    key: i,
                    className: "dsh-wes-match-line",
                    onClick: (e) => {
                      e.stopPropagation();
                      onClick(result.path, m.lineNo);
                    }
                  },
                  h("span", { className: "dsh-wes-line-no" }, String(m.lineNo)),
                  h("span", { className: "dsh-wes-line-text" }, m.preview)
                )
              )
            );
          }
          function SearchPanelBody() {
            if (!state.panelOpen) return null;
            return h(
              "div",
              { className: "dsh-wes-panel" },
              // 顶部工具栏
              h(
                "div",
                { className: "dsh-wes-toolbar" },
                h("input", {
                  type: "text",
                  className: "dsh-wes-search-input",
                  placeholder: t("search.placeholder"),
                  value: state.pattern,
                  onInput: (e) => {
                    state = { ...state, pattern: e.target.value };
                  },
                  onKeyDown: (e) => {
                    if (e.key === "Enter") executeSearch();
                    else if (e.key === "Escape") closeSearchPanel();
                  }
                }),
                h("button", {
                  className: "dsh-wes-close",
                  onClick: closeSearchPanel
                }, "\xD7")
              ),
              // 结果区
              h(
                "div",
                { className: "dsh-wes-results" },
                state.loading && h("div", { className: "dsh-wes-loading" }, t("search.loading")),
                state.error && h("div", { className: "dsh-wes-error" }, state.error),
                !state.loading && !state.error && state.results.length === 0 && state.pattern && h("div", { className: "dsh-wes-empty" }, t("search.noResults")),
                ...state.results.map(
                  (result) => h(ResultRow, { key: result.path, result, onClick: openResult })
                )
              )
            );
          }
          return { SearchPanelBody, openSearchPanel, closeSearchPanel };
        }
        const inject = [
          "slots",
          "locale",
          "documentPreviews",
          "remote",
          "remote.workspaceFiles",
          "sidebarRightTabs",
          "sidebarRight"
        ];
        function FilesGuideIcon(props) {
          const size = props?.size ?? 16;
          return h(
            "svg",
            {
              width: size,
              height: size,
              viewBox: "0 0 16 16",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "1.2",
              strokeLinecap: "round",
              strokeLinejoin: "round",
              "aria-hidden": "true",
              focusable: "false",
              className: props?.className
            },
            h("path", { d: ICON_PATHS.folder[0] }),
            h("path", { d: "M8 8.6v3" }),
            h("path", { d: "M6.5 10.1h3" })
          );
        }
        function apply(ctx) {
          const t = ctx.locale.bind(NS);
          const { DocumentBody, PaneBody, EditAction, DeleteAction } = createEditor(ctx);
          const batchDialog = createBatchListDialog(ctx);
          const { BatchListDialogContent, openBatchList } = batchDialog;
          const { FilesPanel } = createFilesPanel(ctx, { openBatchList });
          const { ImageBody } = createImageBody(ctx);
          const bands = [
            { id: DEFAULT_RENDERER_ID, extensions: DEFAULT_EXTENSIONS, priority: "extension" },
            { id: OPTIONAL_RENDERER_ID, extensions: OPTIONAL_EXTENSIONS, priority: "builtin" }
          ];
          ctx.effect(() => ctx.locale.register(NS, { zh, en }), "workspace-editor: dictionaries");
          for (const band of bands) {
            ctx.effect(() => ctx.documentPreviews.register({
              id: band.id,
              extensions: band.extensions,
              priority: band.priority,
              title: () => t("viewer.title"),
              loading: "renderer",
              wrap: true
            }), `workspace-editor: ${band.id} metadata`);
            ctx.effect(() => ctx.slots.inject("sidebar.right.tab.document", () => ctx.slots.register({
              name: "sidebar.right.tab.document",
              key: band.id,
              locale: NS
            }, DocumentBody)), `workspace-editor: ${band.id} body`);
          }
          ctx.effect(() => ctx.sidebarRightTabs.register({
            id: EDITOR_TAB_ID,
            kind: EDITOR_KIND,
            patterns: [EDITOR_TAB_PATTERN],
            priority: "builtin",
            canOpen: (address) => typeof address === "string" && address.startsWith(FILE_ADDRESS_PREFIX),
            title: (address) => t("tab.title", { name: fileNameOf(address) })
          }), "workspace-editor: editor tab type");
          ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
            name: "sidebar.right.pane.tab",
            key: EDITOR_TAB_ID,
            locale: NS
          }, PaneBody)), "workspace-editor: editor tab body");
          ctx.effect(() => ctx.sidebarRightTabs.register({
            id: IMAGE_TAB_ID,
            kind: IMAGE_KIND,
            patterns: [IMAGE_TAB_PATTERN],
            priority: "builtin",
            canOpen: (address) => typeof address === "string" && address.startsWith(FILE_ADDRESS_PREFIX),
            title: (address) => t("image.title", { name: fileNameOf(address) })
          }), "workspace-editor: image tab type");
          ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
            name: "sidebar.right.pane.tab",
            key: IMAGE_TAB_ID,
            locale: NS
          }, ImageBody)), "workspace-editor: image tab body");
          ctx.effect(() => ctx.slots.inject("sidebar.right.tab.document.actions", () => ctx.slots.register({
            name: "sidebar.right.tab.document.actions",
            id: "workspace-editor",
            order: 5,
            locale: NS
          }, EditAction)), "workspace-editor: preview edit action");
          ctx.effect(() => ctx.slots.inject("sidebar.right.tab.document.actions", () => ctx.slots.register({
            name: "sidebar.right.tab.document.actions",
            id: "workspace-editor-delete",
            order: 6,
            locale: NS
          }, DeleteAction)), "workspace-editor: preview delete action");
          ctx.effect(() => ctx.sidebarRightTabs.register({
            id: FILES_TAB_ID,
            kind: FILES_KIND,
            priority: "builtin",
            keepMounted: true,
            title: () => t("files.title"),
            guide: [{
              id: "workspace-editor-files",
              commandId: "workspace.editor.files",
              order: 20,
              title: () => t("files.title"),
              description: () => t("files.guide"),
              icon: FilesGuideIcon
            }]
          }), "workspace-editor: files tab type");
          ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
            name: "sidebar.right.pane.tab",
            key: FILES_TAB_ID,
            locale: NS
          }, FilesPanel)), "workspace-editor: files panel body");
          ctx.effect(() => ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
            name: "conversation.input.dock",
            id: "workspace-editor-input",
            order: 90,
            locale: NS
          }, InputSink)), "workspace-editor: composer input sink");
          ctx.inject(["shortcuts"], (scoped) => {
            scoped.effect(() => scoped.shortcuts.register({
              id: "workspace.editor.files",
              label: () => t("files.shortcut"),
              aliases: ["workspace editor files", "\u6587\u4EF6\u7F16\u8F91"],
              defaults: {
                "desktop:macos": { code: "KeyE", modifiers: ["primary", "alt"] },
                "desktop:windows": { code: "KeyE", modifiers: ["primary", "alt"] },
                "desktop:linux": { code: "KeyE", modifiers: ["primary", "alt"] },
                "web:macos": { code: "KeyE", modifiers: ["primary", "alt"] },
                "web:windows": { code: "KeyE", modifiers: ["primary", "alt"] },
                "web:linux": { code: "KeyE", modifiers: ["primary", "alt"] }
              },
              regions: ["page", "editable", "terminal"],
              modals: [],
              resolve: ({ target }) => {
                const capture = ctx.sidebarRight.commandTarget(target);
                if (capture === void 0) return { status: "blocked", reason: t("files.noRoot") };
                return { status: "handled", run: () => {
                  ctx.sidebarRight.openTabFromTarget(FILES_KIND, capture);
                } };
              }
            }), "workspace-editor: files shortcut");
          });
        }
        return { name: "workspace-editor", inject, apply };
      }
    });
  })();
})();
