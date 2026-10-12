/* 차트용 데이터 변환. 모든 차트는 필터를 거친 같은 입자 배열에서 이 함수들로 데이터를 만든다. */
import type { AnalysisSettings, Basis, Particle } from "./types";
import { MORPHOLOGY_CLASSES, morphologyLabel } from "./morphology";
import { elementSummaries, meanComposition } from "./composition";
import { particleTargetResult } from "./hazard";

export interface MorphologyBar {
  key: string;
  label: string;
  count: number;
}

export function morphologyDistribution(particles: Particle[]): MorphologyBar[] {
  return [...MORPHOLOGY_CLASSES, "none"]
    .map((m) => ({ key: m, label: morphologyLabel(m), count: particles.filter((p) => (p.morphology ?? "none") === m).length }))
    .filter((r) => r.count > 0);
}

export interface FrequencyBar {
  symbol: string;
  frequencyPct: number;
  detected: number;
  evaluable: number;
  ciLoPct: number | null;
  ciHiPct: number | null;
}

export function frequencyBars(particles: Particle[], settings: AnalysisSettings, symbols?: string[]): FrequencyBar[] {
  return elementSummaries(particles, settings, symbols)
    .filter((s) => s.evaluable > 0)
    .map((s) => ({
      symbol: s.symbol,
      frequencyPct: (s.frequency ?? 0) * 100,
      detected: s.detected,
      evaluable: s.evaluable,
      ciLoPct: s.ci ? s.ci.lo * 100 : null,
      ciHiPct: s.ci ? s.ci.hi * 100 : null,
    }));
}

/**
 * 색상 고정 원소 목록: 전체(필터 전) 데이터의 검출 빈도 상위 원소 순.
 * 필터를 바꿔도 원소 색이 바뀌지 않도록 전체 데이터로 한 번만 정한다.
 */
export function colorOrder(allParticles: Particle[], settings: AnalysisSettings, max = 7): string[] {
  return elementSummaries(allParticles, settings)
    .filter((s) => s.detected > 0)
    .sort((a, b) => b.detected - a.detected || a.symbol.localeCompare(b.symbol))
    .slice(0, max)
    .map((s) => s.symbol);
}

export const OTHER_KEY = "기타";

/** 입자별 원소 조성 누적막대 데이터(정량값 있는 검출 원소만, 색상 원소 외는 '기타'로 합침) */
export function compositionStack(particles: Particle[], basis: Basis, order: string[]): Array<Record<string, number | string>> {
  return particles
    .filter((p) => p.edsValid && (basis === "wt" ? p.wtSum != null : p.atSum != null))
    .map((p) => {
      const row: Record<string, number | string> = { key: p.key, label: `${p.sample_id}/${p.particle_id}` };
      let other = 0;
      for (const e of Object.values(p.elements)) {
        const v = e.status === "detected" ? (basis === "wt" ? e.wt : e.at) : null;
        if (v == null) continue;
        if (order.includes(e.symbol)) row[e.symbol] = ((row[e.symbol] as number) ?? 0) + v;
        else other += v;
      }
      row[OTHER_KEY] = other;
      return row;
    });
}

/** 도넛: 입자별 조성의 산술평균(미검출 = 0) */
export function donutData(particles: Particle[], basis: Basis, order: string[]): { slices: Array<{ name: string; value: number }>; n: number } {
  const { values, n } = meanComposition(particles, basis);
  const slices: Array<{ name: string; value: number }> = [];
  let other = 0;
  for (const [k, v] of Object.entries(values)) {
    if (order.includes(k)) slices.push({ name: k, value: v });
    else other += v;
  }
  slices.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  if (other > 0) slices.push({ name: OTHER_KEY, value: other });
  return { slices, n };
}

export function targetStatusCounts(particles: Particle[], settings: AnalysisSettings) {
  const c = { positive: 0, negative: 0, undetermined: 0, invalid: 0 };
  for (const p of particles) c[particleTargetResult(p, settings).status]++;
  return c;
}
