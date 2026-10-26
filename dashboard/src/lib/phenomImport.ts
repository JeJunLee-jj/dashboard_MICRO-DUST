/* Phenom 원본 폴더 그대로 불러오기.
   폴더 구조(예: 261022 미먼 원본파일/261022/261021_D/…):
     <지점 폴더>/SEM/<날짜>_Local N.tiff                                   ← 입자 사진(이것만 입자 사진으로 쓴다)
     <지점 폴더>/EDS/<분석 이름>/export/<입자>_analysis_K_spot/quantification.csv   ← 스폿별 원소 구성비
     <지점 폴더>/EDS/<분석 이름>/export/<입자>_analysis_K_map|region/quantification.csv ← 맵·영역(참고, 필터 바탕 포함)
   그 밖의 파일(spectrum.tiff 스펙트럼 그래프, 원소 맵 이미지, EDS 화면 캡처, .emsa/.elid/.odt)은 쓰지 않는다.
   - 지점: 경로의 폴더 이름(D, B-28, E-43, F-1, E-2 또는 개찰구·음식점…)으로 정한다.
   - 사진 ↔ EDS 짝: 같은 지점 안에서 번호가 같은 것(SEM 'Local 7' ↔ EDS 'Local 7' 또는 'Image 7').
     두 사진은 시야(약 25.9 µm)가 같아 번호가 맞는 쌍은 화면이 일치한다(상관계수로 확인).
   - 원소 구성비: 스폿 여러 곳의 평균(스폿에서 없는 원소는 0으로 평균). 스폿별 값은 따로 보관한다. */
import type { Table } from "./parse/common";
import { parseCsvText } from "./parse/tabular";
import { matchSitePath, type SiteDef } from "./sites";
import SHAPES from "../config/gangnamShape.json";

export interface PhenomFile {
  file: File;
  path: string;
}

export interface PhenomParticle {
  site: SiteDef;
  /** 지점 폴더 이름(예: 261021_D) — 시료 ID로 쓴다 */
  siteFolder: string;
  /** EDS 입자 이름(예: Local 7, Image 7) */
  name: string;
  num: number;
  spots: PhenomFile[];
  maps: PhenomFile[];
  photo: PhenomFile | null;
}

export interface PhenomScan {
  particles: PhenomParticle[];
  /** SEM 사진 중 짝이 없는 것 */
  unusedPhotos: PhenomFile[];
  /** 지점을 알 수 없는 파일 수 */
  unknownSite: number;
  ignored: number;
}

const SPOT = /(?:^|\/)([^/]+)_analysis_(\d+)_spot\/quantification\.csv$/i;
const MAP = /(?:^|\/)([^/]+)_analysis_(\d+)_(map|region)\/quantification\.csv$/i;
const SEM = /(?:^|\/)SEM\/([^/]+)\.(tiff?|png|jpe?g|bmp)$/i;

const lastNum = (s: string): number | null => {
  const m = s.match(/(\d+)(?!.*\d)/);
  return m ? Number(m[1]) : null;
};

function siteFolderOf(path: string): { site: SiteDef; folder: string } | null {
  const parts = path.split("/").filter(Boolean);
  // 바깥쪽 폴더부터 본다: '261021_D/EDS/261021_EDS_D/…'에서 지점 폴더는 261021_D
  for (let i = 0; i < parts.length - 1; i++) {
    const s = matchSitePath(parts[i] + "/x");
    if (s) return { site: s, folder: parts[i] };
  }
  return null;
}

