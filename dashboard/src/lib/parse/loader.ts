/* 업로드한 표 파일을 종류별로 판별해 해당 파서로 보낸다. */
import type { EdsRecord, HazardRule, LoadedFile, ParticleMeta, PmRecord, QualityIssue, DataOrigin } from "../types";
import type { Table } from "./common";
import { readTables } from "./tabular";
import { parseMetadataTable } from "./metadata";
import { looksLikeEds, parseEdsTable, type EdsParseSummary } from "./eds";
import { looksLikeHazardRules, looksLikePm, parseHazardRulesTable, parsePmTable } from "./other";

export interface TableLoadResult {
  meta: ParticleMeta[];
  eds: EdsRecord[];
  hazardRules: HazardRule[] | null;
  pm: PmRecord[];
  issues: QualityIssue[];
  files: LoadedFile[];
  edsSummaries: EdsParseSummary[];
}

export type TableKind = LoadedFile["kind"];

export function classifyTable(t: Table): TableKind {
  if (looksLikeHazardRules(t)) return "hazard_rules";
  if (looksLikeEds(t)) return "eds";
  if (looksLikePm(t) && !t.headers.includes("particle_id")) return "pm";
  if (t.headers.includes("particle_id")) return "metadata";
  return "unknown";
}

export function loadTables(tables: Table[], origin: DataOrigin, forced?: TableKind): TableLoadResult {
  const out: TableLoadResult = { meta: [], eds: [], hazardRules: null, pm: [], issues: [], files: [], edsSummaries: [] };
  const now = new Date().toISOString();
  for (const t of tables) {
    if (!t.rows.length) {
      out.issues.push({ level: "warning", code: "FILE_EMPTY", file: t.name, message: "데이터 행이 없습니다." });
      continue;
    }
    const kind = forced && forced !== "unknown" ? forced : classifyTable(t);
    if (kind === "metadata") {
      const r = parseMetadataTable(t);
      out.meta.push(...r.meta);
      out.issues.push(...r.issues);
      out.files.push({ name: t.name, kind, rows: r.meta.length, origin, loadedAt: now });
    } else if (kind === "eds") {
      const r = parseEdsTable(t);
      out.eds.push(...r.records);
      out.issues.push(...r.issues);
      if (r.summary) out.edsSummaries.push(r.summary);
      out.files.push({
        name: t.name, kind, rows: r.records.length, origin, loadedAt: now,
        note: r.summary ? `${r.summary.format === "long" ? "긴 형식" : "넓은 형식"} · 입자 ${r.summary.particles}개 · 원소 ${r.summary.elements.length}종 · ${[r.summary.hasWt && "wt%", r.summary.hasAt && "at%"].filter(Boolean).join("+") || "값 없음"}` : undefined,
      });
    } else if (kind === "hazard_rules") {
      const r = parseHazardRulesTable(t);
      out.hazardRules = [...(out.hazardRules ?? []), ...r.rules];
      out.issues.push(...r.issues);
      out.files.push({ name: t.name, kind, rows: r.rules.length, origin, loadedAt: now });
    } else if (kind === "pm") {
      const r = parsePmTable(t);
      out.pm.push(...r.pm);
      out.issues.push(...r.issues);
      out.files.push({ name: t.name, kind, rows: r.pm.length, origin, loadedAt: now });
    } else {
      out.issues.push({
        level: "error", code: "FILE_UNRECOGNIZED", file: t.name,
        message: `표 종류를 판별할 수 없습니다. 열: ${t.headers.join(", ") || "(없음)"}. 입자 메타데이터는 particle_id, EDS는 particle_id + element_symbol + wt_percent/at_percent 열이 필요합니다.`,
      });
      out.files.push({ name: t.name, kind: "unknown", rows: 0, origin, loadedAt: now });
    }
  }
  return out;
}

export function loadTableFile(bytes: Uint8Array, name: string, origin: DataOrigin, forced?: TableKind): TableLoadResult {
  try {
    const { tables, encoding } = readTables(bytes, name);
    const res = loadTables(tables, origin, forced);
    if (encoding && encoding !== "UTF-8") {
      res.issues.push({ level: "info", code: "FILE_ENCODING", file: name, message: `문자 인코딩을 ${encoding}로 읽었습니다.` });
    }
    return res;
  } catch (e) {
    return {
      meta: [], eds: [], hazardRules: null, pm: [], edsSummaries: [],
      issues: [{ level: "error", code: "FILE_READ_FAILED", file: name, message: `파일을 읽지 못했습니다: ${(e as Error).message}` }],
      files: [{ name, kind: "unknown", rows: 0, origin, loadedAt: new Date().toISOString() }],
    };
  }
}
