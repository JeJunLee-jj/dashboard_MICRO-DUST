/* 원소별 건강 영향 정보 조회: 사용자가 설정에서 입력한 값이 있으면 그 값을, 비어 있으면 기본 참고 정보를 쓴다. */
import type { HazardRule } from "./types";
import { HEALTH_INFO } from "../config/healthInfo";
import { elementNameKo } from "./elements";

export interface Reference {
  name: string;
  url: string | null;
}

export interface ElementHealth {
  symbol: string;
  nameKo: string;
  isTarget: boolean;
  category: string | null;
  condition: string | null;
  organs: string | null;
  effects: string | null;
  references: Reference[];
  classificationRef: { name: string; url: string | null; year: number | null } | null;
  /** 건강 영향 문구의 출처: 사용자 입력 / 기본 참고 정보 / 없음 */
  source: "user" | "default" | "none";
}

/** "이름 | URL ; 이름 | URL" → 목록 */
export function parseReferences(s: string | null | undefined): Reference[] {
  if (!s) return [];
  return s
    .split(/\s+;\s+/) // 항목 구분은 " ; " (출처 이름 안의 "2005;18:19" 같은 세미콜론은 나누지 않음)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, url] = part.split("|").map((x) => x.trim());
      return { name, url: url && /^https?:\/\//.test(url) ? url : null };
    });
}

export function elementHealth(symbol: string, rules: HazardRule[], targets: string[]): ElementHealth {
  const r = rules.find((x) => x.element_symbol === symbol) ?? null;
  const d = HEALTH_INFO[symbol];
  const userEffects = r?.health_effects?.trim();
  const effects = userEffects || d?.health_effects || null;
  return {
    symbol,
    nameKo: elementNameKo(symbol),
    isTarget: targets.includes(symbol),
    category: r?.assessment_category ?? null,
    condition: r?.applicable_condition ?? null,
    organs: r?.target_organs?.trim() || d?.target_organs || null,
    effects,
    references: parseReferences(r?.health_references?.trim() || d?.health_references),
    classificationRef: r?.reference_name ? { name: r.reference_name, url: r.reference_url, year: r.reference_year } : null,
    source: userEffects ? "user" : d ? "default" : "none",
  };
}

/** 건강 영향 정보가 있는(사용자 입력 또는 기본값) 원소 */
export function hasHealthInfo(symbol: string, rules: HazardRule[]): boolean {
  return !!(rules.find((x) => x.element_symbol === symbol)?.health_effects?.trim() || HEALTH_INFO[symbol]);
}