export function scanPhenomFolder(files: PhenomFile[]): PhenomScan {
  const byKey = new Map<string, PhenomParticle>();
  const photos = new Map<string, PhenomFile[]>(); // 지점 폴더 → 사진
  let unknownSite = 0, ignored = 0;
  for (const f of files) {
    const path = f.path.replace(/\\/g, "/");
    const spot = path.match(SPOT), map = path.match(MAP), sem = path.match(SEM);
    if (!spot && !map && !sem) { ignored++; continue; }
    const sf = siteFolderOf(path);
    if (!sf) { unknownSite++; continue; }
    if (sem) {
      photos.set(sf.folder, [...(photos.get(sf.folder) ?? []), f]);
      continue;
    }
    const name = (spot ?? map)![1];
    const key = `${sf.folder}::${name}`;
    const p = byKey.get(key) ?? { site: sf.site, siteFolder: sf.folder, name, num: lastNum(name) ?? -1, spots: [], maps: [], photo: null };
    if (spot) p.spots.push(f); else p.maps.push(f);
    byKey.set(key, p);
  }
  const particles = [...byKey.values()].filter((p) => p.spots.length > 0);
  const used = new Set<PhenomFile>();
  for (const p of particles) {
    const cand = (photos.get(p.siteFolder) ?? []).filter((ph) => lastNum(ph.path.split("/").pop()!.replace(/\.[^.]+$/, "")) === p.num);
    if (cand.length) { p.photo = cand[0]; used.add(cand[0]); }
    p.spots.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  }
  particles.sort((a, b) => a.siteFolder.localeCompare(b.siteFolder) || a.num - b.num || a.name.localeCompare(b.name));
  const unusedPhotos = [...photos.values()].flat().filter((ph) => !used.has(ph));
  return { particles, unusedPhotos, unknownSite, ignored };
}

/** Phenom quantification.csv → {원소: [이름, wt 분수, at 분수]} */
async function readQuant(f: File): Promise<Map<string, { name: string; wt: number; at: number }>> {
  const text = await f.text();
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const head = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const iSym = head.findIndex((h) => h.includes("symbol"));
  const iName = head.findIndex((h) => h.includes("element name"));
  const iWt = head.findIndex((h) => h.startsWith("weight"));
  const iAt = head.findIndex((h) => h.startsWith("atomic conc"));
  const out = new Map<string, { name: string; wt: number; at: number }>();
  for (const l of lines.slice(1)) {
    const c = l.split(",");
    const sym = c[iSym]?.trim();
    if (!sym) continue;
    out.set(sym, { name: c[iName]?.trim() ?? sym, wt: parseFloat(c[iWt]) || 0, at: parseFloat(c[iAt]) || 0 });
  }
  return out;
}

export interface AveragedEds {
  table: Table;
  /** 원소 → 스폿별 wt% */
  spotWt: Record<string, number[]>;
}

/** 스폿 여러 곳의 평균 표(값은 분수 그대로 — EDS 파서가 합계 1을 보고 %로 바꾼다) */
export async function averageSpots(spots: PhenomFile[], name: string): Promise<AveragedEds> {
  const qs = await Promise.all(spots.map((s) => readQuant(s.file)));
  const els = [...new Set(qs.flatMap((q) => [...q.keys()]))];
  const lines = ["Element symbol,Element name,Atomic concentration percentage,Weight concentration percentage"];
  for (const e of els) {
    const nm = qs.find((q) => q.has(e))!.get(e)!.name;
    const wt = qs.reduce((a, q) => a + (q.get(e)?.wt ?? 0), 0) / qs.length;
    const at = qs.reduce((a, q) => a + (q.get(e)?.at ?? 0), 0) / qs.length;
    lines.push(`${e},${nm},${at},${wt}`);
  }
  const table = parseCsvText(lines.join("\n"), name);
  const spotWt = Object.fromEntries(els.map((e) => [e, qs.map((q) => Math.round((q.get(e)?.wt ?? 0) * 100000) / 1000)]));
  return { table, spotWt };
}

/** 미리 계산해 둔 형상 측정값(강남역 5개 지점 51개 입자 — EDS 스폿 위치를 씨앗으로 한 자동 분할, 검토 필요) */
export function bundledShape(siteFolder: string, name: string) {
  const s = (SHAPES as Record<string, { feret: number; eqd: number; area: number; ar: number; sol: number }>)[`${siteFolder}::${name}`];
  return s ?? null;
}
