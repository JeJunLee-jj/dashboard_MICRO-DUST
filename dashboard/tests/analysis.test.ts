import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { fixtureDataset, fakeImage, loadFiles, settings, SAMPLE } from "./helpers";
import { hazardSummary, particleTargetResult, massConcentrationAssessment, HAZARD_DISCLAIMER } from "../src/lib/hazard";
import { elementSummaries, correlationMatrix, normalizedWt, meanComposition } from "../src/lib/composition";
import { applyFilters, computeKpis } from "../src/lib/filters";
import { EMPTY_FILTERS } from "../src/lib/types";
import { DEFAULT_HAZARD_RULES } from "../src/config/defaults";
import { classifyParticleType, sourceCandidates, DEFAULT_CLASSIFICATION_RULES, validateRules } from "../src/lib/rules";
import { morphologyDistribution, frequencyBars, targetStatusCounts, compositionStack } from "../src/lib/viewModels";
import { joinState, EMPTY_DATASET } from "../src/lib/dataset";
import { particleResultRows, toCsv, csvHeader } from "../src/lib/exports";
import { compareGroupsBy } from "../src/lib/samples";
import { evaluateHypotheses } from "../src/lib/integration";

const byKey = <T extends { key: string }>(ps: T[], k: string): T => ps.find((p) => p.key === k)!;

describe("입자 결합과 유효 분석 입자", () => {
  const { particles, unmatched } = fixtureDataset();
  it("메타데이터와 EDS의 합집합으로 입자를 만든다", () => {
    expect(particles.map((p) => p.key).sort()).toEqual(["T1::P1", "T1::P2", "T1::P3", "T1::P4", "T2::P1", "T2::P5", "T9::P9"]);
  });
  it("EDS 없는 입자는 유효 분석에서 제외", () => {
    expect(byKey(particles, "T2::P5").edsValid).toBe(false);
    expect(particles.filter((p) => p.edsValid)).toHaveLength(6);
    expect(unmatched.metaWithoutEds).toEqual(["T2::P5"]);
    expect(unmatched.edsWithoutMeta).toEqual(["T9::P9"]);
  });
  it("합계는 wt%와 at%를 따로 계산", () => {
    const p1 = byKey(particles, "T1::P1");
    expect(p1.wtSum).toBeCloseTo(100);
    expect(p1.atSum).toBeCloseTo(100);
    expect(byKey(particles, "T1::P4").wtSum).toBeNull();
    expect(byKey(particles, "T1::P4").atSum).toBeCloseTo(100);
  });
});

describe("원소 조성 집계", () => {
  const { particles, settings: s } = fixtureDataset();
  const sums = elementSummaries(particles, s);
  const fe = sums.find((x) => x.symbol === "Fe")!;
  it("wt%·at% 통계를 섞지 않는다", () => {
    expect(fe.wt.n).toBe(3);                // T1P1 60, T2P1 45, T9P9 50
    expect(fe.wt.mean).toBeCloseTo((60 + 45 + 50) / 3);
    expect(fe.at.n).toBe(2);                // T1P1 33, T1P4 20
    expect(fe.at.mean).toBeCloseTo(26.5);
  });
  it("원소별 검출 빈도와 분모", () => {
    expect(fe.detected).toBe(4);
    expect(fe.evaluable).toBe(6);
    const pb = sums.find((x) => x.symbol === "Pb")!;
    expect(pb.missing).toBe(1);             // T1P2 Pb 결측
    expect(pb.evaluable).toBe(5);
    expect(pb.detected).toBe(0);
  });
  it("정량한계 미만은 검출로 세지만 정량 통계에는 넣지 않는다", () => {
    const cr = sums.find((x) => x.symbol === "Cr")!;
    expect(cr.detected).toBe(1);
    expect(cr.belowLoq).toBe(1);
    expect(cr.wt.n).toBe(0);
  });
  it("평균 조성 도넛의 분모는 해당 기준 값이 있는 유효 입자", () => {
    expect(meanComposition(particles, "wt").n).toBe(5); // T1P4는 wt 없음
    expect(meanComposition(particles, "at").n).toBe(3); // T1P1, T1P2, T1P4
  });
  it("상관계수는 표본이 부족하면 계산하지 않는다", () => {
    // Fe–O 쌍: wt 값이 없는 T1P4는 빠지고, 미검출(Fe 없음)은 0으로 들어가 n = 5
    const m6 = correlationMatrix(particles, s, ["Fe", "O"], "wt", "spearman", 6);
    const cell = m6.find((c) => c.a === "Fe" && c.b === "O")!;
    expect(cell.n).toBe(5);
    expect(cell.r).toBeNull();
    const m5 = correlationMatrix(particles, s, ["Fe", "O"], "wt", "spearman", 5);
    expect(m5.find((c) => c.a === "Fe" && c.b === "O")!.r).not.toBeNull();
  });
});

