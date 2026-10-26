/* 입자 단위 등록: SEM 이미지 1장 + EDS 정량 CSV 1개 = 입자 1개.
   Phenom 등 장비의 EDS 내보내기 파일에는 시료·입자 ID 열이 없으므로, 등록 화면에서 입력한 ID를 붙여
   기존 EDS 파서(parseEdsTable)를 그대로 거친다 — 검출 상태·wt/at 구분·분수 환산 규칙이 일괄 업로드와 같다. */
import type { EdsRecord, ImageAsset, MorphologyClass, ParticleMeta, QualityIssue } from "./types";
import type { Table } from "./parse/common";
import { parseEdsTable, type EdsParseSummary } from "./parse/eds";
import { localDateTime } from "./image/instrument";
import { normalizeElement } from "./elements";

export interface PairMeasurement {
  eqdUm: number | null;
  areaUm2: number | null;
  feretUm: number | null;
  circularity: number | null;
  solidity: number | null;
  aspectRatio: number | null;
  methodLabel: string;
}

export interface PairInput {
  sample_id: string;
  particle_id: string;
  location: string | null;
  date: string | null;
  sample_type: string | null;
  morphology: MorphologyClass | null;
  morphologyMethod: string | null;
  notes: string | null;
  image: ImageAsset | null;
  /** µm/px — 장비 메타데이터 값 또는 사용자 입력 */
  pixelSizeUm: number | null;
  edsName: string | null;
  edsTable: Table | null;
  measurement: PairMeasurement | null;
  /** EDS 스폿별 wt%(원소 → 스폿 값들) — 여러 스폿을 평균해 등록할 때 */
  spotWt?: Record<string, number[]> | null;
}

export interface PairResult {
  meta: ParticleMeta;
  eds: EdsRecord[];
  issues: QualityIssue[];
  edsSummary: EdsParseSummary | null;
}

/** EDS 표의 원소·값 미리보기(등록 전 확인용) */
export function edsPreview(table: Table): Array<{ symbol: string; wt: string; at: string }> {
  return table.rows
    .map((r) => ({ symbol: normalizeElement(r.element_symbol ?? r.element_name) ?? String(r.element_symbol ?? "?"), wt: String(r.wt_percent ?? ""), at: String(r.at_percent ?? "") }))
    .filter((r) => r.symbol);
}

/** 한 입자 EDS 파일인지 대략 확인: 원소 열과 wt/at 열이 있어야 한다 */
export function looksLikeSingleParticleEds(table: Table): boolean {
  const h = table.headers;
  return (h.includes("element_symbol") || h.includes("element_name")) && (h.includes("wt_percent") || h.includes("at_percent"));
}

