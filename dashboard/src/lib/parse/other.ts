/* 위해성 평가 규칙표 · PM 측정값 표 */
import type { HazardRule, PmRecord, QualityIssue } from "../types";
import { normalizeElement } from "../elements";
import { num, parseDate, str, type Table } from "./common";

export function looksLikeHazardRules(t: Table): boolean {
  return t.headers.includes("element_symbol") && t.headers.includes("assessment_category");
}
export function looksLikePm(t: Table): boolean {
  return t.headers.includes("pm25") || t.headers.includes("pm10");
}

export function parseHazardRulesTable(table: Table): { rules: HazardRule[]; issues: QualityIssue[] } {
  const issues: QualityIssue[] = [];
  const rules: HazardRule[] = [];
  table.rows.forEach((r, i) => {
    const row = i + 2;
    const sym = normalizeElement(r.element_symbol);
    if (!sym) {
      issues.push({ level: "error", code: "RULE_UNKNOWN_ELEMENT", file: table.name, row, message: `원소 "${String(r.element_symbol ?? "")}"를 인식할 수 없습니다.` });
      return;
    }
    const cat = str(r.assessment_category);
    if (!cat) {
      issues.push({ level: "warning", code: "RULE_NO_CATEGORY", file: table.name, row, message: `${sym}: assessment_category가 비어 있습니다.` });
    }
    const ref = str(r.reference_name);
    if (cat && !ref) {
      issues.push({ level: "warning", code: "RULE_NO_REFERENCE", file: table.name, row, message: `${sym}: 평가 범주에 근거(reference_name)가 없습니다. 출처 없는 분류는 '근거 미입력'으로 표시됩니다.` });
    }
    const year = num(r.reference_year);
    rules.push({
      element_symbol: sym,
      assessment_category: cat ?? "평가 대상(범주 미입력)",
      reference_name: ref,
      reference_year: year != null && !Number.isNaN(year) ? year : null,
      reference_url: str(r.reference_url),
      applicable_condition: str(r.applicable_condition),
      classification_note: str(r.classification_note),
    });
  });
  return { rules, issues };
}

export function parsePmTable(table: Table): { pm: PmRecord[]; issues: QualityIssue[] } {
  const issues: QualityIssue[] = [];
  const pm: PmRecord[] = [];
  table.rows.forEach((r, i) => {
    const row = i + 2;
    const v25 = num(r.pm25), v10 = num(r.pm10);
    const pm25 = v25 != null && !Number.isNaN(v25) ? v25 : null;
    const pm10 = v10 != null && !Number.isNaN(v10) ? v10 : null;
    if ((v25 != null && Number.isNaN(v25)) || (v10 != null && Number.isNaN(v10))) {
      issues.push({ level: "warning", code: "PM_BAD_NUMBER", file: table.name, row, message: "PM 값을 숫자로 읽을 수 없는 칸이 있습니다." });
    }
    const unit = str(r.basis) ?? str(r.unit);
    if ((pm25 != null || pm10 != null) && !unit) {
      issues.push({ level: "warning", code: "PM_NO_UNIT", file: table.name, row, message: "PM 측정값의 단위(unit)가 없습니다. 값은 표시하지만 단위 미상으로 표기합니다." });
    }
    const date = parseDate(r.collection_date);
    pm.push({
      sample_id: str(r.sample_id),
      collection_location: str(r.collection_location),
      collection_date: date ?? null,
      pm25, pm10, unit,
      method: str(r.measurement_method),
      source: str(r.source),
      sourceFile: table.name,
      sourceRow: row,
    });
  });
  return { pm, issues };
}
