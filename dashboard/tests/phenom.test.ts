/* 사용자 제공 실측 파일(Phenom SEM TIFF 메타데이터, Phenom EDS 정량 CSV)로 입자 단위 등록을 검증한다.
   fixtures/phenom_* 는 실제 측정 파일에서 가져온 것이다(가상 데이터 아님). */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { FIX, bytes, settings } from "./helpers";
import { parsePhenomXml, localDateTime, tagToString } from "../src/lib/image/instrument";
import { readTables } from "../src/lib/parse/tabular";
import { buildParticleFromPair, looksLikeSingleParticleEds, nextParticleId } from "../src/lib/register";
import { joinDataset } from "../src/lib/join";
import { particleTargetResult } from "../src/lib/hazard";
import { classifyParticleType, DEFAULT_CLASSIFICATION_RULES } from "../src/lib/rules";
import { measureFromGray, DEFAULT_SEGMENT } from "../src/lib/image/measure";
import type { ImageAsset } from "../src/lib/types";

const xml = readFileSync(join(FIX, "phenom_metadata.xml"), "utf8");
const inst = parsePhenomXml(xml, 1920)!;
const image: ImageAsset = { filename: "261008_Local1 (2).tiff", url: "blob:x", width: 1920, height: 1275, origin: "user", note: null, synthetic: false, instrument: inst };
const edsTable = readTables(bytes(join(FIX, "phenom_quantification.csv")), "quantification (1).csv").tables[0];

describe("Phenom TIFF 메타데이터", () => {
  it("픽셀 크기·배율·시야폭·정보바·촬영 조건을 읽는다", () => {
    expect(inst.pixelWidthUm).toBeCloseTo(0.0134896, 7);
    expect(inst.fieldWidthUm).toBeCloseTo(25.9, 1);           // 정보바 표시 FW 25.9 µm
    expect(inst.magnification).toBe(20000);                    // 정보바 표시 20 000×
    expect(inst.databarHeightPx).toBe(75);
    expect(inst.highVoltageKv).toBe(10);
    expect(inst.workingDistanceMm).toBeCloseTo(7.66387, 4);
    expect(inst.detector).toBe("SED");
    expect(inst.label).toBe("261008_Local");
    expect(inst.instrument).toContain("Phenom");
    expect(inst.acquiredAtUtc).toBe("2026-10-08T09:28:13Z");
  });
  it("촬영 시각(UTC)을 지역 시각으로 바꾼다", () => {
    const d = new Date("2026-10-08T09:28:13Z");
    const l = localDateTime(inst.acquiredAtUtc)!;
    expect(l.time).toBe(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
  });
  it("Phenom 형식이 아니면 null, 태그 값 형식을 가리지 않고 문자열로", () => {
    expect(parsePhenomXml("<other/>", 100)).toBeNull();
    expect(tagToString(["<a>"])).toBe("<a>");
    expect(tagToString(new TextEncoder().encode("<b>"))).toBe("<b>");
  });
});

describe("Phenom EDS 정량 CSV → 입자 1개", () => {
  it("ID 열 없는 장비 내보내기 파일을 한 입자 EDS로 인식", () => {
    expect(looksLikeSingleParticleEds(edsTable)).toBe(true);
    expect(edsTable.headers).toContain("wt_percent");
    expect(edsTable.headers).toContain("at_percent");
  });

  const res = buildParticleFromPair({
    sample_id: "261008_Local", particle_id: "P001", location: "천안아산역", date: "2026-10-08", sample_type: "측정",
    morphology: null, morphologyMethod: null, notes: null, image, pixelSizeUm: inst.pixelWidthUm,
    edsName: "quantification (1).csv", edsTable, measurement: null,
  });

  it("0–1 분수를 %로 환산하고 wt%·at%를 따로 저장", () => {
    const wt = Object.fromEntries(res.eds.map((r) => [r.element_symbol, r.wt_percent]));
    const at = Object.fromEntries(res.eds.map((r) => [r.element_symbol, r.at_percent]));
    expect(Object.keys(wt).sort()).toEqual(["C", "Ca", "Fe", "O", "Si"]);
    expect(wt.C).toBeCloseTo(20.0799, 3);
    expect(wt.O).toBeCloseTo(44.7552, 3);
    expect(wt.Si).toBeCloseTo(1.5984, 3);
    expect(wt.Ca).toBeCloseTo(30.7692, 3);
    expect(wt.Fe).toBeCloseTo(2.7972, 3);
    expect(at.Ca).toBeCloseTo(14.366, 3);
    expect(res.eds.every((r) => r.detection_status === "detected")).toBe(true);
    expect(res.eds.every((r) => r.normalized === true)).toBe(true);
    expect(res.issues.find((i) => i.code === "EDS_FRACTION_SCALED")?.level).toBe("info");
  });
  it("등록 화면에서 입력한 ID·장비 조건이 메타데이터에 들어간다", () => {
    expect(res.meta).toMatchObject({ sample_id: "261008_Local", particle_id: "P001", magnification: 20000, accelerating_voltage_kv: 10, detector: "SED", image_filename: "261008_Local1 (2).tiff" });
    expect(res.meta.pixel_size_um).toBeCloseTo(0.0134896, 7);
    expect(res.meta.equivalent_diameter).toBeNull(); // 측정하지 않았으면 크기 없음
    expect(res.meta.analysis_conditions).toContain("10 kV");
  });
  it("결합·분석: Fe 검출 → 대상 원소 검출, 파일에 없는 Pb 등은 설정에 따라 미검출", () => {
    const s = settings();
    const { particles } = joinDataset({ origin: "user", meta: [res.meta], eds: res.eds, images: [image], overrides: {}, settings: s });
    const p = particles[0];
    expect(p.image?.filename).toBe(image.filename);
    expect(p.umPerPx).toBeCloseTo(0.0134896, 7);
    expect(p.wtSum).toBeCloseTo(100, 3);
    const t = particleTargetResult(p, s);
    expect(t.status).toBe("positive");
    expect(t.detected).toEqual(["Fe"]);
    // 금속기준(C·O 제외) 재정규화: Ca 30.77/(1.60+30.77+2.80) ≈ 87.5 wt% → Ca-rich
    expect(classifyParticleType(p, s, DEFAULT_CLASSIFICATION_RULES).label).toBe("Ca-rich");
  });
  it("EDS 없이 등록하면 경고", () => {
    const r = buildParticleFromPair({ sample_id: "S", particle_id: "P", location: null, date: null, sample_type: null, morphology: null, morphologyMethod: null, notes: null, image: null, pixelSizeUm: null, edsName: null, edsTable: null, measurement: null });
    expect(r.issues.some((i) => i.code === "PAIR_NO_EDS")).toBe(true);
    expect(r.eds).toEqual([]);
  });
  it("다음 입자 ID 제안", () => {
    expect(nextParticleId(new Set(["P001", "P002"]))).toBe("P003");
    expect(nextParticleId(new Set())).toBe("P001");
  });
});

describe("실측 이미지 형상 측정(단일 입자 분할)", () => {
  const raw = gunzipSync(readFileSync(join(FIX, "phenom_particle_roi_600x600.gray.gz")));
  const gray = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) gray[i] = raw[i];
  // 600×600 영역은 원본에서 잘라낸 것이라 정보바가 없다 → cropBottomPx 0
  const m = measureFromGray(gray, 600, 600, inst.pixelWidthUm, { ...DEFAULT_SEGMENT, cropBottomPx: 0 });
  it("입자 하나를 찾고 크기를 µm로 계산한다", () => {
    expect(m.touchesBorder).toBe(false);
    // 정보바 눈금(8 µm)과 비교해 입자 최대 길이는 6 µm 안팎 — 윤곽 확인으로 정한 기준 범위
    expect(m.feretUm!).toBeGreaterThan(5);
    expect(m.feretUm!).toBeLessThan(6.5);
    expect(m.eqdUm!).toBeGreaterThan(4);
    expect(m.eqdUm!).toBeLessThan(5);
  });
  it("그늘진 면을 잘라내지 않아 고형도가 높다(기존 전역 Otsu 0.71 대비)", () => {
    expect(m.props.sol).toBeGreaterThan(0.85);
    expect(m.methodLabel).toContain("Otsu×0.7");
  });
  it("픽셀 크기가 없으면 µm 값을 만들지 않는다", () => {
    const m2 = measureFromGray(gray, 600, 600, null, { ...DEFAULT_SEGMENT, cropBottomPx: 0 });
    expect(m2.eqdUm).toBeNull();
    expect(m2.feretUm).toBeNull();
    expect(m2.eqdPx).toBeGreaterThan(0);
  });
});

