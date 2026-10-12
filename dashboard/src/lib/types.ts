import type { InstrumentMeta } from "./image/instrument";

/* 데이터 모델 정의.
   세 가지 원천 데이터(입자 메타데이터 · EDS 원소 조성(long format) · 위해성 평가 규칙)를 분리해 관리하고,
   화면에서 쓰는 "입자(Particle)"는 이들을 결합해서 매번 다시 계산한다(파생값은 저장하지 않는다). */

export type DataOrigin = "demo" | "user";

/** wt% (중량%) 와 at% (원자%) — 서로 비교·합산하지 않는다. */
export type Basis = "wt" | "at";

/**
 * 검출 상태.
 * - detected      : 검출(정량값 있음)
 * - below_loq     : 검출한계(LOD) 이상이나 정량한계(LOQ) 미만 — 신호는 있으나 정량값을 신뢰할 수 없음
 * - below_lod     : 검출한계 미만
 * - not_detected  : 미검출(분석 대상이었으나 검출되지 않음)
 * - missing       : 결측(분석 여부·결과를 알 수 없음) — 미검출과 다르다
 */
export type DetectionStatus = "detected" | "below_loq" | "below_lod" | "not_detected" | "missing";

/** 검출 상태를 어떻게 정했는지 — 원본 파일에 명시됐는지, 값에서 추정했는지 */
export type StatusSource =
  | "explicit"        // detection_status 열에 명시
  | "value_text"      // 값 칸에 ND, <LOD 같은 문자로 기재
  | "limit_compare"   // 값과 detection_limit / quantification_limit 비교
  | "inferred_value"  // 상태 정보가 없어 값>0 → 검출, 값=0 → 미검출로 추정
  | "absent_policy";  // 파일에 그 원소 행이 없어 설정(미검출 간주/미분석)에 따라 처리

export type MorphologyClass =
  | "spherical"     // 구형 또는 준구형
  | "angular"       // 각진 파편형
  | "platy"         // 판상형
  | "fibrous"       // 섬유상
  | "agglomerate"   // 응집체
  | "irregular"     // 다공성 또는 불규칙형
  | "undetermined"; // 형상 판별 불가(판정을 시도했으나 결정할 수 없음)

export interface ParticleMeta {
  sample_id: string;
  particle_id: string;
  collection_date: string | null;      // YYYY-MM-DD
  collection_location: string | null;
  image_filename: string | null;
  magnification: number | null;
  scale_bar_value: number | null;      // 원본 단위 그대로
  scale_bar_unit: string | null;       // 표준화된 단위(µm, nm, mm)
  /** 스케일 바의 픽셀 길이. 이 값이 있어야 px → µm 보정이 가능하다(추가 열). */
  scale_bar_px: number | null;
  morphology_class: MorphologyClass | null;
  morphology_raw: string | null;
  /** µm² (size_unit 열이 nm면 변환) */
  projected_area: number | null;
  /** µm */
  equivalent_diameter: number | null;
  classification_method: string | null;
  /** µm/px — 장비 메타데이터(Phenom XML 등)나 사용자가 직접 입력한 픽셀 크기. 있으면 스케일 바보다 우선 */
  pixel_size_um?: number | null;
  /** 이미지 측정 형상 지표(측정한 경우만) */
  feret_diameter?: number | null;     // µm
  circularity?: number | null;
  solidity?: number | null;
  aspect_ratio?: number | null;
  /** 크기·형상 지표를 얻은 방법(예: 이미지 분할 측정 + 사용자 확인, 수동 측정) */
  size_method?: string | null;
  /** 촬영 조건(장비 메타데이터) */
  accelerating_voltage_kv?: number | null;
  working_distance_mm?: number | null;
  detector?: string | null;
  instrument?: string | null;
  acquired_at?: string | null;        // 지역 시각 "YYYY-MM-DD HH:MM"
  sample_type: string | null;          // 예: 측정, 배경(외기), 블랭크 — 선택
  analysis_conditions: string | null;
  notes: string | null;
  sourceFile: string;
  sourceRow: number;
}

export interface EdsRecord {
  sample_id: string;
  particle_id: string;
  element_symbol: string;
  element_name: string;
  wt_percent: number | null;
  at_percent: number | null;
  detection_status: DetectionStatus;
  status_source: StatusSource;
  detection_limit: number | null;
  quantification_limit: number | null;
  measurement_method: string | null;
  /** 원본이 100%로 정규화된 값인지(파일에 명시된 경우만) */
  normalized: boolean | null;
  sourceFile: string;
  sourceRow: number;
}

