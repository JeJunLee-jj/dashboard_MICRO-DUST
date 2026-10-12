import type { MorphologyClass } from "./types";

export const MORPHOLOGY_CLASSES: MorphologyClass[] = [
  "spherical",
  "angular",
  "platy",
  "fibrous",
  "agglomerate",
  "irregular",
  "undetermined",
];

export const MORPHOLOGY_LABEL: Record<MorphologyClass, string> = {
  spherical: "구형·준구형",
  angular: "각진 파편형",
  platy: "판상형",
  fibrous: "섬유상",
  agglomerate: "응집체",
  irregular: "다공성·불규칙형",
  undetermined: "형상 판별 불가",
};

export const NO_MORPHOLOGY_LABEL = "미분류(판정값 없음)";

export function morphologyLabel(m: MorphologyClass | null | undefined | string): string {
  if (!m || m === "none") return NO_MORPHOLOGY_LABEL;
  return MORPHOLOGY_LABEL[m as MorphologyClass] ?? String(m);
}

const ALIASES: Array<[RegExp, MorphologyClass]> = [
  [/^(spher|sphere|round|준구|구형|원형)/i, "spherical"],
  [/(angular|fragment|shard|파편|각진|각형)/i, "angular"],
  [/(plat|flake|sheet|판상|박편|판형)/i, "platy"],
  [/(fib|fiber|fibre|needle|acicular|섬유|침상)/i, "fibrous"],
  [/(agglom|aggreg|cluster|chain|응집|집합)/i, "agglomerate"],
  [/(irreg|porous|불규칙|다공)/i, "irregular"],
  [/(undeterm|unknown|n\/?a|unclass|판별\s*불가|불명|미상)/i, "undetermined"],
];

/** CSV에 적힌 형상 문자열을 표준 분류로 바꾼다. 빈칸은 null(미분류), 인식 불가는 undefined. */
export function normalizeMorphology(raw: unknown): MorphologyClass | null | undefined {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  if ((MORPHOLOGY_CLASSES as string[]).includes(t)) return t as MorphologyClass;
  for (const [re, cls] of ALIASES) if (re.test(t)) return cls;
  return undefined;
}
