import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { normalizeElement } from "../src/lib/elements";
import { canonicalHeader, parseValueText, parseDate, num } from "../src/lib/parse/common";
import { decodeText, parseCsvText } from "../src/lib/parse/tabular";
import { parseEdsTable, determineStatus } from "../src/lib/parse/eds";
import { parseMetadataTable, micronsPerPixel } from "../src/lib/parse/metadata";
import { loadTableFile, classifyTable } from "../src/lib/parse/loader";
import { normalizeMorphology } from "../src/lib/morphology";
import { bytes, FIX } from "./helpers";

describe("원소 기호·이름 표준화", () => {
  it.each([
    ["Fe", "Fe"], ["FE", "Fe"], ["fe", "Fe"], ["Fe K", "Fe"], ["Fe-Ka", "Fe"], ["FeKa", "Fe"], ["Iron", "Fe"], ["철", "Fe"],
    ["Fe (철)", "Fe"], ["C K", "C"], ["CK", "C"], ["O", "O"], ["Aluminum", "Al"], ["Pb M", "Pb"], ["Mn", "Mn"], ["Co", "Co"],
  ])("%s → %s", (raw, sym) => expect(normalizeElement(raw)).toBe(sym));
  it("인식 불가 표기는 null", () => {
    expect(normalizeElement("Xx")).toBeNull();
    expect(normalizeElement("")).toBeNull();
    expect(normalizeElement("Total")).toBeNull();
  });
});

describe("열 이름·값 해석", () => {
  it("wt%·at% 열 이름을 구분해 표준화", () => {
    expect(canonicalHeader("Weight %")).toBe("wt_percent");
    expect(canonicalHeader("Weight Concentration Percentage")).toBe("wt_percent");
    expect(canonicalHeader("Atomic concentration percentage")).toBe("at_percent");
    expect(canonicalHeader("At%")).toBe("at_percent");
    expect(canonicalHeader("Element symbol")).toBe("element_symbol");
    expect(canonicalHeader("입자 ID")).toBe("particle_id");
  });
  it("미검출·검출한계 미만·결측 표기를 구분", () => {
    expect(parseValueText("ND")?.status).toBe("not_detected");
    expect(parseValueText("<LOD")?.status).toBe("below_lod");
    expect(parseValueText("<LOQ")?.status).toBe("below_loq");
    expect(parseValueText("<0.1")).toEqual({ status: "below_lod", limit: 0.1 });
    expect(parseValueText("N/A")?.status).toBe("missing");
    expect(parseValueText("12.3")).toBeNull();
  });
  it("숫자·날짜", () => {
    expect(num("5,000x")).toBe(5000);
    expect(num("x10000")).toBe(10000);
    expect(Number.isNaN(num("abc"))).toBe(true);
    expect(num("")).toBeNull();
    expect(parseDate("2026/3/5")).toBe("2026-03-05");
    expect(parseDate("2026.03.05")).toBe("2026-03-05");
    expect(parseDate("어제")).toBeUndefined();
  });
  it("형상 분류 표기", () => {
    expect(normalizeMorphology("구형 또는 준구형")).toBe("spherical");
    expect(normalizeMorphology("각진 파편형")).toBe("angular");
    expect(normalizeMorphology("다공성 또는 불규칙형")).toBe("irregular");
    expect(normalizeMorphology("형상 판별 불가")).toBe("undetermined");
    expect(normalizeMorphology("")).toBeNull();
    expect(normalizeMorphology("별모양")).toBeUndefined();
  });
});

describe("검출 상태 결정", () => {
  const cell = (v: number | null) => ({ value: v, hint: null });
  it("명시 상태가 값보다 우선하며 불일치를 알린다", () => {
    const r = determineStatus({ wt: cell(2), at: cell(null), explicit: "not_detected", lod: null, loq: null });
    expect(r.status).toBe("not_detected");
    expect(r.conflict).toBeTruthy();
  });
  it("한계값 비교", () => {
    expect(determineStatus({ wt: cell(0.05), at: cell(null), explicit: null, lod: 0.1, loq: 0.3 }).status).toBe("below_lod");
    expect(determineStatus({ wt: cell(0.2), at: cell(null), explicit: null, lod: 0.1, loq: 0.3 }).status).toBe("below_loq");
    expect(determineStatus({ wt: cell(0.5), at: cell(null), explicit: null, lod: 0.1, loq: 0.3 }).status).toBe("detected");
  });
  it("결측(빈칸)과 미검출(0)을 구분", () => {
    expect(determineStatus({ wt: cell(null), at: cell(null), explicit: null, lod: null, loq: null }).status).toBe("missing");
    expect(determineStatus({ wt: cell(0), at: cell(null), explicit: null, lod: null, loq: null }).status).toBe("not_detected");
  });
});

