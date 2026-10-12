/* SVG 히트맵(행 × 열). PNG 저장이 되도록 SVG로 그리고, 칸마다 값 텍스트와 마우스오버 설명을 둔다. */
import { useState } from "react";

export interface HeatCell {
  color: string;
  text: string;          // 칸 안에 표시할 짧은 값
  tooltip: string;       // 마우스오버 설명(분모 포함)
  dark?: boolean;        // 진한 배경이면 흰 글자
  onClick?: () => void;
}

export function Heatmap({ rows, cols, cell, cellW = 52, cellH = 28, rowLabelW = 140, onRowClick, maxHeight }: {
  rows: Array<{ key: string; label: string }>;
  cols: Array<{ key: string; label: string }>;
  cell: (r: string, c: string) => HeatCell | null;
  cellW?: number;
  cellH?: number;
  rowLabelW?: number;
  onRowClick?: (r: string) => void;
  maxHeight?: number;
}) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const headH = 26;
  const W = rowLabelW + cols.length * cellW + 4;
  const H = headH + rows.length * cellH + 2;
  return (
    <div className="relative overflow-auto" style={{ maxHeight }} onMouseLeave={() => setTip(null)}>
      <svg width={W} height={H} role="img" aria-label="히트맵">
        <rect x={0} y={0} width={W} height={H} fill="#ffffff" />
        {cols.map((c, j) => (
          <text key={c.key} x={rowLabelW + j * cellW + cellW / 2} y={17} textAnchor="middle" fontSize={12} fontWeight={600} fill="#4a5754">
            {c.label}
          </text>
        ))}
        {rows.map((r, i) => (
          <g key={r.key} transform={`translate(0, ${headH + i * cellH})`}>
            <text
              x={rowLabelW - 8} y={cellH / 2 + 4} textAnchor="end" fontSize={12} fill={onRowClick ? "#0f6b62" : "#131a18"}
              style={{ cursor: onRowClick ? "pointer" : "default" }} onClick={() => onRowClick?.(r.key)}
            >
              {r.label.length > 20 ? r.label.slice(0, 19) + "…" : r.label}
            </text>
            {cols.map((c, j) => {
              const v = cell(r.key, c.key);
              const x = rowLabelW + j * cellW;
              if (!v) return <rect key={c.key} x={x + 1} y={1} width={cellW - 2} height={cellH - 2} fill="#fafbfa" stroke="#eef1ef" />;
              return (
                <g
                  key={c.key}
                  style={{ cursor: v.onClick ? "pointer" : "default" }}
                  onClick={v.onClick}
                  onMouseMove={(e) => {
                    const box = (e.currentTarget.ownerSVGElement!.parentElement as HTMLElement).getBoundingClientRect();
                    setTip({ x: e.clientX - box.left + 12, y: e.clientY - box.top + 12, text: v.tooltip });
                  }}
                >
                  <rect x={x + 1} y={1} width={cellW - 2} height={cellH - 2} rx={3} fill={v.color} />
                  <text x={x + cellW / 2} y={cellH / 2 + 4} textAnchor="middle" fontSize={11} fill={v.dark ? "#ffffff" : "#131a18"} className="tnum">
                    {v.text}
                  </text>
                </g>
              );
            })}
          </g>
        ))}
      </svg>
      {tip && (
        <div className="absolute z-10 pointer-events-none bg-ink text-white text-[12px] rounded px-2 py-1 max-w-[280px] whitespace-pre-line shadow" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}
