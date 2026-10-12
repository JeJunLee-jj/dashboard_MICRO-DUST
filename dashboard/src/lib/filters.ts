/* 대시보드 필터와 KPI. 모든 화면이 같은 applyFilters 결과를 쓰므로 KPI와 그래프가 항상 일치한다. */
import type { AnalysisSettings, Filters, Particle } from "./types";
import { isDetected } from "./join";
import { particleTargetResult } from "./hazard";
import { elementsInData } from "./composition";
import { MORPHOLOGY_CLASSES } from "./morphology";

export function applyFilters(particles: Particle[], f: Filters, settings: AnalysisSettings): Particle[] {
  return particles.filter((p) => {
    if (f.samples.length && !f.samples.includes(p.sample_id)) return false;
    if (f.locations.length && !f.locations.includes(p.location ?? "(위치 미기재)")) return false;
    if (f.dateFrom && (!p.date || p.date < f.dateFrom)) return false;
    if (f.dateTo && (!p.date || p.date > f.dateTo)) return false;
    if (f.morphologies.length && !f.morphologies.includes(p.morphology ?? "none")) return false;
    if (f.element && !(p.edsValid && isDetected(p, f.element, settings))) return false;
    if (f.targetStatus !== "all" && particleTargetResult(p, settings).status !== f.targetStatus) return false;
    return true;
  });
}

export function filterOptions(particles: Particle[]) {
  const uniq = (xs: Array<string | null>) => [...new Set(xs.map((x) => x ?? ""))].filter(Boolean).sort();
  const dates = uniq(particles.map((p) => p.date));
  return {
    samples: uniq(particles.map((p) => p.sample_id)),
    locations: [...uniq(particles.map((p) => p.location)), ...(particles.some((p) => !p.location) ? ["(위치 미기재)"] : [])],
    dateMin: dates[0] ?? null,
    dateMax: dates[dates.length - 1] ?? null,
    morphologies: [...MORPHOLOGY_CLASSES, "none"].filter((m) => particles.some((p) => (p.morphology ?? "none") === m)),
    elements: elementsInData(particles),
  };
}

export function activeFilterCount(f: Filters): number {
  return (
    (f.samples.length ? 1 : 0) + (f.locations.length ? 1 : 0) + (f.dateFrom ? 1 : 0) + (f.dateTo ? 1 : 0) +
    (f.morphologies.length ? 1 : 0) + (f.element ? 1 : 0) + (f.targetStatus !== "all" ? 1 : 0)
  );
}

export interface Kpis {
  total: number;
  validEds: number;
  elementKinds: number;         // 유효 입자에서 '검출' 상태인 원소 종류 수
  targetPositive: number;
  targetDeterminable: number;
  targetUndetermined: number;
  targetRatio: number | null;
  morphClassified: number;      // 6개 확정 형상 중 하나로 분류된 입자
  morphUndetermined: number;    // '형상 판별 불가'로 판정된 입자
  morphRatio: number | null;    // morphClassified / total
}

export function computeKpis(particles: Particle[], settings: AnalysisSettings): Kpis {
  const valid = particles.filter((p) => p.edsValid);
  const kinds = new Set<string>();
  for (const p of valid) for (const e of Object.values(p.elements)) if (isDetected(p, e.symbol, settings)) kinds.add(e.symbol);
  let pos = 0, neg = 0, und = 0;
  for (const p of valid) {
    const s = particleTargetResult(p, settings).status;
    if (s === "positive") pos++;
    else if (s === "negative") neg++;
    else if (s === "undetermined") und++;
  }
  const classified = particles.filter((p) => p.morphology && p.morphology !== "undetermined").length;
  return {
    total: particles.length,
    validEds: valid.length,
    elementKinds: kinds.size,
    targetPositive: pos,
    targetDeterminable: pos + neg,
    targetUndetermined: und,
    targetRatio: pos + neg ? pos / (pos + neg) : null,
    morphClassified: classified,
    morphUndetermined: particles.filter((p) => p.morphology === "undetermined").length,
    morphRatio: particles.length ? classified / particles.length : null,
  };
}
