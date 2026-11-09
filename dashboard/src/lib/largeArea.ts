/* 대면적 자동 분석(Phenom Particle Inspector) 데이터 — public/shared-data/large-area.json(scripts/build-large-area.py로 생성).
   SEM-EDS 단일입자 데이터와 같은 규칙 엔진(simulate)에 넣을 수 있도록 가벼운 Particle 객체로 바꾼다.
   - 크기: DMax(최대 길이, µm) → meta.feret_diameter
   - 형상: Aspect(종횡비) → meta.aspect_ratio
   - 조성: 원소 wt%(합 100%로 정규화된 값). 측정 원소 목록에 있는 원소는 0이면 '미검출'로 둔다.
   - 지점: 파일 이름 앞부분(D, B-28, E-2, F-1 …). 지점이 아닌 파일(Free Filter, Bio Filter)은 참조 그룹으로 지점 통계에서 빠진다. */
import type { ElementEntry, Particle } from "./types";

export interface LargeAreaGroup {
  id: string;
  tag: string;
  file: string;
  /** 파일 이름과 실제 지점이 다를 때 설명 */
  note?: string | null;
  siteId: string | null;
  label: string;
  n: number;
  elements: string[];
  mag: string[];
  classification: string[];
  sumMean: number | null;
  dmax: number[];
  ar: Array<number | null>;
  wt10: Record<string, number[]>;
}

export interface LargeAreaData {
  source: string;
  builtAt: string;
  instrument: string;
  scale: { dmax: number; ar: number; wt: number };
  groups: LargeAreaGroup[];
}

export interface LargeAreaSet {
  data: LargeAreaData;
  /** 지점 그룹 입자(시뮬레이터 입력) */
  particles: Particle[];
  /** 그룹별 입자(참조 그룹 포함) */
  byGroup: Record<string, Particle[]>;
}

export const LARGE_AREA_PATH = "shared-data/large-area.json";

let cache: Promise<LargeAreaSet | null> | null = null;

/** 한 번만 읽는다(오프라인판은 HTML 안에 넣은 값을 쓴다). 파일이 없으면 null. */
export function loadLargeArea(): Promise<LargeAreaSet | null> {
  if (!cache) {
    cache = (async () => {
      const embedded = (globalThis as { __SEMEDS_LARGE__?: LargeAreaData }).__SEMEDS_LARGE__;
      let data: LargeAreaData | null = embedded ?? null;
      if (!data) {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}${LARGE_AREA_PATH}`, { cache: "no-cache" });
          if (!res.ok) return null;
          data = (await res.json()) as LargeAreaData;
        } catch {
          return null;
        }
      }
      return buildLargeArea(data);
    })();
    cache.catch(() => (cache = null));
  }
  return cache;
}

function notDetected(symbol: string): ElementEntry {
  return { symbol, wt: 0, at: null, status: "not_detected", statusSource: "explicit", detection_limit: null, quantification_limit: null };
}

export function buildLargeArea(data: LargeAreaData): LargeAreaSet {
  const byGroup: Record<string, Particle[]> = {};
  const particles: Particle[] = [];
  const { dmax: sd, ar: sa, wt: sw } = data.scale;
  for (const g of data.groups) {
    const zero: Record<string, ElementEntry> = Object.fromEntries(g.elements.map((e) => [e, notDetected(e)]));
    const location = g.siteId ? g.label : `참조: ${g.label}`;
    const sample = `대면적:${g.tag}`;
    const list: Particle[] = new Array(g.n);
    for (let i = 0; i < g.n; i++) {
      const elements: Record<string, ElementEntry> = {};
      let sum = 0;
      for (const e of g.elements) {
        const v = g.wt10[e][i] / sw;
        sum += v;
        elements[e] = v > 0 ? { symbol: e, wt: v, at: null, status: "detected", statusSource: "explicit", detection_limit: null, quantification_limit: null } : zero[e];
      }
      const a = g.ar[i];
      list[i] = {
        key: `LA:${g.id}:${i + 1}`,
        sample_id: sample,
        particle_id: String(i + 1),
        origin: "user",
        meta: {
          sample_id: sample,
          particle_id: String(i + 1),
          collection_date: null,
          collection_location: location,
          image_filename: null,
          magnification: Number(g.mag[0]) || null,
          scale_bar_value: null,
          scale_bar_unit: null,
          scale_bar_px: null,
          morphology_class: null,
          morphology_raw: null,
          projected_area: null,
          equivalent_diameter: null,
          classification_method: "Phenom Particle Inspector 자동 분석",
          feret_diameter: g.dmax[i] / sd,
          aspect_ratio: a == null ? null : a / sa,
          size_method: "Particle Inspector DMax",
          sample_type: g.siteId ? "측정(대면적)" : "참조(대면적)",
          analysis_conditions: null,
          notes: null,
          sourceFile: g.file,
          sourceRow: i + 2,
        },
        elements,
        hasEds: true,
        edsValid: true,
        excludeReason: null,
        wtSum: sum,
        atSum: null,
        normalized: true,
        measurementMethod: "Particle Inspector EDS",
        image: null,
        imageMatch: "none",
        morphology: null,
        morphologySource: null,
        classificationMethod: "Phenom Particle Inspector 자동 분석",
        umPerPx: null,
        date: null,
        location,
        flags: [],
      };
    }
    byGroup[g.id] = list;
    if (g.siteId) particles.push(...list);
  }
  return { data, particles, byGroup };
}
