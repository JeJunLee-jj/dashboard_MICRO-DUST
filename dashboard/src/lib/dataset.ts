/* 데이터셋 상태와 업로드 결과 병합. UI와 테스트가 같은 경로를 쓴다. */
import type { AnalysisSettings, DataOrigin, EdsRecord, HazardRule, ImageAsset, LoadedFile, ParticleMeta, PmRecord, QualityIssue, UserOverride } from "./types";
import type { TableLoadResult } from "./parse/loader";
import type { EdsParseSummary } from "./parse/eds";
import { particleKey } from "./parse/common";
import { joinDataset, type JoinResult } from "./join";

export interface DatasetState {
  origin: DataOrigin | null;
  meta: ParticleMeta[];
  eds: EdsRecord[];
  images: ImageAsset[];
  pm: PmRecord[];
  files: LoadedFile[];
  issues: QualityIssue[];
  edsSummaries: EdsParseSummary[];
  overrides: Record<string, UserOverride>;
  /** 배포된 공유 데이터셋에서 불러온 경우 그 스냅샷 정보. 사용자가 데이터를 바꾸면 null(내 데이터)로 바뀐다 */
  shared?: { savedAt: string; note: string | null } | null;
}

export const EMPTY_DATASET: DatasetState = {
  origin: null, meta: [], eds: [], images: [], pm: [], files: [], issues: [], edsSummaries: [], overrides: {}, shared: null,
};

/**
 * 새로 읽은 표를 기존 데이터에 합친다.
 * - 같은 입자(시료+입자 ID)의 메타데이터가 다시 들어오면 새 값으로 바꾸고 알린다.
 * - 같은 입자의 EDS가 다른 파일에서 다시 들어오면 그 입자의 EDS 전체를 새 파일 것으로 바꾼다(섞지 않음).
 * - DEMO 데이터 위에 사용자 데이터를 올리면 DEMO를 먼저 비운다(호출하는 쪽 책임).
 */
export function mergeLoad(state: DatasetState, load: TableLoadResult, origin: DataOrigin): { state: DatasetState; hazardRules: HazardRule[] | null } {
  const issues = [...state.issues, ...load.issues];
  let meta = state.meta;
  if (load.meta.length) {
    const incoming = new Map(load.meta.map((m) => [particleKey(m.sample_id, m.particle_id), m]));
    const replaced = meta.filter((m) => incoming.has(particleKey(m.sample_id, m.particle_id)));
    if (replaced.length) issues.push({ level: "info", code: "META_REPLACED", message: `이미 있던 입자 메타데이터 ${replaced.length}건을 새 파일 값으로 바꿨습니다.` });
    meta = [...meta.filter((m) => !incoming.has(particleKey(m.sample_id, m.particle_id))), ...load.meta];
  }
  let eds = state.eds;
  if (load.eds.length) {
    const incomingKeys = new Set(load.eds.map((r) => particleKey(r.sample_id, r.particle_id)));
    const replaced = new Set(eds.filter((r) => incomingKeys.has(particleKey(r.sample_id, r.particle_id))).map((r) => particleKey(r.sample_id, r.particle_id)));
    if (replaced.size) issues.push({ level: "info", code: "EDS_REPLACED", message: `이미 있던 입자 ${replaced.size}개의 EDS 값을 새 파일 값으로 통째로 바꿨습니다(두 파일 값을 섞지 않음).` });
    eds = [...eds.filter((r) => !incomingKeys.has(particleKey(r.sample_id, r.particle_id))), ...load.eds];
  }
  return {
    state: {
      ...state,
      shared: null,
      origin,
      meta,
      eds,
      pm: [...state.pm, ...load.pm],
      files: [...state.files, ...load.files],
      issues,
      edsSummaries: [...state.edsSummaries, ...load.edsSummaries],
    },
    hazardRules: load.hazardRules,
  };
}

export function joinState(state: DatasetState, settings: AnalysisSettings): JoinResult {
  return joinDataset({
    origin: state.origin ?? "user",
    meta: state.meta,
    eds: state.eds,
    images: state.images,
    overrides: state.overrides,
    settings,
  });
}

/** wt%와 at%가 데이터셋 안에서 어떻게 제공되는지 */
export function basisAvailability(eds: EdsRecord[]): { wt: number; at: number; both: number; none: number } {
  let wt = 0, at = 0, both = 0, none = 0;
  for (const r of eds) {
    const w = r.wt_percent != null, a = r.at_percent != null;
    if (w && a) both++;
    else if (w) wt++;
    else if (a) at++;
    else none++;
  }
  return { wt, at, both, none };
}
