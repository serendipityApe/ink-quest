"use client";

import { useMemo } from "react";
import { X, MapPin, HelpCircle, Flag } from "lucide-react";
import type { StoryManifest } from "@/types/story";
import { buildStoryGraph, type GraphNode } from "@/lib/storyGraph";
import { STORY_MAP_LABELS } from "@/data/storyMaps";
import { useTranslations } from "@/i18n/I18nProvider";

interface StoryMapProps {
  storyId: string;
  manifest: StoryManifest;
  currentNodeId: string;
  visited: string[];          // 已经历过的节点 id
  onJump: (nodeId: string) => void;
  onClose: () => void;
}

// 布局常量（SVG 坐标系，单位 px）
const COL_W = 180;   // 每层（列）宽度
const ROW_H = 92;    // 同层节点行高
const PAD_X = 90;
const PAD_Y = 56;
const NODE_R = 26;   // 节点圆半径

export default function StoryMap({
  storyId, manifest, currentNodeId, visited, onJump, onClose,
}: StoryMapProps) {
  const { t } = useTranslations();
  const graph = useMemo(
    () => buildStoryGraph(manifest, STORY_MAP_LABELS[storyId] ?? {}),
    [manifest, storyId]
  );
  const visitedSet = useMemo(() => new Set(visited), [visited]);

  // 每层节点数，用于同层垂直居中
  const perLayer = useMemo(() => {
    const m: Record<number, number> = {};
    graph.nodes.forEach((n) => { m[n.layer] = (m[n.layer] ?? 0) + 1; });
    return m;
  }, [graph]);

  const height = PAD_Y * 2 + (graph.maxLayerWidth - 1) * ROW_H + NODE_R * 2;
  const width = PAD_X * 2 + (graph.layerCount - 1) * COL_W + NODE_R * 2;

  const pos = (n: GraphNode) => {
    const count = perLayer[n.layer] ?? 1;
    const layerH = (count - 1) * ROW_H;
    const top = (height - layerH) / 2;
    return {
      x: PAD_X + NODE_R + n.layer * COL_W,
      y: top + n.col * ROW_H,
    };
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[85vh] bg-surface rounded-2xl border border-surface-container-high/40 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-container-high/30 shrink-0">
          <div className="flex flex-col gap-1">
            <h2 className="font-story-title-lg text-[22px] text-on-surface tracking-tight">
              {(manifest.target_lang === "en" ? manifest.title_en : manifest.title_cn)} · {t("reader.map")}
            </h2>
            <p className="font-ui-body text-xs text-on-surface-variant">
              {t("storyMap.hint")}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close map"
            className="text-secondary hover:text-primary transition-colors p-1 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable graph */}
        <div className="flex-grow overflow-auto p-4">
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="mx-auto"
            style={{ minWidth: width }}
          >
            {/* Edges */}
            {graph.edges.map((e, i) => {
              const a = pos(graph.byId[e.from]);
              const b = pos(graph.byId[e.to]);
              const bothVisited = visitedSet.has(e.from) && visitedSet.has(e.to);
              const midX = (a.x + b.x) / 2;
              return (
                <path
                  key={i}
                  d={`M ${a.x + NODE_R} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x - NODE_R} ${b.y}`}
                  fill="none"
                  stroke={bothVisited ? "var(--color-primary)" : "var(--color-outline-variant)"}
                  strokeWidth={bothVisited ? 2.5 : 1.5}
                  strokeDasharray={bothVisited ? "0" : "4 4"}
                  opacity={bothVisited ? 0.9 : 0.5}
                />
              );
            })}

            {/* Nodes */}
            {graph.nodes.map((n) => {
              const { x, y } = pos(n);
              const isVisited = visitedSet.has(n.id);
              const isCurrent = n.id === currentNodeId;
              const clickable = isVisited && !isCurrent;

              const fill = isCurrent
                ? "var(--color-primary)"
                : isVisited
                  ? "var(--color-primary-fixed)"
                  : "var(--color-surface-container)";
              const stroke = isCurrent
                ? "var(--color-primary)"
                : isVisited
                  ? "var(--color-primary-container)"
                  : "var(--color-outline-variant)";

              return (
                <g
                  key={n.id}
                  transform={`translate(${x}, ${y})`}
                  className={clickable ? "cursor-pointer" : isCurrent ? "" : "cursor-not-allowed"}
                  onClick={() => clickable && onJump(n.id)}
                >
                  {isCurrent && (
                    <circle r={NODE_R + 6} fill="none" stroke="var(--color-primary)" strokeWidth={1.5} opacity={0.4}>
                      <animate attributeName="r" values={`${NODE_R + 4};${NODE_R + 9};${NODE_R + 4}`} dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.5;0.1;0.5" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle r={NODE_R} fill={fill} stroke={stroke} strokeWidth={2} />

                  {/* Icon */}
                  {isVisited ? (
                    n.isEnding ? (
                      <Flag x={-9} y={-9} width={18} height={18} className={isCurrent ? "text-on-primary" : "text-on-primary-fixed"} />
                    ) : (
                      <MapPin x={-9} y={-9} width={18} height={18} className={isCurrent ? "text-on-primary" : "text-on-primary-fixed"} />
                    )
                  ) : (
                    <HelpCircle x={-9} y={-9} width={18} height={18} className="text-outline" />
                  )}

                  {/* Label */}
                  <text
                    y={NODE_R + 16}
                    textAnchor="middle"
                    className="select-none"
                    fontSize="12"
                    fill={isVisited ? "var(--color-on-surface)" : "var(--color-outline)"}
                    fontWeight={isCurrent ? 600 : 400}
                  >
                    {isVisited ? n.label : "？"}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 px-6 py-3 border-t border-surface-container-high/30 shrink-0 flex-wrap">
          <Legend swatch="var(--color-primary)" label={t("storyMap.current")} ring />
          <Legend swatch="var(--color-primary-fixed)" label={t("storyMap.unlocked")} />
          <Legend swatch="var(--color-surface-container)" label={t("storyMap.locked")} dashed />
          <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
            <Flag className="h-3.5 w-3.5 text-primary" /> {t("storyMap.ending")}
          </span>
        </div>
      </div>
    </div>
  );
}

function Legend({ swatch, label, ring, dashed }: { swatch: string; label: string; ring?: boolean; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
      <span
        className="inline-block h-3.5 w-3.5 rounded-full border-2"
        style={{
          backgroundColor: swatch,
          borderColor: ring ? "var(--color-primary)" : dashed ? "var(--color-outline-variant)" : "var(--color-primary-container)",
          borderStyle: dashed ? "dashed" : "solid",
        }}
      />
      {label}
    </span>
  );
}
