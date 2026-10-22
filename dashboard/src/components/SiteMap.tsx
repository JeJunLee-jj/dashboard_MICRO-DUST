/* 지하상가 평면 지도 — 위치별 기준 해당 비율을 원(마커)으로 표시.
   - 기본 배경은 '강남역 지하도상가 배치도'이며, 마커는 채취 점포 위치에 놓인다(sites.ts 좌표).
   - 다른 평면도를 올리면 그 위에 표시하고, '마커 위치 옮기기'로 끌어 맞출 수 있다(좌표는 설정·백업에 저장).
   - 지도 위에는 원(비율)과 이름표만 두고, 기준별 세부 비율은 지도 아래 카드(SiteCards)로 보여준다. */
import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { GroupStats, Rate, SimSettings } from "../lib/criteria";
import { seqColor } from "../lib/palette";
import floorPlanUrl from "../assets/gangnam-floorplan.webp";

export type MapMetric = "shape" | "comp" | "both";

export const METRIC_LABEL: Record<MapMetric, string> = { shape: "형상 기준", comp: "조성 기준", both: "두 기준 모두" };
export const METRIC_COLOR: Record<MapMetric, string> = { shape: "#3d3b37", comp: "#d4552f", both: "#2a78d6" };

/** 기본 배경: 강남역 지하도상가 배치도(2000×1414) */
export const DEFAULT_PLAN = { url: floorPlanUrl, name: "강남역 지하도상가 배치도", w: 2000, h: 1414 };

export const pickRate = (g: GroupStats, m: MapMetric): Rate => (m === "shape" ? g.shape : m === "comp" ? g.comp : g.both);
const f0 = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);

export function SiteMap({ sites, sim, setSim, metric, selected, onSelect, editing }: {
  sites: GroupStats[];
  sim: SimSettings;
  setSim: (f: (s: SimSettings) => SimSettings) => void;
  metric: MapMetric;
  selected: string | null;
  onSelect: (id: string | null) => void;
  editing: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const plan = sim.floorPlan ?? DEFAULT_PLAN;
  const W = 1000;
  const H = Math.round((W * plan.h) / plan.w);
  const maxN = Math.max(1, ...sites.map((g) => g.inRange.length));

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
      aria-label="지하상가 위치별 기준 해당 비율 지도"
      onPointerMove={(e) => {
        if (!drag) return;
        const p = toLocal(e);
        setSim((s) => ({ ...s, positions: { ...s.positions, [drag]: p } }));
      }}
      onPointerUp={() => setDrag(null)}
      onPointerLeave={() => setDrag(null)}
      onClick={(e) => { if (e.target === svg.current || (e.target as Element).tagName === "image" || (e.target as Element).tagName === "rect") onSelect(null); }}
    >
      <image href={plan.url} x={0} y={0} width={W} height={H} preserveAspectRatio="xMidYMid meet" />
      {/* 배치도 색을 옅게 덮어 마커가 눈에 띄게 */}
      <rect x={0} y={0} width={W} height={H} fill="#ffffff" opacity={0.5} />

      {sites.map((g) => {
        const s = g.site!;
        const pos = sim.positions[s.id] ?? { x: s.x, y: s.y };
        const cx = pos.x * W, cy = pos.y * H;
        const r = pickRate(g, metric);
        const n = g.inRange.length;
        const rad = 15 + 13 * Math.sqrt(n / maxN);
        const empty = r.n === 0;
        const fill = empty ? "#ffffff" : seqColor((r.pct ?? 0) / 100);
        const dark = !empty && (r.pct ?? 0) >= 45;
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
            onClick={(e) => { e.stopPropagation(); if (!editing) onSelect(isSel ? null : s.id); }}
            style={{ cursor: editing ? "grab" : "pointer" }}
          >
            <title>{`${s.label}\n분석 대상 ${n}개\n형상 ${g.shape.k}/${g.shape.n} · 조성 ${g.comp.k}/${g.comp.n} · 두 기준 ${g.both.k}/${g.both.n}`}</title>
            {isSel && <circle cx={cx} cy={cy} r={rad + 6} fill="none" stroke="#282828" strokeWidth={2.5} />}
            <circle cx={cx} cy={cy} r={rad} fill={fill} stroke={empty ? "#66645e" : "#73290f"} strokeWidth={2} strokeDasharray={empty ? "4 3" : undefined} />
            <text x={cx} y={cy + 6} textAnchor="middle" fontSize={empty ? 12 : 17} fontWeight={700} fill={dark ? "#fff" : "#282828"} className="tnum">
              {empty ? "없음" : f0(r.pct)}
            </text>
            {/* 이름표 */}
            <g transform={`translate(${cx - tagW / 2},${cy - rad - 26})`}>
              <rect width={tagW} height={21} rx={2} fill={isSel ? "#282828" : "#ffffff"} stroke="#282828" strokeWidth={1.2} />
              <text x={tagW / 2} y={15} textAnchor="middle" fontSize={13.5} fontWeight={700} fill={isSel ? "#ffffff" : "#282828"}>{tag}</text>
            </g>
            <text x={cx} y={cy + rad + 15} textAnchor="middle" fontSize={12.5} fontWeight={600} fill="#282828" stroke="#ffffff" strokeWidth={3} paintOrder="stroke" className="tnum">
              {r.n ? `${r.k}/${r.n}` : `n=${n}`}
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

/** 지도 아래: 위치별 세 기준 비율 카드 */
export function SiteCards({ sites, selected, onSelect }: { sites: GroupStats[]; selected: string | null; onSelect: (id: string | null) => void }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 mt-3">
      {sites.map((g) => {
        const s = g.site!;
        const isSel = selected === s.id;
        return (
          <button key={s.id} onClick={() => onSelect(isSel ? null : s.id)}
            className={`text-left border rounded-[3px] px-3 py-2 ${isSel ? "border-ink bg-accent-soft" : "border-line bg-surface hover:border-ink"}`}>
            <div className="text-[14px] font-semibold leading-tight">{s.short} <span className="text-[12.5px] font-normal text-ink-3">{s.zone} · 대상 {g.inRange.length}개</span></div>
            <div className="mt-1.5 space-y-1">
              {(["shape", "comp", "both"] as MapMetric[]).map((m) => {
                const r = pickRate(g, m);
                return (
                  <div key={m} className="flex items-center gap-1.5 text-[12.5px]">
                    <span className="w-9 text-ink-2 shrink-0">{m === "shape" ? "형상" : m === "comp" ? "조성" : "둘 다"}</span>
                    <span className="flex-1 h-2 bg-[#efece5] relative">
                      {r.pct != null && <span className="absolute inset-y-0 left-0" style={{ width: `${r.pct}%`, background: METRIC_COLOR[m] }} />}
                    </span>
                    <span className="tnum w-[74px] text-right shrink-0">{r.n ? <>{Math.round(r.pct ?? 0)}% <span className="text-ink-3">({r.k}/{r.n})</span></> : "—"}</span>
                  </div>
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}
