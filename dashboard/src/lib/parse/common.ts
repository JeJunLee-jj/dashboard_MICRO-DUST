/* 표 형식 데이터의 공통 처리: 열 이름 표준화, 숫자·날짜·검출 상태 해석 */
import type { DetectionStatus } from "../types";

export type Row = Record<string, unknown>;

export interface Table {
  /** 시트 이름이나 파일 이름 */
  name: string;
  headers: string[];
  rows: Row[];
}

/** 원본 열 이름 → 표준 열 이름. 표준 열 이름 그대로 쓰는 것을 권장한다. */
const HEADER_ALIASES: Record<string, string[]> = {
  sample_id: ["sample_id", "sample", "sampleid", "sample_no", "sample_name", "시료", "시료id", "시료_id", "시료번호", "시료명"],
  particle_id: ["particle_id", "particle", "particleid", "particle_no", "particle_number", "spot", "spot_id", "point", "point_id", "입자", "입자id", "입자_id", "입자번호"],
  collection_date: ["collection_date", "date", "sampling_date", "채취일", "채취날짜", "채취_날짜", "날짜"],
  collection_location: ["collection_location", "location", "site", "sampling_site", "sampling_location", "채취위치", "채취_위치", "채취지점", "지점", "위치"],
  image_filename: ["image_filename", "image", "image_file", "filename", "file", "sem_image", "이미지", "이미지파일", "파일명"],
  magnification: ["magnification", "mag", "배율"],
  scale_bar_value: ["scale_bar_value", "scale_bar", "scalebar", "scale_value", "스케일바", "스케일바값"],
  scale_bar_unit: ["scale_bar_unit", "scale_unit", "scalebar_unit", "스케일바단위", "스케일단위"],
  scale_bar_px: ["scale_bar_px", "scale_bar_pixels", "scalebar_px", "scale_px", "스케일바픽셀", "스케일바_px"],
  morphology_class: ["morphology_class", "morphology", "shape", "shape_class", "형상", "형상분류", "형태"],
  projected_area: ["projected_area", "area", "투영면적", "면적"],
  equivalent_diameter: ["equivalent_diameter", "eq_diameter", "ecd", "diameter", "등가직경", "등가지름", "입경"],
  size_unit: ["size_unit", "크기단위"],
  classification_method: ["classification_method", "method_of_classification", "분류방법", "판정방법"],
  pixel_size_um: ["pixel_size_um", "pixel_size", "um_per_px", "µm/px", "um/px", "픽셀크기", "픽셀크기µm"],
  feret_diameter: ["feret_diameter", "feret", "max_feret", "페렛직경"],
  circularity: ["circularity", "원형도"],
  solidity: ["solidity", "고형도"],
  aspect_ratio: ["aspect_ratio", "종횡비"],
  size_method: ["size_method", "측정방법_크기", "크기측정방법"],
  accelerating_voltage_kv: ["accelerating_voltage_kv", "hv", "kv", "accelerating_voltage", "가속전압"],
  working_distance_mm: ["working_distance_mm", "wd", "working_distance", "작동거리"],
  detector: ["detector", "검출기"],
  instrument: ["instrument", "장비"],
  acquired_at: ["acquired_at", "acquisition_time", "촬영시각"],
  sample_type: ["sample_type", "type_of_sample", "시료유형", "시료구분"],
  analysis_conditions: ["analysis_conditions", "conditions", "analysis_condition", "분석조건"],
  notes: ["notes", "note", "memo", "comment", "비고", "메모"],

  element_symbol: ["element_symbol", "element", "symbol", "elem", "원소", "원소기호"],
  element_name: ["element_name", "원소명", "원소이름"],
  wt_percent: ["wt_percent", "wt", "wt%", "weight", "weight%", "weight_percent", "weight_concentration", "mass%", "mass_percent", "중량%", "중량", "질량%"],
  at_percent: ["at_percent", "at", "at%", "atomic", "atomic%", "atomic_percent", "atomic_concentration", "원자%", "원자"],
  detection_status: ["detection_status", "status", "detected", "검출상태", "검출여부"],
  detection_limit: ["detection_limit", "lod", "mdl", "dl", "검출한계"],
  quantification_limit: ["quantification_limit", "loq", "ql", "정량한계"],
  measurement_method: ["measurement_method", "method", "quant_method", "측정방법", "정량방법"],
  normalized: ["normalized", "normalised", "정규화", "정규화여부"],
  basis: ["basis", "unit", "단위", "기준"],

  assessment_category: ["assessment_category", "category", "평가범주", "분류"],
  reference_name: ["reference_name", "reference", "참고문헌", "근거"],
  reference_year: ["reference_year", "year", "연도"],
  reference_url: ["reference_url", "url", "link"],
  applicable_condition: ["applicable_condition", "condition", "적용조건"],
  classification_note: ["classification_note", "비고사항", "분류메모"],
  health_effects: ["health_effects", "건강영향", "건강_영향"],
  target_organs: ["target_organs", "표적장기", "표적_장기"],
  health_references: ["health_references", "건강영향출처", "건강영향_출처"],

  pm25: ["pm25", "pm2.5", "pm2_5", "pm_2.5", "초미세먼지"],
  pm10: ["pm10", "pm_10", "미세먼지"],
  source: ["source", "data_source", "출처"],
};

const ALIAS_LOOKUP = new Map<string, string>();
for (const [std, list] of Object.entries(HEADER_ALIASES)) {
  for (const a of list) ALIAS_LOOKUP.set(squash(a), std);
}

