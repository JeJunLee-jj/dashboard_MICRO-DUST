/* 입자 메타데이터 표 → ParticleMeta[] */
import type { ParticleMeta, QualityIssue } from "../types";
import { normalizeMorphology } from "../morphology";
import { isBlank, normalizeLengthUnit, num, parseDate, particleKey, str, toMicrometers, type Table } from "./common";

export const METADATA_REQUIRED = ["sample_id", "particle_id"] as const;
export const METADATA_COLUMNS = [
  "sample_id", "particle_id", "collection_date", "collection_location", "image_filename",
  "magnification", "scale_bar_value", "scale_bar_unit", "scale_bar_px", "morphology_class",
  "projected_area", "equivalent_diameter", "size_unit", "classification_method", "sample_type",
  "analysis_conditions", "notes",
  "pixel_size_um", "feret_diameter", "circularity", "solidity", "aspect_ratio", "size_method",
  "accelerating_voltage_kv", "working_distance_mm", "detector", "instrument", "acquired_at",
] as const;

export function parseMetadataTable(table: Table): { meta: ParticleMeta[]; issues: QualityIssue[] } {
  const issues: QualityIssue[] = [];
  const file = table.name;
  const has = (c: string) => table.headers.includes(c);

  if (!has("particle_id")) {
    issues.push({ level: "error", code: "META_NO_PARTICLE_ID", file, message: "필수 열 particle_id가 없어 메타데이터를 불러오지 않았습니다." });
    return { meta: [], issues };
  }
  if (!has("sample_id")) {
    issues.push({ level: "warning", code: "META_NO_SAMPLE_ID", file, message: "필수 열 sample_id가 없습니다. 모든 입자를 시료 '(미지정)'으로 처리합니다." });
  }
  const unknownCols = table.headers.filter((h) => !(METADATA_COLUMNS as readonly string[]).includes(h));
  if (unknownCols.length) {
    issues.push({ level: "info", code: "META_EXTRA_COLUMNS", file, message: `인식하지 않은 열(무시됨): ${unknownCols.join(", ")}` });
  }

  const meta: ParticleMeta[] = [];
  const seen = new Map<string, number>();
  const unitsSeen = new Set<string>();

  table.rows.forEach((r, i) => {
    const row = i + 2; // 머리글 다음 줄부터, 1-based
    const pid = str(r.particle_id);
    if (!pid) {
      issues.push({ level: "error", code: "META_EMPTY_PARTICLE_ID", file, row, message: "particle_id가 비어 있어 이 행을 건너뜁니다." });
      return;
    }
    const sid = str(r.sample_id) ?? "(미지정)";
    const key = particleKey(sid, pid);
    if (seen.has(key)) {
      issues.push({
        level: "error", code: "META_DUPLICATE_ID", file, row, particleKey: key,
        message: `중복 입자 ID: ${sid} / ${pid} (첫 행 ${seen.get(key)}). 첫 번째 행만 사용합니다.`,
      });
      return;
    }
    seen.set(key, row);

    const numField = (field: string, opts: { positive?: boolean } = {}): number | null => {
      const v = num(r[field]);
      if (v === null) return null;
      if (Number.isNaN(v)) {
        issues.push({ level: "warning", code: "META_BAD_NUMBER", file, row, particleKey: key, message: `${field} 값 "${String(r[field])}"을 숫자로 읽을 수 없어 비워 둡니다.` });
        return null;
      }
      if (opts.positive && v <= 0) {
        issues.push({ level: "warning", code: "META_NONPOSITIVE", file, row, particleKey: key, message: `${field} 값 ${v}은 0보다 커야 합니다. 비워 둡니다.` });
        return null;
      }
      return v;
    };

    const date = parseDate(r.collection_date);
    if (date === undefined) {
      issues.push({ level: "warning", code: "META_BAD_DATE", file, row, particleKey: key, message: `채취 날짜 "${String(r.collection_date)}"를 해석할 수 없습니다(YYYY-MM-DD 권장).` });
    }

    // 스케일 바
    const sbValue = numField("scale_bar_value", { positive: true });
    const sbUnitRaw = r.scale_bar_unit;
    const sbUnit = normalizeLengthUnit(sbUnitRaw);
    if (!isBlank(sbUnitRaw) && !sbUnit) {
      issues.push({ level: "warning", code: "META_BAD_UNIT", file, row, particleKey: key, message: `스케일 바 단위 "${String(sbUnitRaw)}"를 인식할 수 없습니다(µm, nm, mm).` });
    }
    if (sbUnit) unitsSeen.add(sbUnit);
    if (sbValue != null && !sbUnit) {
      issues.push({ level: "warning", code: "META_SCALE_NO_UNIT", file, row, particleKey: key, message: "스케일 바 값은 있으나 단위가 없어 실제 크기 보정에 쓰지 않습니다." });
    }

    // 형상
    const morphRaw = str(r.morphology_class);
    const morph = normalizeMorphology(morphRaw);
    if (morph === undefined) {
      issues.push({ level: "warning", code: "META_BAD_MORPHOLOGY", file, row, particleKey: key, message: `형상 분류 "${morphRaw}"를 표준 분류로 바꿀 수 없어 미분류로 둡니다.` });
    }
    const method = str(r.classification_method);
    if (morph && !method) {
      issues.push({ level: "info", code: "META_NO_CLASS_METHOD", file, row, particleKey: key, message: "형상 분류값은 있으나 classification_method(판정 방법)가 비어 있습니다." });
    }

    // 크기: µm 기준. size_unit이 nm/mm면 환산
    let area = numField("projected_area", { positive: true });
    let diam = numField("equivalent_diameter", { positive: true });
    const sizeUnit = normalizeLengthUnit(r.size_unit);
    if (!isBlank(r.size_unit) && !sizeUnit) {
      issues.push({ level: "warning", code: "META_BAD_SIZE_UNIT", file, row, particleKey: key, message: `size_unit "${String(r.size_unit)}"를 인식할 수 없어 크기 값을 쓰지 않습니다.` });
      area = null;
      diam = null;
    } else if (sizeUnit && sizeUnit !== "µm") {
      if (diam != null) diam = toMicrometers(diam, sizeUnit);
      if (area != null) area = toMicrometers(1, sizeUnit) ** 2 * area;
      issues.push({ level: "info", code: "META_SIZE_CONVERTED", file, row, particleKey: key, message: `크기 단위 ${sizeUnit}를 µm(면적은 µm²)로 환산했습니다.` });
    }

    meta.push({
      sample_id: sid,
      particle_id: pid,
      collection_date: date ?? null,
      collection_location: str(r.collection_location),
      image_filename: str(r.image_filename),
      magnification: numField("magnification", { positive: true }),
      scale_bar_value: sbValue,
      scale_bar_unit: sbUnit,
      scale_bar_px: numField("scale_bar_px", { positive: true }),
      morphology_class: morph ?? null,
      morphology_raw: morphRaw,
      projected_area: area,
      equivalent_diameter: diam,
      classification_method: method,
      pixel_size_um: numField("pixel_size_um", { positive: true }),
      feret_diameter: numField("feret_diameter", { positive: true }),
      circularity: numField("circularity", { positive: true }),
      solidity: numField("solidity", { positive: true }),
      aspect_ratio: numField("aspect_ratio", { positive: true }),
      size_method: str(r.size_method),
      accelerating_voltage_kv: numField("accelerating_voltage_kv", { positive: true }),
      working_distance_mm: numField("working_distance_mm", { positive: true }),
      detector: str(r.detector),
      instrument: str(r.instrument),
      acquired_at: str(r.acquired_at),
      sample_type: str(r.sample_type),
      analysis_conditions: str(r.analysis_conditions),
      notes: str(r.notes),
      sourceFile: file,
      sourceRow: row,
    });
  });

  if (unitsSeen.size > 1) {
    issues.push({
      level: "info", code: "META_MIXED_SCALE_UNITS", file,
      message: `스케일 바 단위가 섞여 있습니다(${[...unitsSeen].join(", ")}). 크기 계산 시 µm로 환산합니다.`,
    });
  }
  return { meta, issues };
}

/**
 * µm/px. 장비 메타데이터의 픽셀 크기(pixel_size_um)가 있으면 그 값을 쓰고,
 * 없으면 스케일 바 값·단위·픽셀 길이가 모두 있어야 계산한다. 둘 다 없으면 null(크기 계산 안 함).
 */
export function micronsPerPixel(m: Pick<ParticleMeta, "scale_bar_value" | "scale_bar_unit" | "scale_bar_px" | "pixel_size_um">): number | null {
  if (m.pixel_size_um != null && m.pixel_size_um > 0) return m.pixel_size_um;
  if (m.scale_bar_value == null || m.scale_bar_px == null || !m.scale_bar_unit) return null;
  const unit = normalizeLengthUnit(m.scale_bar_unit);
  if (!unit) return null;
  return toMicrometers(m.scale_bar_value, unit) / m.scale_bar_px;
}