describe("위해성 평가 대상 원소 분포", () => {
  it("입자 개수 비율은 입자 단위로 한 번만 센다", () => {
    const { particles, settings: s } = fixtureDataset();
    const h = hazardSummary(particles, s, DEFAULT_HAZARD_RULES);
    expect(h.totalParticles).toBe(7);
    expect(h.validEds).toBe(6);
    expect(h.positive).toBe(5);
    expect(h.negative).toBe(1);
    expect(h.undetermined).toBe(0);
    expect(h.targetRatio.denominator).toBe(6);
    expect(h.targetRatio.ratio).toBeCloseTo(5 / 6);
    // 원소별 검출 수의 합(9)은 입자 수보다 크지만 비율에는 영향을 주지 않는다
    const sumDetections = h.elementStats.reduce((a, e) => a + e.detected, 0);
    expect(sumDetections).toBe(9);
    expect(h.positive).toBeLessThanOrEqual(h.validEds);
  });
  it("복수 원소 동시 검출: 결측 때문에 판정할 수 없는 입자는 분모에서 뺀다", () => {
    const { particles, settings: s } = fixtureDataset();
    const h = hazardSummary(particles, s, DEFAULT_HAZARD_RULES);
    expect(h.multi[2].numerator).toBe(2);   // T1P1(Fe,Cr,Mn), T2P1(Fe,Cu,Ni)
    expect(h.multi[2].denominator).toBe(5); // T1P2: Zn 1개 + Pb 결측 → 판정 불가
    expect(h.combos.map((c) => c.combo).sort()).toEqual(["Cr+Mn+Fe", "Ni+Cu+Fe"].sort());
  });
  it("정량한계 미만을 검출로 세지 않도록 바꾸면 결과가 바뀐다", () => {
    const { particles, settings: s } = fixtureDataset({ belowLoqCountsAsDetected: false });
    const r = particleTargetResult(byKey(particles, "T1::P1"), s);
    expect(r.detected.sort()).toEqual(["Fe", "Mn"]);
  });
  it("파일에 없는 원소를 결측으로 보는 설정이면 분모가 원소별로 달라진다", () => {
    const { particles, settings: s } = fixtureDataset({ absentElementPolicy: "not_analyzed" });
    const h = hazardSummary(particles, s, DEFAULT_HAZARD_RULES);
    const pb = h.elementStats.find((e) => e.symbol === "Pb")!;
    expect(pb.evaluable).toBe(1);           // T1P1의 명시적 ND만 판정 가능
    expect(h.undetermined).toBe(1);         // T1P3: 대상 원소 행이 하나도 없음
    expect(h.targetRatio.denominator).toBe(5);
    expect(h.targetRatio.ratio).toBe(1);
  });
  it("분석 제외 입자는 비율 계산에 들어가지 않는다", () => {
    const { particles, settings: s } = fixtureDataset();
    expect(particleTargetResult(byKey(particles, "T2::P5"), s).status).toBe("invalid");
  });
});

