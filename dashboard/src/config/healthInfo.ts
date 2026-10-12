/* 원소별 건강 영향 참고 정보(문헌 요약).
   - 공개 기관 자료(WHO, IARC, 미국 ATSDR·NIOSH)에 서술된 "노출 시 알려진 영향"을 짧게 요약한 것이다.
   - 이 정보는 해당 원소(또는 특정 화학종)에 노출되었을 때의 일반적 영향이며, 분석 입자에서 원소가 검출되었다는
     사실이 이 영향을 뜻하지 않는다. 실제 위해는 화학종(산화수·화합물), 노출 농도·기간·경로, 입자 크기에 따라 다르다.
   - 설정 화면의 위해성 평가 규칙 표(health_effects, target_organs, health_references 열)에서 고칠 수 있다.
     사용자가 값을 비워 두면 아래 기본값을 쓴다. 사용 전 원문을 확인할 것. */

export interface HealthInfo {
  target_organs: string;
  health_effects: string;
  /** "출처 이름 | URL" 을 " ; "로 이어 쓴다(URL은 선택) */
  health_references: string;
}

const ATSDR = "https://www.atsdr.cdc.gov/toxprofiledocs/index.html";
const IARC = "https://monographs.iarc.who.int/list-of-classifications/";
const NIOSH = "https://www.cdc.gov/niosh/npg/";

