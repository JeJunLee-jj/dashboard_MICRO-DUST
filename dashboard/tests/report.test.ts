import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { loadFiles, settings, SAMPLE, fixtureDataset } from "./helpers";
import { joinState } from "../src/lib/dataset";
import { buildReportHtml } from "../src/lib/report";
import { DEFAULT_HAZARD_RULES } from "../src/config/defaults";
import { DEFAULT_CLASSIFICATION_RULES } from "../src/lib/rules";
import { followUps } from "../src/lib/limitations";
import { HAZARD_DISCLAIMER } from "../src/lib/hazard";

function report(origin: "demo" | "user") {
  const state = origin === "demo"
    ? loadFiles([join(SAMPLE, "demo_particle_metadata.csv"), join(SAMPLE, "demo_eds_long.csv")], "demo")
    : fixtureDataset().state;
  const s = settings();
  const j = joinState(state, s);
  return buildReportHtml({
    origin, particles: j.particles, allCount: j.particles.length, filterDescription: "", settings: s,
    hazardRules: DEFAULT_HAZARD_RULES, rules: DEFAULT_CLASSIFICATION_RULES, files: state.files, pm: state.pm, eds: state.eds,
    unmatched: j.unmatched, issueCounts: { error: 0, warning: 0, info: 0 },
  });
}

describe("요약 보고서", () => {
  it("데이터 범위·계산식·주요 결과·분석 한계·주의 문구를 포함한다", () => {
    const html = report("user");
    for (const s of ["1. 데이터 범위", "2. 분석 설정과 계산식", "3. 주요 결과", "4. 계산하지 않은 지표", "5. 분석 한계와 주의사항", "6. 추가 조사가 필요한 항목"]) expect(html).toContain(s);
    expect(html).toContain(HAZARD_DISCLAIMER);
    expect(html).toContain("판정 가능한 유효 분석 입자 수");
    expect(html).toContain("83.3% (5/6)"); // 테스트 데이터의 대상 원소 검출 입자 비율
    expect(html).not.toContain("DEMO 보고서");
  });
  it("DEMO 데이터 보고서에는 DEMO 경고가 들어간다", () => {
    const html = report("demo");
    expect(html).toContain("[DEMO]");
    expect(html).toContain("DEMO 보고서");
    expect(html).toContain("실제 측정 결과가 아니며");
  });
  it("데이터가 없으면 추가 조사 항목도 만들지 않는다", () => {
    const j = joinState({ origin: null, meta: [], eds: [], images: [], pm: [], files: [], issues: [], edsSummaries: [], overrides: {} }, settings());
    expect(followUps(j.particles, [], settings(), DEFAULT_HAZARD_RULES, j.unmatched)).toEqual([]);
  });
});
