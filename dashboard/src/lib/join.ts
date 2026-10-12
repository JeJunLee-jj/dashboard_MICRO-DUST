/* 메타데이터 · EDS · 이미지 · 사용자 수정값을 입자 단위로 결합한다. */
import type {
  AnalysisSettings, DataOrigin, DetectionStatus, EdsRecord, ElementEntry, ImageAsset, ImageMatch,
  Particle, ParticleFlag, ParticleMeta, QualityIssue, StatusSource, UserOverride,
} from "./types";
import { particleKey } from "./parse/common";
import { micronsPerPixel } from "./parse/metadata";

export interface JoinInput {
  origin: DataOrigin;
  meta: ParticleMeta[];
  eds: EdsRecord[];
  images: ImageAsset[];
  overrides: Record<string, UserOverride>;
  settings: AnalysisSettings;
}

export interface Unmatched {
  /** 어떤 입자와도 연결되지 않은 이미지 파일 */
  imagesWithoutParticle: string[];
  /** 메타데이터에 image_filename이 있으나 해당 파일이 업로드되지 않은 입자 */
  missingImageFiles: Array<{ key: string; filename: string }>;
  /** 이미지가 연결되지 않은 입자(파일명 미기재 포함) */
  particlesWithoutImage: string[];
  /** EDS는 있으나 메타데이터가 없는 입자 */
  edsWithoutMeta: string[];
  /** 메타데이터는 있으나 EDS가 없는 입자 */
  metaWithoutEds: string[];
}

export interface JoinResult {
  particles: Particle[];
  unmatched: Unmatched;
  issues: QualityIssue[];
}

const baseName = (f: string) => f.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "").toLowerCase();
const fileName = (f: string) => f.replace(/^.*[\\/]/, "").toLowerCase();

