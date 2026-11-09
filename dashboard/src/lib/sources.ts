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
  /** 지표 원소가 유리섬유 필터에서도 나올 수 있어 과대 판정 가능 — 세포 실험 시료 후보에서 뺀다 */
  filterSensitive?: boolean;
  color: string;
}

export const THRESHOLD_LABELS: Record<string, { label: string; unit: string; step: number }> = {
  nonSphereAr: { label: "비구형: 종횡비 하한", unit: "", step: 0.1 },
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
  nonSphereAr: 1.5, feMin: 10, fiberAr: 3, fiberCO: 60, talcMg: 3, talcSi: 10, cRich: 50, sphereAr: 1.2, cafeC: 20,
};

/* 문헌 데이터베이스(연구진 문헌 목록 70편, src/config/literatureDb.json) 기준. 괄호 안 A·B 번호는 문헌 번호.
   인체 영향 문구는 문헌에 보고된 범위만 쓰며, 대부분 직업 노출·고농도 실험 연구의 사례다. */
export const SOURCE_RULES: SourceRule[] = [
  {
    id: "rail", source: "철도 마모", label: "Fe-rich 입자", siteId: "gate",
    conds: [{ kind: "minWt", el: "Fe", key: "feMin" }],
    sub: { label: "Mn 또는 Cu 동반", conds: [{ kind: "detectedAny", els: ["Mn", "Cu"] }] },
    indicators: ["Fe", "Mn", "Cu", "Ba", "Sb"],
    basis: "지하철 바퀴·레일·브레이크 마모 산화철과 Mn, Ba(Moreno et al., 2015, A04), 브레이크 마모 추적 원소 Cu·Sb(Grigoratos & Martini, 2015, A05), 서울 지하철 Fe 함유 입자 85–88%(Kim et al., 2010, A06), 철 함유 판상·파편형 입자(Moreno et al., 2017, A12)",
    health: { effect: "지하철 입자의 유전독성이 도로 입자보다 높음(폐 상피세포), 터널 PM 독성과 산화철 나노입자의 상관, Mn 누적 노출과 파킨슨증 진행(용접공), 3가 안티몬 IARC 2A군 — 단, 지하철 노출 수준의 장기 건강 위험은 낮다는 평가도 있음", refs: "Karlsson et al., 2005 (A15); Le et al., 2020 (B08); Racette et al., 2017 (B09); Karagas et al., 2022 (B14); Seaton et al., 2005 (B01)", evidence: "세포 독성·역학·분류 기관·위험도 평가" },
    color: "#b5381a",
  },
  {
    id: "fiber", source: "의류(섬유)", label: "섬유상 C·O 입자", siteId: "clothing",
    conds: [{ kind: "arMin", key: "fiberAr" }, { kind: "sumMinWt", els: ["C", "O"], key: "fiberCO" }],
    sub: { label: "Ti 또는 Zn 검출(첨가 원소)", conds: [{ kind: "detectedAny", els: ["Ti", "Zn"] }] },
    indicators: ["C", "O", "Ti", "Zn"],
    basis: "실내 미세섬유는 종횡비 3 이상(Vianello et al., 2019, A18; Dris et al., 2017, A19), 섬유 제품의 TiO₂(Filella et al., 2022, A16), 의류매장 실내 PM에서 Zn이 크게 농축(Furst et al., 2025, A17)",
    health: { effect: "공기 중 미세플라스틱 흡입에 따른 기도·간질 염증 보고, 나일론 섬유 노동자의 만성 간질성 폐질환(플록 노동자 폐), 나노 ZnO 흡입 시 농도 의존적 전신 염증 반응", refs: "Prata, 2018 (B15); Kern, 1998 (B16); Monsé et al., 2018 (B17)", evidence: "리뷰·질병·인체 노출 실험" },
    caution: "종횡비는 섬유 필터 배경 위 자동 측정값이라 검토가 필요하다.",
    color: "#2a78d6",
  },
  {
    id: "talc", source: "화장품", label: "Mg-Si 판상(탈크) 입자", siteId: "cosmetic",
    conds: [{ kind: "minWt", el: "Mg", key: "talcMg" }, { kind: "minWt", el: "Si", key: "talcSi" }],
    indicators: ["Mg", "Si"],
    basis: "화장용 탈크 제품 사용 시 공기 중 입자의 90–98%가 탈크(Mg-Si 판상)(Rasmussen et al., 2019, A22)",
    health: { effect: "화장용 파우더 흡입 후 폐 탈크증·폐 육아종증 증례, 석면 없는 탈크 IARC 2A군(2024)", refs: "Cho et al., 2021 (B18); Jasuja et al., 2017 (A25); Ahmadi et al., 2024 (B19)", evidence: "질병 사례·분류 기관" },
    caution: "판상 여부는 2D 사진만으로 구분할 수 없어 조성 조건으로 판정한다. Si는 유리섬유 필터에서도 나오므로 Mg 기준이 중요하다.",
    color: "#e87ba4",
  },
  {
    id: "tizn", source: "화장품", label: "Ti 또는 Zn 함유 입자", siteId: "cosmetic",
    conds: [{ kind: "detectedAny", els: ["Ti", "Zn"] }],
    indicators: ["Ti", "Zn"],
    basis: "화장용 파우더의 TiO₂·산화철 안료와 ZnO(Rasmussen et al., 2019, A22), 의류매장 실내 PM의 Zn 농축(Furst et al., 2025, A17)",
    health: { effect: "TiO₂ 나노입자 독성 자료, Zn 흄의 금속흄열(노출 4–10시간 후 독감 유사 증상), 나노 ZnO 흡입 시 전신 염증 반응", refs: "Shi et al., 2013 (B20); Greenberg & Vearrier, 2015 (B21); Monsé et al., 2018 (B17)", evidence: "리뷰·질병 리뷰·인체 노출 실험" },
    caution: "필터(유리섬유)에서도 Zn·Ti가 검출될 수 있어 과대 판정 가능성이 있다.",
    filterSensitive: true,
    color: "#4a3aa7",
  },
  {
    id: "cas", source: "조리(음식점)", label: "Ca-S 입자", siteId: "food",
    conds: [{ kind: "detectedAll", els: ["Ca", "S"] }],
    indicators: ["Ca", "S"],
    basis: "음식점 PM에서 Ca-S 직사각형 입자가 가장 많음(물 조리)(Li et al., 2019, A26), 조리 방식별 PM2.5 성분(Wang et al., 2015, A29)",
    health: { effect: "고온 튀김 배출물 발암성 평가(IARC), 조리 흄 누적 노출과 폐암 위험, 국내 학교 조리사의 폐 CT 이상·폐암 위험 증가", refs: "Straif et al., 2006 (B23); Yu et al., 2006 (B24); Kim et al., 2024 (B26); Jang et al., 2025 (B27)", evidence: "분류 기관·역학" },
    color: "#eda100",
  },
  {
    id: "csphere", source: "조리(음식점)", label: "C-rich 구형 입자", siteId: "food",
    conds: [{ kind: "minWt", el: "C", key: "cRich" }, { kind: "arMax", key: "sphereAr" }],
    indicators: ["C"],
    basis: "기름 조리 시 C-rich 구형 입자 발생(Li et al., 2019, A26)",
    health: { effect: "고온 튀김 배출물 발암성 평가(IARC), 고기 볶음 조리 흄과 폐암 위험", refs: "Straif et al., 2006 (B23); Seow et al., 2000 (B25); Yu et al., 2006 (B24)", evidence: "분류 기관·역학" },
    color: "#8a6d1d",
  },
  {
    id: "nacl", source: "조리(음식점)", label: "Na-Cl 입자", siteId: "food",
    conds: [{ kind: "detectedAll", els: ["Na", "Cl"] }],
    indicators: ["Na", "Cl"],
    basis: "조리 PM2.5에서 가장 많은 원소는 Na로, 소금 사용에서 비롯됨(Zhang et al., 2017, A27)",
    health: { effect: "Na·Cl 원소 단위의 질병 사례 문헌은 없음 — 발생원(조리 흄) 단위 사례로 대신", refs: "Straif et al., 2006 (B23); Yu et al., 2006 (B24)", evidence: "분류 기관·역학(발생원 단위)" },
    caution: "Na는 유리섬유 필터에서도 나온다.",
    filterSensitive: true,
    color: "#1baf7a",
  },
  {
    id: "cafe", source: "카페·간편식", label: "K·P 동반 불규칙 유기 입자", siteId: "cafe",
    conds: [{ kind: "detectedAll", els: ["K", "P"] }, { kind: "minWt", el: "C", key: "cafeC" }, { kind: "arMin", key: "nonSphereAr" }],
    indicators: ["K", "P", "Ca", "Mg"],
    basis: "커피 찌꺼기 무기 성분 상위 4종이 K, P, Ca, Mg(Campos de Bomfim et al., 2022, A31), 베이커리 실내 PM에서 K가 지표(Ielpo et al., 2020, A35)",
    caution: "'불규칙 유기 입자'라는 형상 근거(Zarrinbakhsh et al., 2016)는 서지 미확인으로 문헌 DB에서 빠졌다.",
    health: { effect: "커피 노동자 천식(생두 알레르기), 커피 분진 고농도 노출 시 비결막 증상·기도 과민성, 커피 가공 공장 노동자의 만성 호흡기 증상·폐기능 저하", refs: "Karr et al., 1978 (B28); Oldenburg et al., 2009 (B29); Bråtveit et al., 2021 (B30)", evidence: "질병·역학(직업)" },
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
  /** 비구형(종횡비 ≥ 기준값) 여부 */
  nonSphere: Tri;
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
  const ar = p.meta?.aspect_ratio;
  const nonSphere: Tri = ar == null || !Number.isFinite(ar) ? null : ar >= cfg.thresholds.nonSphereAr;
  return { particle: p, site: siteOf(p), size, inSize, nonSphere, results, matched: rules.filter((r) => results[r.id].match === true).map((r) => r.id) };
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
  /** 비구형 입자 비율 */
  nonSphere: RuleStat;
}

function rate(k: number, n: number): Rate {
  return { k, n, pct: n ? (k / n) * 100 : null, ci: wilson(k, n) };
}

export interface Simulation {
  judgements: ParticleJudgement[];
  sites: SiteResult[];
  overall: Record<string, Rate>;
  overallNonSphere: Rate;
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
    const sa = judged.filter((j) => j.nonSphere !== null), sb = rest.filter((j) => j.nonSphere !== null);
    const ka = sa.filter((j) => j.nonSphere).length, kb = sb.filter((j) => j.nonSphere).length;
    const nonSphere: RuleStat = { ...rate(ka, sa.length), sub: null, p: sa.length && sb.length ? fisherExact(ka, sa.length - ka, kb, sb.length - kb) : null };
    return { site, total: judgements.filter((j) => j.site?.id === site.id).length, judged, rules: stats, nonSphere };
  });
  const overall: Record<string, Rate> = {};
  for (const r of rules) {
    const c = count(pool, r.id);
    overall[r.id] = rate(c.k, c.n);
  }
  const ns = pool.filter((j) => j.nonSphere !== null);
  const overallNonSphere = rate(ns.filter((j) => j.nonSphere).length, ns.length);
  return { judgements, sites, overall, overallNonSphere, unassigned: judgements.filter((j) => !j.site).length };
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
  /** 후속 세포 실험 시료 후보: 필터 영향이 큰 유형을 빼고 건강 영향이 보고된 유형 중 해당 비율이 가장 높은 것 */
  target: { rule: SourceRule; stat: RuleStat } | null;
}