export const HEALTH_INFO: Record<string, HealthInfo> = {
  Pb: {
    target_organs: "신경계, 조혈계(혈액), 신장, 심혈관계",
    health_effects: "체내에 축적되어 신경계(특히 어린이의 인지 발달), 조혈계(빈혈), 신장, 심혈관계(혈압 상승)에 영향을 줄 수 있다. WHO는 해롭지 않다고 알려진 납 노출 수준은 없다고 본다.",
    health_references: `WHO Lead poisoning fact sheet | https://www.who.int/news-room/fact-sheets/detail/lead-poisoning-and-health ; ATSDR Toxicological Profile for Lead | ${ATSDR}`,
  },
  Cd: {
    target_organs: "신장, 뼈, 호흡기(폐)",
    health_effects: "흡입 시 폐 손상과 폐암 위험이 있고(카드뮴 및 화합물, IARC Group 1), 장기 노출 시 신장(근위세뇨관) 손상과 뼈 약화(골연화증·골다공증)를 일으킬 수 있다.",
    health_references: `ATSDR Toxicological Profile for Cadmium | ${ATSDR} ; IARC Monographs Vol. 100C | ${IARC}`,
  },
  As: {
    target_organs: "피부, 폐, 방광, 심혈관계, 신경계",
    health_effects: "무기 비소는 폐암·방광암·피부암의 원인(IARC Group 1)이며, 장기 노출 시 피부 병변, 말초신경병증, 심혈관 질환과 관련된다. 주된 노출 경로는 음용수이며 흡입 노출은 폐암 위험과 관련된다.",
    health_references: `WHO Arsenic fact sheet | https://www.who.int/news-room/fact-sheets/detail/arsenic ; IARC Monographs Vol. 100C | ${IARC}`,
  },
  Cr: {
    target_organs: "호흡기(폐·비강), 피부",
    health_effects: "6가 크롬(Cr(VI)) 화합물을 흡입하면 폐암(IARC Group 1), 비중격 궤양·천공, 호흡기 자극이 생길 수 있고, 피부 감작(알레르기성 접촉피부염)을 일으킨다. 3가 크롬은 독성이 훨씬 낮다. EDS로는 산화수를 구분할 수 없다.",
    health_references: `ATSDR Toxicological Profile for Chromium | ${ATSDR} ; IARC Monographs Vol. 100C | ${IARC}`,
  },
  Ni: {
    target_organs: "호흡기(폐·비강), 피부",
    health_effects: "니켈 화합물 흡입은 폐암·비강암의 원인(IARC Group 1)이며 만성 기관지염 등 호흡기 영향이 보고되었다. 피부에 닿으면 니켈 알레르기(접촉피부염)가 흔하다. 금속 니켈은 IARC Group 2B이다.",
    health_references: `ATSDR Toxicological Profile for Nickel | ${ATSDR} ; IARC Monographs Vol. 100C, Vol. 49 | ${IARC}`,
  },
  Co: {
    target_organs: "호흡기, 심장, 피부",
    health_effects: "코발트 분진 흡입은 천식 등 호흡기 질환, 경금속 폐질환(특히 텅스텐 카바이드와 함께 노출될 때)과 관련되며 피부 감작을 일으킬 수 있다. 고농도 노출에서 심근병증이 보고되었다. 발암성 분류는 화학종에 따라 다르다(IARC Vol. 131).",
    health_references: `ATSDR Toxicological Profile for Cobalt | ${ATSDR} ; IARC Monographs Vol. 131 | ${IARC}`,
  },
  Mn: {
    target_organs: "신경계, 호흡기",
    health_effects: "장기간 고농도로 흡입하면 신경계 손상(망간중독증: 떨림·보행 장애 등 파킨슨병과 비슷한 증상)이 나타날 수 있고 호흡기 자극을 일으킬 수 있다. 필수 미량 원소이기도 하다.",
    health_references: `ATSDR Toxicological Profile for Manganese | ${ATSDR}`,
  },
  Cu: {
    target_organs: "호흡기, 위장관, 간",
    health_effects: "구리 분진·흄 흡입은 호흡기 자극과 금속 흄열(일시적인 독감 비슷한 증상)을 일으킬 수 있다. 필수 미량 원소이며, 과량 섭취하면 위장관·간에 영향이 있다.",
    health_references: `ATSDR Toxicological Profile for Copper | ${ATSDR}`,
  },
  Zn: {
    target_organs: "호흡기",
    health_effects: "산화아연 흄을 흡입하면 금속 흄열(발열·오한 등 일시적 증상)이 생길 수 있다. 필수 미량 원소이며 일반 분진 형태의 독성은 상대적으로 낮다.",
    health_references: `ATSDR Toxicological Profile for Zinc | ${ATSDR}`,
  },
  Fe: {
    target_organs: "호흡기(폐)",
    health_effects: "산화철 분진·흄을 장기간 흡입하면 폐에 철이 쌓이는 철폐증(siderosis)이 생길 수 있으며, 대개 폐 기능 저하는 크지 않은 것으로 알려져 있다. 지하철 미세먼지 중 철 함유 입자가 산화 스트레스를 유발할 가능성이 연구되고 있다.",
    health_references: `NIOSH Pocket Guide — Iron oxide dust and fume | ${NIOSH} ; Karlsson HL 외, Chem. Res. Toxicol. 2005;18:19–23 (지하철 입자의 유전독성·산화 스트레스)`,
  },
  Si: {
    target_organs: "호흡기(폐)",
    health_effects: "결정형 실리카(석영·크리스토발라이트) 흡입은 규폐증과 폐암의 원인(IARC Group 1)이다. 비정질 실리카와 규산염 광물은 독성이 다르며, EDS로는 결정형 여부를 구분할 수 없다(XRD 등 별도 분석 필요).",
    health_references: `IARC Monographs Vol. 100C — Silica dust, crystalline | ${IARC}`,
  },
  Al: {
    target_organs: "호흡기, 신경계",
    health_effects: "알루미늄 분진을 직업적으로 고농도 흡입한 경우 폐 섬유화 등 호흡기 영향이 보고되었다. 일반 환경 노출 수준에서의 영향은 불확실하다.",
    health_references: `ATSDR Toxicological Profile for Aluminum | ${ATSDR}`,
  },
  Mo: {
    target_organs: "호흡기",
    health_effects: "삼산화몰리브덴 흡입은 호흡기 자극을 일으킬 수 있으며, 삼산화몰리브덴은 IARC Group 2B로 분류된다. 금속 몰리브덴과 이황화몰리브덴(윤활제 성분)의 흡입 독성 자료는 제한적이다.",
    health_references: `IARC Monographs Vol. 118 — Molybdenum trioxide | ${IARC}`,
  },
  Sr: {
    target_organs: "뼈(방사성 동위원소의 경우)",
    health_effects: "안정 스트론튬은 일반 환경 농도에서 독성이 낮은 것으로 알려져 있다. 방사성 동위원소(Sr-90)는 위해가 다르며, EDS는 동위원소를 구분하지 않는다.",
    health_references: `ATSDR Toxicological Profile for Strontium | ${ATSDR}`,
  },
};

/** 미세먼지 입자 자체의 영향(성분과 별개) */
export const PM_GENERAL_NOTE = {
  text: "성분과 별개로, 미세먼지(PM2.5·PM10) 노출 자체가 호흡기·심혈관 질환 위험 증가와 관련된다.",
  reference: "WHO Ambient (outdoor) air pollution fact sheet",
  url: "https://www.who.int/news-room/fact-sheets/detail/ambient-(outdoor)-air-quality-and-health",
};
