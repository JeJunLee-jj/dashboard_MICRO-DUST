/* 이미지 기반 크기·형상 지표 측정 — "사진 한 장 = 입자 하나" SEM 이미지용.
   처리: 하단 정보바 제외 → 가우시안 블러 → 임계값(Otsu × 계수) → 닫힘 연산 → 구멍 채우기 → 가장 큰 영역 하나 → 형상 지표.
   - 전역 Otsu 그대로는 입자 안쪽의 그늘진 면이 배경으로 잘려 윤곽이 들쭉날쭉해진다(실측 Phenom 이미지에서 확인).
     그래서 기본 임계값을 Otsu보다 낮게(×0.7) 두고 닫힘 연산으로 틈을 메운다. 이 계수는 시료·촬영 조건에 따라
     달라질 수 있으므로 화면에서 윤곽을 겹쳐 보고 조절·확인하도록 한다.
   - 형상 분류를 자동 확정하지 않는다: 지표가 조건을 만족하면 "후보"만 제안하고 적용은 사용자가 정한다.
     각진 파편형·판상형·다공성/불규칙형은 2D 윤곽 지표로 서로 구분하지 않는다.
   영상처리 기본 함수는 기존 sem-particle-analyzer 의 ip.js 를 그대로 쓴다. */
import { IP, type RegionProps } from "./ip.js";
import type { MorphologyClass } from "../types";

export const SHAPE_THRESHOLDS = {
  // 기존 sem-particle-analyzer 기본값(합성 데이터 기반) — 실측 재보정 필요
  fibrousAspect: 2.8,
  agglomerateSolidity: 0.72,
  sphericalCircularity: 0.8,
  sphericalAspectMax: 1.3,
};

export interface SegmentParams {
  sigma: number;            // 블러 표준편차(px)
  thresholdFactor: number;  // 임계값 = Otsu × 계수
  closeRadiusPx: number;    // 닫힘 연산 반경(px, 원본 해상도 기준)
  cropBottomPx: number | null; // 하단 정보바 높이(px). null이면 자동 감지
  bright: boolean;          // 입자가 배경보다 밝음
}

export const DEFAULT_SEGMENT: SegmentParams = { sigma: 3, thresholdFactor: 0.7, closeRadiusPx: 6, cropBottomPx: null, bright: true };

export interface SegmentResult {
  props: RegionProps;       // 분석 좌표(축소했으면 축소 좌표)
  threshold: number;
  otsu: number;
  cropBottomPx: number;
  touchesBorder: boolean;
}

/** 회색조 배열(0–255)에서 가장 큰 입자 하나를 분할 */
export function segmentSingleParticle(gray: Float32Array, W: number, H0: number, p: SegmentParams, scale = 1): SegmentResult {
  let crop = p.cropBottomPx != null ? Math.round(p.cropBottomPx * scale) : IP.detectInfoBar(gray, W, H0);
  crop = Math.max(0, Math.min(H0 - 10, crop));
  const H = H0 - crop;
  const g = crop ? gray.subarray(0, W * H) : gray;
  const blurred = IP.gaussian(g, W, H, p.sigma * scale);
  const otsu = IP.otsu(blurred);
  // 밝은 입자: 임계값을 낮춰 그늘진 면까지 포함 / 어두운 입자: 반대로 높인다
  const threshold = p.bright ? otsu * p.thresholdFactor : 255 - (255 - otsu) * p.thresholdFactor;
  let bw = IP.binarize(blurred, W, H, threshold, p.bright);
  const r = p.closeRadiusPx * scale;
  if (r > 0) {
    const n = W * H;
    const inv = new Uint8Array(n);
    for (let i = 0; i < n; i++) inv[i] = bw[i] ? 0 : 1;
    const dToFg = IP.edt(inv, W, H);             // 배경 픽셀에서 가장 가까운 전경까지 거리
    const dil = new Uint8Array(n);
    for (let i = 0; i < n; i++) dil[i] = bw[i] || dToFg[i] <= r ? 1 : 0;
    const dToBg = IP.edt(dil, W, H);             // 전경 픽셀에서 가장 가까운 배경까지 거리
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = dToBg[i] > r ? 1 : 0;
    bw = out;
  }
  bw = IP.fillHoles(bw, W, H);
  const L = IP.label(bw, W, H);
  if (!L.count) throw new Error("입자를 찾지 못했습니다. 임계 계수를 바꾸거나 '입자가 배경보다 어두움'을 확인하세요.");
  const area = new Int32Array(L.count + 1);
  for (let i = 0; i < W * H; i++) if (L.lab[i]) area[L.lab[i]]++;
  let keep = 1;
  for (let k = 2; k <= L.count; k++) if (area[k] > area[keep]) keep = k;
  const lab = new Int32Array(W * H);
  for (let i = 0; i < W * H; i++) lab[i] = L.lab[i] === keep ? 1 : 0;
  const props = IP.regionProps(lab, 1, W, H)[0];
  const [y0, x0, y1, x1] = props.bbox;
  return { props, threshold, otsu, cropBottomPx: Math.round(crop / scale), touchesBorder: x0 <= 0 || y0 <= 0 || x1 >= W || y1 >= H };
}