export function buildParticleFromPair(input: PairInput): PairResult {
  const key = `${input.sample_id}::${input.particle_id}`;
  const issues: QualityIssue[] = [];
  const inst = input.image?.instrument ?? null;
  const local = localDateTime(inst?.acquiredAtUtc ?? null);

  let eds: EdsRecord[] = [];
  let edsSummary: EdsParseSummary | null = null;
  if (input.edsTable) {
    const t = input.edsTable;
    if (t.headers.includes("particle_id") || t.headers.includes("sample_id")) {
      issues.push({ level: "warning", code: "PAIR_IDS_OVERRIDDEN", file: input.edsName ?? t.name, particleKey: key, message: "EDS 파일에 있던 sample_id·particle_id 대신 등록 화면에서 입력한 ID를 사용했습니다." });
    }
    const extra = t.headers.filter((h) => /energy/i.test(h));
    const energyNote = extra.map((h) => `${h}=${[...new Set(t.rows.map((r) => String(r[h] ?? "")))].join("/")}`).join(", ");
    const table: Table = {
      name: input.edsName ?? t.name,
      headers: [...new Set([...t.headers, "sample_id", "particle_id", "measurement_method", "normalized"])],
      rows: t.rows.map((r) => ({
        ...r,
        sample_id: input.sample_id,
        particle_id: input.particle_id,
        measurement_method: r.measurement_method ?? `EDS 정량 CSV(${input.edsName ?? t.name}${energyNote ? `; ${energyNote}` : ""})`,
        normalized: r.normalized ?? null,
      })),
    };
    const res = parseEdsTable(table);
    eds = res.records;
    edsSummary = res.summary;
    for (const i of res.issues) {
      // Phenom 내보내기는 0–1 분수가 정상 형식이므로 경고 대신 안내로 기록
      if (i.code === "EDS_FRACTION_SCALED") issues.push({ ...i, level: "info", particleKey: key, message: "EDS 값이 0–1 분수(합계 1)로 기재되어 ×100 하여 %로 환산했습니다(Phenom 등 장비 내보내기 형식)." });
      else issues.push({ ...i, particleKey: key });
    }
    // 합계가 1(=100%) 근처면 정규화된 값으로 표시
    const wtSum = eds.reduce((a, r) => a + (r.wt_percent ?? 0), 0);
    if (eds.length && eds.every((r) => r.normalized == null) && Math.abs(wtSum - 100) < 0.5) for (const r of eds) r.normalized = true;
  } else {
    issues.push({ level: "warning", code: "PAIR_NO_EDS", particleKey: key, message: "EDS 파일 없이 등록했습니다 — 조성 분석에서 제외됩니다." });
  }

  const m = input.measurement;
  const conditions = inst
    ? [inst.instrument, inst.highVoltageKv != null ? `${inst.highVoltageKv} kV` : null, inst.detector, inst.workingDistanceMm != null ? `WD ${inst.workingDistanceMm.toFixed(2)} mm` : null, inst.pressurePa != null ? `${inst.pressurePa} Pa` : null, inst.spotSize != null ? `spot ${inst.spotSize}` : null]
        .filter(Boolean).join(", ")
    : null;

  const meta: ParticleMeta = {
    sample_id: input.sample_id,
    particle_id: input.particle_id,
    collection_date: input.date,
    collection_location: input.location,
    image_filename: input.image?.filename ?? null,
    magnification: inst?.magnification ?? null,
    scale_bar_value: null,
    scale_bar_unit: null,
    scale_bar_px: null,
    pixel_size_um: input.pixelSizeUm,
    morphology_class: input.morphology,
    morphology_raw: input.morphology,
    projected_area: m?.areaUm2 ?? null,
    equivalent_diameter: m?.eqdUm ?? null,
    feret_diameter: m?.feretUm ?? null,
    circularity: m?.circularity ?? null,
    solidity: m?.solidity ?? null,
    aspect_ratio: m?.aspectRatio ?? null,
    size_method: m?.methodLabel ?? null,
    classification_method: input.morphology ? (input.morphologyMethod ?? "사용자 판정(등록 화면)") : null,
    accelerating_voltage_kv: inst?.highVoltageKv ?? null,
    working_distance_mm: inst?.workingDistanceMm ?? null,
    detector: inst?.detector ?? null,
    instrument: inst?.instrument ?? null,
    acquired_at: local ? `${local.date} ${local.time}` : null,
    sample_type: input.sample_type,
    spot_wt: input.spotWt ?? null,
    analysis_conditions: conditions,
    notes: input.notes,
    sourceFile: [input.image?.filename, input.edsName].filter(Boolean).join(" + ") || "등록 화면",
    sourceRow: 0,
  };
  if (m && input.pixelSizeUm == null) {
    issues.push({ level: "info", code: "PAIR_NO_SCALE", particleKey: key, message: "픽셀 크기(µm/px)가 없어 형상 지표(원형도 등)만 저장하고 실제 크기(µm)는 계산하지 않았습니다." });
  }
  return { meta, eds, issues, edsSummary };
}

/** 시료 안에서 다음 입자 ID 제안: P001, P002 … (이미 쓰인 ID는 건너뜀) */
export function nextParticleId(used: Set<string>, prefix = "P"): string {
  for (let i = 1; i < 10000; i++) {
    const id = `${prefix}${String(i).padStart(3, "0")}`;
    if (!used.has(id)) return id;
  }
  return `${prefix}${Date.now()}`;
}
