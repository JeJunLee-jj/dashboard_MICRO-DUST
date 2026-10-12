/* 형태–성분 통합 분석: 형상 그룹과 원소 검출의 관계를 실제 데이터에서 검정한다.
   결과는 관측 사실 / 통계적 관계 / 해석 가설 / 확인되지 않은 사항으로 나누어 돌려준다. */
import type { AnalysisSettings, MorphologyClass, Particle } from "./types";
import { elementStatus, isDetectedStatus, quantValue } from "./join";
import { fisherExact, holm, oddsRatio, describe, type Describe } from "./stats";
import { morphologyLabel, MORPHOLOGY_CLASSES } from "./morphology";
import { normalizedWt } from "./composition";

export interface GroupElementTest {
  element: string;
  inDetected: number;
  inEvaluable: number;
  outDetected: number;
  outEvaluable: number;
  freqIn: number | null;
  freqOut: number | null;
  oddsRatio: number | null;
  p: number | null;
  pAdj: number | null;
  note: string | null;
}

/** 그룹(조건을 만족하는 입자) vs 비교군의 원소 검출 빈도 비교 — Fisher 정확검정, Holm 보정 */
export function compareGroups(
  group: Particle[], rest: Particle[], elements: string[], settings: AnalysisSettings, minN = 3,
): GroupElementTest[] {
  const count = (ps: Particle[], e: string) => {
    let d = 0, n = 0;
    for (const p of ps) {
      const s = elementStatus(p, e, settings).status;
      if (s === "missing") continue;
      n++;
      if (isDetectedStatus(s, settings)) d++;
    }
    return [d, n] as const;
  };
  const rows: GroupElementTest[] = elements.map((element) => {
    const [a, n1] = count(group, element);
    const [c, n2] = count(rest, element);
    const enough = n1 >= minN && n2 >= minN;
    return {
      element,
      inDetected: a, inEvaluable: n1, outDetected: c, outEvaluable: n2,
      freqIn: n1 ? a / n1 : null, freqOut: n2 ? c / n2 : null,
      oddsRatio: enough ? oddsRatio(a, n1 - a, c, n2 - c) : null,
      p: enough ? fisherExact(a, n1 - a, c, n2 - c) : null,
      pAdj: null,
      note: enough ? null : `표본 부족(그룹 n=${n1}, 비교군 n=${n2}; 각 ${minN} 이상 필요)`,
    };
  });
  const tested = rows.filter((r) => r.p != null);
  const adj = holm(tested.map((r) => r.p!));
  tested.forEach((r, i) => (r.pAdj = adj[i]));
  return rows;
}

export interface MorphologyCrossRow {
  morphology: string;
  label: string;
  n: number;
  perElement: Record<string, { detected: number; evaluable: number }>;
  quant: Record<string, Describe>;
}

/** 형상 × 원소 교차표(검출 빈도)와 형상별 정량값 요약 */
export function morphologyCross(particles: Particle[], elements: string[], settings: AnalysisSettings, basis: "wt" | "at"): MorphologyCrossRow[] {
  const valid = particles.filter((p) => p.edsValid);
  return [...MORPHOLOGY_CLASSES, "none"]
    .map((m) => {
      const ps = valid.filter((p) => (p.morphology ?? "none") === m);
      const perElement: MorphologyCrossRow["perElement"] = {};
      const quant: MorphologyCrossRow["quant"] = {};
      for (const e of elements) {
        let d = 0, n = 0;
        const vals: number[] = [];
        for (const p of ps) {
          const s = elementStatus(p, e, settings).status;
          if (s === "missing") continue;
          n++;
          if (isDetectedStatus(s, settings)) d++;
          const v = quantValue(p, e, basis);
          if (v != null) vals.push(v);
        }
        perElement[e] = { detected: d, evaluable: n };
        quant[e] = describe(vals);
      }
      return { morphology: m, label: morphologyLabel(m), n: ps.length, perElement, quant };
    })
    .filter((r) => r.n > 0);
}

