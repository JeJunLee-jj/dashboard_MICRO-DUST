/* 데이터 품질·분석 한계와 추가 조사 항목을 실제 데이터 상태에서 만든다(화면과 보고서가 같이 쓴다). */
import type { AnalysisSettings, EdsRecord, HazardRule, Particle } from "./types";
import type { Unmatched } from "./join";
import { particleTargetResult } from "./hazard";

export interface FollowUp {
  item: string;
  detail: string;
  count?: number;
}

export function followUps(particles: Particle[], eds: EdsRecord[], settings: AnalysisSettings, hazardRules: HazardRule[], unmatched: Unmatched): FollowUp[] {
  const out: FollowUp[] = [];
  if (!particles.length) return out;
  const noScale = particles.filter((p) => p.meta && p.umPerPx == null).length;
  if (noScale) out.push({ item: "스케일 보정 정보 보완", detail: "scale_bar_value·scale_bar_unit·scale_bar_px가 모두 있어야 이미지에서 실제 크기를 계산할 수 있습니다.", count: noScale });
  const noMorph = particles.filter((p) => !p.morphology).length;
  if (noMorph) out.push({ item: "형상 판정", detail: "형상 판정값이 없는 입자입니다. 입자 상세 화면에서 판정하거나 메타데이터에 입력하세요.", count: noMorph });
  const undMorph = particles.filter((p) => p.morphology === "undetermined").length;
  if (undMorph) out.push({ item: "형상 재확인", detail: "'형상 판별 불가'로 판정된 입자 — 고배율 재촬영 등으로 재확인이 필요할 수 있습니다.", count: undMorph });
  const und = particles.filter((p) => particleTargetResult(p, settings).status === "undetermined").length;
  if (und) out.push({ item: "대상 원소 결측 보완", detail: "대상 원소가 하나도 검출되지 않았지만 일부 대상 원소 값이 결측이라 판정할 수 없는 입자입니다.", count: und });
  if (eds.length && eds.every((r) => r.status_source === "inferred_value" || r.status_source === "value_text")) {
    out.push({ item: "검출 상태 명시", detail: "EDS 파일에 detection_status 열이 없어 값에서 검출 여부를 추정했습니다. 장비 보고서의 검출 판정을 함께 기록하세요." });
  }
  if (eds.length && eds.every((r) => r.detection_limit == null && r.quantification_limit == null)) {
    out.push({ item: "검출한계·정량한계 확인", detail: "미량 원소(Pb, Cd, As 등)의 검출·미검출 해석에는 측정 조건별 검출한계가 필요합니다." });
  }
  if (!settings.preparationChecked) out.push({ item: "탄소 코팅·기판 신호 확인", detail: "블랭크(코팅·기판) 스펙트럼으로 C, Al, Si 등 시료 준비 유래 신호의 영향을 확인하세요." });
  const hasBackground = particles.some((p) => /배경|background|외기|외부/i.test(p.meta?.sample_type ?? ""));
  if (!hasBackground) out.push({ item: "배경(외기) 시료 확보", detail: "외부 대기 유입 여부와 역사 내 발생원 기여를 구분하려면 동시간대 외부 배경 시료가 필요합니다." });
  const noRef = settings.targetElements.filter((s) => !hazardRules.find((r) => r.element_symbol === s && r.reference_name));
  if (noRef.length) out.push({ item: "평가 기준·출처 입력", detail: `근거가 입력되지 않은 대상 원소: ${noRef.join(", ")}` });
  if (unmatched.imagesWithoutParticle.length || unmatched.missingImageFiles.length) {
    out.push({ item: "이미지–입자 연결 확인", detail: "연결되지 않은 이미지 또는 업로드되지 않은 이미지 파일이 있습니다(데이터 업로드 화면 참고).", count: unmatched.imagesWithoutParticle.length + unmatched.missingImageFiles.length });
  }
  out.push({ item: "화학종(산화수) 분석", detail: "EDS는 원소만 검출합니다. Cr(VI)/Cr(III) 등 화학종에 따라 위해성 분류가 달라지므로 XPS·XANES 등 별도 분석이 필요합니다." });
  out.push({ item: "입자 선정의 대표성 기록", detail: "분석 입자를 어떻게 골랐는지(무작위·전수·선택적)를 기록해야 결과를 시료 전체로 일반화할 수 있는지 판단할 수 있습니다." });
  return out;
}

/** 분석 방법상 항상 적용되는 한계 */
export const STANDING_LIMITATIONS = [
  "EDS 정량값은 가속전압, 작동거리, 입자 크기·형상·두께, 표면 거칠기 등에 영향을 받으며, 작은 입자는 기판·주변 신호가 섞일 수 있습니다(반정량으로 해석).",
  "탄소 코팅·탄소 테이프·기판 신호, 표면 오염, 검출한계의 영향이 확인되지 않은 경우 C·O·Al·Si 등의 값은 해석에 주의해야 합니다.",
  "wt%와 at%는 서로 다른 기준이므로 직접 비교하거나 합산하지 않습니다. 이 대시보드는 두 값을 서로 환산해 만들지 않습니다.",
  "입자 형상은 입자 유형을 추정하는 보조 지표이며 화학 조성을 확정하지 않습니다.",
  "원소의 검출은 독성·인체 흡수량·건강 위해도를 뜻하지 않습니다.",
  "입자 개수 비율은 질량 비율이나 대기 중 농도와 다릅니다. 이 대시보드는 질량 비율·대기 농도를 계산하지 않습니다.",
  "입자 유형·발생원 분류는 규칙 기반(임계값) 후보 제시이며, 임계값은 합성 데이터에서 정한 기본값이므로 실측 시료로 재보정해야 합니다.",
];
