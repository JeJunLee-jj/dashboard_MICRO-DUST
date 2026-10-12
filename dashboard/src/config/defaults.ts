/* 분석 설정·위해성 평가 규칙의 기본값.
   모든 값은 설정 화면에서 바꿀 수 있고, CSV/JSON으로 내보내고 다시 불러올 수 있다. */
import type { AnalysisSettings, HazardRule } from "../lib/types";
import { DEFAULT_TARGET_ELEMENTS } from "../lib/elements";

export const DEFAULT_SETTINGS: AnalysisSettings = {
  targetElements: [...DEFAULT_TARGET_ELEMENTS],
  belowLoqCountsAsDetected: true,
  absentElementPolicy: "not_detected",
  sumTolerance: 5,
  excludeSumOutliers: false,
  normalization: "metal",
  displayBasis: "wt",
  preparationElements: [],
  preparationChecked: false,
};

const IARC_URL = "https://monographs.iarc.who.int/list-of-classifications/";

/**
 * 위해성 평가 규칙 기본값.
 * - 출처가 확인되는 항목(IARC 발암성 분류)만 범주를 채웠다. 이 분류는 "화학종"에 대한 것이며
 *   EDS는 원소만 검출할 뿐 산화수·화합물 형태를 구분하지 못한다. 따라서 이 범주는 입자의 위해도를
 *   판정하는 데 쓰지 않고, 원소별 참고 정보로만 표시한다.
 * - 근거를 입력하지 않은 원소는 "평가 대상(범주 미입력)"으로 둔다. 임의의 위험 등급을 만들지 않는다.
 * - 사용 전 원문(IARC 분류 목록)을 확인할 것.
 */
export const DEFAULT_HAZARD_RULES: HazardRule[] = [
  {
    element_symbol: "As",
    assessment_category: "IARC Group 1 (무기 비소 화합물)",
    reference_name: "IARC Monographs Vol. 100C — Arsenic and inorganic arsenic compounds",
    reference_year: 2012,
    reference_url: IARC_URL,
    applicable_condition: "비소 및 무기 비소 화합물에 해당. EDS로는 화학종 구분 불가.",
    classification_note: "발암성 증거 수준 분류이며 노출량·위해도를 뜻하지 않음. 사용 전 원문 확인.",
  },
  {
    element_symbol: "Cd",
    assessment_category: "IARC Group 1 (카드뮴 및 화합물)",
    reference_name: "IARC Monographs Vol. 100C — Cadmium and cadmium compounds",
    reference_year: 2012,
    reference_url: IARC_URL,
    applicable_condition: "카드뮴 및 카드뮴 화합물.",
    classification_note: "발암성 증거 수준 분류이며 노출량·위해도를 뜻하지 않음. 사용 전 원문 확인.",
  },
  {
    element_symbol: "Cr",
    assessment_category: "IARC Group 1 — 6가 크롬 화합물에 한함",
    reference_name: "IARC Monographs Vol. 100C — Chromium (VI) compounds",
    reference_year: 2012,
    reference_url: IARC_URL,
    applicable_condition: "6가 크롬(Cr(VI)) 화합물에만 해당. 금속 크롬·3가 크롬 화합물은 별도 분류(Vol. 49, Group 3). EDS로는 산화수 구분 불가 → Cr 검출이 Cr(VI) 존재를 뜻하지 않음.",
    classification_note: "화학종 확인(XPS, XANES 등) 없이 Group 1로 해석하지 말 것.",
  },
  {
    element_symbol: "Ni",
    assessment_category: "IARC Group 1 — 니켈 화합물 / 금속 니켈 Group 2B",
    reference_name: "IARC Monographs Vol. 100C — Nickel compounds; Vol. 49 — Nickel, metallic and alloys",
    reference_year: 2012,
    reference_url: IARC_URL,
    applicable_condition: "니켈 화합물(Group 1)과 금속 니켈·합금(Group 2B)의 분류가 다름. EDS로는 화학종 구분 불가.",
    classification_note: "사용 전 원문 확인.",
  },
  {
    element_symbol: "Pb",
    assessment_category: "IARC Group 2A — 무기 납 화합물 / 금속 납 Group 2B",
    reference_name: "IARC Monographs Vol. 87 — Inorganic and organic lead compounds",
    reference_year: 2006,
    reference_url: IARC_URL,
    applicable_condition: "무기 납 화합물(Group 2A)과 금속 납(Group 2B)의 분류가 다름. EDS로는 화학종 구분 불가.",
    classification_note: "사용 전 원문 확인.",
  },
  {
    element_symbol: "Co",
    assessment_category: "평가 대상(범주 미입력)",
    reference_name: null,
    reference_year: null,
    reference_url: IARC_URL,
    applicable_condition: "IARC Monographs Vol. 131에서 코발트 화학종별로 분류가 다름 — 원문 확인 후 직접 입력.",
    classification_note: "근거 미입력.",
  },
  ...(["Mn", "Cu", "Zn", "Fe"] as const).map((s) => ({
    element_symbol: s,
    assessment_category: "평가 대상(범주 미입력)",
    reference_name: null,
    reference_year: null,
    reference_url: null,
    applicable_condition: null,
    classification_note: "초기 검토 대상 원소. 평가 기준과 출처를 입력하기 전에는 범주를 부여하지 않음.",
  })),
];
