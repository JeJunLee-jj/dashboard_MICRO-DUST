/* 원소별 위해성 참고 정보 — IARC 발암성 분류(해당 화학종 기준)와 보고된 건강 영향.
   healthInfo.ts(ATSDR·WHO·IARC 요약)에 없는 원소(Ti, Ba, Sb)는 여기서 보충한다.
   EDS는 원소만 확인하고 화학종(산화수·결정형·화합물)은 구분하지 못하므로, 분류는 '그 원소를 포함한 특정 화학종'에 대한 것이다. */
import { HEALTH_INFO, type HealthInfo } from "./healthInfo";

const IARC = "https://monographs.iarc.who.int/list-of-classifications/";
const ATSDR = "https://www.atsdr.cdc.gov/toxprofiledocs/index.html";

export interface ElementHazard extends HealthInfo {
  /** IARC 분류(해당 화학종) */
  iarc: string;
  /** 화면 강조용 등급: 1 = 1군 화학종 있음, 2 = 2A·2B, 3 = 미분류·참고 */
  level: 1 | 2 | 3;
}

const EXTRA: Record<string, HealthInfo> = {
  Ti: {
    target_organs: "호흡기(폐)",
    health_effects: "이산화티타늄(TiO₂) 분진은 IARC 2B군(인체 발암 가능)으로 분류된다. 고농도 흡입 시 폐 염증과 관련된 동물 실험 근거가 있으며, 화장품·도료·섬유 첨가제로 널리 쓰인다.",
    health_references: `IARC Monographs Vol. 93 — Titanium dioxide | ${IARC}`,
  },
  Ba: {
    target_organs: "호흡기, 심혈관·신경계(가용성 화합물)",
    health_effects: "불용성 황산바륨 분진 흡입은 바륨진폐증(대체로 기능 저하가 적은 진폐)과 관련된다. 가용성 바륨 화합물을 섭취하면 근육·심장에 영향을 줄 수 있다. 브레이크 마모 지표 원소로 쓰인다.",
    health_references: `ATSDR Toxicological Profile for Barium | ${ATSDR}`,
  },
  Sb: {
    target_organs: "호흡기, 심혈관계",
    health_effects: "3가 안티몬 화합물은 IARC 2A군(인체 발암 추정)으로 분류된다. 직업적 흡입 노출에서 호흡기 자극과 진폐가 보고되었다. 브레이크 패드 마모 지표 원소다.",
    health_references: `IARC Monographs Vol. 131 | ${IARC} ; ATSDR Toxicological Profile for Antimony | ${ATSDR}`,
  },
};

const IARC_CLASS: Record<string, [string, 1 | 2 | 3]> = {
  As: ["1군 — 무기 비소 화합물", 1],
  Cd: ["1군 — 카드뮴 및 화합물", 1],
  Cr: ["1군 — 6가 크롬 화합물에 한함", 1],
  Ni: ["1군 — 니켈 화합물 / 금속 니켈 2B", 1],
  Si: ["1군 — 결정형 실리카에 한함(EDS로 구분 불가)", 1],
  Pb: ["2A — 무기 납 화합물 / 금속 납 2B", 2],
  Co: ["2A — 코발트 금속·가용성 Co(II) 염 / 산화코발트 2B", 2],
  Sb: ["2A — 3가 안티몬 화합물", 2],
  Ti: ["2B — 이산화티타늄", 2],
  Mo: ["2B — 삼산화몰리브덴에 한함", 2],
  Fe: ["3군 — 산화철(분류 불가)", 3],
  Mn: ["미분류", 3],
  Cu: ["미분류", 3],
  Zn: ["미분류", 3],
  Al: ["원소 자체 미분류(알루미늄 생산 공정은 1군)", 3],
  Ba: ["미분류", 3],
  Sr: ["미분류", 3],
};

export const ELEMENT_HAZARD: Record<string, ElementHazard> = Object.fromEntries(
  Object.entries(IARC_CLASS).map(([el, [iarc, level]]) => [el, { ...(HEALTH_INFO[el] ?? EXTRA[el]), iarc, level }]),
);

/** 유리섬유 필터·시료 준비에서도 나올 수 있는 원소 — 검출 빈도를 해석할 때 주의 */
export const FILTER_ELEMENTS = new Set(["Si", "Al", "Zn", "Ti", "Ba"]);