export interface HypothesisResult {
  id: string;
  title: string;
  groupLabel: string;
  groupN: number;
  restLabel: string;
  restN: number;
  observed: string[];
  tests: GroupElementTest[];
  statistical: string[];
  interpretation: string[];
  unconfirmed: string[];
  available: boolean;
}

interface HypothesisDef {
  id: string;
  title: string;
  /** 그룹 선택: 형상 목록 또는 조성 조건 */
  group: { morph: MorphologyClass[] } | { carbonRich: number };
  elements: string[] | "auto";
  interpretation: string[];
}

const HYPOTHESES: HypothesisDef[] = [
  {
    id: "angular_metal",
    title: "각진 파편형 입자와 Fe·Cr·Mn 등 금속 원소의 동시 검출",
    group: { morph: ["angular"] },
    elements: ["Fe", "Cr", "Mn", "Ni", "Cu"],
    interpretation: [
      "기계적 마찰·마모(레일·차륜·제동재 등)로 생긴 파편은 각진 형태와 금속 조성을 함께 보일 수 있다.",
      "다만 각진 금속 산화물 입자는 토양·산업 기원일 수도 있으며, 형상만으로 기원을 정할 수 없다.",
    ],
  },
  {
    id: "irregular_mineral",
    title: "불규칙한 광물성 입자와 Si·Al·Ca·Fe 조성",
    group: { morph: ["irregular"] },
    elements: ["Si", "Al", "Ca", "Fe", "K", "Mg"],
    interpretation: ["토양·광물 입자는 불규칙한 형상과 알루미노실리케이트 조성을 보이는 경우가 많다.", "도로 재비산·건설 먼지도 비슷한 조성을 보일 수 있다."],
  },
  {
    id: "carbon_rich",
    title: "탄소가 풍부한 입자(C ≥ 55 wt%, 전체기준)와 다른 원소의 동시 검출",
    group: { carbonRich: 55 },
    elements: "auto",
    interpretation: [
      "탄소 풍부 입자는 유기물·검댕·타이어 마모 입자일 수 있다.",
      "탄소 코팅이나 탄소 테이프 기판 신호가 섞였을 가능성을 먼저 배제해야 한다.",
    ],
  },
  {
    id: "spherical",
    title: "구형 입자와 특정 원소 조성의 관계",
    group: { morph: ["spherical"] },
    elements: "auto",
    interpretation: [
      "구형 입자는 고온 과정(용융 후 응고: 아크·스파크, 연소 비산재 등)에서 생길 수 있다.",
      "구형 금속 입자는 집전장치 아크나 용접 흄과 연관될 가능성이 있으나 추가 근거가 필요하다.",
    ],
  },
  {
    id: "fibrous",
    title: "섬유상 입자와 검출 원소의 관계",
    group: { morph: ["fibrous"] },
    elements: "auto",
    interpretation: ["섬유상 입자는 광물 섬유, 유리·합성 섬유, 생물 기원 등 다양한 기원이 가능하다.", "석면 여부 등은 SEM-EDS 형상·조성만으로 판정할 수 없고 별도 공인 분석이 필요하다."],
  },
];