export function siteAdvice(res: SiteResult, rules = SOURCE_RULES): SiteAdvice {
  const list = rules.map((rule) => ({ rule, stat: res.rules[rule.id] }));
  // 필터 신호가 섞일 수 있는 유형(Ti·Zn, Na-Cl)은 뒤로 보낸다
  const priority = list.filter((x) => x.stat.k > 0).sort((a, b) => Number(!!a.rule.filterSensitive) - Number(!!b.rule.filterSensitive) || (b.stat.pct ?? 0) - (a.stat.pct ?? 0));
  const expected = list.filter((x) => x.rule.siteId === res.site.id);
  const top = priority[0]?.stat.pct ?? expected[0]?.stat.pct ?? 50;
  const target = priority.find((x) => !x.rule.filterSensitive && x.rule.health.refs !== "—") ?? null;
  return { priority, expected, needN: requiredN(top), target };
}

/** 지표 원소 중 데이터 전체에서 한 번도 검출되지 않은 원소 — 측정 원소 목록에 넣었는지 확인 필요 */
export function missingIndicators(particles: Particle[], rules = SOURCE_RULES): Array<{ el: string; rules: SourceRule[] }> {
  const seen = new Set<string>();
  for (const p of particles) for (const [el, e] of Object.entries(p.elements)) if (e.status === "detected" && (e.wt ?? 0) > 0) seen.add(el);
  const map = new Map<string, SourceRule[]>();
  for (const r of rules) for (const el of r.indicators) if (!seen.has(el)) map.set(el, [...(map.get(el) ?? []), r]);
  return [...map.entries()].map(([el, rs]) => ({ el, rules: rs }));
}

/** 분석 대상 입자의 평균 조성이 높은 순서(주요 구성 원소) */
export function mainElements(res: Simulation, top = 4): Array<{ el: string; wt: number }> {
  const ps = res.sites.flatMap((s) => s.judged.filter((j) => j.particle.edsValid).map((j) => j.particle));
  const sum = new Map<string, number>();
  for (const p of ps) for (const [el, e] of Object.entries(p.elements)) if (e.status === "detected" && e.wt) sum.set(el, (sum.get(el) ?? 0) + e.wt);
  return [...sum.entries()].map(([el, v]) => ({ el, wt: v / (ps.length || 1) })).sort((a, b) => b.wt - a.wt).slice(0, top);
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
