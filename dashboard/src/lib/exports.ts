/* 분석 결과 내보내기(CSV). 모든 파일 머리에 데이터 구분(DEMO/실측)과 계산 기준을 주석(#)으로 남긴다. */
import Papa from "papaparse";
import type { AnalysisSettings, DataOrigin, EdsRecord, HazardRule, Particle, ParticleMeta, QualityIssue } from "./types";
import { METADATA_COLUMNS } from "./parse/metadata";
import type { ElementSummary } from "./composition";
import type { ClassificationRules } from "./rules";
import { classifyParticleType, sourceCandidates } from "./rules";
import { particleTargetResult } from "./hazard";
import { morphologyLabel } from "./morphology";
import type { GroupRow } from "./samples";

export type CsvRow = Record<string, string | number | null | undefined>;

export const STATUS_LABEL: Record<string, string> = {
  detected: "검출",
  below_loq: "정량한계 미만",
  below_lod: "검출한계 미만",
  not_detected: "미검출",
  missing: "결측",
};

export function originLabel(origin: DataOrigin | null): string {
  return origin === "demo" ? "DEMO(가상 예시 데이터 — 실제 측정 결과 아님)" : origin === "user" ? "사용자 업로드 데이터" : "데이터 없음";
}

export function toCsv(rows: CsvRow[], header: string[] = []): string {
  const body = rows.length ? Papa.unparse(rows) : "";
  const comments = header.map((h) => `# ${h.replace(/\r?\n/g, " ")}`).join("\r\n");
  return "﻿" + (comments ? comments + "\r\n" : "") + body;
}

export function csvHeader(origin: DataOrigin | null, settings: AnalysisSettings, extra: string[] = []): string[] {
  return [
    `데이터 구분: ${originLabel(origin)}`,
    `생성 시각: ${new Date().toISOString()}`,
    `대상 원소: ${settings.targetElements.join(", ")}`,
    `정량한계 미만 처리: ${settings.belowLoqCountsAsDetected ? "검출로 계수(정량 통계에서는 제외)" : "미검출로 계수"}`,
    `파일에 없는 원소: ${settings.absentElementPolicy === "not_detected" ? "미검출로 간주(가정)" : "결측(미분석)으로 처리"}`,
    ...extra,
  ];
}

const f = (v: number | null | undefined, d = 3) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(d)));

export function particleResultRows(particles: Particle[], settings: AnalysisSettings, rules: ClassificationRules): CsvRow[] {
  return particles.map((p) => {
    const t = particleTargetResult(p, settings);
    const type = classifyParticleType(p, settings, rules);
    const src = sourceCandidates(p, settings, rules);
    return {
      data_origin: p.origin,
      sample_id: p.sample_id,
      particle_id: p.particle_id,
      collection_date: p.date,
      collection_location: p.location,
      image_filename: p.image?.filename ?? p.meta?.image_filename ?? null,
      image_match: p.imageMatch,
      morphology_class: p.morphology,
      morphology_label: morphologyLabel(p.morphology),
      morphology_source: p.morphologySource,
      classification_method: p.classificationMethod,
      equivalent_diameter_um: f(p.meta?.equivalent_diameter),
      feret_diameter_um: f(p.meta?.feret_diameter),
      projected_area_um2: f(p.meta?.projected_area),
      circularity: f(p.meta?.circularity),
      solidity: f(p.meta?.solidity),
      aspect_ratio: f(p.meta?.aspect_ratio),
      size_method: p.meta?.size_method ?? null,
      pixel_size_um: p.umPerPx != null ? Number(p.umPerPx.toPrecision(6)) : null,
      magnification: p.meta?.magnification ?? null,
      accelerating_voltage_kv: p.meta?.accelerating_voltage_kv ?? null,
      detector: p.meta?.detector ?? null,
      acquired_at: p.meta?.acquired_at ?? null,
      eds_valid: p.edsValid ? "Y" : "N",
      exclude_reason: p.excludeReason,
      wt_sum: f(p.wtSum, 2),
      at_sum: f(p.atSum, 2),
      target_status: { positive: "대상 원소 검출", negative: "대상 원소 미검출", undetermined: "판정 불가(결측)", invalid: "분석 제외" }[t.status],
      target_elements_detected: t.detected.join(" "),
      target_elements_missing: t.missing.join(" "),
      particle_type_candidate: type.label,
      particle_type_method: type.method,
      particle_type_evidence: type.evidence.join("; "),
      source_summary: src.summaryLabel,
      source_candidates: src.matches.map((m) => `${m.candidate}[${m.level}]`).join(" | "),
      quality_flags: p.flags.map((x) => x.message).join(" | "),
    };
  });
}