export function joinDataset(input: JoinInput): JoinResult {
  const { meta, eds, images, overrides, settings, origin } = input;
  const issues: QualityIssue[] = [];

  const metaByKey = new Map<string, ParticleMeta>();
  for (const m of meta) metaByKey.set(particleKey(m.sample_id, m.particle_id), m);
  const edsByKey = new Map<string, EdsRecord[]>();
  for (const r of eds) {
    const k = particleKey(r.sample_id, r.particle_id);
    const arr = edsByKey.get(k);
    if (arr) arr.push(r);
    else edsByKey.set(k, [r]);
  }
  const keys = [...new Set([...metaByKey.keys(), ...edsByKey.keys()])];

  // 이미지 색인
  const byFile = new Map<string, ImageAsset>();
  const byBase = new Map<string, ImageAsset[]>();
  for (const img of images) {
    byFile.set(fileName(img.filename), img);
    const b = baseName(img.filename);
    byBase.set(b, [...(byBase.get(b) ?? []), img]);
  }
  // 같은 particle_id가 여러 시료에 있으면 particle_id만으로는 이미지를 연결하지 않는다
  const pidCount = new Map<string, number>();
  for (const k of keys) {
    const pid = k.split("::")[1].toLowerCase();
    pidCount.set(pid, (pidCount.get(pid) ?? 0) + 1);
  }

  const usedImages = new Set<string>();
  const unmatched: Unmatched = { imagesWithoutParticle: [], missingImageFiles: [], particlesWithoutImage: [], edsWithoutMeta: [], metaWithoutEds: [] };
  const lo = 100 - settings.sumTolerance, hi = 100 + settings.sumTolerance;

  const particles: Particle[] = keys.map((key) => {
    const [sample_id, particle_id] = splitKey(key);
    const m = metaByKey.get(key) ?? null;
    const recs = edsByKey.get(key) ?? [];
    const ov = overrides[key] ?? {};
    const flags: ParticleFlag[] = [];

    // 원소
    const elements: Record<string, ElementEntry> = {};
    for (const r of recs) {
      elements[r.element_symbol] = {
        symbol: r.element_symbol, wt: r.wt_percent, at: r.at_percent,
        status: r.detection_status, statusSource: r.status_source,
        detection_limit: r.detection_limit, quantification_limit: r.quantification_limit,
      };
    }
    const hasEds = recs.length > 0;
    const allMissing = hasEds && recs.every((r) => r.detection_status === "missing");
    const wtVals = recs.map((r) => r.wt_percent).filter((v): v is number => v != null);
    const atVals = recs.map((r) => r.at_percent).filter((v): v is number => v != null);
    const wtSum = wtVals.length ? wtVals.reduce((a, b) => a + b, 0) : null;
    const atSum = atVals.length ? atVals.reduce((a, b) => a + b, 0) : null;
    const normFlags = [...new Set(recs.map((r) => r.normalized).filter((v) => v != null))];
    const normalized = normFlags.length === 1 ? (normFlags[0] as boolean) : null;
    const methods = [...new Set(recs.map((r) => r.measurement_method).filter(Boolean))] as string[];

    let edsValid = hasEds && !allMissing;
    let excludeReason: string | null = null;
    if (!hasEds) {
      flags.push({ level: "warning", code: "NO_EDS", message: "EDS 성분 데이터가 없습니다(유효 EDS 분석 입자에서 제외)." });
      excludeReason = "EDS 데이터 없음";
      unmatched.metaWithoutEds.push(key);
    } else if (allMissing) {
      flags.push({ level: "warning", code: "EDS_ALL_MISSING", message: "모든 원소 값이 결측입니다(유효 EDS 분석 입자에서 제외)." });
      excludeReason = "모든 원소 결측";
    }
    if (!m) {
      flags.push({ level: "info", code: "NO_META", message: "입자 메타데이터가 없습니다(이미지·형상·채취 정보 없음)." });
      unmatched.edsWithoutMeta.push(key);
    }

    for (const [basis, sum] of [["wt", wtSum], ["at", atSum]] as const) {
      if (sum == null) continue;
      if (sum < lo || sum > hi) {
        const msg = `${basis}% 합계 ${sum.toFixed(1)}%가 허용 범위(100 ± ${settings.sumTolerance}%p)를 벗어났습니다.` +
          (normalized === true ? " 정규화된 값으로 표시됐으나 합계가 맞지 않습니다." : " 정규화되지 않았거나 일부 원소가 제외됐을 수 있습니다.");
        flags.push({ level: "warning", code: `SUM_${basis.toUpperCase()}_OUT`, message: msg });
        if (settings.excludeSumOutliers && edsValid) {
          edsValid = false;
          excludeReason = `${basis}% 합계 이탈`;
        }
      }
    }
    if (hasEds && wtSum == null && atSum == null) {
      flags.push({ level: "info", code: "NO_QUANT", message: "정량값(wt%·at%)이 없고 검출 상태만 있습니다." });
    }
    if (methods.length > 1) flags.push({ level: "warning", code: "MIXED_METHOD", message: `한 입자에 측정 방법이 섞여 있습니다: ${methods.join(", ")}` });
    if (recs.some((r) => r.status_source === "inferred_value")) {
      flags.push({ level: "info", code: "STATUS_INFERRED", message: "일부 원소의 검출 상태를 값에서 추정했습니다(상태 열 없음)." });
    }
    const prep = settings.preparationElements.filter((s) => elements[s] && isDetectedStatus(elements[s].status, settings));
    if (prep.length) {
      flags.push({ level: "info", code: "PREP_ELEMENT", message: `시료 준비(코팅·기판) 유래 가능 원소 검출: ${prep.join(", ")}` });
    }
    if (ov.excluded) {
      edsValid = false;
      excludeReason = "사용자가 분석에서 제외";
      flags.push({ level: "info", code: "USER_EXCLUDED", message: "사용자가 이 입자를 분석에서 제외했습니다." });
    }

    // 이미지 연결
    let image: ImageAsset | null = null;
    let imageMatch: ImageMatch = "none";
    if (m?.image_filename) {
      image = byFile.get(fileName(m.image_filename)) ?? null;
      if (image) imageMatch = "filename";
      else {
        const cands = byBase.get(baseName(m.image_filename)) ?? [];
        if (cands.length === 1) {
          image = cands[0];
          imageMatch = "basename";
        }
      }
      if (!image) unmatched.missingImageFiles.push({ key, filename: m.image_filename });
    }
    if (!image && !m?.image_filename) {
      const tries = [`${sample_id}_${particle_id}`, `${sample_id}-${particle_id}`].map((s) => s.toLowerCase());
      if ((pidCount.get(particle_id.toLowerCase()) ?? 0) === 1) tries.push(particle_id.toLowerCase());
      for (const t of tries) {
        const c = byBase.get(t) ?? [];
        if (c.length === 1) {
          image = c[0];
          imageMatch = "particle_id";
          break;
        }
      }
    }
    if (image) usedImages.add(image.filename);
    else unmatched.particlesWithoutImage.push(key);

    const morphology = ov.morphology !== undefined ? ov.morphology : (m?.morphology_class ?? null);
    const morphologySource = ov.morphology !== undefined ? "user" : m?.morphology_class ? "metadata" : null;
    const classificationMethod = ov.morphology !== undefined ? (ov.morphologyMethod ?? "사용자 판정(대시보드 입력)") : (m?.classification_method ?? null);

    return {
      key, sample_id, particle_id, origin, meta: m, elements, hasEds, edsValid, excludeReason,
      wtSum, atSum, normalized, measurementMethod: methods.join(", ") || null,
      image, imageMatch, morphology, morphologySource, classificationMethod,
      umPerPx: m ? micronsPerPixel(m) : null,
      date: m?.collection_date ?? null,
      location: m?.collection_location ?? null,
      flags,
    };
  });

  for (const img of images) if (!usedImages.has(img.filename)) unmatched.imagesWithoutParticle.push(img.filename);
  for (const { key, filename } of unmatched.missingImageFiles) {
    if (images.length) issues.push({ level: "warning", code: "IMAGE_FILE_MISSING", particleKey: key, message: `메타데이터의 이미지 "${filename}"가 업로드되지 않았습니다.` });
  }
  for (const f of unmatched.imagesWithoutParticle) {
    issues.push({ level: "warning", code: "IMAGE_UNMATCHED", file: f, message: `이미지 "${f}"와 연결되는 입자가 없습니다(메타데이터 image_filename 또는 파일명=particle_id 확인).` });
  }
  if (unmatched.edsWithoutMeta.length && meta.length) {
    issues.push({ level: "warning", code: "EDS_WITHOUT_META", message: `EDS는 있으나 메타데이터가 없는 입자 ${unmatched.edsWithoutMeta.length}개 — sample_id·particle_id 표기가 같은지 확인하세요.` });
  }
  if (unmatched.metaWithoutEds.length && eds.length) {
    issues.push({ level: "warning", code: "META_WITHOUT_EDS", message: `메타데이터는 있으나 EDS가 없는 입자 ${unmatched.metaWithoutEds.length}개.` });
  }

  particles.sort((a, b) => a.sample_id.localeCompare(b.sample_id) || a.particle_id.localeCompare(b.particle_id, undefined, { numeric: true }));
  return { particles, unmatched, issues };
}

