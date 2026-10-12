/* 규칙 기반 입자 유형 분류와 발생원 후보 탐색.
   규칙 자체는 src/config/classificationRules.default.json 에 있고 화면에서 수정할 수 있다.
   분류 방식: 규칙 기반(rule-based). 통계·머신러닝 분류는 구현하지 않았다.
   결과는 "후보"이며 확정이 아니다. */
import type { AnalysisSettings, MorphologyClass, Normalization, Particle } from "./types";
import { normalizedWt } from "./composition";
import { isDetected } from "./join";
import { morphologyLabel } from "./morphology";
import defaultRules from "../config/classificationRules.default.json";

export type Condition =
  | { kind: "min"; element: string; value: number }
  | { kind: "max"; element: string; value: number }
  | { kind: "sumMin"; elements: string[]; value: number }
  | { kind: "sumMax"; elements: string[]; value: number }
  | { kind: "ratioBetween"; numerator: string; denominator: string; min: number; max: number }
  | { kind: "detected"; element: string; label?: string }
  | { kind: "anyDetected"; elements: string[]; label?: string }
  | { kind: "morphologyIn"; classes: MorphologyClass[] }
  | { kind: "requiresBackground" };

export type RuleNormalization = Normalization | "setting";

export interface ParticleTypeRule {
  id: string;
  label: string;
  normalization: RuleNormalization;
  all: Condition[];
  note?: string;
}

export interface SourceRule {
  id: string;
  candidate: string;
  enabled: boolean;
  normalization: RuleNormalization;
  all: Condition[];
  supporting: Condition[];
  morphologySupport: MorphologyClass[];
  features: string;
  thresholdBasis: string;
  alternatives: string[];
  requiredValidation: string[];
}

export interface ClassificationRules {
  version: string;
  description?: string;
  thresholdProvenance?: string;
  particleTypes: ParticleTypeRule[];
  sourceCandidates: SourceRule[];
}

export const DEFAULT_CLASSIFICATION_RULES = defaultRules as ClassificationRules;

const fmt = (v: number) => (Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));

interface CondResult {
  ok: boolean | null;   // null = 평가 불가
  evidence: string;
}

function evalCondition(c: Condition, comp: Record<string, number> | null, p: Particle, settings: AnalysisSettings, normLabel: string): CondResult {
  const g = (s: string) => comp?.[s] ?? 0;
  switch (c.kind) {
    case "min":
      if (!comp) return { ok: null, evidence: "wt% 정량값 없음" };
      return { ok: g(c.element) >= c.value, evidence: `${c.element} ${fmt(g(c.element))} wt%(${normLabel}) ${g(c.element) >= c.value ? "≥" : "<"} ${c.value}` };
    case "max":
      if (!comp) return { ok: null, evidence: "wt% 정량값 없음" };
      return { ok: g(c.element) < c.value, evidence: `${c.element} ${fmt(g(c.element))} wt%(${normLabel}) ${g(c.element) < c.value ? "<" : "≥"} ${c.value}` };
    case "sumMin": {
      if (!comp) return { ok: null, evidence: "wt% 정량값 없음" };
      const s = c.elements.reduce((a, e) => a + g(e), 0);
      return { ok: s >= c.value, evidence: `${c.elements.join("+")} ${fmt(s)} wt%(${normLabel}) ${s >= c.value ? "≥" : "<"} ${c.value}` };
    }
    case "sumMax": {
      if (!comp) return { ok: null, evidence: "wt% 정량값 없음" };
      const s = c.elements.reduce((a, e) => a + g(e), 0);
      return { ok: s < c.value, evidence: `${c.elements.join("+")} ${fmt(s)} wt%(${normLabel}) ${s < c.value ? "<" : "≥"} ${c.value}` };
    }
    case "ratioBetween": {
      if (!comp) return { ok: null, evidence: "wt% 정량값 없음" };
      const den = g(c.denominator);
      if (den <= 0) return { ok: false, evidence: `${c.denominator} 미검출 — ${c.numerator}/${c.denominator} 계산 불가` };
      const r = g(c.numerator) / den;
      const ok = r >= c.min && r <= c.max;
      return { ok, evidence: `${c.numerator}/${c.denominator} = ${r.toFixed(2)} (${ok ? "범위 내" : "범위 밖"} ${c.min}–${c.max})` };
    }
    case "detected": {
      const d = isDetected(p, c.element, settings);
      return { ok: d, evidence: `${c.element} ${d ? "검출" : "미검출"}` };
    }
    case "anyDetected": {
      const found = c.elements.filter((e) => isDetected(p, e, settings));
      return { ok: found.length > 0, evidence: found.length ? `${found.join("·")} 검출` : `${c.elements.join("·")} 모두 미검출` };
    }
    case "morphologyIn": {
      if (!p.morphology || p.morphology === "undetermined") return { ok: null, evidence: "형상 판정값 없음" };
      const ok = c.classes.includes(p.morphology);
      return { ok, evidence: `형상 ${morphologyLabel(p.morphology)}` };
    }
    case "requiresBackground":
      return { ok: null, evidence: "배경(외기) 시료 비교 없이 개별 입자로 판별 불가" };
  }
}

