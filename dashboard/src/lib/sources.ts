/* 규칙 기반 AI 시뮬레이터 — 발생원 판정 엔진(초록 ver1.1).
   선행연구에서 제시된 발생원별 지표 조건(원소 조성 + 형상)을 규칙으로 두고, 입자마다 조성·형상 조건을
   동시에 적용해 발생원 유형을 판정한다. 판정 결과는 지점별로 집계하고(비율, 95% 신뢰구간, 지점 간 차이 검정),
   규칙에 연결된 건강 영향과 함께 보여준다.
   - 원소 값 = 입자 위 EDS 스폿 3곳 평균 wt%. 검출 = 평균 > 0(스폿 중 한 곳 이상에서 검출).
   - 판정할 수 없는 입자(형상 미측정, EDS 없음)는 그 규칙의 분모에서 뺀다.
   - 비율은 '규칙에 해당하는 입자의 비율'이며 노출량이나 건강 위험의 크기가 아니다. */
import type { AnalysisSettings, Particle } from "./types";
import { elementStatus, isDetectedStatus, quantValue } from "./join";
import { fisherExact, wilson } from "./stats";
import { GANGNAM_SITES, matchSiteText, type SiteDef } from "./sites";

/* ---------- 규칙 정의 ---------- */

export type Cond =
  | { kind: "minWt"; el: string; key: string }              // el ≥ th[key] wt%
  | { kind: "detectedAll"; els: string[] }                   // 모두 검출
  | { kind: "detectedAny"; els: string[] }                   // 하나 이상 검출
  | { kind: "sumMinWt"; els: string[]; key: string }         // 합 ≥ th[key] wt%
  | { kind: "arMin"; key: string }                           // 종횡비 ≥ th[key]
  | { kind: "arMax"; key: string };                          // 종횡비 < th[key]

export interface HealthLink {
  effect: string;
  refs: string;
  /** 근거의 종류(세포 실험, 역학, 분류 기관 등) */
  evidence: string;
}

export interface SourceRule {
  id: string;
  /** 발생원(지점 유형) */
  source: string;
  /** 입자 유형 이름 */
  label: string;
  /** 이 발생원이 예상되는 지점 */
  siteId: string;
  conds: Cond[];
  /** 해당 입자 중 부가 지표(예: Mn·Cu 동반)의 비율 */
  sub?: { label: string; conds: Cond[] };
  /** 판정에 쓰는 지표 원소 — 데이터에서 한 번도 나오지 않으면 '원소 목록 확인/추가 분석 필요' */
  indicators: string[];
  basis: string;     // 판정 근거(문헌)
  health: HealthLink;
  caution?: string;
  color: string;
}

export const THRESHOLD_LABELS: Record<string, { label: string; unit: string; step: number }> = {
  feMin: { label: "철도 마모: Fe 하한", unit: "wt%", step: 1 },
  fiberAr: { label: "섬유: 종횡비 하한", unit: "", step: 0.1 },
  fiberCO: { label: "섬유: C+O 합 하한", unit: "wt%", step: 5 },
  talcMg: { label: "탈크: Mg 하한", unit: "wt%", step: 0.5 },
  talcSi: { label: "탈크: Si 하한", unit: "wt%", step: 1 },
  cRich: { label: "조리: C 하한(C-rich)", unit: "wt%", step: 5 },
  sphereAr: { label: "조리: 구형 종횡비 상한", unit: "", step: 0.05 },
  cafeC: { label: "카페: 유기(C) 하한", unit: "wt%", step: 5 },
};

export const DEFAULT_THRESHOLDS: Record<string, number> = {
  feMin: 10, fiberAr: 3, fiberCO: 60, talcMg: 3, talcSi: 10, cRich: 50, sphereAr: 1.2, cafeC: 20,
};

