/* EDS 원소 조성표 → EdsRecord[] (long format)
   지원 형식
   1) long : 한 행 = 한 입자의 한 원소. 열 sample_id, particle_id, element_symbol, wt_percent, at_percent, detection_status ...
   2) wide : 한 행 = 한 입자. 원소별 열 이름에 기준을 붙인다: "Fe_wt", "Fe wt%", "wt% Fe", "Fe_at" ...
             기준이 붙지 않은 원소 열("Fe")은 행마다 basis 열(wt% 또는 at%)이 있어야 읽는다.
   wt%·at% 값이 없으면 만들어 내지 않는다(서로 환산하지 않음). */
import type { Basis, DetectionStatus, EdsRecord, QualityIssue, StatusSource } from "../types";
import { elementNameKo, normalizeElement } from "../elements";
import { isBlank, num, parseBool, parseStatusText, parseValueText, particleKey, str, type Row, type Table } from "./common";

export interface EdsParseSummary {
  format: "long" | "wide";
  hasWt: boolean;
  hasAt: boolean;
  hasStatusColumn: boolean;
  hasLod: boolean;
  hasLoq: boolean;
  scaledFromFraction: Basis[];
  particles: number;
  elements: string[];
}

export interface EdsParseResult {
  records: EdsRecord[];
  issues: QualityIssue[];
  summary: EdsParseSummary | null;
}

interface WideColumn {
  header: string;
  symbol: string;
  basis: Basis | "row";
}

const BASIS_WORD: Record<string, Basis> = { wt: "wt", weight: "wt", mass: "wt", at: "at", atomic: "at" };

export function detectWideColumns(headers: string[]): WideColumn[] {
  const out: WideColumn[] = [];
  for (const h of headers) {
    const t = h.trim();
    let m = t.match(/^([A-Za-z]{1,2})\s*[_\-\s(\[]*\s*(wt|at|weight|atomic|mass)\s*%?\s*[)\]]?$/i);
    if (m) {
      const sym = normalizeElement(m[1]);
      if (sym && sym.toLowerCase() === m[1].toLowerCase()) out.push({ header: h, symbol: sym, basis: BASIS_WORD[m[2].toLowerCase()] });
      continue;
    }
    m = t.match(/^(wt|at|weight|atomic|mass)\s*%?\s*[_\-\s(\[]*\s*([A-Za-z]{1,2})\s*[)\]]?$/i);
    if (m) {
      const sym = normalizeElement(m[2]);
      if (sym && sym.toLowerCase() === m[2].toLowerCase()) out.push({ header: h, symbol: sym, basis: BASIS_WORD[m[1].toLowerCase()] });
      continue;
    }
    // 대소문자까지 정확한 원소 기호 하나("Fe", "Si", "O")
    m = t.match(/^([A-Z][a-z]?)$/);
    if (m) {
      const sym = normalizeElement(m[1]);
      if (sym === m[1]) out.push({ header: h, symbol: sym, basis: "row" });
    }
  }
  return out;
}

function parseBasisText(v: unknown): Basis | null {
  if (isBlank(v)) return null;
  const t = String(v).toLowerCase().replace(/[\s%_.]/g, "");
  if (["wt", "weight", "mass", "중량", "질량", "w"].includes(t)) return "wt";
  if (["at", "atomic", "원자", "a"].includes(t)) return "at";
  return null;
}

interface CellResult {
  value: number | null;
  hint: { status: DetectionStatus; limit: number | null } | null;
}

function readCell(raw: unknown, ctx: { file: string; row: number; key: string; label: string; issues: QualityIssue[] }): CellResult {
  if (isBlank(raw)) return { value: null, hint: null };
  const hint = parseValueText(raw);
  if (hint) return { value: null, hint };
  const v = num(raw);
  if (v === null) return { value: null, hint: null };
  if (Number.isNaN(v)) {
    ctx.issues.push({ level: "warning", code: "EDS_BAD_NUMBER", file: ctx.file, row: ctx.row, particleKey: ctx.key, message: `${ctx.label} 값 "${String(raw)}"을 해석할 수 없어 결측으로 둡니다.` });
    return { value: null, hint: null };
  }
  if (v < 0 || v > 100) {
    ctx.issues.push({ level: "error", code: "EDS_OUT_OF_RANGE", file: ctx.file, row: ctx.row, particleKey: ctx.key, message: `${ctx.label} 값 ${v}은 0–100 범위를 벗어나 사용하지 않습니다.` });
    return { value: null, hint: null };
  }
  return { value: v, hint: null };
}

