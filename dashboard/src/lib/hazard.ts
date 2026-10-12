/* 위해성 평가 대상 원소의 입자 분포.
   핵심 원칙
   - 입자 개수 비율: 한 입자에 대상 원소가 여러 개 있어도 그 입자는 한 번만 센다.
   - 분모는 "판정 가능한 유효 입자"다. 대상 원소가 하나도 검출되지 않았지만 일부 대상 원소가 결측이면
     음성으로 단정할 수 없으므로 "판정 불가"로 분모에서 뺀다.
   - 원소별 검출 빈도는 원소별 분모(그 원소를 판정할 수 있는 입자 수)를 따로 쓴다.
   - 질량 비율·대기 농도는 계산하지 않는다(massConcentrationAssessment 참고). */
import type { AnalysisSettings, HazardRule, Particle } from "./types";
import { elementStatus, isDetectedStatus } from "./join";
import { elementSummaries, type ElementSummary } from "./composition";
import { wilson } from "./stats";
import { MORPHOLOGY_CLASSES, morphologyLabel } from "./morphology";

export type TargetStatus = "positive" | "negative" | "undetermined" | "invalid";

export interface ParticleTargetResult {
  status: TargetStatus;
  detected: string[];   // 검출된 대상 원소
  missing: string[];    // 판정 불가(결측) 대상 원소
}

export function particleTargetResult(p: Particle, settings: AnalysisSettings): ParticleTargetResult {
  if (!p.edsValid) return { status: "invalid", detected: [], missing: [] };
  const detected: string[] = [], missing: string[] = [];
  for (const s of settings.targetElements) {
    const { status } = elementStatus(p, s, settings);
    if (status === "missing") missing.push(s);
    else if (isDetectedStatus(status, settings)) detected.push(s);
  }
  const status: TargetStatus = detected.length ? "positive" : missing.length ? "undetermined" : "negative";
  return { status, detected, missing };
}

export interface ProportionStat {
  numerator: number;
  denominator: number;
  ratio: number | null;
  ci: { lo: number; hi: number } | null;
}

function prop(k: number, n: number): ProportionStat {
  return { numerator: k, denominator: n, ratio: n ? k / n : null, ci: wilson(k, n) };
}

export interface HazardSummary {
  totalParticles: number;
  validEds: number;
  positive: number;
  negative: number;
  undetermined: number;
  /** 대상 원소 검출 입자 비율 = positive / (positive + negative) */
  targetRatio: ProportionStat;
  /** 대상 원소가 k개 이상 동시 검출된 입자 비율(k = 2, 3) */
  multi: Record<2 | 3, ProportionStat>;
  /** 검출된 대상 원소 개수별 입자 수(판정 가능 입자 중) */
  countDistribution: Array<{ k: number; particles: number }>;
  elementStats: Array<ElementSummary & { rule: HazardRule | null }>;
  combos: Array<{ combo: string; elements: string[]; particles: number }>;
  byMorphology: Array<{ morphology: string; label: string; particles: number; positive: number; determinable: number; perElement: Record<string, { detected: number; evaluable: number }> }>;
  byGroup: (field: "sample_id" | "location") => Array<{ group: string; particles: number; positive: number; determinable: number; ratio: ProportionStat; perElement: Record<string, { detected: number; evaluable: number }> }>;
}

