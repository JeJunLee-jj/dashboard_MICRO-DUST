/* EDS 원소 조성 통계 — wt%와 at%는 항상 따로 계산한다. */
import type { AnalysisSettings, Basis, Normalization, Particle } from "./types";
import { describe, spearman, pearson, wilson, type Describe } from "./stats";
import { elementStatus, isDetectedStatus, quantValue } from "./join";
import { atomicOrder } from "./elements";

/** 데이터에 등장한 모든 원소(원자번호 순) */
export function elementsInData(particles: Particle[]): string[] {
  const s = new Set<string>();
  for (const p of particles) for (const k of Object.keys(p.elements)) s.add(k);
  return [...s].sort((a, b) => atomicOrder(a) - atomicOrder(b));
}

export interface ElementSummary {
  symbol: string;
  /** 해당 원소를 판정할 수 있는 유효 입자 수(분모) */
  evaluable: number;
  detected: number;        // 설정상 '검출'로 세는 입자 수(LOQ 미만 포함 여부는 설정)
  detectedQuant: number;   // 정량값까지 있는 검출
  belowLoq: number;
  belowLod: number;
  notDetected: number;
  missing: number;
  frequency: number | null;           // detected / evaluable
  ci: { lo: number; hi: number } | null;
  wt: Describe;                        // 검출+정량값 있는 입자만
  at: Describe;
}

export function elementSummaries(particles: Particle[], settings: AnalysisSettings, symbols?: string[]): ElementSummary[] {
  const valid = particles.filter((p) => p.edsValid);
  const syms = symbols ?? elementsInData(particles);
  return syms.map((symbol) => {
    let detected = 0, belowLoq = 0, belowLod = 0, notDetected = 0, missing = 0, detectedQuant = 0;
    const wt: number[] = [], at: number[] = [];
    for (const p of valid) {
      const { status } = elementStatus(p, symbol, settings);
      if (status === "missing") { missing++; continue; }
      if (status === "below_loq") belowLoq++;
      if (status === "below_lod") belowLod++;
      if (status === "not_detected") notDetected++;
      if (isDetectedStatus(status, settings)) detected++;
      const w = quantValue(p, symbol, "wt"), a = quantValue(p, symbol, "at");
      if (w != null) wt.push(w);
      if (a != null) at.push(a);
      if (status === "detected" && (w != null || a != null)) detectedQuant++;
    }
    const evaluable = valid.length - missing;
    return {
      symbol, evaluable, detected, detectedQuant, belowLoq, belowLod, notDetected, missing,
      frequency: evaluable ? detected / evaluable : null,
      ci: wilson(detected, evaluable),
      wt: describe(wt), at: describe(at),
    };
  });
}

/** 입자별 주요 원소 TOP N (선택한 기준의 정량값 순) */
export function topElements(p: Particle, basis: Basis, n = 5): Array<{ symbol: string; value: number }> {
  return Object.values(p.elements)
    .filter((e) => e.status === "detected" && (basis === "wt" ? e.wt : e.at) != null)
    .map((e) => ({ symbol: e.symbol, value: (basis === "wt" ? e.wt : e.at)! }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

/**
 * 분류 규칙용 재정규화 조성(wt% 기준).
 * - total: 검출된 원소의 wt%를 합계 100으로 재정규화
 * - metal: C·O를 뺀 나머지를 합계 100으로 재정규화(기존 프로토타입의 '금속기준')
 * wt% 값이 하나도 없으면 null(분류 불가) — at%를 대신 쓰지 않는다.
 */
export function normalizedWt(p: Particle, normalization: Normalization): Record<string, number> | null {
  const vals: Record<string, number> = {};
  let total = 0;
  for (const e of Object.values(p.elements)) {
    if (e.status !== "detected" || e.wt == null) continue;
    if (normalization === "metal" && (e.symbol === "C" || e.symbol === "O")) continue;
    vals[e.symbol] = e.wt;
    total += e.wt;
  }
  if (total <= 0) return null;
  for (const k of Object.keys(vals)) vals[k] = (vals[k] / total) * 100;
  return vals;
}

export interface CooccurrenceCell {
  a: string;
  b: string;
  both: number;           // 두 원소가 모두 검출된 입자 수
  evaluable: number;      // 두 원소 모두 판정 가능한 입자 수
  jaccard: number | null; // both / (A 또는 B 검출)
}

export function cooccurrence(particles: Particle[], settings: AnalysisSettings, symbols: string[]): CooccurrenceCell[] {
  const valid = particles.filter((p) => p.edsValid);
  const cells: CooccurrenceCell[] = [];
  for (const a of symbols) {
    for (const b of symbols) {
      let both = 0, either = 0, evaluable = 0;
      for (const p of valid) {
        const sa = elementStatus(p, a, settings).status, sb = elementStatus(p, b, settings).status;
        if (sa === "missing" || sb === "missing") continue;
        evaluable++;
        const da = isDetectedStatus(sa, settings), db = isDetectedStatus(sb, settings);
        if (da && db) both++;
        if (da || db) either++;
      }
      cells.push({ a, b, both, evaluable, jaccard: either ? both / either : null });
    }
  }
  return cells;
}

export interface CorrelationCell {
  a: string;
  b: string;
  r: number | null;
  n: number;
}

/**
 * 원소 간 상관(입자 간). 두 원소 모두 판정 가능한 입자만 사용.
 * 미검출·검출한계 미만은 0으로 두고, LOQ 미만(값 불확실)은 제외한다.
 * n < minN이면 계산하지 않는다(null).
 * 주의: 조성 자료는 합이 100인 폐쇄 자료라 음의 상관이 인위적으로 생길 수 있다.
 */
export function correlationMatrix(
  particles: Particle[], settings: AnalysisSettings, symbols: string[], basis: Basis,
  method: "spearman" | "pearson" = "spearman", minN = 5,
): CorrelationCell[] {
  const valid = particles.filter((p) => p.edsValid);
  const valueOf = (p: Particle, s: string): number | null | undefined => {
    const { status } = elementStatus(p, s, settings);
    if (status === "missing" || status === "below_loq") return undefined;
    if (status === "not_detected" || status === "below_lod") return 0;
    return quantValue(p, s, basis) ?? undefined;
  };
  const out: CorrelationCell[] = [];
  for (const a of symbols) {
    for (const b of symbols) {
      const xs: number[] = [], ys: number[] = [];
      for (const p of valid) {
        const x = valueOf(p, a), y = valueOf(p, b);
        if (x == null || y == null) continue;
        xs.push(x);
        ys.push(y);
      }
      const n = xs.length;
      const r = a === b ? (n >= minN ? 1 : null) : n >= minN ? (method === "spearman" ? spearman(xs, ys) : pearson(xs, ys)) : null;
      out.push({ a, b, r, n });
    }
  }
  return out;
}

/** 도넛·누적막대용: 입자 집합의 원소별 평균 조성(검출+정량값 있는 입자의 평균이 아니라, 입자별 조성의 평균) */
export function meanComposition(particles: Particle[], basis: Basis): { values: Record<string, number>; n: number } {
  const valid = particles.filter((p) => p.edsValid && (basis === "wt" ? p.wtSum != null : p.atSum != null));
  const acc: Record<string, number> = {};
  for (const p of valid) {
    for (const e of Object.values(p.elements)) {
      const v = e.status === "detected" ? (basis === "wt" ? e.wt : e.at) : null;
      if (v == null) continue;
      acc[e.symbol] = (acc[e.symbol] ?? 0) + v;
    }
  }
  const n = valid.length;
  for (const k of Object.keys(acc)) acc[k] /= n || 1;
  return { values: acc, n };
}