export function evaluateHypotheses(particles: Particle[], settings: AnalysisSettings, allElements: string[]): HypothesisResult[] {
  const valid = particles.filter((p) => p.edsValid);
  const classified = valid.filter((p) => p.morphology && p.morphology !== "undetermined");
  const autoElements = allElements.filter((e) => e !== "C" && e !== "O").slice(0, 12);

  return HYPOTHESES.map((h) => {
    let group: Particle[], rest: Particle[], groupLabel: string, restLabel: string;
    const unconfirmed: string[] = [];
    if ("morph" in h.group) {
      const set = h.group.morph;
      group = classified.filter((p) => set.includes(p.morphology!));
      rest = classified.filter((p) => !set.includes(p.morphology!));
      groupLabel = set.map(morphologyLabel).join("·");
      restLabel = "그 밖의 형상 분류 입자";
      const unclassified = valid.length - classified.length;
      if (unclassified) unconfirmed.push(`형상 판정값이 없거나 판별 불가인 유효 입자 ${unclassified}개는 비교에서 제외됨.`);
      const methods = [...new Set(group.concat(rest).map((p) => p.classificationMethod ?? "방법 미기재"))];
      unconfirmed.push(`형상 판정 방법: ${methods.join(", ") || "—"}. 판정자 간 일치도는 확인되지 않음.`);
    } else {
      const thr = h.group.carbonRich;
      const withWt = valid.filter((p) => normalizedWt(p, "total"));
      group = withWt.filter((p) => (normalizedWt(p, "total")!.C ?? 0) >= thr);
      rest = withWt.filter((p) => (normalizedWt(p, "total")!.C ?? 0) < thr);
      groupLabel = `C ≥ ${thr} wt%`;
      restLabel = `C < ${thr} wt%`;
      if (!settings.preparationChecked) unconfirmed.push("탄소 코팅·기판 신호의 영향이 확인되지 않음(설정에서 확인 여부 표시).");
      if (valid.length > withWt.length) unconfirmed.push(`wt% 정량값이 없는 입자 ${valid.length - withWt.length}개는 제외됨.`);
    }
    const elements = (h.elements === "auto" ? autoElements : h.elements).filter((e) => allElements.includes(e));
    const tests = compareGroups(group, rest, elements, settings);
    const observed: string[] = [`${groupLabel} 입자 ${group.length}개, 비교군(${restLabel}) ${rest.length}개.`];
    for (const t of tests) {
      if (t.inEvaluable) observed.push(`${t.element}: ${groupLabel}에서 ${t.inDetected}/${t.inEvaluable} 검출, 비교군에서 ${t.outDetected}/${t.outEvaluable} 검출.`);
    }
    const statistical: string[] = [];
    const tested = tests.filter((t) => t.p != null);
    if (!tested.length) statistical.push("두 그룹 모두 3개 이상의 입자가 있어야 검정합니다 — 현재 데이터로는 통계적 관계를 판단할 수 없습니다.");
    for (const t of tested) {
      const dir = (t.freqIn ?? 0) > (t.freqOut ?? 0) ? "높음" : (t.freqIn ?? 0) < (t.freqOut ?? 0) ? "낮음" : "같음";
      const sig = t.pAdj! < 0.05 ? "보정 후 p < 0.05" : "유의한 차이 확인 안 됨";
      statistical.push(`${t.element}: 검출 빈도 ${groupLabel} ${(t.freqIn! * 100).toFixed(0)}% vs 비교군 ${(t.freqOut! * 100).toFixed(0)}% (${dir}), OR ${t.oddsRatio!.toFixed(2)}, Fisher p = ${t.p!.toPrecision(2)}, Holm 보정 p = ${t.pAdj!.toPrecision(2)} → ${sig}`);
    }
    unconfirmed.push("검출 빈도 차이는 연관성이며 인과(형성 과정)를 뜻하지 않음.", "입자 선정이 무작위가 아니면 결과가 분석 대상 선택에 따라 달라질 수 있음.");
    return {
      id: h.id, title: h.title, groupLabel, groupN: group.length, restLabel, restN: rest.length,
      observed, tests, statistical, interpretation: h.interpretation, unconfirmed,
      available: group.length > 0,
    };
  });
}

/** 복합 입자: 입자별 검출 원소 수(C·O 제외) 분포 */
export function elementCountDistribution(particles: Particle[], settings: AnalysisSettings, exclude = ["C", "O"]): Array<{ k: number; particles: number }> {
  const valid = particles.filter((p) => p.edsValid);
  const m = new Map<number, number>();
  for (const p of valid) {
    const k = Object.values(p.elements).filter((e) => !exclude.includes(e.symbol) && isDetectedStatus(e.status, settings)).length;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  const max = Math.max(0, ...m.keys());
  return Array.from({ length: max + 1 }, (_, k) => ({ k, particles: m.get(k) ?? 0 }));
}