describe("필터와 KPI 일관성", () => {
  const { particles, settings: s } = fixtureDataset();
  const check = (filtered: typeof particles) => {
    const k = computeKpis(filtered, s);
    const h = hazardSummary(filtered, s, DEFAULT_HAZARD_RULES);
    const counts = targetStatusCounts(filtered, s);
    expect(k.total).toBe(filtered.length);
    expect(k.validEds).toBe(h.validEds);
    expect(k.targetPositive).toBe(h.positive);
    expect(k.targetDeterminable).toBe(h.targetRatio.denominator);
    expect(counts.positive).toBe(k.targetPositive);
    expect(morphologyDistribution(filtered).reduce((a, b) => a + b.count, 0)).toBe(k.total);
    const fe = frequencyBars(filtered, s, ["Fe"])[0];
    if (fe) expect(fe.evaluable).toBeLessThanOrEqual(k.validEds);
  };
  it("필터 없음", () => check(applyFilters(particles, EMPTY_FILTERS, s)));
  it("시료 필터", () => {
    const f = applyFilters(particles, { ...EMPTY_FILTERS, samples: ["T1"] }, s);
    expect(f).toHaveLength(4);
    check(f);
  });
  it("원소·형상·날짜·대상 상태 필터", () => {
    const byEl = applyFilters(particles, { ...EMPTY_FILTERS, element: "Fe" }, s);
    expect(byEl.map((p) => p.key).sort()).toEqual(["T1::P1", "T1::P4", "T2::P1", "T9::P9"]);
    check(byEl);
    const byMorph = applyFilters(particles, { ...EMPTY_FILTERS, morphologies: ["none"] }, s);
    expect(byMorph.map((p) => p.key).sort()).toEqual(["T1::P3", "T9::P9"]);
    check(byMorph);
    const byDate = applyFilters(particles, { ...EMPTY_FILTERS, dateFrom: "2026-01-02", dateTo: "2026-01-02" }, s);
    expect(byDate.map((p) => p.key).sort()).toEqual(["T1::P3", "T1::P4"]);
    check(byDate);
    const neg = applyFilters(particles, { ...EMPTY_FILTERS, targetStatus: "negative" }, s);
    expect(neg.map((p) => p.key)).toEqual(["T1::P3"]);
    check(neg);
  });
  it("형상 분류 완료 비율: 판별 불가·미분류는 완료가 아님", () => {
    const k = computeKpis(particles, s);
    expect(k.morphClassified).toBe(4); // T1P1 angular, T1P2 spherical, T1P4 fibrous, T2P1 irregular
    expect(k.morphUndetermined).toBe(1);
    expect(k.morphRatio).toBeCloseTo(4 / 7);
  });
});

describe("SEM 이미지와 입자 ID 매칭", () => {
  const images = [fakeImage("P1.png"), fakeImage("P2.png"), fakeImage("p4.TIF"), fakeImage("T2_P1.png"), fakeImage("P3.png"), fakeImage("orphan.png")];
  const { particles, unmatched } = fixtureDataset({}, images);
  it("파일명(대소문자 무시)으로 연결", () => {
    expect(byKey(particles, "T1::P1").image?.filename).toBe("P1.png");
    expect(byKey(particles, "T1::P4").image?.filename).toBe("p4.TIF");
    expect(byKey(particles, "T2::P1").image?.filename).toBe("T2_P1.png");
    expect(byKey(particles, "T1::P1").imageMatch).toBe("filename");
  });
  it("메타데이터에 파일명이 없으면 고유한 particle_id와 같은 파일명으로 연결", () => {
    expect(byKey(particles, "T1::P3").image?.filename).toBe("P3.png");
    expect(byKey(particles, "T1::P3").imageMatch).toBe("particle_id");
  });
  it("여러 시료에 같은 particle_id가 있으면 particle_id만으로 연결하지 않는다", () => {
    // T1::P1과 T2::P1 — 파일명 P1.png는 메타데이터 image_filename으로만 T1::P1에 연결된다
    expect(byKey(particles, "T2::P1").image?.filename).not.toBe("P1.png");
  });
  it("미매칭 목록", () => {
    expect(unmatched.imagesWithoutParticle).toEqual(["orphan.png"]);
    expect(unmatched.particlesWithoutImage.sort()).toEqual(["T2::P5", "T9::P9"]);
  });
});

