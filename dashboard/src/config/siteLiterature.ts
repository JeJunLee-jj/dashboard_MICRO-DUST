/* 지점별 선행연구 — 발생원·지표 원소와 건강 영향(연구진이 정리한 문헌 목록, 2026-10-26).
   한 줄 요약은 연구진 정리 문구를 그대로 쓴다. 위해성은 '그 발생원·화학종에서 보고된 사례'이며
   우리 입자의 위해 정도를 뜻하지 않는다. */

export interface LitItem {
  /** 무엇에 대한 근거인지(연구진 요약) */
  topic: string;
  cite: string;
  url: string;
  kind: "건강 영향" | "발생원·조성" | "형상" | "배경";
}

export interface SiteLiterature {
  siteId: string;
  /** 연구진이 꼽은 지표 원소 */
  indicators: string[];
  items: LitItem[];
}

export const SITE_LITERATURE: SiteLiterature[] = [
  {
    siteId: "gate", indicators: ["Fe", "Ba", "Sb"],
    items: [
      { topic: "안티몬 발암성 — 브레이크 패드", cite: "von Uexküll et al. (2005). Journal of Cleaner Production, 13, 19–31.", url: "https://www.globalcommunity.org/business/Antimony%20in%20Brake%20Pads%20-%20Jnl%20of%20Cleaner%20Production%20-%202005.pdf", kind: "건강 영향" },
      { topic: "지하철 종사자 단기 호흡기 영향 없음", cite: "Scand J Work Environ Health (2011), 37(2), 129–135.", url: "https://www.sjweh.fi/article/3074", kind: "건강 영향" },
      { topic: "지하철 입자 형상 — 판상·파편형", cite: "Moreno et al. (2017). Environmental Science: Processes & Impacts.", url: "https://pubs.rsc.org/en/content/articlehtml/2017/em/c6em00576d", kind: "형상" },
    ],
  },
  {
    siteId: "cosmetic", indicators: ["Ti", "Zn", "Mg"],
    items: [
      { topic: "화장용 탈크 흡입 — 폐 육아종증 증례", cite: "Jasuja et al. (2017). J Investig Med High Impact Case Rep, 5(3).", url: "https://journals.sagepub.com/doi/10.1177/2324709617728527", kind: "건강 영향" },
      { topic: "호흡성 TiO₂ 경고 자료(공기 중 비결합 호흡성 입자)", cite: "California OEHHA Proposition 65 Fact Sheet — Titanium dioxide.", url: "https://www.p65warnings.ca.gov/fact-sheets/titanium-dioxide-airborne-unbound-particles-respirable-size", kind: "건강 영향" },
    ],
  },
  {
    siteId: "cafe", indicators: ["K", "P"],
    items: [
      { topic: "커피 로스팅·포장 종사자 호흡기 이상", cite: "Bailey et al. (2020). Frontiers in Public Health, 8, 5.", url: "https://stacks.cdc.gov/view/cdc/223273", kind: "건강 영향" },
      { topic: "제빵사 천식·비염 용량반응", cite: "Brisman et al. (2000). Occup Environ Med, 57(5), 335–340.", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1739948", kind: "건강 영향" },
      { topic: "베이커리 실내 PM 조성 — K가 제빵 지표", cite: "Ielpo et al. (2020). Atmosphere, 11(4), 415.", url: "https://www.mdpi.com/2073-4433/11/4/415", kind: "발생원·조성" },
    ],
  },
  {
    siteId: "food", indicators: ["Ca", "Cl", "S"],
    items: [
      { topic: "조리 방식별 PM2.5 성분비", cite: "Wang et al. (2015). Aerosol and Air Quality Research, 15, 2357–2366.", url: "https://aaqr.org/articles/aaqr-15-02-siiac-0079", kind: "발생원·조성" },
    ],
  },
  {
    siteId: "clothing", indicators: ["C", "O", "Ti"],
    items: [
      { topic: "면방직 노동자 폐기능 15년 추적", cite: "Christiani et al. (2001). Am J Respir Crit Care Med, 163(4), 847–853.", url: "https://stacks.cdc.gov/view/cdc/186216", kind: "건강 영향" },
    ],
  },
];

export const BACKGROUND_LITERATURE: LitItem[] = [
  { topic: "서울 수도권 지하상가 PM2.5와 미량원소(대상지 배경)", cite: "Won et al. (2021). IJERPH, 18(1), 297.", url: "https://www.mdpi.com/1660-4601/18/1/297", kind: "배경" },
];

export function siteLiterature(siteId: string): SiteLiterature | null {
  return SITE_LITERATURE.find((s) => s.siteId === siteId) ?? null;
}