function splitKey(key: string): [string, string] {
  const i = key.indexOf("::");
  return [key.slice(0, i), key.slice(i + 2)];
}

export function isDetectedStatus(s: DetectionStatus, settings: Pick<AnalysisSettings, "belowLoqCountsAsDetected">): boolean {
  return s === "detected" || (s === "below_loq" && settings.belowLoqCountsAsDetected);
}

/**
 * 입자에서 한 원소의 상태. 파일에 행이 없는 원소는 설정(absentElementPolicy)에 따라
 * 미검출로 간주하거나 결측(분석되지 않음)으로 본다. EDS가 없는 입자는 항상 결측.
 */
export function elementStatus(p: Particle, symbol: string, settings: Pick<AnalysisSettings, "absentElementPolicy">): { status: DetectionStatus; source: StatusSource } {
  const e = p.elements[symbol];
  if (e) return { status: e.status, source: e.statusSource };
  if (!p.hasEds) return { status: "missing", source: "absent_policy" };
  return settings.absentElementPolicy === "not_detected"
    ? { status: "not_detected", source: "absent_policy" }
    : { status: "missing", source: "absent_policy" };
}

export function isDetected(p: Particle, symbol: string, settings: AnalysisSettings): boolean {
  return isDetectedStatus(elementStatus(p, symbol, settings).status, settings);
}

/** 정량값: 상태가 '검출'이고 해당 기준 값이 있을 때만(LOQ 미만 등은 정량 통계에서 제외) */
export function quantValue(p: Particle, symbol: string, basis: "wt" | "at"): number | null {
  const e = p.elements[symbol];
  if (!e || e.status !== "detected") return null;
  return basis === "wt" ? e.wt : e.at;
}
