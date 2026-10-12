/* 시료·채취 지점 비교 */
import type { AnalysisSettings, Particle, PmRecord } from "./types";
import { particleTargetResult } from "./hazard";
import { elementStatus, isDetectedStatus } from "./join";
import { fisherExact, holm, wilson } from "./stats";
import type { ClassificationRules } from "./rules";
import { classifyParticleType } from "./rules";

export type GroupField = "sample_id" | "location";

export interface GroupRow {
  group: string;
  location: string | null;
  dates: string[];
  sampleType: string | null;
  particles: number;
  valid: number;
  positive: number;
  determinable: number;
  ratio: number | null;
  ci: { lo: number; hi: number } | null;
  perElement: Record<string, { detected: number; evaluable: number }>;
  types: Record<string, number>;
  morph: Record<string, number>;
  pm: PmRecord[];
}

export function groupKey(p: Particle, field: GroupField): string {
  return field === "sample_id" ? p.sample_id : (p.location ?? "(위치 미기재)");
}

export function compareGroupsBy(
  particles: Particle[], field: GroupField, settings: AnalysisSettings, rules: ClassificationRules, pm: PmRecord[],
): { rows: GroupRow[]; pairwise: Array<{ a: string; b: string; p: number; pAdj: number }> } {
  const groups = new Map<string, Particle[]>();
  for (const p of particles) groups.set(groupKey(p, field), [...(groups.get(groupKey(p, field)) ?? []), p]);
  const rows: GroupRow[] = [...groups.entries()].map(([group, ps]) => {
    const valid = ps.filter((p) => p.edsValid);
    let pos = 0, neg = 0;
    for (const p of valid) {
      const s = particleTargetResult(p, settings).status;
      if (s === "positive") pos++;
      else if (s === "negative") neg++;
    }
    const perElement: GroupRow["perElement"] = {};
    for (const e of settings.targetElements) {
      let d = 0, n = 0;
      for (const p of valid) {
        const s = elementStatus(p, e, settings).status;
        if (s === "missing") continue;
        n++;
        if (isDetectedStatus(s, settings)) d++;
      }
      perElement[e] = { detected: d, evaluable: n };
    }
    const types: Record<string, number> = {};
    for (const p of valid) {
      const t = classifyParticleType(p, settings, rules).label;
      types[t] = (types[t] ?? 0) + 1;
    }
    const morph: Record<string, number> = {};
    for (const p of ps) morph[p.morphology ?? "none"] = (morph[p.morphology ?? "none"] ?? 0) + 1;
    const locs = [...new Set(ps.map((p) => p.location).filter(Boolean))] as string[];
    const sampleIds = new Set(ps.map((p) => p.sample_id));
    return {
      group,
      location: locs.join(", ") || null,
      dates: [...new Set(ps.map((p) => p.date).filter(Boolean))].sort() as string[],
      sampleType: [...new Set(ps.map((p) => p.meta?.sample_type).filter(Boolean))].join(", ") || null,
      particles: ps.length,
      valid: valid.length,
      positive: pos,
      determinable: pos + neg,
      ratio: pos + neg ? pos / (pos + neg) : null,
      ci: wilson(pos, pos + neg),
      perElement, types, morph,
      pm: pm.filter((r) => (field === "sample_id" ? r.sample_id === group : r.collection_location === group) || (r.sample_id != null && sampleIds.has(r.sample_id) && field === "location")),
    };
  }).sort((a, b) => a.group.localeCompare(b.group));

  const pairs: Array<{ a: string; b: string; p: number }> = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const A = rows[i], B = rows[j];
      if (A.determinable < 3 || B.determinable < 3) continue;
      pairs.push({ a: A.group, b: B.group, p: fisherExact(A.positive, A.determinable - A.positive, B.positive, B.determinable - B.positive) });
    }
  }
  const adj = holm(pairs.map((x) => x.p));
  return { rows, pairwise: pairs.map((x, i) => ({ ...x, pAdj: adj[i] })) };
}
