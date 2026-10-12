/* 차트 색상. 범주형 색은 고정 순서로 배정하고(순환 금지), 8번째를 넘는 범주는 '기타'(회색)로 합친다.
   팔레트 값은 dataviz 기준 팔레트(검증된 순서)를 따른다. */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
export const OTHER_COLOR = "#aaa59b";
/** 단일 계열 막대·점(범례 없는 차트) — 짙은 잉크색 */
export const INK_BAR = "#3d3b37";
/** 강조(선택 원소 등) — 주황 면 색 */
export const SIGNAL = "#f15534";
export const MUTED = "#66645e";
export const GRID = "#e2ded5";
export const AXIS = "#b9b4a9";

/** 순차(크기) — 주황 한 가지 색의 밝기 단계(옅은 살구 → 짙은 적갈) */
export const SEQ = ["#fbe6dd", "#f6c7b3", "#f0a283", "#e97a56", "#d4552f", "#a63d1d", "#73290f"];
export function seqColor(t: number): string {
  if (!Number.isFinite(t)) return "#eeebe4";
  const i = Math.max(0, Math.min(SEQ.length - 1, Math.round(t * (SEQ.length - 1))));
  return SEQ[i];
}

/** 발산(상관계수) — 빨강(음) ↔ 회색(0) ↔ 파랑(양) */
const NEG = ["#f6d0cf", "#ee9e9d", "#e66767", "#c43c3c"];
const POS = ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab"];
export function divColor(r: number | null): string {
  if (r == null) return "#f7f5f0";
  const a = Math.abs(r);
  if (a < 0.1) return "#f0efec";
  const i = Math.min(3, Math.floor(a * 4 - 0.0001));
  return r > 0 ? POS[i] : NEG[i];
}

/** 검출 상태 색(상태 표시는 항상 텍스트 라벨과 함께 쓴다) */
export const STATUS_COLOR: Record<string, string> = {
  detected: "#3d3b37",
  below_loq: "#8f8a80",
  below_lod: "#c9c4b9",
  not_detected: "#e6e2d9",
  missing: "#ffffff",
};

export function elementColor(symbol: string, order: string[]): string {
  const i = order.indexOf(symbol);
  return i >= 0 && i < SERIES.length ? SERIES[i] : OTHER_COLOR;
}