/* 문헌 데이터베이스(초록에 인용된 선행연구 기준). 건강 영향 문구는 초록·문헌에 보고된 범위만 쓴다. */
export const SOURCE_RULES: SourceRule[] = [
  {
    id: "rail", source: "철도 마모", label: "Fe-rich 입자", siteId: "gate",
    conds: [{ kind: "minWt", el: "Fe", key: "feMin" }],
    sub: { label: "Mn 또는 Cu 동반", conds: [{ kind: "detectedAny", els: ["Mn", "Cu"] }] },
    indicators: ["Fe", "Mn", "Cu", "Ba"],
    basis: "철도 마모 입자는 Fe, Mn, Cu, Ba를 포함한 판상 입자(Moreno et al., 2017)",
    health: { effect: "DNA 손상·산화 스트레스(지하철 입자, 폐 상피세포), 브레이크 패드 안티몬(Sb)의 발암성 우려 — 단, 지하철 종사자의 단기 호흡기 영향은 관찰되지 않았다는 보고도 있음", refs: "Karlsson et al., 2005; von Uexküll et al., 2005; Scand J Work Environ Health, 2011", evidence: "세포 실험·문헌 검토·역학" },
    color: "#b5381a",
  },
  {
    id: "fiber", source: "의류(섬유)", label: "섬유상 C·O 입자", siteId: "clothing",
    conds: [{ kind: "arMin", key: "fiberAr" }, { kind: "sumMinWt", els: ["C", "O"], key: "fiberCO" }],
    sub: { label: "Ti 검출(첨가 원소)", conds: [{ kind: "detectedAny", els: ["Ti"] }] },
    indicators: ["C", "O", "Ti"],
    basis: "섬유 입자는 종횡비 3 이상의 형상과 Ti 등 첨가 원소를 보임(Vianello et al., 2019; Filella et al., 2022)",
    health: { effect: "면방직 노동자의 폐기능 15년 추적 보고(면 분진 직업 노출), 실내 공기 중 섬유상 미세플라스틱의 흡입 노출 확인", refs: "Christiani et al., 2001; Vianello et al., 2019", evidence: "역학(직업)·노출 평가" },
    caution: "종횡비는 섬유 필터 배경 위 자동 측정값이라 검토가 필요하다.",
    color: "#2a78d6",
  },
  {
    id: "talc", source: "화장품", label: "Mg-Si 판상(탈크) 입자", siteId: "cosmetic",
    conds: [{ kind: "minWt", el: "Mg", key: "talcMg" }, { kind: "minWt", el: "Si", key: "talcSi" }],
    indicators: ["Mg", "Si"],
    basis: "화장품·향수 상점 주변 입자는 Mg-Si 판상의 탈크를 포함(Rasmussen et al., 2019)",
    health: { effect: "탈크: IARC 2A군(인체 발암 추정, 2024), 화장용 탈크 흡입에 따른 폐 육아종증 증례", refs: "IARC Monographs Vol. 136; Jasuja et al., 2017", evidence: "분류 기관·증례" },
    caution: "Si는 유리섬유 필터에서도 나오므로 Mg 기준이 중요하다.",
    color: "#e87ba4",
  },
  {
    id: "tizn", source: "화장품", label: "Ti 또는 Zn 함유 입자", siteId: "cosmetic",
    conds: [{ kind: "detectedAny", els: ["Ti", "Zn"] }],
    indicators: ["Ti", "Zn"],
    basis: "화장품 입자는 TiO₂·ZnO를 포함(Shi et al., 2013)",
    health: { effect: "호흡성 TiO₂ 입자: IARC 2B군, 캘리포니아 Prop 65 경고 대상 / ZnO 흄: 금속흄열", refs: "IARC Monographs Vol. 93; OEHHA Prop 65; ATSDR Zinc", evidence: "분류 기관" },
    caution: "필터(유리섬유)에서도 Zn·Ti가 검출될 수 있어 과대 판정 가능성이 있다.",
    color: "#4a3aa7",
  },
  {
    id: "cas", source: "조리(음식점)", label: "Ca-S 입자", siteId: "food",
    conds: [{ kind: "detectedAll", els: ["Ca", "S"] }],
    indicators: ["Ca", "S"],
    basis: "조리 시 발생 입자는 C-rich 구형 입자와 Ca-S 입자를 포함(Li et al., 2019; Dou et al., 2018), 조리 방식별 PM2.5 성분비(Wang et al., 2015)",
    health: { effect: "고온 조리 배출물: IARC 2A군(튀김 등 고온 조리 배출물)", refs: "IARC Monographs Vol. 95", evidence: "분류 기관" },
    color: "#eda100",
  },
  {
    id: "csphere", source: "조리(음식점)", label: "C-rich 구형 입자", siteId: "food",
    conds: [{ kind: "minWt", el: "C", key: "cRich" }, { kind: "arMax", key: "sphereAr" }],
    indicators: ["C"],
    basis: "조리 시 C-rich 구형 입자 발생(Li et al., 2019)",
    health: { effect: "고온 조리 배출물: IARC 2A군", refs: "IARC Monographs Vol. 95", evidence: "분류 기관" },
    color: "#8a6d1d",
  },
  {
    id: "nacl", source: "조리(음식점)", label: "Na-Cl 입자", siteId: "food",
    conds: [{ kind: "detectedAll", els: ["Na", "Cl"] }],
    indicators: ["Na", "Cl"],
    basis: "음식점 시료의 Na-Cl 입자(조리·식품 유래 염)",
    health: { effect: "보고된 건강 영향 근거 제한적", refs: "—", evidence: "—" },
    caution: "Na는 유리섬유 필터에서도 나온다.",
    color: "#1baf7a",
  },
  {
    id: "cafe", source: "카페·간편식", label: "K·P 동반 유기 입자", siteId: "cafe",
    conds: [{ kind: "detectedAll", els: ["K", "P"] }, { kind: "minWt", el: "C", key: "cafeC" }],
    indicators: ["K", "P", "Ca"],
    basis: "카페 분진은 K, Ca, P를 포함한 불규칙 유기 입자(Zarrinbakhsh et al., 2016), 베이커리 실내 PM에서 K가 제빵 지표(Ielpo et al., 2020)",
    health: { effect: "커피 로스팅·포장 종사자의 호흡기 이상, 제빵사 천식·비염의 용량반응 관계", refs: "Bailey et al., 2020; Brisman et al., 2000", evidence: "역학(직업)" },
    color: "#66645e",
  },
];

