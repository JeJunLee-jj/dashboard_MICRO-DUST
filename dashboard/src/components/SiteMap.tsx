/* 지하상가 평면 지도 — 선택한 판정 규칙에 해당하는 입자 비율을 지점별 원(마커)으로 표시.
   기본 배경은 '강남역 지하도상가 배치도'이며, 다른 평면도를 올리면 마커를 끌어 위치를 맞출 수 있다. */
import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { SimSettings } from "../lib/sources";
import type { SiteDef } from "../lib/sites";
import { seqColor } from "../lib/palette";
import floorPlanUrl from "../assets/gangnam-floorplan.webp";

export const DEFAULT_PLAN = { url: floorPlanUrl, name: "강남역 지하도상가 배치도", w: 2000, h: 1414 };

export interface MapItem {
  site: SiteDef;
  k: number;
  n: number;
  pct: number | null;
  /** 이 지점이 선택한 규칙의 '예상 지점'인지 */
  expected: boolean;
}

export function SiteMap({ items, sim, setSim, selected, onSelect, editing }: {
  items: MapItem[];
  sim: SimSettings;
  setSim: (f: (s: SimSettings) => SimSettings) => void;
  selected: string | null;
  onSelect: (id: string) => void;
  editing: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const plan = sim.floorPlan ?? DEFAULT_PLAN;
  const W = 1000;
  const H = Math.round((W * plan.h) / plan.w);
  const maxN = Math.max(1, ...items.map((i) => i.n));

  const toLocal = (e: RPointerEvent) => {
    const el = svg.current!;
    const pt = el.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(el.getScreenCTM()!.inverse());
    return { x: Math.min(1, Math.max(0, p.x / W)), y: Math.min(1, Math.max(0, p.y / H)) };
  };

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${W} ${H}`}
      className={`w-full h-auto select-none bg-white border border-line rounded-[3px] ${editing ? "cursor-crosshair touch-none" : ""}`}
      role="img"
      aria-label="지하상가 지점별 판정 비율 지도"
      onPointerMove={(e) => {
        if (!drag) return;
        const p = toLocal(e);
        setSim((s) => ({ ...s, positions: { ...s.positions, [drag]: p } }));
      }}
      onPointerUp={() => setDrag(null)}
      onPointerLeave={() => setDrag(null)}
    >
      <image href={plan.url} x={0} y={0} width={W} height={H} preserveAspectRatio="xMidYMid meet" />
      <rect x={0} y={0} width={W} height={H} fill="#ffffff" opacity={0.5} />
      {items.map(({ site: s, k, n, pct, expected }) => {
        const pos = sim.positions[s.id] ?? { x: s.x, y: s.y };
        const cx = pos.x * W, cy = pos.y * H;
        const rad = 15 + 13 * Math.sqrt(n / maxN);
        const empty = n === 0;
        const dark = !empty && (pct ?? 0) >= 45;
        const isSel = selected === s.id;
        const tag = `${s.short} ${s.zone}`;
        const tagW = 15 + tag.length * 10.5;
        return (
          <g
            key={s.id}
            onPointerDown={(e) => {
              if (!editing) return;
              (e.target as Element).setPointerCapture?.(e.pointerId);
              setDrag(s.id);
            }}
            onClick={(e) => { e.stopPropagation(); if (!editing) onSelect(s.id); }}
            style={{ cursor: editing ? "grab" : "pointer" }}
          >
            <title>{`${s.label}: ${k}/${n}`}</title>
            {isSel && <circle cx={cx} cy={cy} r={rad + 6} fill="none" stroke="#282828" strokeWidth={2.5} />}
            <circle cx={cx} cy={cy} r={rad} fill={empty ? "#fff" : seqColor((pct ?? 0) / 100)} stroke={expected ? "#282828" : "#73290f"}
              strokeWidth={expected ? 3 : 1.5} strokeDasharray={empty ? "4 3" : undefined} />
            <text x={cx} y={cy + 6} textAnchor="middle" fontSize={empty ? 12 : 17} fontWeight={700} fill={dark ? "#fff" : "#282828"} className="tnum">
              {empty ? "없음" : `${Math.round(pct ?? 0)}%`}
            </text>
            <g transform={`translate(${cx - tagW / 2},${cy - rad - 26})`}>
              <rect width={tagW} height={21} rx={2} fill={isSel ? "#282828" : "#fff"} stroke="#282828" strokeWidth={1.2} />
              <text x={tagW / 2} y={15} textAnchor="middle" fontSize={13.5} fontWeight={700} fill={isSel ? "#fff" : "#282828"}>{tag}</text>
            </g>
            <text x={cx} y={cy + rad + 15} textAnchor="middle" fontSize={12.5} fontWeight={600} fill="#282828" stroke="#fff" strokeWidth={3} paintOrder="stroke" className="tnum">
              {k}/{n}
            </text>
          </g>
        );
      })}
      {editing && (
        <text x={W - 12} y={H - 12} textAnchor="end" fontSize={14} fill="#b5381a" fontWeight={700} stroke="#fff" strokeWidth={3} paintOrder="stroke">마커를 끌어 위치를 옮기세요</text>
      )}
    </svg>
  );
}
