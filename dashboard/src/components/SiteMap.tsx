/* 지하상가 평면 지도 — 선택한 판정 규칙에 해당하는 입자 비율을 지점별 원(마커)으로 표시.
   기본 배경은 '강남역 지하도상가 배치도'이며, 다른 평면도를 올리면 마커를 끌어 위치를 맞출 수 있다. */
import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { SimSettings } from "../lib/sources";
import type { SiteDef } from "../lib/sites";
import { seqColor, seqColorSmooth } from "../lib/palette";
import { convexHull, hullDistance, hullMean, isolines, sampleGrid, sibsonGrid } from "../lib/interp";
import floorPlanUrl from "../assets/gangnam-floorplan.webp";

export const DEFAULT_PLAN = { url: floorPlanUrl, name: "강남역 지하도상가 배치도", w: 2000, h: 1414 };

export interface MapItem {
  site: SiteDef;
  k: number;
  n: number;
  pct: number | null;
  /** 이 지점이 선택한 규칙의 '예상 지점'인지 */
  expected: boolean;
  /** 원 아래에 붙일 이름(대표 판정 모드: 가장 많이 해당한 입자 유형) */
  caption?: string;
  /** 원 색(지정하지 않으면 비율에 따른 주황 단계) */
  color?: string;
}

export type MapDisplay = "circle" | "contour";

/** 등고선 띠 간격(%) — 값 범위가 좁으면 5%, 넓으면 10% */
const contourStep = (vs: number[]) => (Math.max(...vs) - Math.min(...vs) >= 20 ? 10 : 5);