/* ---------- 입자 판정 ---------- */

type Tri = boolean | null;

export interface SimConfig {
  thresholds: Record<string, number>;
  /** 분석 대상 크기(최대 Feret) 선별 */
  applySize: boolean;
  sizeMin: number;
  sizeMax: number;
}

export const DEFAULT_SIM_CONFIG: SimConfig = { thresholds: { ...DEFAULT_THRESHOLDS }, applySize: true, sizeMin: 5, sizeMax: 10 };

function wt(p: Particle, el: string): number {
  return quantValue(p, el, "wt") ?? 0;
}

function detected(p: Particle, el: string, s: AnalysisSettings): Tri {
  const { status } = elementStatus(p, el, s);
  if (status === "missing") return null;
  return isDetectedStatus(status, s) && wt(p, el) > 0;
}

function and(vals: Tri[]): Tri {
  if (vals.some((v) => v === false)) return false;
  if (vals.every((v) => v === true)) return true;
  return null;
}

export function evalCond(p: Particle, c: Cond, th: Record<string, number>, s: AnalysisSettings): Tri {
  if (!p.edsValid && c.kind !== "arMin" && c.kind !== "arMax") return null;
  const ar = p.meta?.aspect_ratio;
  switch (c.kind) {
    case "minWt": return wt(p, c.el) >= th[c.key];
    case "detectedAll": return and(c.els.map((e) => detected(p, e, s)));
    case "detectedAny": {
      const v = c.els.map((e) => detected(p, e, s));
      return v.some((x) => x === true) ? true : v.some((x) => x === null) ? null : false;
    }
    case "sumMinWt": return c.els.reduce((a, e) => a + wt(p, e), 0) >= th[c.key];
    case "arMin": return ar == null || !Number.isFinite(ar) ? null : ar >= th[c.key];
    case "arMax": return ar == null || !Number.isFinite(ar) ? null : ar < th[c.key];
  }
}