describe("허위 분석 결과를 만들지 않는다", () => {
  it("데이터가 없으면 비율은 null이고 0%로 표시하지 않는다", () => {
    const { particles } = joinState(EMPTY_DATASET, settings());
    const k = computeKpis(particles, settings());
    expect(k.total).toBe(0);
    expect(k.targetRatio).toBeNull();
    expect(k.morphRatio).toBeNull();
    const h = hazardSummary(particles, settings(), DEFAULT_HAZARD_RULES);
    expect(h.targetRatio.ratio).toBeNull();
    expect(h.targetRatio.ci).toBeNull();
    expect(elementSummaries(particles, settings())).toEqual([]);
  });
  it("질량 비율·대기 농도·건강 위해도는 계산하지 않는다", () => {
    const a = massConcentrationAssessment();
    expect(a.length).toBe(3);
    expect(a.every((x) => x.computable === false && x.reasons.length > 0)).toBe(true);
    expect(HAZARD_DISCLAIMER).toContain("확정할 수 없으며");
  });
  it("wt%가 없는 입자는 wt% 규칙으로 분류하지 않는다(at%로 대체 안 함)", () => {
    const { particles, settings: s } = fixtureDataset();
    const p4 = byKey(particles, "T1::P4");
    expect(normalizedWt(p4, "total")).toBeNull();
    expect(classifyParticleType(p4, s, DEFAULT_CLASSIFICATION_RULES).id).toBe("no_wt");
    expect(sourceCandidates(p4, s, DEFAULT_CLASSIFICATION_RULES).summaryLabel).toContain("판별 불가");
    expect(compositionStack(particles, "wt", ["Fe"]).some((r) => r.key === "T1::P4")).toBe(false);
  });
  it("스케일 보정이 없으면 크기를 계산하지 않는다", () => {
    const { particles } = fixtureDataset();
    expect(byKey(particles, "T1::P2").umPerPx).toBeNull();
    expect(byKey(particles, "T1::P2").meta?.equivalent_diameter).toBeNull();
  });
  it("근거 없는 원소에는 위해성 범주를 부여하지 않는다", () => {
    for (const s of ["Mn", "Cu", "Zn", "Fe", "Co"]) {
      const r = DEFAULT_HAZARD_RULES.find((x) => x.element_symbol === s)!;
      expect(r.reference_name).toBeNull();
      expect(r.assessment_category).toContain("미입력");
    }
    for (const r of DEFAULT_HAZARD_RULES.filter((x) => x.reference_name)) {
      expect(r.reference_url).toBeTruthy();
      expect(r.reference_year).toBeTruthy();
    }
  });
  it("발생원은 후보로만 제시하고 외부 유입은 개별 입자로 판별하지 않는다", () => {
    const { particles, settings: s } = fixtureDataset();
    const r = sourceCandidates(byKey(particles, "T1::P1"), s, DEFAULT_CLASSIFICATION_RULES);
    expect(r.matches.length).toBeGreaterThan(0);
    for (const m of r.matches) {
      expect(["원소 조건 + 보조 근거", "원소 조건만 충족"]).toContain(m.level);
      expect(m.alternatives.length + m.requiredValidation.length).toBeGreaterThan(0);
    }
    expect(r.notEvaluable.some((n) => n.candidate.includes("외부"))).toBe(true);
  });
  it("가설 검정은 표본이 부족하면 결론을 내지 않는다", () => {
    const { particles, settings: s } = fixtureDataset();
    const hs = evaluateHypotheses(particles, s, ["Fe", "Cr", "Mn", "Si", "Al", "Ca", "C", "O", "Zn"]);
    const angular = hs.find((h) => h.id === "angular_metal")!;
    expect(angular.tests.every((t) => t.p === null)).toBe(true);
    expect(angular.statistical[0]).toContain("판단할 수 없습니다");
  });
  it("규칙 JSON 검증", () => {
    expect(validateRules({}).ok).toBe(false);
    expect(validateRules({ particleTypes: [], sourceCandidates: [{ id: "x", all: [{ kind: "weird" }] }] }).ok).toBe(false);
    expect(validateRules(JSON.parse(JSON.stringify(DEFAULT_CLASSIFICATION_RULES))).ok).toBe(true);
  });
});

describe("DEMO 데이터와 실제 데이터의 구분", () => {
  const demo = loadFiles([join(SAMPLE, "demo_particle_metadata.csv"), join(SAMPLE, "demo_eds_long.csv")], "demo");
  const s = settings();
  const { particles } = joinState(demo, s);
  it("DEMO 파일은 같은 파서를 거치며 모든 입자가 demo로 표시된다", () => {
    expect(demo.origin).toBe("demo");
    expect(particles.length).toBeGreaterThan(50);
    expect(particles.every((p) => p.origin === "demo")).toBe(true);
    expect(demo.files.every((f) => f.origin === "demo")).toBe(true);
    expect(particles.every((p) => p.sample_id.startsWith("DEMO"))).toBe(true);
  });
  it("내보내기에도 DEMO 표시가 남는다", () => {
    const rows = particleResultRows(particles, s, DEFAULT_CLASSIFICATION_RULES);
    expect(rows.every((r) => r.data_origin === "demo")).toBe(true);
    const csv = toCsv(rows, csvHeader("demo", s));
    expect(csv).toContain("DEMO(가상 예시 데이터 — 실제 측정 결과 아님)");
  });
  it("사용자 업로드 데이터는 user로 표시된다", () => {
    const { particles: up } = fixtureDataset();
    expect(up.every((p) => p.origin === "user")).toBe(true);
  });
  it("DEMO 데이터로 시료 비교 계산이 동작한다", () => {
    const { rows, pairwise } = compareGroupsBy(particles, "sample_id", s, DEFAULT_CLASSIFICATION_RULES, []);
    expect(rows.map((r) => r.group)).toEqual(["DEMO-A", "DEMO-B", "DEMO-C"]);
    expect(pairwise.length).toBe(3);
    for (const r of rows) expect(r.positive).toBeLessThanOrEqual(r.determinable);
  });
});