describe("메타데이터 파싱", () => {
  const table = parseCsvText(decodeText(bytes(join(FIX, "test_metadata.csv"))).text, "test_metadata.csv");
  const { meta, issues } = parseMetadataTable(table);
  it("중복 입자 ID를 탐지하고 첫 행만 쓴다", () => {
    expect(issues.some((i) => i.code === "META_DUPLICATE_ID")).toBe(true);
    expect(meta.filter((m) => m.sample_id === "T1" && m.particle_id === "P1")).toHaveLength(1);
    expect(meta.find((m) => m.particle_id === "P1" && m.sample_id === "T1")!.image_filename).toBe("P1.png");
  });
  it("같은 particle_id라도 시료가 다르면 다른 입자", () => {
    expect(meta.filter((m) => m.particle_id === "P1")).toHaveLength(2);
  });
  it("스케일 보정은 값·단위·픽셀 길이가 모두 있을 때만", () => {
    const p1 = meta.find((m) => m.sample_id === "T1" && m.particle_id === "P1")!;
    const p2 = meta.find((m) => m.particle_id === "P2")!;
    const p4 = meta.find((m) => m.particle_id === "P4")!;
    expect(micronsPerPixel(p1)).toBeCloseTo(0.02);
    expect(micronsPerPixel(p2)).toBeNull(); // scale_bar_px 없음
    expect(micronsPerPixel(p4)).toBeCloseTo(0.01); // 500 nm / 50 px
    expect(p4.magnification).toBe(5000);
    expect(p4.collection_date).toBe("2026-01-02");
  });
  it("측정값이 없는 크기는 null로 둔다", () => {
    expect(meta.every((m) => m.equivalent_diameter === null && m.projected_area === null)).toBe(true);
  });
  it("형상 미입력은 null(미분류), 판별 불가는 별도 분류", () => {
    expect(meta.find((m) => m.particle_id === "P3")!.morphology_class).toBeNull();
    expect(meta.find((m) => m.particle_id === "P5")!.morphology_class).toBe("undetermined");
  });
});

