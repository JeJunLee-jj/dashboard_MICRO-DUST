import { describe, expect, it } from "vitest";
import { settings } from "./helpers";
import { parseCsvText } from "../src/lib/parse/tabular";
import { buildParticleFromPair, type PairInput } from "../src/lib/register";
import { EMPTY_DATASET, joinState } from "../src/lib/dataset";
import { matchSitePath } from "../src/lib/sites";
import { DEFAULT_SIM_CONFIG, missingIndicators, requiredN, simulate } from "../src/lib/sources";
import { scanPhenomFolder, averageSpots } from "../src/lib/phenomImport";

const csv = (rows: Array<[string, number]>) =>
  parseCsvText(["Element symbol,Weight concentration percentage", ...rows.map(([e, w]) => `${e},${w}`)].join("\n"), "q.csv");

function particle(id: string, location: string, feret: number, ar: number | null, eds: Array<[string, number]>) {
  const input: PairInput = {
    sample_id: "S", particle_id: id, location, date: null, sample_type: null, morphology: null, morphologyMethod: null, notes: null,
    image: null, pixelSizeUm: 0.03, edsName: `${id}.csv`, edsTable: csv(eds),
    measurement: { eqdUm: null, areaUm2: null, feretUm: feret, circularity: null, solidity: null, aspectRatio: ar, methodLabel: "test" },
  };
  return buildParticleFromPair(input);
}

function dataset(list: ReturnType<typeof particle>[]) {
  const s = settings();
  return { s, particles: joinState({ ...EMPTY_DATASET, origin: "user", meta: list.map((x) => x.meta), eds: list.flatMap((x) => x.eds) }, s).particles };
}

describe("발생원 판정 규칙", () => {
  const { s, particles } = dataset([
    particle("G1", "개찰구 (D구역)", 7, 1.2, [["O", 30], ["Fe", 60], ["Mn", 2], ["Si", 8]]),   // 철도 마모 + Mn
    particle("G2", "개찰구 (D구역)", 8, 1.3, [["O", 40], ["Fe", 3], ["Si", 57]]),               // 해당 없음
    particle("G3", "개찰구 (D구역)", 12, 1.3, [["Fe", 100]]),                                    // 크기 범위 밖
    particle("C1", "의류매장 (E-2)", 9, 3.4, [["C", 50], ["O", 30], ["Ti", 2], ["Si", 18]]),      // 섬유 + Ti
    particle("C2", "의류매장 (E-2)", 9, null, [["C", 50], ["O", 30], ["Si", 20]]),               // 종횡비 없음 → 판정 불가
    particle("K1", "카페·간편식 (E-43)", 6, 1.6, [["C", 40], ["O", 30], ["K", 5], ["P", 3], ["Ca", 22]]), // 카페
    particle("F1", "음식점 (B-28)", 6, 1.1, [["C", 60], ["O", 20], ["Ca", 10], ["S", 5], ["Na", 3], ["Cl", 2]]), // Ca-S, C-rich 구형, Na-Cl
    particle("M1", "화장품 (F-1)", 7, 1.5, [["O", 40], ["Mg", 15], ["Si", 30], ["Zn", 2], ["C", 13]]), // 탈크 + Zn
  ]);
  const r = simulate(particles, DEFAULT_SIM_CONFIG, s);
  const site = (id: string) => r.sites.find((x) => x.site.id === id)!;

  it("철도 마모: Fe ≥ 10 wt%, 부가 지표 Mn·Cu", () => {
    expect(site("gate").rules.rail).toMatchObject({ k: 1, n: 2 });
    expect(site("gate").rules.rail.sub).toMatchObject({ k: 1, n: 1 });
    expect(site("gate").total).toBe(3);
  });
  it("섬유: 종횡비와 C+O를 동시에 — 종횡비가 없으면 분모에서 뺀다", () => {
    expect(site("clothing").rules.fiber).toMatchObject({ k: 1, n: 1 });
    expect(site("clothing").rules.fiber.sub).toMatchObject({ k: 1, n: 1 });
  });
  it("조리·카페·화장품 규칙", () => {
    expect(site("food").rules.cas.k).toBe(1);
    expect(site("food").rules.csphere.k).toBe(1);
    expect(site("food").rules.nacl.k).toBe(1);
    expect(site("cafe").rules.cafe.k).toBe(1);
    expect(site("cosmetic").rules.talc.k).toBe(1);
    expect(site("cosmetic").rules.tizn.k).toBe(1);
  });
  it("기준값을 바꾸면 판정이 바뀐다", () => {
    const r2 = simulate(particles, { ...DEFAULT_SIM_CONFIG, thresholds: { ...DEFAULT_SIM_CONFIG.thresholds, feMin: 70 } }, s);
    expect(r2.sites.find((x) => x.site.id === "gate")!.rules.rail.k).toBe(0);
  });
  it("한 번도 검출되지 않은 지표 원소를 알려준다", () => {
    const miss = missingIndicators(particles).map((m) => m.el);
    expect(miss).toContain("Cu");
    expect(miss).toContain("Ba");
    expect(miss).not.toContain("P");
  });
  it("필요 입자 수", () => {
    expect(requiredN(23.3)).toBe(31);
    expect(requiredN(50)).toBe(43);
  });
});

