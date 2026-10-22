/* 위치별 기준 시뮬레이터 — 초록의 두 기준을 입자 하나하나에 적용하고 위치별 해당 비율을 낸다.
   - 분석 대상: 최대 길이(최대 Feret 지름) 5–10 µm 단일입자(범위는 바꿀 수 있음)
   - 형상 기준: 종횡비(AR) ≥ 기준값인 비구형 입자
   - 조성 기준: 고른 원소(기본 Fe, Mn, Cu, Ba, Sb; Moreno et al., 2017) 중 하나 이상 검출(원소별 wt% 하한 선택)
   판정할 수 없는 입자(크기·AR 미측정, EDS 결측)는 해당 기준의 분모에서 뺀다 — "해당 안 됨"으로 세지 않는다.
   이 비율은 기준에 해당하는 입자의 비율일 뿐이며 노출량이나 건강 위험의 크기를 뜻하지 않는다. */
import type { AnalysisSettings, Particle } from "./types";
import { elementStatus, isDetectedStatus, quantValue } from "./join";
import { wilson } from "./stats";
import { GANGNAM_SITES, matchSiteText, type SiteDef } from "./sites";

export const MORENO_ELEMENTS = ["Fe", "Mn", "Cu", "Ba", "Sb"];

export interface CriteriaConfig {
  /** 크기 범위 적용 여부 */
  applySize: boolean;
  sizeMin: number;
  sizeMax: number;
  /** 최대 길이(최대 Feret) 또는 등가원 지름 */
  sizeBy: "feret" | "eqd";
  arThreshold: number;
  /** 기준값을 바꿨을 때 비교할 값 */
  arCompare: number;
  elements: string[];
  /** 원소별 wt% 하한(0 또는 없음 = 검출만 보면 됨) */
  minWt: Record<string, number>;
}

export const DEFAULT_CRITERIA: CriteriaConfig = {
  applySize: true,
  sizeMin: 5,
  sizeMax: 10,
  sizeBy: "feret",
  arThreshold: 1.5,
  arCompare: 2.0,
  elements: [...MORENO_ELEMENTS],
  minWt: {},
};

type Tri = boolean | null;

export interface ParticleEval {
  particle: Particle;
  site: SiteDef | null;
  size: number | null;
  inSize: Tri;
  ar: number | null;
  shape: Tri;
  comp: Tri;
  /** 조성 기준을 만족시킨 원소 */
  compHits: string[];
  /** 판정 못 한 원소(결측, 또는 하한이 있는데 정량값이 없음) */
  compUnknown: string[];
  both: Tri;
}

export function siteOfParticle(p: Particle): SiteDef | null {
  return matchSiteText(p.location) ?? matchSiteText(p.meta?.image_filename) ?? null;
}

export function particleSize(p: Particle, by: CriteriaConfig["sizeBy"]): number | null {
  const v = by === "feret" ? p.meta?.feret_diameter : p.meta?.equivalent_diameter;
  return v != null && Number.isFinite(v) ? v : null;
}

function and(a: Tri, b: Tri): Tri {
  if (a === false || b === false) return false;
  if (a === true && b === true) return true;
  return null;
}

export function evaluateComposition(p: Particle, cfg: Pick<CriteriaConfig, "elements" | "minWt">, settings: AnalysisSettings): { comp: Tri; hits: string[]; unknown: string[] } {
  if (!p.edsValid || !cfg.elements.length) return { comp: null, hits: [], unknown: [...cfg.elements] };
  const hits: string[] = [], unknown: string[] = [];
  for (const el of cfg.elements) {
    const { status } = elementStatus(p, el, settings);
    if (status === "missing") { unknown.push(el); continue; }
    if (!isDetectedStatus(status, settings)) continue;
    const floor = cfg.minWt[el] ?? 0;
    if (floor > 0) {
      const wt = quantValue(p, el, "wt");
      if (wt == null) { unknown.push(el); continue; }
      if (wt < floor) continue;
    }
    hits.push(el);
  }
  return { comp: hits.length ? true : unknown.length ? null : false, hits, unknown };
}

