import { describe, expect, it } from "vitest";
import { buildLargeArea, type LargeAreaData } from "../src/lib/largeArea";
import { DEFAULT_SIM_CONFIG, simulate } from "../src/lib/sources";
import { DEFAULT_SETTINGS } from "../src/config/defaults";

const data: LargeAreaData = {
  source: "test",
  builtAt: "2026-11-09",
  instrument: "test",
  scale: { dmax: 100, ar: 100, wt: 10 },
  groups: [
    // 개찰구: 입자 1 = Fe 30 wt%, 길이 7 µm, 종횡비 3.2 / 입자 2 = Fe 0, 길이 12 µm(범위 밖)
    { id: "D", tag: "D", file: "D.csv", siteId: "gate", label: "개찰구 (D구역)", n: 2, elements: ["Fe", "O", "Mn"], mag: ["150"], classification: [], sumMean: 100,
      dmax: [700, 1200], ar: [320, 110], wt10: { Fe: [300, 0], O: [700, 1000], Mn: [0, 0] } },
    { id: "Free-Filter", tag: "Free Filter", file: "F.csv", siteId: null, label: "Free Filter", n: 1, elements: ["Fe", "O"], mag: ["150"], classification: [], sumMean: 100,
      dmax: [800], ar: [100], wt10: { Fe: [500], O: [500] } },
  ],
};

describe("대면적 자동 분석 데이터", () => {
  const set = buildLargeArea(data);

  it("지점 그룹만 시뮬레이터 입력에 넣고, 참조 그룹은 따로 둔다", () => {
    expect(set.particles).toHaveLength(2);
    expect(set.byGroup["Free-Filter"]).toHaveLength(1);
  });

  it("크기·종횡비·조성을 규칙 엔진 형식으로 바꾼다", () => {
    const p = set.particles[0];
    expect(p.meta?.feret_diameter).toBeCloseTo(7);
    expect(p.meta?.aspect_ratio).toBeCloseTo(3.2);
    expect(p.elements.Fe).toMatchObject({ wt: 30, status: "detected" });
    expect(p.elements.Mn.status).toBe("not_detected");
  });

  it("지점 판정: 개찰구 입자만 집계되고, 크기 범위 밖 입자는 빠진다", () => {
    const res = simulate(set.particles, DEFAULT_SIM_CONFIG, DEFAULT_SETTINGS);
    const gate = res.sites.find((s) => s.site.id === "gate")!;
    expect(gate.total).toBe(2);
    expect(gate.judged).toHaveLength(1);
    expect(gate.rules.rail.k).toBe(1);
    expect(res.sites.find((s) => s.site.id === "cafe")!.total).toBe(0);
    // 참조 그룹 입자를 넣어도 지점에 배정되지 않는다
    const withRef = simulate([...set.particles, ...set.byGroup["Free-Filter"]], DEFAULT_SIM_CONFIG, DEFAULT_SETTINGS);
    expect(withRef.unassigned).toBe(1);
  });
});
