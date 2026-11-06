import { cut, initSync } from "../vendor/jieba-wasm/jieba_rs_wasm.js";
import module from "../vendor/jieba-wasm/jieba_rs_wasm_bg.wasm";

// Initialize the immutable Jieba dictionary during isolate startup, rather than
// charging its first-use parsing to the first Queue delivery's CPU budget.
const wasm = initSync({ module });
cut("初始化", true);
export const segmenterVersion = "jieba-wasm-2.4.0";
export const segmenterMemoryBytes = () => wasm.memory.buffer.byteLength;
export function segmentChinese(text: string): string[] { return cut(text, true); }