function resolveNorm(n: RuleNormalization, settings: AnalysisSettings): Normalization {
  return n === "setting" ? settings.normalization : n;
}
const NORM_LABEL: Record<Normalization, string> = { metal: "금속기준", total: "전체기준" };

export interface ParticleTypeResult {
  id: string;
  label: string;
  evidence: string[];
  method: string;
}

/** 입자 유형: 규칙을 순서대로 적용해 처음 만족하는 유형. wt% 없으면 "분류 불가". */
export function classifyParticleType(p: Particle, settings: AnalysisSettings, rules: ClassificationRules): ParticleTypeResult {
  const method = "규칙 기반(조성 임계값, 순차 적용)";
  if (!p.edsValid) return { id: "invalid", label: "분석 제외", evidence: [p.excludeReason ?? "유효 EDS 아님"], method };
  if (!normalizedWt(p, "total")) return { id: "no_wt", label: "분류 불가(wt% 없음)", evidence: ["wt% 정량값이 없어 wt% 기준 규칙을 적용할 수 없음"], method };
  for (const r of rules.particleTypes) {
    const norm = resolveNorm(r.normalization, settings);
    const comp = normalizedWt(p, norm);
    const res = r.all.map((c) => evalCondition(c, comp, p, settings, NORM_LABEL[norm]));
    if (res.length && res.every((x) => x.ok === true)) return { id: r.id, label: r.label, evidence: res.map((x) => x.evidence), method };
  }
  return { id: "other", label: "기타/미분류", evidence: ["어떤 유형 규칙도 만족하지 않음"], method };
}

export type JudgementLevel = "원소 조건 + 보조 근거" | "원소 조건만 충족" | "판별 불가";

export interface SourceMatch {
  ruleId: string;
  candidate: string;
  level: JudgementLevel;
  evidence: string[];          // 실제 데이터에서 확인된 근거(필수 조건)
  supportingEvidence: string[]; // 보조 근거(충족한 것만)
  missingSupport: string[];     // 확인되지 않은 보조 근거
  features: string;
  thresholdBasis: string;
  alternatives: string[];
  requiredValidation: string[];
}

export interface SourceResult {
  matches: SourceMatch[];
  /** 복합 기원 후보(규칙 2개 이상 일치) 여부 */
  composite: boolean;
  /** 개별 입자로 평가할 수 없는 후보(외부 유입 등) */
  notEvaluable: Array<{ candidate: string; reason: string; requiredValidation: string[] }>;
  summaryLabel: string;
}