function squash(h: string): string {
  return h
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\(.*?\)/g, (m) => (/%/.test(m) ? "%" : "")) // "Weight (%)" → "weight%"
    .replace(/[\s\-_.]/g, "")
    .replace(/percentage/g, "%")
    .replace(/percent/g, "%")
    .replace(/concentration/g, "")
    .trim();
}

/** 열 이름을 표준 이름으로. 모르는 이름은 원래 이름(소문자 정리)으로 둔다. */
export function canonicalHeader(h: string): string {
  const s = squash(h);
  if (ALIAS_LOOKUP.has(s)) return ALIAS_LOOKUP.get(s)!;
  // "Weight Concentration %" 같은 긴 이름
  if (/^(weight|wt|mass)%?$/.test(s) || /^(weight|wt|mass).*%$/.test(s)) return "wt_percent";
  if (/^(atomic|at).*%$/.test(s)) return "at_percent";
  return h.trim();
}

export function isBlank(v: unknown): boolean {
  return v == null || (typeof v === "string" && v.trim() === "");
}

export function str(v: unknown): string | null {
  if (isBlank(v)) return null;
  if (v instanceof Date) return toIsoDate(v);
  return String(v).trim();
}

/** 숫자 해석. 실패하면 NaN, 빈칸은 null. "5,000x", "x5000" 같은 표기 허용. */
export function num(v: unknown): number | null {
  if (isBlank(v)) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const t = String(v).trim().replace(/^[x×]/i, "").replace(/[x×]$/i, "").replace(/,/g, "").replace(/\s/g, "");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return NaN;
  return parseFloat(t);
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 날짜를 YYYY-MM-DD로. 해석 불가면 undefined, 빈칸이면 null */
export function parseDate(v: unknown): string | null | undefined {
  if (isBlank(v)) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : toIsoDate(v);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // 엑셀 날짜 일련번호(1900 체계)
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  const t = String(v).trim();
  const m = t.match(/^(\d{4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})일?/);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return undefined;
  }
  const c = t.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (c) return `${c[1]}-${c[2]}-${c[3]}`;
  return undefined;
}

export function parseBool(v: unknown): boolean | null {
  if (isBlank(v)) return null;
  const t = String(v).trim().toLowerCase();
  if (["y", "yes", "true", "1", "o", "예", "정규화", "normalized"].includes(t)) return true;
  if (["n", "no", "false", "0", "x", "아니오", "비정규화", "raw"].includes(t)) return false;
  return null;
}

/** 길이 단위를 µm, nm, mm 중 하나로. 인식 불가면 null */
export function normalizeLengthUnit(v: unknown): "µm" | "nm" | "mm" | null {
  if (isBlank(v)) return null;
  const t = String(v).trim().toLowerCase().replace("μ", "µ");
  if (["µm", "um", "micron", "microns", "micrometer", "micrometre", "마이크로미터", "마이크론"].includes(t)) return "µm";
  if (["nm", "nanometer", "nanometre", "나노미터"].includes(t)) return "nm";
  if (["mm", "millimeter", "millimetre", "밀리미터"].includes(t)) return "mm";
  return null;
}

export function toMicrometers(value: number, unit: "µm" | "nm" | "mm"): number {
  if (unit === "nm") return value / 1000;
  if (unit === "mm") return value * 1000;
  return value;
}

/** 검출 상태 열의 표기 해석 */
export function parseStatusText(v: unknown): DetectionStatus | null {
  if (isBlank(v)) return null;
  const t = String(v).trim().toLowerCase().replace(/[\s_.]/g, "");
  if (["detected", "det", "d", "yes", "y", "true", "1", "검출", "o", "positive"].includes(t)) return "detected";
  if (["notdetected", "nd", "no", "n", "false", "0", "미검출", "불검출", "negative", "x"].includes(t)) return "not_detected";
  if (["belowlod", "<lod", "<dl", "<mdl", "bdl", "blod", "belowdl", "검출한계미만"].includes(t)) return "below_lod";
  if (["belowloq", "<loq", "<ql", "bql", "bloq", "정량한계미만", "detectedbelowloq"].includes(t)) return "below_loq";
  if (["missing", "na", "n/a", "notanalyzed", "미분석", "결측"].includes(t)) return "missing";
  return null;
}

/**
 * 수치 칸에 문자가 적힌 경우의 해석.
 * - "ND", "미검출" → 미검출
 * - "<LOD", "BDL" → 검출한계 미만
 * - "<LOQ" → 정량한계 미만
 * - "<0.1" → 검출한계 미만, 한계값 0.1
 * - "NA", "-" → 결측
 */
export function parseValueText(v: unknown): { status: DetectionStatus; limit: number | null } | null {
  if (isBlank(v) || typeof v === "number") return null;
  const raw = String(v).trim();
  const t = raw.toLowerCase().replace(/[\s_.]/g, "");
  const lt = raw.match(/^<\s*([0-9.]+)$/);
  if (lt) return { status: "below_lod", limit: parseFloat(lt[1]) };
  if (["nd", "notdetected", "미검출", "불검출"].includes(t)) return { status: "not_detected", limit: null };
  if (["<lod", "<dl", "<mdl", "bdl", "belowlod", "검출한계미만"].includes(t)) return { status: "below_lod", limit: null };
  if (["<loq", "<ql", "bql", "belowloq", "정량한계미만"].includes(t)) return { status: "below_loq", limit: null };
  if (["na", "n/a", "-", "--", "—", "미분석", "결측"].includes(t)) return { status: "missing", limit: null };
  return null;
}

export function particleKey(sample_id: string, particle_id: string): string {
  return `${sample_id}::${particle_id}`;
}