export function evalRule(p: Particle, r: SourceRule, th: Record<string, number>, s: AnalysisSettings): { match: Tri; sub: Tri } {
  const match = and(r.conds.map((c) => evalCond(p, c, th, s)));
  const sub = match && r.sub ? and(r.sub.conds.map((c) => evalCond(p, c, th, s))) : null;
  return { match, sub };
}

export interface ParticleJudgement {
  particle: Particle;
  site: SiteDef | null;
  size: number | null;
  inSize: Tri;
  results: Record<string, { match: Tri; sub: Tri }>;
  /** 해당한 규칙 id */
  matched: string[];
}

export function siteOf(p: Particle): SiteDef | null {
  return matchSiteText(p.location) ?? matchSiteText(p.sample_id);
}

export function judgeParticle(p: Particle, cfg: SimConfig, s: AnalysisSettings, rules = SOURCE_RULES): ParticleJudgement {
  const f = p.meta?.feret_diameter;
  const size = f != null && Number.isFinite(f) ? f : null;
  const inSize: Tri = !cfg.applySize ? true : size == null ? null : size >= cfg.sizeMin && size <= cfg.sizeMax;
  const results: ParticleJudgement["results"] = {};
  for (const r of rules) results[r.id] = evalRule(p, r, cfg.thresholds, s);
  return { particle: p, site: siteOf(p), size, inSize, results, matched: rules.filter((r) => results[r.id].match === true).map((r) => r.id) };
}

/* ---------- 지점별 집계 ---------- */

export interface Rate {
  k: number;
  n: number;
  pct: number | null;
  ci: { lo: number; hi: number } | null;
}

export interface RuleStat extends Rate {
  sub: Rate | null;
  /** 이 지점 vs 나머지 지점 Fisher 정확검정 p */
  p: number | null;
}

export interface SiteResult {
  site: SiteDef;
  /** 지점의 전체 입자 */
  total: number;
  /** 분석 대상(크기 범위 안) */
  judged: ParticleJudgement[];
  rules: Record<string, RuleStat>;
}

function rate(k: number, n: number): Rate {
  return { k, n, pct: n ? (k / n) * 100 : null, ci: wilson(k, n) };
}

export interface Simulation {
  judgements: ParticleJudgement[];
  sites: SiteResult[];
  overall: Record<string, Rate>;
  /** 지점에 배정되지 않은 입자 수 */
  unassigned: number;
}

export function simulate(particles: Particle[], cfg: SimConfig, s: AnalysisSettings, rules = SOURCE_RULES): Simulation {
  const judgements = particles.map((p) => judgeParticle(p, cfg, s, rules));
  const pool = judgements.filter((j) => j.site && j.inSize === true);
  const count = (js: ParticleJudgement[], id: string) => {
    const ev = js.filter((j) => j.results[id].match !== null);
    return { k: ev.filter((j) => j.results[id].match).length, n: ev.length, ev };
  };
  const sites = GANGNAM_SITES.map((site) => {
    const judged = pool.filter((j) => j.site!.id === site.id);
    const rest = pool.filter((j) => j.site!.id !== site.id);
    const stats: Record<string, RuleStat> = {};
    for (const r of rules) {
      const a = count(judged, r.id), b = count(rest, r.id);
      const matched = a.ev.filter((j) => j.results[r.id].match);
      const subEv = matched.filter((j) => j.results[r.id].sub !== null);
      stats[r.id] = {
        ...rate(a.k, a.n),
        sub: r.sub ? rate(subEv.filter((j) => j.results[r.id].sub).length, subEv.length) : null,
        p: a.n && b.n ? fisherExact(a.k, a.n - a.k, b.k, b.n - b.k) : null,
      };
    }
    return { site, total: judgements.filter((j) => j.site?.id === site.id).length, judged, rules: stats };
  });
  const overall: Record<string, Rate> = {};
  for (const r of rules) {
    const c = count(pool, r.id);
    overall[r.id] = rate(c.k, c.n);
  }
  return { judgements, sites, overall, unassigned: judgements.filter((j) => !j.site).length };
}