export function elementSummaryRows(summaries: ElementSummary[]): CsvRow[] {
  return summaries.map((s) => ({
    element: s.symbol,
    evaluable_particles: s.evaluable,
    detected_particles: s.detected,
    detection_frequency_pct: f(s.frequency != null ? s.frequency * 100 : null, 2),
    ci95_low_pct: f(s.ci ? s.ci.lo * 100 : null, 2),
    ci95_high_pct: f(s.ci ? s.ci.hi * 100 : null, 2),
    below_loq: s.belowLoq,
    below_lod: s.belowLod,
    not_detected: s.notDetected,
    missing: s.missing,
    wt_n: s.wt.n, wt_mean: f(s.wt.mean), wt_median: f(s.wt.median), wt_sd: f(s.wt.sd), wt_q1: f(s.wt.q1), wt_q3: f(s.wt.q3), wt_min: f(s.wt.min), wt_max: f(s.wt.max),
    at_n: s.at.n, at_mean: f(s.at.mean), at_median: f(s.at.median), at_sd: f(s.at.sd), at_q1: f(s.at.q1), at_q3: f(s.at.q3), at_min: f(s.at.min), at_max: f(s.at.max),
  }));
}

export function hazardElementRows(stats: Array<ElementSummary & { rule: HazardRule | null }>): CsvRow[] {
  return stats.map((s) => ({
    ...elementSummaryRows([s])[0],
    assessment_category: s.rule?.assessment_category ?? "규칙 없음",
    reference_name: s.rule?.reference_name ?? null,
    reference_year: s.rule?.reference_year ?? null,
    reference_url: s.rule?.reference_url ?? null,
    applicable_condition: s.rule?.applicable_condition ?? null,
  }));
}

export function sampleComparisonRows(rows: GroupRow[], targets: string[]): CsvRow[] {
  return rows.map((r) => {
    const o: CsvRow = {
      group: r.group,
      location: r.location,
      dates: r.dates.join(" "),
      sample_type: r.sampleType,
      particles: r.particles,
      valid_eds: r.valid,
      target_positive: r.positive,
      target_determinable: r.determinable,
      target_ratio_pct: f(r.ratio != null ? r.ratio * 100 : null, 2),
      ci95_low_pct: f(r.ci ? r.ci.lo * 100 : null, 2),
      ci95_high_pct: f(r.ci ? r.ci.hi * 100 : null, 2),
    };
    for (const e of targets) {
      const c = r.perElement[e];
      o[`${e}_detected/evaluable`] = c ? `${c.detected}/${c.evaluable}` : null;
    }
    return o;
  });
}

export function edsLongRows(records: EdsRecord[]): CsvRow[] {
  return records.map((r) => ({
    sample_id: r.sample_id, particle_id: r.particle_id, element_symbol: r.element_symbol, element_name: r.element_name,
    wt_percent: r.wt_percent, at_percent: r.at_percent, detection_status: r.detection_status,
    status_source: r.status_source, detection_limit: r.detection_limit, quantification_limit: r.quantification_limit,
    measurement_method: r.measurement_method, normalized: r.normalized == null ? null : r.normalized ? "Y" : "N",
    source_file: r.sourceFile, source_row: r.sourceRow,
  }));
}

/** 입자 메타데이터 CSV — 일괄 업로드 형식과 같아 다시 불러올 수 있다 */
export function metadataRows(meta: ParticleMeta[]): CsvRow[] {
  return meta.map((m) => {
    const row: CsvRow = {};
    for (const c of METADATA_COLUMNS) {
      const v = (m as unknown as Record<string, unknown>)[c];
      row[c] = c === "size_unit" ? (m.equivalent_diameter != null || m.projected_area != null ? "µm" : null) : v == null ? null : typeof v === "number" ? Number(v.toPrecision(8)) : String(v);
    }
    return row;
  });
}

export function issueRows(issues: QualityIssue[]): CsvRow[] {
  return issues.map((i) => ({ level: i.level, code: i.code, message: i.message, file: i.file ?? null, row: i.row ?? null, particle: i.particleKey ?? null }));
}

export function hazardRuleRows(rules: HazardRule[]): CsvRow[] {
  return rules.map((r) => ({ ...r }));
}

export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
