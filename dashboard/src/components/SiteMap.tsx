/* 지하상가 평면 지도 — 선택한 판정 규칙에 해당하는 입자 비율을 지점별 원(마커)으로 표시.
   기본 배경은 '강남역 지하도상가 배치도'이며, 다른 평면도를 올리면 마커를 끌어 위치를 맞출 수 있다. */
import { useId, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { SimSettings } from "../lib/sources";
import type { SiteDef } from "../lib/sites";
import { seqColor, seqColorSmooth } from "../lib/palette";
import { chainSegments, convexHull, hullDistance, hullMean, isolines, sampleGrid, sibsonGrid, smoothGrid } from "../lib/interp";
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

/** 등고선 간격(%) — 가는 선(주곡선)이 15~20개쯤 되게 고르고, 숫자를 붙이는 굵은 선(계곡선)은 5개마다 */
const contourSteps = (vs: number[]) => {
  const range = Math.max(...vs) - Math.min(...vs);
  const minor = [1, 2, 5, 10].find((m) => range / m <= 20) ?? 10;
  return { minor, major: minor * 5 };
};

/** 점 목록을 매끈한 곡선 경로로(Catmull-Rom → 베지어) */
function smoothPath(pts: Array<[number, number]>): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

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

  // 등고선(지형도처럼): 측정값이 있는 지점이 2곳 이상일 때만(지점별 대표 판정처럼 범주형 색은 원으로)
  const maskId = useId();
  const contour = useMemo(() => {
    if (display !== "contour") return null;
    const pts = items.filter((i) => i.n > 0 && i.pct != null && !i.color).map((i) => ({ ...(sim.positions[i.site.id] ?? { x: i.site.x, y: i.site.y }), v: i.pct! }));
    if (pts.length < 2) return null;
    const nx = 120, ny = Math.max(2, Math.round((nx * H) / W));
    const g = smoothGrid(smoothGrid(sibsonGrid(pts, nx, ny)));
    const hull = convexHull(pts);
    const vs = pts.map((p) => p.v);
    const vmin = Math.min(...vs), vmax = Math.max(...vs);
    const { minor, major } = contourSteps(vs);
    // 측정 범위(점선) 안은 그대로, 바깥은 범위에서 멀어질수록 옅게 — MARGIN(가로 폭 비율)을 넘으면 그리지 않는다
    const MARGIN = 0.12, ay = H / W;
    const alphaAt = (u: number, v: number) => { const d = hullDistance(hull, u, v, ay); return d === 0 ? 1 : d < MARGIN ? 1 - d / MARGIN : 0; };
    // 옅은 높이 색(높을수록 짙은 주황)과 가림막(mask) 그림
    let tint: string | null = null, mask: string | null = null;
    const cw = 400, ch = Math.round((cw * H) / W);
    const mk = () => { const c = typeof document !== "undefined" ? document.createElement("canvas") : null; const x = c?.getContext("2d"); if (c && x) { c.width = cw; c.height = ch; } return [c, x] as const; };
    const [tc, tx] = mk(), [mc, mx] = mk();
    if (tc && tx && mc && mx) {
      const ti = tx.createImageData(cw, ch), mi = mx.createImageData(cw, ch);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const u = (x + 0.5) / cw, v = (y + 0.5) / ch, o = (y * cw + x) * 4;
        const a = alphaAt(u, v);
        mi.data[o] = mi.data[o + 1] = mi.data[o + 2] = Math.round(255 * a); mi.data[o + 3] = 255;
        if (a <= 0) continue;
        const val = sampleGrid(g, u, v);
        if (!Number.isFinite(val)) continue;
        const c = seqColorSmooth(vmax > vmin ? (val - vmin) / (vmax - vmin) : 0.5);
        ti.data[o] = parseInt(c.slice(1, 3), 16); ti.data[o + 1] = parseInt(c.slice(3, 5), 16); ti.data[o + 2] = parseInt(c.slice(5, 7), 16); ti.data[o + 3] = 255;
      }
      tx.putImageData(ti, 0, 0); mx.putImageData(mi, 0, 0);
      tint = tc.toDataURL("image/png"); mask = mc.toDataURL("image/png");
    }
    // 등고선: 선분을 이어 매끈한 곡선으로, 굵은 선에는 값 숫자를 선 방향으로 붙인다
    const sites = pts.map((p) => [p.x * W, p.y * H]);
    const lines: Array<{ l: number; major: boolean; d: string }> = [];
    const labels: Array<{ l: number; x: number; y: number; angle: number }> = [];
    for (let l = Math.ceil(vmin / minor) * minor; l <= vmax; l += minor) {
      if (l <= vmin || l >= vmax) continue;
      const isMajor = l % major === 0;
      for (const line of chainSegments(isolines(g, l))) {
        const px = line.map(([x, y]) => [x * W, y * H] as [number, number]);
        const visible = px.filter(([x, y]) => alphaAt(x / W, y / H) > 0.05);
        if (visible.length < 2) continue;
        lines.push({ l, major: isMajor, d: smoothPath(px) });
        if (!isMajor || px.length < 8) continue;
        // 선 가운데쯤에서, 지점 표시와 겹치지 않고 측정 범위 안인 곳에 숫자
        const order = px.map((_, i) => i).sort((a, b) => Math.abs(a - px.length / 2) - Math.abs(b - px.length / 2));
        const at = order.find((i) => i > 1 && i < px.length - 2 && alphaAt(px[i][0] / W, px[i][1] / H) > 0.6 && sites.every(([sx, sy]) => Math.hypot(sx - px[i][0], sy - px[i][1]) > 70));
        if (at == null) continue;
        let angle = (Math.atan2(px[at + 2][1] - px[at - 2][1], px[at + 2][0] - px[at - 2][0]) * 180) / Math.PI;
        if (angle > 90) angle -= 180; else if (angle < -90) angle += 180;
        labels.push({ l, x: px[at][0], y: px[at][1], angle });
      }
    }
    return { tint, mask, hull, lines, labels, minor, major, mean: hullMean(g, hull) };
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
          {contour.mask && (
            <defs>
              <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
                <image href={contour.mask} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
              </mask>
            </defs>
          )}
          <g mask={contour.mask ? `url(#${maskId})` : undefined}>
            {contour.tint && <image href={contour.tint} x={0} y={0} width={W} height={H} preserveAspectRatio="none" opacity={0.38} />}
            {contour.lines.map((ln, i) => (
              <path key={i} d={ln.d} fill="none" stroke="#7a3b12" strokeWidth={ln.major ? 2.2 : 1} opacity={ln.major ? 0.95 : 0.7} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {contour.labels.map((lb, i) => (
              <text key={i} x={lb.x} y={lb.y} transform={`rotate(${lb.angle.toFixed(1)} ${lb.x.toFixed(1)} ${lb.y.toFixed(1)})`} dy={4.5}
                textAnchor="middle" fontSize={13} fontWeight={700} fill="#7a3b12" stroke="#fff" strokeWidth={4} paintOrder="stroke" className="tnum">{lb.l}%</text>
            ))}
          </g>
          <polygon points={contour.hull.map((p) => `${p.x * W},${p.y * H}`).join(" ")} fill="none" stroke="#282828" strokeWidth={1} strokeDasharray="5 5" opacity={0.45} />
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
        <span className="inline-flex items-center gap-1.5">
          <svg width="34" height="10" aria-hidden><line x1="1" y1="5" x2="33" y2="5" stroke="#7a3b12" strokeWidth="1" opacity="0.7" /></svg>{contour.minor}% 간격
          <svg width="34" height="10" aria-hidden className="ml-1.5"><line x1="1" y1="5" x2="33" y2="5" stroke="#7a3b12" strokeWidth="2.2" /></svg>{contour.major}% 간격(숫자 표시)
        </span>
        <span className="inline-flex items-center gap-1">낮음<span className="w-16 h-2.5 inline-block opacity-60" style={{ background: `linear-gradient(90deg, ${seqColorSmooth(0)}, ${seqColorSmooth(0.5)}, ${seqColorSmooth(1)})` }} />높음</span>
        {contour.mean != null && <span>점선 안 <b>면적 가중 평균 {contour.mean.toFixed(1)}%</b></span>}
        <span className="text-ink-3">점선 = 측정 지점이 둘러싸는 범위. 점선 바깥으로 흐려지는 부분은 측정 범위 밖으로 늘인 값이라 참고만 하세요.</span>
      </div>
    )}
    </>
  );
}