describe("등록 데이터 내보내기 → 다시 불러오기", () => {
  it("입자 메타데이터 CSV가 일괄 업로드 형식으로 그대로 돌아온다", async () => {
    const { metadataRows, toCsv } = await import("../src/lib/exports");
    const { loadTableFile } = await import("../src/lib/parse/loader");
    const r = buildParticleFromPair({
      sample_id: "261008_Local", particle_id: "P001", location: "천안아산역", date: "2026-10-08", sample_type: "측정",
      morphology: "angular", morphologyMethod: "사용자 판정", notes: null, image, pixelSizeUm: inst.pixelWidthUm,
      edsName: "q.csv", edsTable, measurement: { eqdUm: 4.52, areaUm2: 16.05, feretUm: 5.68, circularity: 0.535, solidity: 0.9, aspectRatio: 1.29, methodLabel: "이미지 분할 측정" },
    });
    const csv = toCsv(metadataRows([r.meta]), ["round trip"]);
    const back = loadTableFile(new TextEncoder().encode(csv), "particle_metadata.csv", "user");
    expect(back.files[0].kind).toBe("metadata");
    const m = back.meta[0];
    expect(m).toMatchObject({ sample_id: "261008_Local", particle_id: "P001", morphology_class: "angular", magnification: 20000, detector: "SED", accelerating_voltage_kv: 10, equivalent_diameter: 4.52, feret_diameter: 5.68, circularity: 0.535 });
    expect(m.pixel_size_um).toBeCloseTo(0.0134896, 7);
    expect(back.issues.filter((i) => i.level !== "info")).toEqual([]);
  });
});
