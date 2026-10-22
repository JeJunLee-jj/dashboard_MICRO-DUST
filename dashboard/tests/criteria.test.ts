import { describe, expect, it } from "vitest";
import { settings } from "./helpers";
import { parseCsvText } from "../src/lib/parse/tabular";
import { buildParticleFromPair, type PairInput } from "../src/lib/register";
import { EMPTY_DATASET, joinState } from "../src/lib/dataset";
import { matchSitePath, matchSiteText } from "../src/lib/sites";
import { DEFAULT_CRITERIA, abstractBlanks, arSensitivity, simulate, type CriteriaConfig } from "../src/lib/criteria";

describe("위치 자동 지정(폴더·파일 이름)", () => {
  it("위치명·구역 번호를 알아본다", () => {
    expect(matchSiteText("개찰구 (D구역)")?.id).toBe("gate");
    expect(matchSiteText("음식점(B-28)")?.id).toBe("food");
    expect(matchSiteText("카페(간편식)(E-43)")?.id).toBe("cafe");
    expect(matchSiteText("화장품(F-1)")?.id).toBe("cosmetic");
    expect(matchSiteText("의류매장(E-2)")?.id).toBe("clothing");
    expect(matchSiteText("261022_E2_03")?.id).toBe("clothing");
    expect(matchSiteText("B28_01")?.id).toBe("food");
  });
  it("비슷한 번호와 헷갈리지 않는다", () => {
    expect(matchSiteText("E-28")).toBeNull();
    expect(matchSiteText("F-10")).toBeNull();
    expect(matchSiteText("E-2.5")).toBeNull();
    expect(matchSiteText("261008_Local1 (2)")).toBeNull();
    expect(matchSiteText("공기청정기")).toBeNull();
  });
  it("경로에서는 안쪽 폴더를 먼저 본다", () => {
    expect(matchSitePath("강남역/화장품(F-1)/261022_Local1 (3).tiff")?.id).toBe("cosmetic");
    expect(matchSitePath("강남역/개찰구/quantification (1).csv")?.id).toBe("gate");
    expect(matchSitePath("카페_05.tif")?.id).toBe("cafe");
    expect(matchSitePath("data/quantification (1).csv")).toBeNull();
  });
});

const csv = (rows: Array<[string, number]>) =>
  parseCsvText(["Element symbol,Weight concentration percentage", ...rows.map(([e, w]) => `${e},${w}`)].join("\n"), "q.csv");

function particle(id: string, location: string | null, opts: { feret?: number | null; ar?: number | null; eds?: Array<[string, number]> | null }) {
  const input: PairInput = {
    sample_id: "S", particle_id: id, location, date: null, sample_type: null, morphology: null, morphologyMethod: null, notes: null,
    image: null, pixelSizeUm: 0.05, edsName: opts.eds ? `${id}.csv` : null, edsTable: opts.eds ? csv(opts.eds) : null,
    measurement: opts.ar === undefined && opts.feret === undefined ? null : { eqdUm: null, areaUm2: null, feretUm: opts.feret ?? null, circularity: 0.8, solidity: 0.9, aspectRatio: opts.ar ?? NaN, methodLabel: "test" },
  };
  return buildParticleFromPair(input);
}

function dataset(list: ReturnType<typeof particle>[]) {
  const s = settings();
  return { s, particles: joinState({ ...EMPTY_DATASET, origin: "user", meta: list.map((x) => x.meta), eds: list.flatMap((x) => x.eds) }, s).particles };
}