describe("EDS 파싱", () => {
  const res = loadTableFile(bytes(join(FIX, "test_eds_long.csv")), "test_eds_long.csv", "user");
  it("긴 형식 판별과 중복 탐지", () => {
    expect(res.files[0].kind).toBe("eds");
    expect(res.issues.some((i) => i.code === "EDS_DUPLICATE")).toBe(true);
    const o = res.eds.filter((r) => r.sample_id === "T9" && r.element_symbol === "O");
    expect(o).toHaveLength(1);
    expect(o[0].wt_percent).toBe(50);
  });
  it("wt%와 at%를 따로 저장하고 서로 채우지 않는다", () => {
    const p4fe = res.eds.find((r) => r.particle_id === "P4" && r.element_symbol === "Fe")!;
    expect(p4fe.wt_percent).toBeNull();
    expect(p4fe.at_percent).toBe(20);
    const t2cu = res.eds.find((r) => r.sample_id === "T2" && r.element_symbol === "Cu")!;
    expect(t2cu.at_percent).toBeNull();
  });
  it("값 칸 ND는 미검출, 빈칸은 결측", () => {
    const pbP1 = res.eds.find((r) => r.particle_id === "P1" && r.sample_id === "T1" && r.element_symbol === "Pb")!;
    const pbP2 = res.eds.find((r) => r.particle_id === "P2" && r.element_symbol === "Pb")!;
    expect(pbP1.detection_status).toBe("not_detected");
    expect(pbP1.status_source).toBe("value_text");
    expect(pbP2.detection_status).toBe("missing");
  });
  it("상태 열이 비면 값으로 추정하고 출처를 기록", () => {
    const zn = res.eds.find((r) => r.element_symbol === "Zn")!;
    expect(zn.detection_status).toBe("detected");
    expect(zn.status_source).toBe("inferred_value");
  });

  it("넓은 형식: 기준 표시 없는 원소 열은 basis 열 없이는 읽지 않는다", () => {
    const w = loadTableFile(bytes(join(FIX, "test_eds_wide.csv")), "test_eds_wide.csv", "user");
    expect(w.files[0].kind).toBe("eds");
    expect(w.issues.some((i) => i.code === "EDS_WIDE_BASIS_UNKNOWN")).toBe(true);
    expect(w.eds.some((r) => r.element_symbol === "Si")).toBe(false);
  });
  it("넓은 형식: 0–1 분수 wt 값은 ×100 환산하고 경고, at은 조건 불충족 시 그대로", () => {
    const w = loadTableFile(bytes(join(FIX, "test_eds_wide.csv")), "test_eds_wide.csv", "user");
    expect(w.issues.some((i) => i.code === "EDS_FRACTION_SCALED")).toBe(true);
    const fe = w.eds.find((r) => r.particle_id === "A1" && r.element_symbol === "Fe")!;
    expect(fe.wt_percent).toBeCloseTo(60);
    expect(fe.at_percent).toBeCloseTo(0.33);
    const pb = w.eds.find((r) => r.particle_id === "A1" && r.element_symbol === "Pb")!;
    expect(pb.detection_status).toBe("not_detected");
    const pb2 = w.eds.find((r) => r.particle_id === "A2" && r.element_symbol === "Pb")!;
    expect(pb2.detection_status).toBe("missing");
  });
  it("값만 있고 기준(basis)이 없는 긴 형식은 거부", () => {
    const t = parseCsvText("sample_id,particle_id,element_symbol,value\nS,P,Fe,50\n", "x.csv");
    const r = parseEdsTable(t);
    expect(r.records).toHaveLength(0);
    expect(r.issues[0].code).toBe("EDS_BASIS_UNKNOWN");
  });
  it("범위를 벗어난 값과 알 수 없는 원소는 쓰지 않는다", () => {
    const t = parseCsvText("sample_id,particle_id,element_symbol,wt_percent\nS,P,Fe,150\nS,P,Zz,3\nS,P,O,-1\n", "x.csv");
    const r = parseEdsTable(t);
    expect(r.records.find((x) => x.element_symbol === "Fe")!.wt_percent).toBeNull();
    expect(r.records.find((x) => x.element_symbol === "Fe")!.detection_status).toBe("missing");
    expect(r.issues.filter((i) => i.code === "EDS_OUT_OF_RANGE")).toHaveLength(2);
    expect(r.issues.some((i) => i.code === "EDS_UNKNOWN_ELEMENT")).toBe(true);
  });
});

describe("파일 판별과 인코딩", () => {
  it("EUC-KR(CP949) CSV도 읽는다", () => {
    // "시료,입자\nS1,P1" 를 EUC-KR로 인코딩한 바이트
    const euc = new Uint8Array([0xbd, 0xc3, 0xb7, 0xe1, 0x2c, 0xc0, 0xd4, 0xc0, 0xda, 0x0a, 0x53, 0x31, 0x2c, 0x50, 0x31]);
    const d = decodeText(euc);
    expect(d.encoding).toContain("EUC-KR");
    expect(d.text.startsWith("시료,입자")).toBe(true);
  });
  it("열 구성으로 표 종류를 판별", () => {
    expect(classifyTable(parseCsvText("sample_id,particle_id,morphology_class\nS,P,구형", "m"))).toBe("metadata");
    expect(classifyTable(parseCsvText("element_symbol,assessment_category\nPb,x", "r"))).toBe("hazard_rules");
    expect(classifyTable(parseCsvText("sample_id,pm25,pm10\nS,1,2", "p"))).toBe("pm");
    expect(classifyTable(parseCsvText("a,b\n1,2", "u"))).toBe("unknown");
  });
  it("인식할 수 없는 표는 오류로 알린다", () => {
    const r = loadTableFile(new TextEncoder().encode("a,b\n1,2\n"), "u.csv", "user");
    expect(r.issues.some((i) => i.code === "FILE_UNRECOGNIZED" && i.level === "error")).toBe(true);
  });
});