/**
 * 한 원소 값의 검출 상태 결정. 우선순위:
 * 명시된 detection_status → 값 칸의 문자(ND, <LOD) → 한계값 비교 → 값>0/=0 추정 → 결측
 * 검출한계·정량한계는 wt%와 같은 단위로 가정한다(at%만 있는 경우 비교하지 않음).
 */
export function determineStatus(input: {
  wt: CellResult;
  at: CellResult;
  explicit: DetectionStatus | null;
  lod: number | null;
  loq: number | null;
}): { status: DetectionStatus; source: StatusSource; lodFromText: number | null; conflict: string | null } {
  const { wt, at, explicit, lod, loq } = input;
  const hint = wt.hint ?? at.hint;
  const lodFromText = hint?.limit ?? null;
  const anyPositive = (wt.value ?? 0) > 0 || (at.value ?? 0) > 0;
  if (explicit) {
    let conflict: string | null = null;
    if ((explicit === "not_detected" || explicit === "below_lod") && anyPositive) {
      conflict = `상태가 '${explicit === "not_detected" ? "미검출" : "검출한계 미만"}'인데 양의 값이 있습니다. 상태를 우선하고 값은 정량 통계에서 제외합니다.`;
    } else if (explicit === "detected" && hint && hint.status !== "detected") {
      conflict = `상태가 '검출'인데 값 칸이 '${hint.status}'입니다. 상태를 우선합니다.`;
    }
    return { status: explicit, source: "explicit", lodFromText, conflict };
  }
  if (hint) return { status: hint.status, source: "value_text", lodFromText, conflict: null };
  if (wt.value == null && at.value == null) return { status: "missing", source: "inferred_value", lodFromText, conflict: null };
  if (wt.value != null && (lod != null || loq != null)) {
    if (lod != null && wt.value < lod) return { status: "below_lod", source: "limit_compare", lodFromText, conflict: null };
    if (loq != null && wt.value < loq) return { status: "below_loq", source: "limit_compare", lodFromText, conflict: null };
    if (wt.value > 0) return { status: "detected", source: "limit_compare", lodFromText, conflict: null };
  }
  if (anyPositive) return { status: "detected", source: "inferred_value", lodFromText, conflict: null };
  return { status: "not_detected", source: "inferred_value", lodFromText, conflict: null };
}

function isEdsLong(headers: string[]): boolean {
  return headers.includes("element_symbol") || headers.includes("element_name");
}

export function looksLikeEds(table: Table): boolean {
  if (isEdsLong(table.headers) && (table.headers.includes("wt_percent") || table.headers.includes("at_percent") || table.headers.includes("value") || table.headers.includes("detection_status"))) return true;
  return table.headers.includes("particle_id") && detectWideColumns(table.headers).length >= 2;
}