export function evaluateParticle(p: Particle, cfg: CriteriaConfig, settings: AnalysisSettings): ParticleEval {
  const size = particleSize(p, cfg.sizeBy);
  const inSize: Tri = !cfg.applySize ? true : size == null ? null : size >= cfg.sizeMin && size <= cfg.sizeMax;
  const arRaw = p.meta?.aspect_ratio;
  const ar = arRaw != null && Number.isFinite(arRaw) ? arRaw : null;
  const shape: Tri = ar == null ? null : ar >= cfg.arThreshold;
  const c = evaluateComposition(p, cfg, settings);
  return { particle: p, site: siteOfParticle(p), size, inSize, ar, shape, comp: c.comp, compHits: c.hits, compUnknown: c.unknown, both: and(shape, c.comp) };
}

export interface Rate {
  k: number;
  n: number;
  pct: number | null;
  ci: { lo: number; hi: number } | null;
}

function rate(evals: ParticleEval[], get: (e: ParticleEval) => Tri): Rate {
  let k = 0, n = 0;
  for (const e of evals) {
    const v = get(e);
    if (v == null) continue;
    n++;
    if (v) k++;
  }
  return { k, n, pct: n ? (k / n) * 100 : null, ci: wilson(k, n) };
}

export interface GroupStats {
  id: string;
  label: string;
  site: SiteDef | null;
  /** 이 그룹의 전체 입자 수 */
  total: number;
  /** 크기를 알 수 없어 뺀 입자 */
  sizeUnknown: number;
  /** 크기 범위 밖이라 뺀 입자 */
  outOfRange: number;
  /** 분석 대상(크기 범위 안) */
  inRange: ParticleEval[];
  shape: Rate;
  comp: Rate;
  both: Rate;
  shapeCompare: Rate;
}

export function groupStats(id: string, label: string, site: SiteDef | null, evals: ParticleEval[], cfg: CriteriaConfig): GroupStats {
  const inRange = evals.filter((e) => e.inSize === true);
  return {
    id, label, site,
    total: evals.length,
    sizeUnknown: evals.filter((e) => e.inSize == null).length,
    outOfRange: evals.filter((e) => e.inSize === false).length,
    inRange,
    shape: rate(inRange, (e) => e.shape),
    comp: rate(inRange, (e) => e.comp),
    both: rate(inRange, (e) => e.both),
    shapeCompare: rate(inRange, (e) => (e.ar == null ? null : e.ar >= cfg.arCompare)),
  };
}

export interface SimulationResult {
  evals: ParticleEval[];
  /** 5개 위치(데이터가 없어도 자리를 둔다) */
  sites: GroupStats[];
  /** 5개 위치 전체 */
  overall: GroupStats;
  /** 위치를 알 수 없는 입자(다른 채취 지점 등) — 위치 비교에 넣지 않고 참고로만 */
  others: GroupStats[];
}

export function simulate(particles: Particle[], cfg: CriteriaConfig, settings: AnalysisSettings): SimulationResult {
  const evals = particles.map((p) => evaluateParticle(p, cfg, settings));
  const sites = GANGNAM_SITES.map((s) => groupStats(s.id, s.label, s, evals.filter((e) => e.site?.id === s.id), cfg));
  const onSite = evals.filter((e) => e.site);
  const overall = groupStats("all", "5개 위치 전체", null, onSite, cfg);
  const rest = new Map<string, ParticleEval[]>();
  for (const e of evals) {
    if (e.site) continue;
    const k = e.particle.location?.trim() || "채취 지점 미입력";
    rest.set(k, [...(rest.get(k) ?? []), e]);
  }
  const others = [...rest.entries()].map(([k, es]) => groupStats(`other:${k}`, k, null, es, cfg));
  return { evals, sites, overall, others };
}

/** AR 기준값을 바꿔 가며 형상 기준 해당 비율(%) — 크기 범위 안·AR 측정 입자 기준 */
export function arSensitivity(groups: GroupStats[], thresholds: number[]): Array<Record<string, number | null> & { t: number }> {
  return thresholds.map((t) => {
    const row: Record<string, number | null> & { t: number } = { t } as never;
    for (const g of groups) {
      const ars = g.inRange.map((e) => e.ar).filter((v): v is number => v != null);
      row[g.id] = ars.length ? (ars.filter((a) => a >= t).length / ars.length) * 100 : null;
    }
    return row;
  });
}

export function thresholdSteps(min = 1, max = 3, step = 0.05): number[] {
  const out: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

const f1 = (v: number | null) => (v == null ? "[ ]" : v.toFixed(1));
const fAr = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(Math.round(v * 100) / 100));

