/* 지하상가 평면 지도 — 위치별 기준 해당 비율을 원(마커)으로 표시.
   - 평면도 이미지를 올리지 않으면 모식도(구역 배치·거리는 실제와 다름)를 그린다.
   - '위치 옮기기'를 켜면 마커를 끌어 실제 평면도 위 위치에 맞출 수 있다(좌표는 설정·백업에 저장). */
import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { GroupStats, Rate, SimSettings } from "../lib/criteria";
import { seqColor } from "../lib/palette";

export type MapMetric = "shape" | "comp" | "both";

export const METRIC_LABEL: Record<MapMetric, string> = { shape: "형상 기준", comp: "조성 기준", both: "두 기준 모두" };

const pick = (g: GroupStats, m: MapMetric): Rate => (m === "shape" ? g.shape : m === "comp" ? g.comp : g.both);
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
  const plan = sim.floorPlan;
  const W = 1000;
  const H = plan ? Math.round((W * plan.h) / plan.w) : 470;
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
      className={`w-full h-auto select-none bg-[#faf9f6] border border-line rounded-[3px] ${editing ? "cursor-crosshair touch-none" : ""}`}
      role="img"
      aria-label="지하상가 위치별 기준 해당 비율 지도"
      onPointerMove={(e) => {
        if (!drag) return;
        const p = toLocal(e);
        setSim((s) => ({ ...s, positions: { ...s.positions, [drag]: p } }));
      }}
      onPointerUp={() => setDrag(null)}
      onPointerLeave={() => setDrag(null)}
      onClick={(e) => { if (e.target === svg.current) onSelect(null); }}
    >
      {plan ? <image href={plan.url} x={0} y={0} width={W} height={H} preserveAspectRatio="xMidYMid meet" opacity={0.85} /> : <Schematic />}

      {sites.map((g) => {
        const s = g.site!;
        const pos = sim.positions[s.id] ?? { x: s.x, y: s.y };
        const cx = pos.x * W, cy = pos.y * H;
        const r = pick(g, metric);
        const n = g.inRange.length;
        const rad = 16 + 18 * Math.sqrt(n / maxN);
        const empty = r.n === 0;
        const fill = empty ? "#ffffff" : seqColor((r.pct ?? 0) / 100);
        const dark = !empty && (r.pct ?? 0) >= 45;
        const isSel = selected === s.id;
        const labelBelow = pos.y < 0.5;
        const ly = labelBelow ? cy + rad + 10 : cy - rad - 70;
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
            {isSel && <circle cx={cx} cy={cy} r={rad + 7} fill="none" stroke="#282828" strokeWidth={2} />}
            <circle cx={cx} cy={cy} r={rad} fill={fill} stroke={empty ? "#8a877f" : "#73290f"} strokeWidth={1.5} strokeDasharray={empty ? "4 3" : undefined} />
            <text x={cx} y={cy + 6} textAnchor="middle" fontSize={empty ? 13 : 18} fontWeight={700} fill={dark ? "#fff" : "#282828"} className="tnum">
              {empty ? "없음" : f0(r.pct)}
            </text>
            <g transform={`translate(${Math.min(W - 186, Math.max(6, cx - 90))},${Math.min(H - 76, Math.max(4, ly))})`}>
              <rect width={180} height={66} rx={3} fill="#ffffff" stroke={isSel ? "#282828" : "#d6d2c8"} />
              <text x={9} y={19} fontSize={14.5} fontWeight={700} fill="#282828">{s.short} <tspan fontSize={12.5} fontWeight={500} fill="#66645e">{s.zone} · n={n}</tspan></text>
              <MiniBar y={27} label="형상" r={g.shape} color="#3d3b37" />
              <MiniBar y={40} label="조성" r={g.comp} color="#d4552f" />
              <MiniBar y={53} label="둘 다" r={g.both} color="#2a78d6" />
            </g>
          </g>
        );
      })}
      {editing && (
        <text x={W - 12} y={H - 10} textAnchor="end" fontSize={13} fill="#b5381a" fontWeight={600}>마커를 끌어 위치를 옮기세요</text>
      )}
    </svg>
  );
}

function MiniBar({ y, label, r, color }: { y: number; label: string; r: Rate; color: string }) {
  const w = 82;
  return (
    <g transform={`translate(9,${y})`}>
      <text x={0} y={9} fontSize={11.5} fill="#4a4945">{label}</text>
      <rect x={34} y={2} width={w} height={8} fill="#efece5" />
      {r.pct != null && <rect x={34} y={2} width={(w * r.pct) / 100} height={8} fill={color} />}
      <text x={34 + w + 5} y={9.5} fontSize={11.5} fill="#282828" className="tnum">{r.n ? `${Math.round(r.pct ?? 0)}% (${r.k}/${r.n})` : "—"}</text>
    </g>
  );
}

/** 모식도: 지하상가 통로와 구역(배치·거리는 실제와 다름) */
function Schematic() {
  const zones = [
    { x: 40, w: 230, label: "B구역" },
    { x: 290, w: 230, label: "D구역" },
    { x: 540, w: 270, label: "E구역" },
    { x: 830, w: 130, label: "F구역" },
  ];
  return (
    <g>
      <defs>
        <pattern id="sm-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke="#ebe8e1" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="1000" height="470" fill="url(#sm-grid)" />
      {/* 통로 */}
      <rect x={30} y={190} width={940} height={110} fill="#f1eee7" stroke="#b9b4a9" strokeWidth={1.5} />
      {zones.map((z) => (
        <g key={z.label}>
          <rect x={z.x} y={200} width={z.w} height={90} fill="#ffffff" stroke="#d6d2c8" />
          <text x={z.x + 8} y={284} fontSize={13} fill="#66645e" fontFamily="Geist Mono, monospace">{z.label}</text>
        </g>
      ))}
      {/* 지하철 연결부 */}
      <rect x={350} y={300} width={110} height={36} fill="#3d3b37" />
      <text x={405} y={323} textAnchor="middle" fontSize={13} fill="#fff" fontWeight={600}>2호선 강남역</text>
      <text x={18} y={26} fontSize={13} fill="#66645e">강남역 지하상가 — 모식도(구역 배치·거리는 실제와 다름)</text>
    </g>
  );
}
