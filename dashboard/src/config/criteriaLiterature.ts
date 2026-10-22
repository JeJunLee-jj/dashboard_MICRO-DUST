/* 기준별 입자 특성에 대한 선행연구의 인체 영향 사례(초록 작업 진행 메모 2026-10-22에서 확인한 범위만).
   - checked: 무엇을 보고 요약했는지 — 원문을 못 본 문헌은 초록만 확인했다고 표시한다.
   - caution: 우리 입자에 그대로 옮기면 안 되는 이유.
   이 사례는 "이런 특성의 입자에서 이런 영향이 보고되었다"는 것이며, 기준에 해당하는 우리 입자가 같은 영향을 준다는 뜻이 아니다. */

export interface LiteratureCase {
  cite: string;
  title?: string;
  url?: string;
  checked: "원문 확인" | "초록만 확인" | "초록 인용(서지 확인 필요)";
  finding: string;
  caution?: string;
}

export const SHAPE_CASES: LiteratureCase[] = [
  {
    cite: "Moreno et al. (2017)",
    checked: "초록 인용(서지 확인 필요)",
    finding: "지하철의 마찰·마모 기원 입자는 판상·파편형이며 Fe, Mn, Cu, Ba, Sb를 포함한다고 보고 — 본 연구 형상·조성 기준의 근거.",
    caution: "기준의 근거 문헌이며, 인체 영향을 직접 측정한 연구는 아니다.",
  },
  {
    cite: "Schinwald et al. (2012), ACS Nano 6(1):736–746",
    title: "Graphene-based nanoplatelets: a new risk to the respiratory system as a consequence of their unusual aerodynamic properties",
    url: "https://doi.org/10.1021/nn204229f",
    checked: "초록만 확인",
    finding: "판상 입자는 공기역학적 특성 때문에 지름 25 µm까지도 폐 깊은 곳에 도달할 수 있다고 계산. 마우스와 대식세포(THP-1)에서 염증 반응이 나타났고, 같은 조건의 구형 카본블랙은 반응이 없었다. 대식세포가 판상 입자를 다 감싸지 못하는 것(frustrated phagocytosis)을 원인으로 제시.",
    caution: "그래핀 판상 입자 연구다. 철도 기원 금속 판상 입자에 그대로 적용할 수 없으며, '판상 형상이 염증 반응에 관여한다는 보고가 있다' 정도로만 쓴다.",
  },
  {
    cite: "Stoehr et al. (2011), Part. Fibre Toxicol. 8:36",
    title: "Shape matters: effects of silver nanospheres and wires on human alveolar epithelial cells",
    url: "https://doi.org/10.1186/1743-8977-8-36",
    checked: "초록 인용(서지 확인 필요)",
    finding: "은 나노와이어는 A549 폐포 상피세포의 생존율을 유의하게 낮추었으나, 같은 물질의 구형 입자는 영향이 없었다(처음 초록에 인용).",
    caution: "실험실에서 만든 나노 입자다. 크기 범위(5–10 µm)와 물질이 우리 입자와 다르다.",
  },
];

export const COMPOSITION_CASES: LiteratureCase[] = [
  {
    cite: "Karlsson et al. (2005), Chem. Res. Toxicol. 18(1):19–23",
    title: "Subway particles are more genotoxic than street particles and induce oxidative stress in cultured human lung cells",
    url: "https://doi.org/10.1021/tx049723c",
    checked: "초록만 확인",
    finding: "스톡홀름 지하철역 입자를 A549 폐 세포에 노출했을 때 도로 입자보다 DNA 손상이 약 8배, 산화 스트레스가 약 4배 높았다. 산화 능력은 주로 자철석(Fe₃O₄) 형태의 Fe 때문이라고 해석.",
    caution: "세포 실험 결과이며, 노출량·노출 기간이 사람 노출과 다르다.",
  },
  {
    cite: "Ngoc et al. (2020), J. Hazard. Mater. 382:121175",
    url: "https://doi.org/10.1016/j.jhazmat.2019.121175",
    checked: "초록만 확인",
    finding: "서울 지하철 터널 PM의 주성분은 α/γ-Fe₂O₃(PM10의 57.6%). α-Fe₂O₃는 HeLa 세포와 제브라피시 배아에 독성을 보였고, γ-Fe₂O₃는 독성이 거의 없었다.",
    caution: "같은 Fe라도 결정상(α/γ)에 따라 독성이 다르다 — EDS로는 결정상을 구분할 수 없으므로 'Fe 검출'이 곧 독성을 뜻하지 않는다.",
  },
];

/** 조성 기준 원소 중 기본 참고 정보(healthInfo.ts)에 없는 원소의 메모 */
export const ELEMENT_NOTES: Record<string, string> = {
  Sb: "3가 안티몬은 IARC 2A군(인체 발암 추정)으로 분류되어 있다(IARC Monographs Vol. 131). 브레이크 패드 마모의 지표 원소로 쓰인다.",
  Ba: "IARC 발암성 분류 목록에 없다. 브레이크 패드(황산바륨 충전재) 마모의 지표 원소로 쓰인다. EDS에서 Ba L선과 Ti K선(약 4.5 keV)이 겹쳐 자동 판정이 섞일 수 있다.",
};

export const BOTH_NOTE =
  "형상 기준과 조성 기준을 동시에 만족하는 현장 입자의 인체 영향을 직접 다룬 선행연구는 아직 찾지 못했다. 두 기준을 함께 만족하는 입자는 후속 세포 실험에서 우선 확인할 대상으로 제안할 수 있다.";

export const LIMITATIONS = [
  "EDS는 원소만 확인하며 결정상·화합물 형태(예: α/γ-Fe₂O₃, 산화수)는 구분하지 못한다.",
  "포집 위치가 곧 발생원은 아니다 — 지하상가 공기는 섞이므로 위치 간 차이를 발생원 차이로 해석하지 않는다.",
  "종횡비 경계값은 본 연구에서 정한 값이라, 기준값에 따라 결과가 달라진다(아래 민감도 그래프로 확인).",
  "기준에 해당하는 입자의 비율은 노출량이나 건강 위험의 크기를 뜻하지 않는다(농도·흡입량 자료 없음).",
  "위치별 분석 입자가 약 10개로 적어 비율의 불확실성(95% 신뢰구간)이 크다 — 위치 간 차이는 경향으로만 본다.",
];
