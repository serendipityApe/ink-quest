"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 监听用户在阅读容器内的文本选择，返回选中的段索引区间与定位矩形，
 * 供外层渲染「播放此句」浮动按钮。
 *
 * 用法：
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   const { range, anchor, clear } = useSentenceSelection(containerRef);
 *
 * 实现要点：
 *   - 容器内每段必须有 `data-seg-index="<i>"`，hook 据此把 DOM 节点映射回段索引。
 *   - 用 `selectionchange` 全局事件 + 节流，确保用户拖选过程中也能更新（mouseup 在触屏不可靠）。
 *   - 选区被清空（点击空白）或落在容器外时，清掉状态隐藏按钮。
 */
export function useSentenceSelection(
  containerRef: React.RefObject<HTMLElement | null>,
  enabled = true
) {
  const [range, setRange] = useState<[number, number] | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const rafRef = useRef<number>(0);

  const clear = useCallback(() => {
    setRange(null);
    setAnchor(null);
    if (typeof window !== "undefined") window.getSelection()?.removeAllRanges();
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const compute = () => {
      const sel = window.getSelection();
      const container = containerRef.current;
      if (!sel || sel.isCollapsed || !container) {
        setRange(null);
        setAnchor(null);
        return;
      }
      const sRange = sel.getRangeAt(0);
      // 选区必须落在容器内
      if (!container.contains(sRange.commonAncestorContainer)) {
        setRange(null);
        setAnchor(null);
        return;
      }
      const startSeg = climbToSegIndex(sRange.startContainer);
      const endSeg = climbToSegIndex(sRange.endContainer);
      if (startSeg < 0 || endSeg < 0) {
        setRange(null);
        setAnchor(null);
        return;
      }
      const lo = Math.min(startSeg, endSeg);
      const hi = Math.max(startSeg, endSeg);
      const rect = sRange.getBoundingClientRect();
      // 空 rect（罕见）→ 不显示
      if (rect.width === 0 && rect.height === 0) {
        setRange(null);
        setAnchor(null);
        return;
      }
      setRange([lo, hi]);
      setAnchor({
        top: rect.top + window.scrollY,
        left: rect.left + rect.width / 2 + window.scrollX,
      });
    };

    const onSelChange = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(compute);
    };

    document.addEventListener("selectionchange", onSelChange);
    return () => {
      document.removeEventListener("selectionchange", onSelChange);
      cancelAnimationFrame(rafRef.current);
    };
  }, [containerRef, enabled]);

  return { range: enabled ? range : null, anchor: enabled ? anchor : null, clear };
}

/** 从 DOM 节点向上找带 data-seg-index 的祖先；找不到返回 -1。 */
function climbToSegIndex(node: Node | null): number {
  let cur: Node | null = node;
  while (cur) {
    if (cur.nodeType === Node.ELEMENT_NODE) {
      const el = cur as HTMLElement;
      const v = el.dataset?.segIndex;
      if (v !== undefined) {
        const n = parseInt(v, 10);
        return Number.isNaN(n) ? -1 : n;
      }
    }
    cur = cur.parentNode;
  }
  return -1;
}