describe("Phenom 원본 폴더 읽기", () => {
  const f = (path: string, text = "") => ({ path, file: new File([text], path.split("/").pop()!) });
  const q = "Atomic number,Element symbol,Element name,Atomic concentration percentage,Weight concentration percentage,Energy level\n26,Fe,Iron,0.2,0.6,10000\n8,O,Oxygen,0.8,0.4,10000\n";
  const q2 = "Atomic number,Element symbol,Element name,Atomic concentration percentage,Weight concentration percentage,Energy level\n8,O,Oxygen,1,1,10000\n";
  const files = [
    f("261022/261021_D/SEM/261021_Local 1.tiff"),
    f("261022/261021_D/SEM/261021_Local 2.tiff"),
    f("261022/261021_D/EDS/261021_EDS_D/261021_D_EDS.elid"),
    f("261022/261021_D/EDS/261021_EDS_D/export/Local 1.tiff"),
    f("261022/261021_D/EDS/261021_EDS_D/export/Local 1_analysis_1_spot/quantification.csv", q),
    f("261022/261021_D/EDS/261021_EDS_D/export/Local 1_analysis_1_spot/spectrum.tiff"),
    f("261022/261021_D/EDS/261021_EDS_D/export/Local 1_analysis_2_spot/quantification.csv", q2),
    f("261022/261021_D/EDS/261021_EDS_D/export/Local 1_analysis_4_map/quantification.csv", q2),
    f("261022/261021_D/EDS/261021_EDS_D/export/Local 1_analysis_4_map/Local 1_analysis_4_map_Iron_(480x300 points).tiff"),
    f("261022/261022_F-1/SEM/261022_Local7.tiff"),
    f("261022/261022_F-1/EDS/261022_EDS_F-1/export/Image 7_analysis_1_spot/quantification.csv", q),
  ];
  const scan = scanPhenomFolder(files);
  it("SEM 폴더 사진만 입자 사진으로, 번호로 짝짓는다", () => {
    expect(scan.particles.map((p) => `${p.siteFolder}/${p.name}`)).toEqual(["261021_D/Local 1", "261022_F-1/Image 7"]);
    expect(scan.particles[0].photo?.path).toBe("261022/261021_D/SEM/261021_Local 1.tiff");
    expect(scan.particles[1].photo?.path).toBe("261022/261022_F-1/SEM/261022_Local7.tiff");
    expect(scan.particles[0].spots).toHaveLength(2);
    expect(scan.particles[0].maps).toHaveLength(1);
    expect(scan.unusedPhotos.map((p) => p.path)).toEqual(["261022/261021_D/SEM/261021_Local 2.tiff"]);
    expect(scan.particles[0].site.id).toBe("gate");
    expect(scan.particles[1].site.id).toBe("cosmetic");
  });
  it("스폿 평균(없는 원소는 0으로)", async () => {
    const { spotWt, table } = await averageSpots(scan.particles[0].spots, "t");
    expect(spotWt.Fe).toEqual([60, 0]);
    expect(spotWt.O).toEqual([40, 100]);
    expect(table.rows).toHaveLength(2);
  });
  it("폴더 이름 D, EDS는 개찰구로 헷갈리지 않는다", () => {
    expect(matchSitePath("261021_D/x")?.id).toBe("gate");
    expect(matchSitePath("261021_EDS_E-43/x")?.id).toBe("cafe");
  });
});
