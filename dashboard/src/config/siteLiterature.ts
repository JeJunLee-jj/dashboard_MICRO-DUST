/* 문헌 데이터베이스 — 연구진 문헌 목록 '강남역 지하상가 미세먼지 문헌 데이터베이스(70편, 2026-11-06)'.
   literatureDb.json은 scripts/build-literature-db.py로 마크다운에서 만든다(목록이 바뀌면 다시 실행).
   A부 40편: 목표종·형상·배경·방법 근거, B부 30편: 인체 영향 사례. 인체 영향은 '선행연구에서 보고된 사례'이며
   우리 입자의 위해 정도를 뜻하지 않는다. */
import db from "./literatureDb.json";

export type LitKind = "건강 영향" | "목표종·조성" | "형상" | "배경" | "분석 방법";

export interface DbEntry {
  /** 문헌 번호(A01~A40, B01~B30) */
  no: string;
  part: "A" | "B";
  /** 소제목(예: 지하철 목표종 원소별) */
  group: string;
  /** 발생원·지점(예: 지하철 개찰구) */
  source: string;
  cite: string;
  title: string;
  journal: string;
  /** 용도·핵심(A부) 또는 핵심 내용(B부) */
  use: string;
  /** B부 연구 유형(역학, 독성, 발암성 분류 등) */
  type: string;
  /** B부 원소·노출 */
  element: string;
  url: string;
  doi: string;
  /** ● 서지 확인, ◐ 일부 미확인 */
  verified: boolean;
  kind: LitKind;
}

export interface SiteTarget {
  site: string;
  elements: string[];
  refs: string[];
}

export const LITERATURE_DB = db.entries as DbEntry[];
export const SITE_TARGETS = db.targets as SiteTarget[];
export const LITERATURE_SOURCE_FILE = db.source;

export const litByNo = (no: string) => LITERATURE_DB.find((x) => x.no === no) ?? null;

/** 지점 id → 문헌 목록의 지점 이름 */
const SITE_NAME: Record<string, string> = { gate: "지하철 개찰구", clothing: "의류매장", cosmetic: "화장품 매장", food: "음식점", cafe: "카페·간편식" };

export interface SiteLiterature {
  siteId: string;
  /** 지점별 최종 목표종 */
  indicators: string[];
  /** 목표종 근거(A부) + 인체 영향 사례(B부) */
  items: DbEntry[];
}

export function siteLiterature(siteId: string): SiteLiterature | null {
  const name = SITE_NAME[siteId];
  if (!name) return null;
  const target = SITE_TARGETS.find((t) => t.site === name);
  const core = (target?.refs ?? []).map(litByNo).filter((x): x is DbEntry => !!x);
  const health = LITERATURE_DB.filter((x) => x.part === "B" && x.source === name);
  return { siteId, indicators: target?.elements ?? [], items: [...core, ...health] };
}

export const BACKGROUND_LITERATURE: DbEntry[] = LITERATURE_DB.filter((x) => x.group === "서론·대상지 배경");