/** 비율이 가장 높은 위치(동률이면 모두). 판정 가능한 입자가 없는 위치는 뺀다 */
export function topSites(sites: GroupStats[], pick: (g: GroupStats) => Rate): GroupStats[] {
  const valid = sites.filter((g) => pick(g).n > 0);
  if (!valid.length) return [];
  const best = Math.max(...valid.map((g) => pick(g).pct ?? -1));
  return valid.filter((g) => Math.abs((pick(g).pct ?? -1) - best) < 1e-9);
}

export interface AbstractBlanks {
  shapeTop: string;
  compTop: string;
  bothOverall: string;
  arFrom: string;
  arTo: string;
  shapeFrom: string;
  shapeTo: string;
  sentence: string;
}

export function compositionLabel(cfg: Pick<CriteriaConfig, "elements" | "minWt">): string {
  return cfg.elements.map((el) => ((cfg.minWt[el] ?? 0) > 0 ? `${el} ≥ ${cfg.minWt[el]} wt%` : el)).join(", ");
}

/** 초록 '분석 결과' 빈칸 채우기 */
export function abstractBlanks(r: SimulationResult, cfg: CriteriaConfig): AbstractBlanks {
  const names = (gs: GroupStats[], pick: (g: GroupStats) => Rate) =>
    gs.length ? `${gs.map((g) => g.site?.short ?? g.label).join("·")}(${gs.map((g) => `${pick(g).k}/${pick(g).n}`).join(", ")}, ${f1(pick(gs[0]).pct)}%)` : "[ ]";
  const shapeTop = names(topSites(r.sites, (g) => g.shape), (g) => g.shape);
  const compTop = names(topSites(r.sites, (g) => g.comp), (g) => g.comp);
  const b = r.overall.both;
  const bothOverall = b.n ? `${f1(b.pct)}%(${b.k}/${b.n})` : "[ ]";
  const shapeFrom = r.overall.shape.n ? `${f1(r.overall.shape.pct)}%` : "[ ]";
  const shapeTo = r.overall.shapeCompare.n ? `${f1(r.overall.shapeCompare.pct)}%` : "[ ]";
  const sizeTxt = cfg.applySize ? `${cfg.sizeBy === "feret" ? "최대 길이" : "등가원 지름"} ${cfg.sizeMin}–${cfg.sizeMax} μm ` : "";
  const sentence =
    `${sizeTxt}입자 ${r.overall.inRange.length}개를 분석한 결과, 형상 기준(종횡비 ${fAr(cfg.arThreshold)} 이상)에 해당하는 입자의 비율은 ${shapeTop}에서, ` +
    `조성 기준(${compositionLabel(cfg)} 검출)에 해당하는 입자의 비율은 ${compTop}에서 가장 높았다. ` +
    `두 기준을 모두 만족하는 입자는 전체의 ${bothOverall}였으며, 종횡비 기준값을 ${fAr(cfg.arThreshold)}에서 ${fAr(cfg.arCompare)}(으)로 바꾸면 형상 기준에 해당하는 입자의 비율은 ${shapeFrom}에서 ${shapeTo}(으)로 달라졌다.`;
  return { shapeTop, compTop, bothOverall, arFrom: fAr(cfg.arThreshold), arTo: fAr(cfg.arCompare), shapeFrom, shapeTo, sentence };
}

/** 시뮬레이터 화면 설정(기준값·지도 마커 위치·평면도) — localStorage와 백업 파일(extras.sim)에 저장 */
export interface SimSettings {
  criteria: CriteriaConfig;
  /** 위치 id → 지도 위 좌표(0–1) */
  positions: Record<string, { x: number; y: number }>;
  /** 사용자가 올린 평면도(축소한 data URL). 없으면 모식도 */
  floorPlan: { url: string; name: string; w: number; h: number } | null;
}

export const DEFAULT_SIM: SimSettings = { criteria: DEFAULT_CRITERIA, positions: {}, floorPlan: null };

export function normalizeSim(v: Partial<SimSettings> | null | undefined): SimSettings {
  return {
    criteria: { ...DEFAULT_CRITERIA, ...(v?.criteria ?? {}), minWt: { ...(v?.criteria?.minWt ?? {}) } },
    positions: { ...(v?.positions ?? {}) },
    floorPlan: v?.floorPlan ?? null,
  };
}