export interface HazardRule {
  element_symbol: string;
  assessment_category: string;
  reference_name: string | null;
  reference_year: number | null;
  reference_url: string | null;
  applicable_condition: string | null;
  classification_note: string | null;
  /** 노출 시 알려진 건강 영향(문헌 요약) — 비우면 기본 참고 정보(config/healthInfo.ts) 사용 */
  health_effects?: string | null;
  /** 주요 표적 장기 */
  target_organs?: string | null;
  /** 건강 영향 출처: "이름 | URL ; 이름 | URL" */
  health_references?: string | null;
}

/** 선택적: 대기 중 PM 측정값. 입자 분석 결과와 섞어서 계산하지 않고, 보고된 값으로만 표시한다. */
export interface PmRecord {
  sample_id: string | null;
  collection_location: string | null;
  collection_date: string | null;
  pm25: number | null;
  pm10: number | null;
  unit: string | null;
  method: string | null;
  source: string | null;
  sourceFile: string;
  sourceRow: number;
}

export interface ImageAsset {
  filename: string;
  url: string;
  width: number | null;
  height: number | null;
  origin: DataOrigin;
  note: string | null;      // 예: "16비트 TIFF를 대비 조정해 표시"
  synthetic: boolean;       // DEMO 합성 이미지 여부
  /** 이미지 파일에서 읽은 장비 메타데이터(Phenom TIFF 등) */
  instrument?: InstrumentMeta | null;
}

export type IssueLevel = "error" | "warning" | "info";

export interface QualityIssue {
  level: IssueLevel;
  code: string;
  message: string;
  file?: string;
  row?: number;
  particleKey?: string;
}

export interface LoadedFile {
  name: string;
  kind: "metadata" | "eds" | "image" | "pair" | "hazard_rules" | "pm" | "unknown";
  rows: number;
  origin: DataOrigin;
  loadedAt: string;
  note?: string;
}

export interface ElementEntry {
  symbol: string;
  wt: number | null;
  at: number | null;
  status: DetectionStatus;
  statusSource: StatusSource;
  detection_limit: number | null;
  quantification_limit: number | null;
}

export type ImageMatch = "filename" | "basename" | "particle_id" | "none";

export interface ParticleFlag {
  level: IssueLevel;
  code: string;
  message: string;
}

/** 결합된 입자 — 메타데이터, EDS, 이미지, 사용자 수정값을 합친 파생 객체 */
export interface Particle {
  key: string;               // `${sample_id}::${particle_id}`
  sample_id: string;
  particle_id: string;
  origin: DataOrigin;
  meta: ParticleMeta | null;
  elements: Record<string, ElementEntry>;
  hasEds: boolean;
  /** 유효 EDS 분석 입자 여부(EDS 기록이 있고 제외 조건에 걸리지 않음) */
  edsValid: boolean;
  excludeReason: string | null;
  wtSum: number | null;
  atSum: number | null;
  normalized: boolean | null;
  measurementMethod: string | null;
  image: ImageAsset | null;
  imageMatch: ImageMatch;
  morphology: MorphologyClass | null;
  morphologySource: "metadata" | "user" | null;
  classificationMethod: string | null;
  /** µm/px — 스케일 바 값·단위·픽셀 길이가 모두 있을 때만 */
  umPerPx: number | null;
  date: string | null;
  location: string | null;
  flags: ParticleFlag[];
}

export type AbsentElementPolicy = "not_detected" | "not_analyzed";
export type Normalization = "metal" | "total";

export interface AnalysisSettings {
  targetElements: string[];
  /** 정량한계 미만(below_loq)을 "검출"로 셀지 */
  belowLoqCountsAsDetected: boolean;
  /** 파일에 행이 없는 원소의 해석 */
  absentElementPolicy: AbsentElementPolicy;
  /** 조성 합계 허용 범위 ±(%p) */
  sumTolerance: number;
  /** 합계 허용 범위를 벗어난 입자를 유효 분석에서 제외 */
  excludeSumOutliers: boolean;
  /** 입자 유형·발생원 규칙의 정규화 기준 */
  normalization: Normalization;
  /** 차트 기본 표시 기준 */
  displayBasis: Basis;
  /** 탄소 코팅·기판·스퍼터 코팅 등 시료 준비 유래 가능 원소 */
  preparationElements: string[];
  /** 코팅·기판 신호 영향을 확인했는지(사용자가 확인 후 체크) */
  preparationChecked: boolean;
}

export interface UserOverride {
  morphology?: MorphologyClass | null;
  morphologyMethod?: string;
  note?: string;
  excluded?: boolean;
}

export interface Filters {
  dateFrom: string | null;
  dateTo: string | null;
  samples: string[];
  locations: string[];
  morphologies: string[];       // MorphologyClass 또는 "none"
  element: string | null;       // 해당 원소가 검출된 입자만
  targetStatus: "all" | "positive" | "negative" | "undetermined";
}

export const EMPTY_FILTERS: Filters = {
  dateFrom: null,
  dateTo: null,
  samples: [],
  locations: [],
  morphologies: [],
  element: null,
  targetStatus: "all",
};
