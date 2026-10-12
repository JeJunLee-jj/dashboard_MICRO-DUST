export interface RegionProps {
  id: number;
  area: number;      // px²
  cx: number;
  cy: number;
  bbox: [number, number, number, number]; // [y0, x0, y1, x1]
  perim: number;     // px
  circ: number;      // 원형도 4πA/P²
  sol: number;       // 고형도 A/볼록껍질면적
  ar: number;        // 종횡비(2차 모멘트 장축/단축)
  major: number;
  minor: number;
  eqd: number;       // 등가원 지름 px
  feret: number;     // 최대 Feret px
  contour: Array<[number, number]>;
  hull: Array<[number, number]>;
}

export interface AnalyzeOptions {
  sigma: number;
  autoThreshold: boolean;
  threshold: number;
  bright: boolean;
  fillHoles: boolean;
  minArea: number;
  dropBorder: boolean;
  splitFrac: number;
  cropBottom: number;
  autoCrop: boolean;
  singleParticle: boolean;
}

export interface AnalyzeResult {
  W: number;
  H: number;
  cropBottom: number;
  autoCropPx: number;
  threshold: number;
  lab: Int32Array;
  props: RegionProps[];
}

type Binary = Uint8Array;

export declare const IP: {
  analyze(img: ImageData | { data: Uint8ClampedArray; width: number; height: number }, opt: AnalyzeOptions): AnalyzeResult;
  toGray(img: ImageData | { data: Uint8ClampedArray; width: number; height: number }): Float32Array;
  gaussian(src: Float32Array, W: number, H: number, sigma: number): Float32Array;
  otsu(gray: Float32Array): number;
  binarize(gray: Float32Array, W: number, H: number, thr: number, bright: boolean): Binary;
  fillHoles(bw: Binary, W: number, H: number): Binary;
  label(bw: Binary, W: number, H: number): { lab: Int32Array; count: number };
  edt(bw: Binary, W: number, H: number): Float32Array;
  detectInfoBar(gray: Float32Array, W: number, H: number): number;
  regionProps(lab: Int32Array, count: number, W: number, H: number): RegionProps[];
};
