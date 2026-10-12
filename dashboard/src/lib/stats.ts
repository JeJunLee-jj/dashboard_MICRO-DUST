/* 기술통계와 작은 표본에 맞는 검정. 외부 통계 라이브러리 없이 구현하고 테스트로 검증한다. */

export interface Describe {
  n: number;
  mean: number | null;
  median: number | null;
  sd: number | null;      // 표본표준편차(n−1)
  min: number | null;
  max: number | null;
  q1: number | null;
  q3: number | null;
  cv: number | null;      // 변동계수 = sd / mean
}

/** 분위수 — 선형보간(R type 7, 엑셀 QUARTILE.INC와 같음) */
export function quantile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h), hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

export function describe(values: number[]): Describe {
  const v = values.filter((x) => Number.isFinite(x));
  const n = v.length;
  if (!n) return { n: 0, mean: null, median: null, sd: null, min: null, max: null, q1: null, q3: null, cv: null };
  const s = [...v].sort((a, b) => a - b);
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null;
  return {
    n, mean, median: quantile(s, 0.5), sd,
    min: s[0], max: s[n - 1], q1: quantile(s, 0.25), q3: quantile(s, 0.75),
    cv: sd != null && mean !== 0 ? sd / mean : null,
  };
}

/** 비율의 Wilson 95% 신뢰구간. n = 0이면 null */
export function wilson(k: number, n: number, z = 1.959963984540054): { lo: number; hi: number } | null {
  if (n <= 0) return null;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

function logFactorial(n: number): number {
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}

/**
 * Fisher 정확검정(2×2, 양측).
 *            검출   미검출
 *   그룹A     a      b
 *   그룹B     c      d
 * 관측된 표보다 확률이 같거나 작은 모든 표의 확률 합.
 */
export function fisherExact(a: number, b: number, c: number, d: number): number {
  const r1 = a + b, r2 = c + d, c1 = a + c, n = r1 + r2;
  if (n === 0) return 1;
  const lf = new Float64Array(n + 1);
  for (let i = 2; i <= n; i++) lf[i] = lf[i - 1] + Math.log(i);
  const logP = (x: number) =>
    lf[r1] + lf[r2] + lf[c1] + lf[n - c1] - lf[n] - lf[x] - lf[r1 - x] - lf[c1 - x] - lf[r2 - c1 + x];
  const lo = Math.max(0, c1 - r2), hi = Math.min(r1, c1);
  const pObs = logP(a);
  let p = 0;
  for (let x = lo; x <= hi; x++) {
    const lp = logP(x);
    if (lp <= pObs + 1e-7) p += Math.exp(lp);
  }
  return Math.min(1, p);
}

/** 오즈비(Haldane 보정: 칸에 0이 있으면 0.5를 더함) */
export function oddsRatio(a: number, b: number, c: number, d: number): number {
  if (a === 0 || b === 0 || c === 0 || d === 0) return ((a + 0.5) * (d + 0.5)) / ((b + 0.5) * (c + 0.5));
  return (a * d) / (b * c);
}

/** Holm–Bonferroni 보정 p값 */
export function holm(pvalues: number[]): number[] {
  const m = pvalues.length;
  const idx = pvalues.map((p, i) => [p, i] as const).sort((x, y) => x[0] - y[0]);
  const adj = new Array<number>(m);
  let running = 0;
  idx.forEach(([p, i], rank) => {
    const v = Math.min(1, (m - rank) * p);
    running = Math.max(running, v);
    adj[i] = running;
  });
  return adj;
}

export function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n < 3 || y.length !== n) return null;
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** 평균 순위(동순위 처리) */
export function ranks(v: number[]): number[] {
  const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(v.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

export function spearman(x: number[], y: number[]): number | null {
  if (x.length < 3) return null;
  return pearson(ranks(x), ranks(y));
}

/** 백분율 문자열 */
export function pct(k: number, n: number, digits = 1): string {
  if (!n) return "—";
  return `${((k / n) * 100).toFixed(digits)}%`;
}

export { logFactorial };