export function SiteMap({ items, sim, setSim, selected, onSelect, editing, display = "circle" }: {
  items: MapItem[];
  display?: MapDisplay;
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
  const posOf = (s: SiteDef) => sim.positions[s.id] ?? { x: s.x, y: s.y };

  // 등고선: 측정값이 있는 지점이 2곳 이상일 때만(지점별 대표 판정처럼 범주형 색은 원으로)
  const contour = useMemo(() => {
    if (display !== "contour") return null;
    const pts = items.filter((i) => i.n > 0 && i.pct != null && !i.color).map((i) => ({ ...(sim.positions[i.site.id] ?? { x: i.site.x, y: i.site.y }), v: i.pct! }));
    if (pts.length < 2) return null;
    const nx = 90, ny = Math.max(2, Math.round((nx * H) / W));
    const g = sibsonGrid(pts, nx, ny);
    const hull = convexHull(pts);
    const step = contourStep(pts.map((p) => p.v));
    const lo = Math.floor(Math.min(...pts.map((p) => p.v)) / step) * step;
    const hi = Math.max(lo + step, Math.ceil(Math.max(...pts.map((p) => p.v)) / step) * step);
    const bands: Array<{ from: number; to: number; color: string }> = [];
    // 띠 색은 이 지도의 값 범위 안에서 옅은 색 → 짙은 색으로 고르게 나눈다(띠끼리 잘 구분되게)
    const nb = Math.round((hi - lo) / step);
    for (let i = 0; i < nb; i++) bands.push({ from: lo + i * step, to: lo + (i + 1) * step, color: seqColorSmooth(nb === 1 ? 0.5 : 0.08 + (0.84 * i) / (nb - 1)) });
    const bandOf = (v: number) => bands[Math.max(0, Math.min(bands.length - 1, Math.floor((v - lo) / step)))];
    // 측정 범위(점선) 안은 진하게, 바깥은 범위에서 멀어질수록 옅게 — MARGIN(가로 폭 비율)을 넘으면 그리지 않는다
    const MARGIN = 0.07, ay = H / W;
    const alphaAt = (u: number, v: number) => { const d = hullDistance(hull, u, v, ay); return d === 0 ? 1 : d < MARGIN ? 0.55 * (1 - d / MARGIN) : 0; };
    // 띠 색 그림(격자를 쌍선형으로 늘려 경계를 매끈하게)
    let url: string | null = null;
    const cw = 500, ch = Math.round((cw * H) / W);
    const cv = typeof document !== "undefined" ? document.createElement("canvas") : null;
    const ctx = cv?.getContext("2d");
    if (cv && ctx) {
      cv.width = cw; cv.height = ch;
      const img = ctx.createImageData(cw, ch);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const u = (x + 0.5) / cw, v = (y + 0.5) / ch;
        const a = alphaAt(u, v);
        const val = a > 0 ? sampleGrid(g, u, v) : NaN;
        if (!Number.isFinite(val)) continue;
        const c = bandOf(val).color;
        const o = (y * cw + x) * 4;
        img.data[o] = parseInt(c.slice(1, 3), 16); img.data[o + 1] = parseInt(c.slice(3, 5), 16); img.data[o + 2] = parseInt(c.slice(5, 7), 16);
        img.data[o + 3] = Math.round(235 * a);
      }
      ctx.putImageData(img, 0, 0);
      url = cv.toDataURL("image/png");
    }
    return { url, hull, bands, levels: bands.slice(1).map((b) => ({ l: b.from, segs: isolines(g, b.from).filter(([x1, y1, x2, y2]) => alphaAt((x1 + x2) / 2, (y1 + y2) / 2) > 0.25) })), mean: hullMean(g, hull) };
  }, [display, items, sim.positions, W, H]);

  const toLocal = (e: RPointerEvent) => {
    const el = svg.current!;
    const pt = el.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(el.getScreenCTM()!.inverse());
    return { x: Math.min(1, Math.max(0, p.x / W)), y: Math.min(1, Math.max(0, p.y / H)) };
  };

  return (
    <>
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
      {contour && (
        <g pointerEvents="none">
          {contour.url && <image href={contour.url} x={0} y={0} width={W} height={H} preserveAspectRatio="none" style={{ mixBlendMode: "multiply" }} />}
          {contour.levels.map(({ l, segs }) => (
            <path key={l} d={segs.map(([x1, y1, x2, y2]) => `M${(x1 * W).toFixed(1)} ${(y1 * H).toFixed(1)}L${(x2 * W).toFixed(1)} ${(y2 * H).toFixed(1)}`).join("")}
              fill="none" stroke="#73290f" strokeWidth={1.2} opacity={0.55} />
          ))}
          <polygon points={contour.hull.map((p) => `${p.x * W},${p.y * H}`).join(" ")} fill="none" stroke="#282828" strokeWidth={1.4} strokeDasharray="6 4" opacity={0.7} />
        </g>
      )}
      {items.map(({ site: s, k, n, pct, expected, caption, color }) => {
        const pos = posOf(s);
        const cx = pos.x * W, cy = pos.y * H;
        const rad = contour ? 9 : 15 + 13 * Math.sqrt(n / maxN);
        const empty = n === 0;
        const dark = !empty && (color ? true : (pct ?? 0) >= 45);
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
            <circle cx={cx} cy={cy} r={rad} fill={contour || empty ? "#fff" : color ?? seqColor((pct ?? 0) / 100)} stroke={expected ? "#282828" : "#73290f"}
              strokeWidth={expected ? 3 : 1.5} strokeDasharray={empty ? "4 3" : undefined} />
            {contour ? (
              <text x={cx} y={cy + rad + 20} textAnchor="middle" fontSize={17} fontWeight={700} fill="#282828" stroke="#fff" strokeWidth={4} paintOrder="stroke" className="tnum">
                {empty ? "없음" : `${Math.round(pct ?? 0)}%`}
              </text>
            ) : (
              <text x={cx} y={cy + 6} textAnchor="middle" fontSize={empty ? 12 : 17} fontWeight={700} fill={dark ? "#fff" : "#282828"} className="tnum">
                {empty ? "없음" : `${Math.round(pct ?? 0)}%`}
              </text>
            )}
            <g transform={`translate(${cx - tagW / 2},${cy - rad - 26})`}>
              <rect width={tagW} height={21} rx={2} fill={isSel ? "#282828" : "#fff"} stroke="#282828" strokeWidth={1.2} />
              <text x={tagW / 2} y={15} textAnchor="middle" fontSize={13.5} fontWeight={700} fill={isSel ? "#fff" : "#282828"}>{tag}</text>
            </g>
            <text x={cx} y={cy + rad + (contour ? 36 : 15)} textAnchor="middle" fontSize={12.5} fontWeight={600} fill="#282828" stroke="#fff" strokeWidth={3} paintOrder="stroke" className="tnum">
              {k}/{n}
            </text>
            {caption && (
              <text x={cx} y={cy + rad + (contour ? 52 : 31)} textAnchor="middle" fontSize={13} fontWeight={700} fill={color ?? "#282828"} stroke="#fff" strokeWidth={3.5} paintOrder="stroke">{caption}</text>
            )}
          </g>
        );
      })}
      {editing && (
        <text x={W - 12} y={H - 12} textAnchor="end" fontSize={14} fill="#b5381a" fontWeight={700} stroke="#fff" strokeWidth={3} paintOrder="stroke">마커를 끌어 위치를 옮기세요</text>
      )}
    </svg>
    {contour && (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[12.5px] text-ink-2">
        <span className="inline-flex items-end">
          {contour.bands.map((b) => (
            <span key={b.from} className="inline-flex flex-col items-center">
              <span className="w-12 h-3" style={{ background: b.color }} />
              <span className="tnum text-[11.5px]">{b.from}~{b.to}%</span>
            </span>
          ))}
        </span>
        {contour.mean != null && <span>점선 안 <b>면적 가중 평균 {contour.mean.toFixed(1)}%</b></span>}
        <span className="text-ink-3">점선 = 측정 지점이 둘러싸는 범위. 점선 바깥의 옅은 테두리는 측정 범위 밖으로 늘인 값이라 참고만 하세요.</span>
      </div>
    )}
    </>
  );
}