export function sourceCandidates(p: Particle, settings: AnalysisSettings, rules: ClassificationRules): SourceResult {
  const matches: SourceMatch[] = [];
  const notEvaluable: SourceResult["notEvaluable"] = [];
  if (!p.edsValid) return { matches, composite: false, notEvaluable, summaryLabel: "분석 제외" };
  for (const r of rules.sourceCandidates) {
    if (!r.enabled) continue;
    const norm = resolveNorm(r.normalization, settings);
    const comp = normalizedWt(p, norm);
    const res = r.all.map((c) => evalCondition(c, comp, p, settings, NORM_LABEL[norm]));
    if (res.some((x) => x.ok === null) && r.all.some((c) => c.kind === "requiresBackground")) {
      notEvaluable.push({ candidate: r.candidate, reason: res.find((x) => x.ok === null)!.evidence, requiredValidation: r.requiredValidation });
      continue;
    }
    if (!res.length || !res.every((x) => x.ok === true)) continue;
    const supportingEvidence: string[] = [], missingSupport: string[] = [];
    for (const c of r.supporting) {
      const s = evalCondition(c, comp, p, settings, NORM_LABEL[norm]);
      const label = ("label" in c && c.label) || s.evidence;
      if (s.ok) supportingEvidence.push(`${label}: ${s.evidence}`);
      else missingSupport.push(`${label} — ${s.evidence}`);
    }
    if (r.morphologySupport.length) {
      const want = r.morphologySupport.map(morphologyLabel).join("·");
      if (!p.morphology || p.morphology === "undetermined") missingSupport.push(`형상(${want}) — 형상 판정값 없음`);
      else if (r.morphologySupport.includes(p.morphology)) supportingEvidence.push(`형상 ${morphologyLabel(p.morphology)} (보조 형상: ${want})`);
      else missingSupport.push(`형상 ${morphologyLabel(p.morphology)} — 보조 형상(${want})과 다름`);
    }
    matches.push({
      ruleId: r.id, candidate: r.candidate,
      level: supportingEvidence.length ? "원소 조건 + 보조 근거" : "원소 조건만 충족",
      evidence: res.map((x) => x.evidence), supportingEvidence, missingSupport,
      features: r.features, thresholdBasis: r.thresholdBasis, alternatives: r.alternatives, requiredValidation: r.requiredValidation,
    });
  }
  const composite = new Set(matches.map((m) => m.candidate.replace(/\s*\(.*\)$/, ""))).size >= 2;
  const summaryLabel = !normalizedWt(p, "total")
    ? "판별 불가(wt% 없음)"
    : matches.length === 0
      ? "발생원 판별 불가"
      : composite
        ? "복합 기원 후보"
        : matches[0].candidate.replace(/\s*\(.*\)$/, "");
  return { matches, composite, notEvaluable, summaryLabel };
}

/** 규칙 JSON 구조 검사 — 사용자가 편집한 규칙을 적용하기 전에 확인 */
export function validateRules(obj: unknown): { ok: true; rules: ClassificationRules } | { ok: false; error: string } {
  if (!obj || typeof obj !== "object") return { ok: false, error: "JSON 객체가 아닙니다." };
  const r = obj as Partial<ClassificationRules>;
  if (!Array.isArray(r.particleTypes)) return { ok: false, error: "particleTypes 배열이 없습니다." };
  if (!Array.isArray(r.sourceCandidates)) return { ok: false, error: "sourceCandidates 배열이 없습니다." };
  const kinds = ["min", "max", "sumMin", "sumMax", "ratioBetween", "detected", "anyDetected", "morphologyIn", "requiresBackground"];
  for (const t of [...r.particleTypes, ...r.sourceCandidates] as Array<{ id?: string; all?: Condition[]; supporting?: Condition[] }>) {
    if (!t.id) return { ok: false, error: "id가 없는 규칙이 있습니다." };
    if (!Array.isArray(t.all) || !t.all.length) return { ok: false, error: `${t.id}: all 조건 배열이 비어 있습니다.` };
    for (const c of [...t.all, ...(t.supporting ?? [])]) {
      if (!kinds.includes((c as Condition).kind)) return { ok: false, error: `${t.id}: 알 수 없는 조건 종류 "${(c as { kind?: string }).kind}"` };
    }
  }
  for (const s of r.sourceCandidates) {
    s.supporting ??= [];
    s.morphologySupport ??= [];
    s.alternatives ??= [];
    s.requiredValidation ??= [];
    s.enabled ??= true;
    s.normalization ??= "setting";
    s.features ??= "";
    s.thresholdBasis ??= "근거 미입력";
  }
  for (const t of r.particleTypes) t.normalization ??= "setting";
  return { ok: true, rules: { version: r.version ?? "user", ...r } as ClassificationRules };
}