describe("기준 적용과 위치별 비율", () => {
  const { s, particles } = dataset([
    particle("P1", "개찰구 (D구역)", { feret: 7, ar: 2.2, eds: [["C", 20], ["O", 30], ["Fe", 50]] }),
    particle("P2", "개찰구 (D구역)", { feret: 8, ar: 1.1, eds: [["C", 40], ["O", 40], ["Si", 20]] }),
    particle("P3", "개찰구 (D구역)", { feret: 12, ar: 3.0, eds: [["Fe", 100]] }),            // 크기 범위 밖
    particle("P4", "음식점 (B-28)", { feret: 6, ar: 1.6, eds: [["O", 50], ["Fe", 3], ["Ca", 47]] }),
    particle("P5", "음식점 (B-28)", { feret: 9, ar: null, eds: [["O", 50], ["Cu", 50]] }),     // AR 미측정
    particle("P6", "음식점 (B-28)", { feret: 5.5, ar: 1.8, eds: null }),                      // EDS 없음
    particle("P7", null, { feret: 7, ar: 2, eds: [["Fe", 100]] }),                             // 위치 없음 → 참고
  ]);
  const r = simulate(particles, DEFAULT_CRITERIA, s);
  const gate = r.sites.find((g) => g.id === "gate")!;
  const food = r.sites.find((g) => g.id === "food")!;

  it("크기 범위(최대 길이 5–10 µm) 밖 입자는 분석 대상에서 뺀다", () => {
    expect(gate.total).toBe(3);
    expect(gate.inRange.map((e) => e.particle.particle_id)).toEqual(["P1", "P2"]);
    expect(gate.outOfRange).toBe(1);
  });
  it("판정할 수 없는 입자는 분모에서 뺀다(해당 안 됨으로 세지 않음)", () => {
    expect(food.shape).toMatchObject({ k: 2, n: 2 });   // P5(AR 없음) 제외
    expect(food.comp).toMatchObject({ k: 2, n: 2 });    // P6(EDS 없음) 제외
    expect(food.both).toMatchObject({ k: 1, n: 1 });    // P4만 둘 다 판정 가능
  });
  it("위치가 없는 입자는 5개 위치 전체에 넣지 않고 참고로만", () => {
    expect(r.overall.total).toBe(6);
    expect(r.others).toHaveLength(1);
    expect(r.others[0].label).toBe("채취 지점 미입력");
  });
  it("원소별 wt% 하한을 두면 낮은 Fe는 조성 기준에서 빠진다", () => {
    const cfg: CriteriaConfig = { ...DEFAULT_CRITERIA, minWt: { Fe: 10 } };
    const f = simulate(particles, cfg, s).sites.find((g) => g.id === "food")!;
    expect(f.comp).toMatchObject({ k: 1, n: 2 });       // P4(Fe 3 wt%) 탈락, P5(Cu) 유지
  });
  it("원소 2개 이상 동시 검출을 요구할 수 있다", () => {
    const { s: s2, particles: ps } = dataset([
      particle("Q1", "개찰구", { feret: 7, ar: 1.2, eds: [["Fe", 90], ["Cu", 10]] }),   // Fe+Cu → 해당
      particle("Q2", "개찰구", { feret: 7, ar: 1.2, eds: [["Fe", 100]] }),             // Fe만 → 해당 안 됨
    ]);
    const g = simulate(ps, { ...DEFAULT_CRITERIA, minHits: 2 }, s2).sites.find((x) => x.id === "gate")!;
    expect(g.comp).toMatchObject({ k: 1, n: 2 });
    expect(g.inRange[0].compHits).toEqual(["Fe", "Cu"]);
  });
  it("AR 기준값을 바꾸면 형상 비율이 바뀐다", () => {
    expect(r.overall.shape).toMatchObject({ k: 3, n: 4 });         // P1 2.2, P2 1.1, P4 1.6, P6 1.8 (기준 1.5)
    expect(r.overall.shapeCompare).toMatchObject({ k: 1, n: 4 });  // 기준 2.0
    const curve = arSensitivity([r.overall], [1.5, 2.0]);
    expect(curve[0].all).toBeCloseTo(75);
    expect(curve[1].all).toBeCloseTo(25);
  });
  it("초록 빈칸 문장을 만든다", () => {
    const b = abstractBlanks(r, DEFAULT_CRITERIA);
    expect(b.shapeTop).toContain("음식점");
    expect(b.bothOverall).toBe("66.7%(2/3)");   // P1, P4 / 판정 가능 P1·P2·P4
    expect(b.shapeFrom).toBe("75.0%");
    expect(b.shapeTo).toBe("25.0%");
    expect(b.sentence).toContain("종횡비 기준값을 1.5에서 2.0");
  });
  it("데이터가 없으면 빈칸으로 남긴다", () => {
    const b = abstractBlanks(simulate([], DEFAULT_CRITERIA, s), DEFAULT_CRITERIA);
    expect(b.shapeTop).toBe("[ ]");
    expect(b.bothOverall).toBe("[ ]");
  });
});
