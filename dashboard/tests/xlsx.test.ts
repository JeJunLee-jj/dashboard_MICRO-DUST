import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { loadTableFile } from "../src/lib/parse/loader";

/** TEST 전용 가상 데이터로 만든 XLSX(시트 2개: 메타데이터, EDS) */
function makeWorkbook(): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["# TEST 전용 가상 데이터"],
    ["시료", "입자 ID", "채취일", "형상"],
    ["X1", "P1", new Date(2026, 2, 5), "응집체"],
  ]), "metadata");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["sample_id", "particle_id", "Element", "Weight %", "Atomic %"],
    ["X1", "P1", "Fe K", 70, 40],
    ["X1", "P1", "O K", 30, 60],
  ]), "eds");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

describe("XLSX 업로드", () => {
  const res = loadTableFile(makeWorkbook(), "test.xlsx", "user");
  it("시트마다 종류를 판별하고 한글·별칭 열 이름을 표준화한다", () => {
    expect(res.files.map((f) => f.kind)).toEqual(["metadata", "eds"]);
    expect(res.meta[0]).toMatchObject({ sample_id: "X1", particle_id: "P1", collection_date: "2026-03-05", morphology_class: "agglomerate" });
  });
  it("Fe K 같은 표기와 Weight %/Atomic % 열을 구분해 읽는다", () => {
    const fe = res.eds.find((r) => r.element_symbol === "Fe")!;
    expect(fe.wt_percent).toBe(70);
    expect(fe.at_percent).toBe(40);
  });
});