export function parseEdsTable(table: Table): EdsParseResult {
  const file = table.name;
  const issues: QualityIssue[] = [];
  const has = (c: string) => table.headers.includes(c);

  if (!has("particle_id")) {
    issues.push({ level: "error", code: "EDS_NO_PARTICLE_ID", file, message: "필수 열 particle_id가 없어 EDS 데이터를 불러오지 않았습니다." });
    return { records: [], issues, summary: null };
  }
  if (!has("sample_id")) {
    issues.push({ level: "warning", code: "EDS_NO_SAMPLE_ID", file, message: "sample_id 열이 없습니다. 모든 입자를 시료 '(미지정)'으로 처리합니다. 메타데이터의 sample_id와 다르면 연결되지 않습니다." });
  }

  const long = isEdsLong(table.headers);
  const statusCol = has("detection_status");
  const records: EdsRecord[] = [];
  const seen = new Map<string, number>();

  const push = (rec: Omit<EdsRecord, "sourceFile" | "sourceRow">, row: number) => {
    const dupKey = `${rec.sample_id}::${rec.particle_id}::${rec.element_symbol}`;
    if (seen.has(dupKey)) {
      issues.push({
        level: "error", code: "EDS_DUPLICATE", file, row, particleKey: particleKey(rec.sample_id, rec.particle_id),
        message: `같은 입자·원소가 중복됩니다: ${rec.sample_id} / ${rec.particle_id} / ${rec.element_symbol} (첫 행 ${seen.get(dupKey)}). 첫 번째 값만 사용합니다.`,
      });
      return;
    }
    seen.set(dupKey, row);
    records.push({ ...rec, sourceFile: file, sourceRow: row });
  };

  if (long) {
    const valueOnly = !has("wt_percent") && !has("at_percent") && has("value");
    if (valueOnly && !has("basis")) {
      issues.push({ level: "error", code: "EDS_BASIS_UNKNOWN", file, message: "value 열만 있고 basis(wt%/at%) 열이 없어 기준을 알 수 없습니다. 값을 불러오지 않았습니다." });
      return { records: [], issues, summary: null };
    }
    if (!has("wt_percent") && !has("at_percent") && !valueOnly && !statusCol) {
      issues.push({ level: "error", code: "EDS_NO_VALUES", file, message: "wt_percent·at_percent·detection_status 열이 모두 없어 조성을 읽을 수 없습니다." });
      return { records: [], issues, summary: null };
    }
    table.rows.forEach((r: Row, i) => {
      const row = i + 2;
      const pid = str(r.particle_id);
      if (!pid) {
        issues.push({ level: "error", code: "EDS_EMPTY_PARTICLE_ID", file, row, message: "particle_id가 비어 있어 이 행을 건너뜁니다." });
        return;
      }
      const sid = str(r.sample_id) ?? "(미지정)";
      const key = particleKey(sid, pid);
      const symRaw = r.element_symbol ?? r.element_name;
      const sym = normalizeElement(symRaw) ?? normalizeElement(r.element_name);
      if (!sym) {
        issues.push({ level: "error", code: "EDS_UNKNOWN_ELEMENT", file, row, particleKey: key, message: `원소 "${String(symRaw ?? "")}"를 인식할 수 없어 이 행을 건너뜁니다.` });
        return;
      }
      let rawWt = r.wt_percent, rawAt = r.at_percent;
      if (valueOnly) {
        const b = parseBasisText(r.basis);
        if (!b) {
          issues.push({ level: "error", code: "EDS_ROW_BASIS_UNKNOWN", file, row, particleKey: key, message: `basis "${String(r.basis ?? "")}"를 wt% 또는 at%로 인식할 수 없어 값을 쓰지 않습니다.` });
          rawWt = null; rawAt = null;
        } else if (b === "wt") rawWt = r.value;
        else rawAt = r.value;
      }
      const ctx = { file, row, key, issues };
      const wt = readCell(rawWt, { ...ctx, label: `${sym} wt%` });
      const at = readCell(rawAt, { ...ctx, label: `${sym} at%` });
      let explicit: DetectionStatus | null = null;
      if (statusCol && !isBlank(r.detection_status)) {
        explicit = parseStatusText(r.detection_status);
        if (!explicit) issues.push({ level: "warning", code: "EDS_BAD_STATUS", file, row, particleKey: key, message: `검출 상태 "${String(r.detection_status)}"를 인식할 수 없어 값으로 판단합니다.` });
      }
      const lodN = num(r.detection_limit), loqN = num(r.quantification_limit);
      const lod = lodN != null && !Number.isNaN(lodN) ? lodN : null;
      const loq = loqN != null && !Number.isNaN(loqN) ? loqN : null;
      const st = determineStatus({ wt, at, explicit, lod, loq });
      if (st.conflict) issues.push({ level: "warning", code: "EDS_STATUS_CONFLICT", file, row, particleKey: key, message: `${sym}: ${st.conflict}` });
      push({
        sample_id: sid, particle_id: pid, element_symbol: sym,
        element_name: str(r.element_name) ?? elementNameKo(sym),
        wt_percent: wt.value, at_percent: at.value,
        detection_status: st.status, status_source: st.source,
        detection_limit: lod ?? st.lodFromText, quantification_limit: loq,
        measurement_method: str(r.measurement_method),
        normalized: parseBool(r.normalized),
      }, row);
    });
  } else {
    const cols = detectWideColumns(table.headers);
    const rowBasisCols = cols.filter((c) => c.basis === "row");
    if (rowBasisCols.length && !has("basis")) {
      issues.push({
        level: "error", code: "EDS_WIDE_BASIS_UNKNOWN", file,
        message: `원소 열(${rowBasisCols.map((c) => c.header).join(", ")})에 wt/at 표시가 없고 basis 열도 없어 기준을 알 수 없습니다. 이 열들은 불러오지 않았습니다. 열 이름을 "Fe_wt", "Fe_at"처럼 바꾸거나 basis 열을 추가하세요.`,
      });
    }
    table.rows.forEach((r: Row, i) => {
      const row = i + 2;
      const pid = str(r.particle_id);
      if (!pid) {
        issues.push({ level: "error", code: "EDS_EMPTY_PARTICLE_ID", file, row, message: "particle_id가 비어 있어 이 행을 건너뜁니다." });
        return;
      }
      const sid = str(r.sample_id) ?? "(미지정)";
      const key = particleKey(sid, pid);
      const rowBasis = parseBasisText(r.basis);
      const byElement = new Map<string, { wt: unknown; at: unknown }>();
      for (const c of cols) {
        let b: Basis | null = c.basis === "row" ? rowBasis : c.basis;
        if (c.basis === "row" && !has("basis")) continue;
        if (!b) {
          if (!isBlank(r[c.header])) issues.push({ level: "error", code: "EDS_ROW_BASIS_UNKNOWN", file, row, particleKey: key, message: `basis 값을 인식할 수 없어 ${c.header} 값을 쓰지 않습니다.` });
          continue;
        }
        const cur = byElement.get(c.symbol) ?? { wt: null, at: null };
        if (b === "wt") cur.wt = r[c.header];
        else cur.at = r[c.header];
        byElement.set(c.symbol, cur);
      }
      const method = str(r.measurement_method);
      const normalized = parseBool(r.normalized);
      for (const [sym, raw] of byElement) {
        const ctx = { file, row, key, issues };
        const wt = readCell(raw.wt, { ...ctx, label: `${sym} wt%` });
        const at = readCell(raw.at, { ...ctx, label: `${sym} at%` });
        const st = determineStatus({ wt, at, explicit: null, lod: null, loq: null });
        push({
          sample_id: sid, particle_id: pid, element_symbol: sym, element_name: elementNameKo(sym),
          wt_percent: wt.value, at_percent: at.value,
          detection_status: st.status, status_source: st.source,
          detection_limit: st.lodFromText, quantification_limit: null,
          measurement_method: method, normalized,
        }, row);
      }
    });
  }

  // 0–1 분수로 기재된 파일 감지: 모든 입자의 합계가 1.5 이하이고 최댓값이 1 이하이면 ×100 환산
  const scaledFromFraction: Basis[] = [];
  for (const basis of ["wt", "at"] as Basis[]) {
    const field = basis === "wt" ? "wt_percent" : "at_percent";
    const sums = new Map<string, number>();
    let maxV = 0, nVals = 0;
    for (const rec of records) {
      const v = rec[field];
      if (v == null) continue;
      nVals++;
      maxV = Math.max(maxV, v);
      const k = particleKey(rec.sample_id, rec.particle_id);
      sums.set(k, (sums.get(k) ?? 0) + v);
    }
    if (nVals >= 2 && maxV <= 1 && [...sums.values()].every((s) => s > 0.5 && s <= 1.5)) {
      for (const rec of records) {
        if (rec[field] != null) rec[field] = rec[field]! * 100;
        if (basis === "wt") {
          if (rec.detection_limit != null) rec.detection_limit *= 100;
          if (rec.quantification_limit != null) rec.quantification_limit *= 100;
        }
      }
      scaledFromFraction.push(basis);
      issues.push({
        level: "warning", code: "EDS_FRACTION_SCALED", file,
        message: `${basis === "wt" ? "wt" : "at"} 값이 0–1 분수로 기재된 것으로 판단해(모든 입자 합계 ≈ 1) ×100 하여 %로 환산했습니다.${basis === "wt" ? " 검출·정량한계도 같은 배율로 환산했습니다." : ""} 원본 단위를 확인하세요.`,
      });
    }
  }

  const hasWt = records.some((r) => r.wt_percent != null);
  const hasAt = records.some((r) => r.at_percent != null);
  if (records.length && !hasWt) issues.push({ level: "warning", code: "EDS_NO_WT", file, message: "wt% 값이 없습니다. wt% 기준의 분류 규칙(입자 유형·발생원 후보)은 적용할 수 없습니다. at%에서 wt%를 환산해 만들지 않습니다." });
  if (records.length && !statusCol) {
    issues.push({ level: "info", code: "EDS_STATUS_INFERRED", file, message: "detection_status 열이 없어 값 > 0은 검출, 값 = 0은 미검출, 빈칸은 결측으로 처리했습니다(ND·<LOD 같은 문자 표기는 그대로 해석)." });
  }
  const hasLod = has("detection_limit") || records.some((r) => r.detection_limit != null);
  const hasLoq = has("quantification_limit");
  if (records.length && !hasLod && !hasLoq) {
    issues.push({ level: "info", code: "EDS_NO_LIMITS", file, message: "검출한계·정량한계 정보가 없습니다. 미량 원소의 검출 여부는 장비 검출한계를 확인해 해석해야 합니다." });
  }

  const particles = new Set(records.map((r) => particleKey(r.sample_id, r.particle_id)));
  return {
    records,
    issues,
    summary: {
      format: long ? "long" : "wide",
      hasWt, hasAt, hasStatusColumn: statusCol, hasLod, hasLoq,
      scaledFromFraction,
      particles: particles.size,
      elements: [...new Set(records.map((r) => r.element_symbol))],
    },
  };
}