export function hazardSummary(particles: Particle[], settings: AnalysisSettings, rules: HazardRule[]): HazardSummary {
  const results = new Map(particles.map((p) => [p.key, particleTargetResult(p, settings)]));
  const valid = particles.filter((p) => p.edsValid);
  let positive = 0, negative = 0, undetermined = 0;
  for (const p of valid) {
    const r = results.get(p.key)!;
    if (r.status === "positive") positive++;
    else if (r.status === "negative") negative++;
    else undetermined++;
  }

  // k개 이상 동시 검출: 검출 수 ≥ k 이면 양성, 검출 수 + 결측 수 < k 이면 음성, 나머지는 판정 불가
  const multiStat = (k: number) => {
    let yes = 0, no = 0;
    for (const p of valid) {
      const r = results.get(p.key)!;
      if (r.detected.length >= k) yes++;
      else if (r.detected.length + r.missing.length < k) no++;
    }
    return prop(yes, yes + no);
  };

  const dist = new Map<number, number>();
  for (const p of valid) {
    const r = results.get(p.key)!;
    if (r.status === "undetermined") continue;
    dist.set(r.detected.length, (dist.get(r.detected.length) ?? 0) + 1);
  }
  const maxK = Math.max(0, ...dist.keys());
  const countDistribution = Array.from({ length: maxK + 1 }, (_, k) => ({ k, particles: dist.get(k) ?? 0 }));

  const ruleMap = new Map(rules.map((r) => [r.element_symbol, r]));
  const elementStats = elementSummaries(particles, settings, settings.targetElements).map((s) => ({ ...s, rule: ruleMap.get(s.symbol) ?? null }));

  const comboCount = new Map<string, { elements: string[]; n: number }>();
  for (const p of valid) {
    const r = results.get(p.key)!;
    if (r.detected.length < 2) continue;
    const els = [...r.detected].sort((a, b) => settings.targetElements.indexOf(a) - settings.targetElements.indexOf(b));
    const k = els.join("+");
    const cur = comboCount.get(k) ?? { elements: els, n: 0 };
    cur.n++;
    comboCount.set(k, cur);
  }
  const combos = [...comboCount.entries()].map(([combo, v]) => ({ combo, elements: v.elements, particles: v.n })).sort((a, b) => b.particles - a.particles);

  const perElementCounts = (ps: Particle[]) => {
    const o: Record<string, { detected: number; evaluable: number }> = {};
    for (const s of settings.targetElements) {
      let d = 0, e = 0;
      for (const p of ps) {
        const st = elementStatus(p, s, settings).status;
        if (st === "missing") continue;
        e++;
        if (isDetectedStatus(st, settings)) d++;
      }
      o[s] = { detected: d, evaluable: e };
    }
    return o;
  };

  const morphKeys = [...MORPHOLOGY_CLASSES, "none"] as string[];
  const byMorphology = morphKeys
    .map((m) => {
      const ps = valid.filter((p) => (p.morphology ?? "none") === m);
      const pos = ps.filter((p) => results.get(p.key)!.status === "positive").length;
      const neg = ps.filter((p) => results.get(p.key)!.status === "negative").length;
      return { morphology: m, label: morphologyLabel(m), particles: ps.length, positive: pos, determinable: pos + neg, perElement: perElementCounts(ps) };
    })
    .filter((r) => r.particles > 0);

  const byGroup = (field: "sample_id" | "location") => {
    const groups = new Map<string, Particle[]>();
    for (const p of valid) {
      const g = (field === "sample_id" ? p.sample_id : p.location) ?? "(위치 미기재)";
      groups.set(g, [...(groups.get(g) ?? []), p]);
    }
    return [...groups.entries()].map(([group, ps]) => {
      const pos = ps.filter((p) => results.get(p.key)!.status === "positive").length;
      const neg = ps.filter((p) => results.get(p.key)!.status === "negative").length;
      return { group, particles: ps.length, positive: pos, determinable: pos + neg, ratio: prop(pos, pos + neg), perElement: perElementCounts(ps) };
    }).sort((a, b) => a.group.localeCompare(b.group));
  };

  return {
    totalParticles: particles.length,
    validEds: valid.length,
    positive, negative, undetermined,
    targetRatio: prop(positive, positive + negative),
    multi: { 2: multiStat(2), 3: multiStat(3) },
    countDistribution,
    elementStats,
    combos,
    byMorphology,
    byGroup,
  };
}

/**
 * 질량 비율과 대기 농도의 계산 가능 여부.
 * 이 대시보드는 입자별 질량(밀도·부피), 대표성 있는 시료 채취 설계, 질량 기반 정량 분석,
 * 채취 유량·시간 정보를 받지 않으므로 항상 "분석 불가"를 돌려준다.
 * 입자별 wt%만으로 전체 미세먼지 중 유해 성분 질량 비율을 계산하지 않는다.
 */
export interface Computability {
  metric: string;
  computable: false;
  reasons: string[];
}

export function massConcentrationAssessment(): Computability[] {
  return [
    {
      metric: "전체 미세먼지 질량 중 대상 원소의 질량 비율",
      computable: false,
      reasons: [
        "입자별 질량(밀도 × 3차원 부피) 정보가 없습니다 — SEM 투영 면적만으로 부피·질량을 정할 수 없습니다.",
        "분석 입자가 전체 시료를 대표하도록 선정되었다는 설계 정보(무작위·체계적 선정, 분석 입자 수 근거)가 없습니다.",
        "EDS 입자별 wt%는 그 입자(분석 부피) 안의 조성이며, 입자들을 단순 평균해도 질량 가중 조성이 되지 않습니다.",
      ],
    },
    {
      metric: "PM2.5 / PM10 대기 중 농도",
      computable: false,
      reasons: [
        "대기 농도는 채취 유량·시간과 필터 중량(또는 연속 측정기) 자료로만 구할 수 있으며 SEM-EDS 입자 분석에서 유도되지 않습니다.",
        "PM 측정값 파일을 업로드하면 '보고된 측정값'으로 별도 표시합니다(입자 분석 결과와 합산·환산하지 않음).",
      ],
    },
    {
      metric: "인체 노출량·건강 위해도",
      computable: false,
      reasons: [
        "원소의 화학종(산화수·화합물), 생체 이용률, 노출 농도·시간·경로 정보가 필요합니다.",
        "원소 검출만으로 독성이나 위해도를 확정할 수 없습니다.",
      ],
    },
  ];
}

export const HAZARD_DISCLAIMER =
  "본 결과는 분석된 입자의 원소 검출 및 조성 분포를 나타냅니다. 원소의 검출만으로 해당 입자의 독성이나 실제 인체 위해도를 확정할 수 없으며, 전체 대기 미세먼지에 대한 대표성은 시료 채취 및 분석 설계에 따라 달라집니다.";