export interface ShapeMeasurement {
  props: RegionProps;
  scale: number;              // 분석 이미지 px ÷ 원본 px (축소했을 때 < 1)
  eqdPx: number;              // 원본 px 기준
  areaPx: number;
  feretPx: number;
  eqdUm: number | null;
  areaUm2: number | null;
  feretUm: number | null;
  candidate: MorphologyClass | null;
  candidateReason: string;
  threshold: number;
  otsu: number;
  cropBottom: number;
  touchesBorder: boolean;
  params: SegmentParams;
  /** 메타데이터 size_method 에 기록할 문자열 */
  methodLabel: string;
}

const MAXPIX = 3.2e6;

export function candidateFromMetrics(p: Pick<RegionProps, "ar" | "sol" | "circ">): { candidate: MorphologyClass | null; reason: string } {
  const T = SHAPE_THRESHOLDS;
  if (p.ar >= T.fibrousAspect) return { candidate: "fibrous", reason: `종횡비 ${p.ar.toFixed(2)} ≥ ${T.fibrousAspect}` };
  if (p.sol < T.agglomerateSolidity) return { candidate: "agglomerate", reason: `고형도 ${p.sol.toFixed(2)} < ${T.agglomerateSolidity}` };
  if (p.circ >= T.sphericalCircularity && p.ar < T.sphericalAspectMax)
    return { candidate: "spherical", reason: `원형도 ${p.circ.toFixed(2)} ≥ ${T.sphericalCircularity}, 종횡비 ${p.ar.toFixed(2)} < ${T.sphericalAspectMax}` };
  return {
    candidate: null,
    reason: "구형·섬유상·응집체 조건에 해당하지 않음 — 각진 파편형, 판상형, 다공성·불규칙형은 2D 윤곽 지표로 구분하지 않으므로 이미지를 보고 직접 판정하세요.",
  };
}

export function measureFromGray(gray: Float32Array, W: number, H: number, umPerPx: number | null, params: SegmentParams, scale = 1): ShapeMeasurement {
  const seg = segmentSingleParticle(gray, W, H, params, scale);
  const p = seg.props;
  const k = 1 / scale;
  const eqdPx = p.eqd * k, areaPx = p.area * k * k, feretPx = p.feret * k;
  const cand = candidateFromMetrics(p);
  return {
    props: p, scale, eqdPx, areaPx, feretPx,
    eqdUm: umPerPx != null ? eqdPx * umPerPx : null,
    areaUm2: umPerPx != null ? areaPx * umPerPx * umPerPx : null,
    feretUm: umPerPx != null ? feretPx * umPerPx : null,
    candidate: cand.candidate,
    candidateReason: cand.reason,
    threshold: seg.threshold,
    otsu: seg.otsu,
    cropBottom: seg.cropBottomPx,
    touchesBorder: seg.touchesBorder,
    params,
    methodLabel: `이미지 분할 측정(블러 σ${params.sigma}, 임계 Otsu×${params.thresholdFactor}, 닫힘 ${params.closeRadiusPx}px, 정보바 ${seg.cropBottomPx}px 제외) — 윤곽 사용자 확인`,
  };
}

export async function measureImage(url: string, umPerPx: number | null, params: SegmentParams = DEFAULT_SEGMENT): Promise<ShapeMeasurement> {
  const im = new Image();
  await new Promise<void>((res, rej) => {
    im.onload = () => res();
    im.onerror = () => rej(new Error("이미지를 읽지 못했습니다"));
    im.src = url;
  });
  const W0 = im.naturalWidth, H0 = im.naturalHeight;
  const scale = W0 * H0 > MAXPIX ? Math.sqrt(MAXPIX / (W0 * H0)) : 1;
  const W = Math.round(W0 * scale), H = Math.round(H0 * scale);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(im, 0, 0, W, H);
  const gray = IP.toGray(ctx.getImageData(0, 0, W, H));
  return measureFromGray(gray, W, H, umPerPx, params, scale);
}
