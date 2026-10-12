/* DEMO(가상) 데이터 생성 스크립트 — 실제 측정 결과가 아니다.
   대시보드의 화면과 분석 흐름을 보여주기 위해 고정 시드 난수로 만든 예시이며,
   실제 시료(천안아산역·아산역 등)의 분석 결과로 사용하거나 인용하면 안 된다.
   실행: npm run generate:demo  →  public/sample-data/*.csv 생성 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "sample-data");
mkdirSync(outDir, { recursive: true });

let seed = 20260312;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const weighted = (pairs) => {
  const tot = pairs.reduce((a, [, w]) => a + w, 0);
  let r = rand() * tot;
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[pairs.length - 1][0];
};

const ATOMIC_WEIGHT = {
  C: 12.011, O: 15.999, Na: 22.99, Mg: 24.305, Al: 26.982, Si: 28.085, S: 32.06, K: 39.098, Ca: 40.078,
  Ti: 47.867, Cr: 51.996, Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546, Zn: 65.38,
  As: 74.922, Cd: 112.41, Pb: 207.2, Ba: 137.33,
};
const TARGETS = ["Pb", "Cd", "As", "Cr", "Ni", "Co", "Mn", "Cu", "Zn", "Fe"];
const LOD = 0.1, LOQ = 0.3; // wt% — DEMO용 가정값

// 조성 원형(archetype): wt% 기준값 → 잡음 → 재정규화
const ARCHETYPES = {
  fe_wear: { base: { Fe: 55, O: 25, C: 6, Si: 3, Al: 1, Mn: 1.2 }, trace: { Cr: 0.5, Cu: 0.6, Ni: 0.25, Co: 0.12 }, morph: [["angular", 5], ["platy", 3], ["irregular", 1], ["spherical", 1]] },
  mineral: { base: { O: 45, Si: 25, Al: 10, Fe: 4, K: 2, Ca: 3, Mg: 1.5, Na: 1, C: 5 }, trace: { Mn: 0.15, Zn: 0.12 }, morph: [["irregular", 5], ["angular", 3], ["platy", 2]] },
  calcium: { base: { O: 40, Ca: 35, C: 10, S: 4, Si: 3, Mg: 2 }, trace: { Fe: 0.6 }, morph: [["angular", 3], ["irregular", 3]] },
  carbon: { base: { C: 70, O: 18, S: 1, Si: 1 }, trace: { Fe: 0.4, Zn: 0.2 }, morph: [["spherical", 3], ["agglomerate", 4], ["irregular", 1]] },
  mixed: { base: { Fe: 25, O: 35, Si: 15, Al: 6, C: 8, Ca: 3 }, trace: { Zn: 0.6, Mn: 0.4, Cu: 0.3, Pb: 0.18 }, morph: [["agglomerate", 4], ["irregular", 3]] },
  nonferrous: { base: { Cu: 30, Zn: 15, O: 20, Fe: 15, C: 10 }, trace: { Ni: 0.8, Pb: 0.35, Cr: 0.2 }, morph: [["spherical", 3], ["angular", 2]] },
  titanium: { base: { Ti: 45, O: 40, Fe: 3, Si: 2, C: 5 }, trace: {}, morph: [["angular", 2], ["irregular", 2]] },
  fiber: { base: { O: 42, Si: 30, Mg: 12, Ca: 5, Fe: 3, C: 6 }, trace: {}, morph: [["fibrous", 1]] },
};

const SAMPLES = [
  { id: "DEMO-A", location: "DEMO-지점A (가상: 역사 승강장 가정)", date: "2026-03-10", type: "측정(가상)", n: 24,
    mix: [["fe_wear", 9], ["mineral", 4], ["mixed", 4], ["carbon", 3], ["nonferrous", 2], ["calcium", 1], ["fiber", 1]] },
  { id: "DEMO-B", location: "DEMO-지점B (가상: 역사 대합실 가정)", date: "2026-03-10", type: "측정(가상)", n: 20,
    mix: [["fe_wear", 5], ["mineral", 5], ["mixed", 3], ["carbon", 4], ["calcium", 2], ["titanium", 1]] },
  { id: "DEMO-C", location: "DEMO-지점C (가상: 외부 배경 가정)", date: "2026-03-11", type: "배경(가상)", n: 16,
    mix: [["mineral", 7], ["calcium", 3], ["carbon", 3], ["mixed", 2], ["fe_wear", 1]] },
];

const meta = [], eds = [];
const r2 = (v) => Math.round(v * 100) / 100;

for (const s of SAMPLES) {
  for (let i = 1; i <= s.n; i++) {
    const pid = `P${String(i).padStart(3, "0")}`;
    const arch = ARCHETYPES[weighted(s.mix)];
    const mag = pick([5000, 8000, 10000, 15000, 20000]);
    const umPerPx = 190 / mag;
    const sbValue = mag >= 15000 ? 1 : mag >= 8000 ? 2 : 5;
    const sbPx = Math.round(sbValue / umPerPx);
    const rPx = 35 + rand() * 85;
    const eqd = r2(2 * rPx * umPerPx);

    // 형상: 대부분 판정값 있음, 일부는 미분류·판별 불가(DEMO 상황 재현)
    const u = rand();
    const morph = u < 0.08 ? "" : u < 0.13 ? "형상 판별 불가" : weighted(arch.morph);
    const morphKo = { spherical: "구형", angular: "각진 파편형", platy: "판상형", fibrous: "섬유상", agglomerate: "응집체", irregular: "불규칙형" }[morph] ?? morph;
    const hasSize = rand() < 0.7;
    meta.push({
      sample_id: s.id, particle_id: pid, collection_date: s.date, collection_location: s.location,
      image_filename: `${s.id}_${pid}.png`, magnification: mag,
      scale_bar_value: sbValue, scale_bar_unit: "µm", scale_bar_px: sbPx,
      morphology_class: morphKo,
      projected_area: hasSize ? r2(Math.PI * (eqd / 2) ** 2) : "",
      equivalent_diameter: hasSize ? eqd : "",
      size_unit: hasSize ? "µm" : "",
      classification_method: morph ? "DEMO: 가상 판정값(실제 판정 아님)" : "",
      sample_type: s.type,
      analysis_conditions: "DEMO 가정: 15 kV, WD 10 mm",
      notes: "DEMO 가상 데이터 — 실제 측정 결과 아님",
    });

    // 조성
    const comp = {};
    for (const [el, v] of Object.entries(arch.base)) comp[el] = Math.max(0.2, v * (0.75 + rand() * 0.5));
    const traceStatus = {};
    for (const [el, v] of Object.entries(arch.trace)) {
      if (rand() < 0.65) {
        const val = v * (0.3 + rand() * 1.6);
        comp[el] = val;
      }
    }
    let total = Object.values(comp).reduce((a, b) => a + b, 0);
    for (const k of Object.keys(comp)) comp[k] = (comp[k] / total) * 100;
    // 원자% 환산(DEMO 생성용 계산)
    const molar = Object.fromEntries(Object.entries(comp).map(([k, v]) => [k, v / ATOMIC_WEIGHT[k]]));
    const molTot = Object.values(molar).reduce((a, b) => a + b, 0);

    // 한 입자는 합계 이탈(비정규화 원자료) 상황을 재현
    const unnormalized = s.id === "DEMO-B" && i === 7;
    const elems = new Set([...Object.keys(comp), ...TARGETS]);
    // 일부 입자는 As·Cd가 분석되지 않음(결측) — 판정 불가 상황 재현
    const asCdMissing = s.id === "DEMO-B" && (i === 3 || i === 11);
    // 한 입자는 EDS 없음(메타데이터만)
    if (s.id === "DEMO-C" && i === 16) continue;

    for (const el of elems) {
      const w = comp[el];
      let row = { sample_id: s.id, particle_id: pid, element_symbol: el, wt_percent: "", at_percent: "", detection_status: "", detection_limit: LOD, quantification_limit: LOQ, measurement_method: "DEMO: 가상 표준없는 정량(가정)", normalized: unnormalized ? "N" : "Y" };
      if (asCdMissing && (el === "As" || el === "Cd")) {
        row.detection_limit = "";
        row.quantification_limit = "";
        eds.push(row); // 값·상태 모두 비어 있음 → 결측
        continue;
      }
      if (w == null) {
        row.detection_status = "not_detected";
        row.wt_percent = 0;
        row.at_percent = 0;
      } else if (w < LOD) {
        row.detection_status = "below_lod";
        row.wt_percent = "<LOD";
      } else if (w < LOQ) {
        row.detection_status = "below_loq";
        row.wt_percent = r2(w);
      } else {
        row.detection_status = "detected";
        const scale = unnormalized ? 0.86 : 1;
        row.wt_percent = r2(w * scale);
        row.at_percent = r2((molar[el] / molTot) * 100 * scale);
      }
      eds.push(row);
    }
  }
}
// 메타데이터 없이 EDS만 있는 입자(미매칭 상황 재현)
for (const [el, w, a] of [["Fe", 61.2, 33.1], ["O", 30.4, 57.4], ["Mn", 1.1, 0.6], ["Si", 7.3, 7.9]]) {
  eds.push({ sample_id: "DEMO-A", particle_id: "P099", element_symbol: el, wt_percent: w, at_percent: a, detection_status: "detected", detection_limit: LOD, quantification_limit: LOQ, measurement_method: "DEMO: 가상 표준없는 정량(가정)", normalized: "Y" });
}
// 이미지 파일명이 없는 입자 한 개
meta.find((m) => m.sample_id === "DEMO-C" && m.particle_id === "P005").image_filename = "";

function toCsv(rows, comments) {
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + comments.map((c) => `# ${c}`).join("\n") + "\n" + [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n") + "\n";
}

const banner = [
  "DEMO(가상) 데이터 — 실제 측정 결과가 아닙니다. scripts/generate-demo-data.mjs 로 고정 시드 생성.",
  "대시보드 화면·분석 흐름 확인용이며 어떤 실제 시료의 결과로도 사용·인용하지 마십시오.",
];
writeFileSync(join(outDir, "demo_particle_metadata.csv"), toCsv(meta, banner));
writeFileSync(join(outDir, "demo_eds_long.csv"), toCsv(eds, [...banner, "검출한계 0.1 wt%, 정량한계 0.3 wt%는 DEMO용 가정값입니다."]));
writeFileSync(join(outDir, "demo_pm_measurements.csv"), toCsv([
  { sample_id: "DEMO-A", collection_location: SAMPLES[0].location, collection_date: "2026-03-10", pm25: "", pm10: "", unit: "µg/m³", measurement_method: "DEMO: 측정값 없음(빈칸 예시)", source: "DEMO 가상" },
], [...banner, "PM 측정값 파일 형식 예시입니다. 값이 없으므로 대시보드는 '측정값 없음'으로 표시합니다."]));
console.log(`DEMO 데이터 생성: 메타데이터 ${meta.length}행, EDS ${eds.length}행 → ${outDir}`);
