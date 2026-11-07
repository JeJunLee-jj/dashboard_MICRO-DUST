/* 평면도 등고선용 공간 보간 — 자연이웃(Sibson) 보간, 즉 '면적 가중 평균'.
   어떤 위치의 값 = 그 위치를 새 지점으로 넣었을 때 각 측정 지점의 보로노이 영역에서 빼앗아 오는 면적의 비율로 가중한 평균.
   격자에서 계산하는 방식(Park et al., 2006, discrete Sibson interpolation)을 쓴다:
   격자 칸 q마다 가장 가까운 측정 지점 s와 거리 d를 구하고, q에서 거리 d 안에 있는 모든 칸 p에 s의 값을 한 표씩 준다.
   p의 값 = 받은 표의 평균. 측정 지점 위치에서는 그 지점 값과 같고, 지점 사이에서는 면적 비율대로 섞인다. */

export interface InterpPoint {
  x: number; // 0~1(평면도 가로 비율)
  y: number; // 0~1(평면도 세로 비율)
  v: number;
}

export interface Grid {
  nx: number;
  ny: number;
  values: Float64Array; // 행 우선(y*nx + x), 칸 중심 기준
}

export function sibsonGrid(points: InterpPoint[], nx: number, ny: number): Grid {
  const values = new Float64Array(nx * ny);
  if (!points.length) return { nx, ny, values: values.fill(NaN) };
  const sum = new Float64Array(nx * ny);
  const cnt = new Float64Array(nx * ny);
  // 측정 지점을 격자 좌표(칸 단위, 가로·세로 같은 축척)로
  const ps = points.map((p) => ({ gx: p.x * nx - 0.5, gy: p.y * ny - 0.5, v: p.v }));
  for (let qy = 0; qy < ny; qy++) {
    for (let qx = 0; qx < nx; qx++) {
      let best = 0, bd = Infinity;
      for (let i = 0; i < ps.length; i++) {
        const dx = ps[i].gx - qx, dy = ps[i].gy - qy;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      const v = ps[best].v;
      const r = Math.sqrt(bd);
      const ri = Math.floor(r);
      const y0 = Math.max(0, qy - ri), y1 = Math.min(ny - 1, qy + ri);
      for (let py = y0; py <= y1; py++) {
        const dy = py - qy;
        const w = Math.floor(Math.sqrt(Math.max(0, bd - dy * dy)));
        const x0 = Math.max(0, qx - w), x1 = Math.min(nx - 1, qx + w);
        const row = py * nx;
        for (let px = x0; px <= x1; px++) { sum[row + px] += v; cnt[row + px] += 1; }
      }
    }
  }
  for (let i = 0; i < values.length; i++) values[i] = cnt[i] ? sum[i] / cnt[i] : NaN;
  return { nx, ny, values };
}

/** 격자 값을 0~1 좌표에서 쌍선형으로 읽는다 */
export function sampleGrid(g: Grid, x: number, y: number): number {
  const fx = Math.min(g.nx - 1, Math.max(0, x * g.nx - 0.5));
  const fy = Math.min(g.ny - 1, Math.max(0, y * g.ny - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(g.nx - 1, x0 + 1), y1 = Math.min(g.ny - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const v = (xx: number, yy: number) => g.values[yy * g.nx + xx];
  return (v(x0, y0) * (1 - tx) + v(x1, y0) * tx) * (1 - ty) + (v(x0, y1) * (1 - tx) + v(x1, y1) * tx) * ty;
}

/** 볼록 껍질(측정 지점이 둘러싸는 범위) — 반시계 방향 */
export function convexHull(pts: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: typeof p = [], upper: typeof p = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function insideHull(hull: Array<{ x: number; y: number }>, x: number, y: number): boolean {
  if (hull.length < 3) return false;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false;
  }
  return true;
}

/** 측정 범위(볼록 껍질) 안의 면적 가중 평균 */
export function hullMean(g: Grid, hull: Array<{ x: number; y: number }>): number | null {
  let s = 0, n = 0;
  for (let y = 0; y < g.ny; y++) for (let x = 0; x < g.nx; x++) {
    if (!insideHull(hull, (x + 0.5) / g.nx, (y + 0.5) / g.ny)) continue;
    const v = g.values[y * g.nx + x];
    if (Number.isFinite(v)) { s += v; n++; }
  }
  return n ? s / n : null;
}

/** 등고선(마칭 스퀘어) — 수준값마다 선분 목록(0~1 좌표) */
export function isolines(g: Grid, level: number): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  const at = (x: number, y: number) => g.values[y * g.nx + x];
  const X = (x: number) => (x + 0.5) / g.nx, Y = (y: number) => (y + 0.5) / g.ny;
  for (let y = 0; y < g.ny - 1; y++) for (let x = 0; x < g.nx - 1; x++) {
    const a = at(x, y), b = at(x + 1, y), c = at(x + 1, y + 1), d = at(x, y + 1);
    if (![a, b, c, d].every(Number.isFinite)) continue;
    const t = (u: number, v: number) => (level - u) / (v - u);
    const pts: Array<[number, number]> = [];
    if ((a < level) !== (b < level)) pts.push([X(x + t(a, b)), Y(y)]);
    if ((b < level) !== (c < level)) pts.push([X(x + 1), Y(y + t(b, c))]);
    if ((d < level) !== (c < level)) pts.push([X(x + t(d, c)), Y(y + 1)]);
    if ((a < level) !== (d < level)) pts.push([X(x), Y(y + t(a, d))]);
    if (pts.length === 2) out.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
    else if (pts.length === 4) { out.push([...pts[0], ...pts[1]]); out.push([...pts[2], ...pts[3]]); }
  }
  return out;
}

/** 볼록 껍질 바깥 점에서 껍질까지의 거리(안쪽이면 0). ay = 세로 축척(평면도 세로/가로 비) */
export function hullDistance(hull: Array<{ x: number; y: number }>, x: number, y: number, ay = 1): number {
  if (insideHull(hull, x, y)) return 0;
  let best = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const ax = a.x, ayy = a.y * ay, bx = b.x, by = b.y * ay, px = x, py = y * ay;
    const dx = bx - ax, dy = by - ayy;
    const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ayy) * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ayy + t * dy)));
  }
  return best;
}