/* ---------- 관리·추가 분석 판단 ---------- */

/** 비율 p를 ±margin(비율) 오차로 추정하는 데 필요한 입자 수(정규 근사, 95%) */
export function requiredN(pPct: number | null, margin = 0.15): number {
  const p = Math.min(0.9, Math.max(0.1, (pPct ?? 50) / 100));
  return Math.ceil((1.96 * 1.96 * p * (1 - p)) / (margin * margin));
}

export interface SiteAdvice {
  /** 우선 관리 입자(해당 비율 순) */
  priority: Array<{ rule: SourceRule; stat: RuleStat }>;
  /** 이 지점에서 예상되는 발생원 규칙의 결과 */
  expected: Array<{ rule: SourceRule; stat: RuleStat }>;
  /** 신뢰구간 ±15%p 이내로 추정하려면 필요한 입자 수 */
  needN: number;
}

export function siteAdvice(res: SiteResult, rules = SOURCE_RULES): SiteAdvice {
  const list = rules.map((rule) => ({ rule, stat: res.rules[rule.id] }));
  const priority = list.filter((x) => x.stat.k > 0).sort((a, b) => (b.stat.pct ?? 0) - (a.stat.pct ?? 0));
  const expected = list.filter((x) => x.rule.siteId === res.site.id);
  const top = priority[0]?.stat.pct ?? expected[0]?.stat.pct ?? 50;
  return { priority, expected, needN: requiredN(top) };
}

/** 지표 원소 중 데이터 전체에서 한 번도 검출되지 않은 원소 — 측정 원소 목록에 넣었는지 확인 필요 */
export function missingIndicators(particles: Particle[], rules = SOURCE_RULES): Array<{ el: string; rules: SourceRule[] }> {
  const seen = new Set<string>();
  for (const p of particles) for (const [el, e] of Object.entries(p.elements)) if (e.status === "detected" && (e.wt ?? 0) > 0) seen.add(el);
  const map = new Map<string, SourceRule[]>();
  for (const r of rules) for (const el of r.indicators) if (!seen.has(el)) map.set(el, [...(map.get(el) ?? []), r]);
  return [...map.entries()].map(([el, rs]) => ({ el, rules: rs }));
}

/** 조건을 사람이 읽는 문장으로 */
export function condText(c: Cond, th: Record<string, number>): string {
  switch (c.kind) {
    case "minWt": return `${c.el} ≥ ${th[c.key]} wt%`;
    case "detectedAll": return `${c.els.join("·")} 모두 검출`;
    case "detectedAny": return `${c.els.join(" 또는 ")} 검출`;
    case "sumMinWt": return `${c.els.join("+")} ≥ ${th[c.key]} wt%`;
    case "arMin": return `종횡비 ≥ ${th[c.key]}`;
    case "arMax": return `종횡비 < ${th[c.key]}(구형)`;
  }
}

export function ruleText(r: SourceRule, th: Record<string, number>): string {
  return r.conds.map((c) => condText(c, th)).join(" 그리고 ");
}

/* ---------- 화면 설정(저장용) ---------- */

export interface SimSettings {
  config: SimConfig;
  positions: Record<string, { x: number; y: number }>;
  floorPlan: { url: string; name: string; w: number; h: number } | null;
}

export const DEFAULT_SIM: SimSettings = { config: DEFAULT_SIM_CONFIG, positions: {}, floorPlan: null };

export function normalizeSim(v: Partial<SimSettings> | null | undefined): SimSettings {
  const c = (v?.config ?? {}) as Partial<SimConfig>;
  return {
    config: { ...DEFAULT_SIM_CONFIG, ...c, thresholds: { ...DEFAULT_THRESHOLDS, ...(c.thresholds ?? {}) } },
    positions: { ...(v?.positions ?? {}) },
    floorPlan: v?.floorPlan ?? null,
  };
}
