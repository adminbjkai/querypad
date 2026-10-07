import { loader } from "@monaco-editor/react";
import type * as MonacoApi from "monaco-editor";

/**
 * Stand-in for `monaco-editor/esm/vs/editor/editor.api.js` (aliased in next.config.ts).
 *
 * y-monaco imports Monaco's ESM build for `Range`, `Selection` and `SelectionDirection`,
 * which would bundle a second 2.5 MB copy of the editor. The editor itself is loaded
 * through @monaco-editor/react's AMD loader from /monaco/<version>/vs, so this module
 * re-exports those names from that loaded instance instead. The bindings are live: they
 * fill in as soon as Monaco is available (it already is when a collaboration binding is
 * created, since that happens after the editor mounted).
 */
export let Range: typeof MonacoApi.Range;
export let Selection: typeof MonacoApi.Selection;
export let SelectionDirection: typeof MonacoApi.SelectionDirection;
export let editor: typeof MonacoApi.editor;

function adopt(monaco: typeof MonacoApi): void {
  Range = monaco.Range;
  Selection = monaco.Selection;
  SelectionDirection = monaco.SelectionDirection;
  editor = monaco.editor;
}

const loaded = loader.__getMonacoInstance();
if (loaded) adopt(loaded);
else void loader.init().then(adopt, () => undefined);
