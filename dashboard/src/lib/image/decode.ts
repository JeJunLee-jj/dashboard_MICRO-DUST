/* SEM 이미지 파일 읽기. 브라우저는 TIFF를 직접 표시하지 못하므로 UTIF로 디코딩해 PNG로 바꾼다.
   (기존 sem-particle-analyzer의 TIFF 처리 방식을 따름: 16비트 회색조는 실제 값 범위에 맞춰 8비트로 편다) */
import type { DataOrigin, ImageAsset } from "../types";
import { parsePhenomXml, tagToString } from "./instrument";

export type ImageFormat = "png" | "jpeg" | "tiff" | "bmp" | "gif" | "webp" | "unknown";

export function sniffBytes(b: Uint8Array): ImageFormat {
  const m = (...xs: number[]) => xs.every((x, i) => b[i] === x);
  if (m(0x89, 0x50, 0x4e, 0x47)) return "png";
  if (m(0xff, 0xd8, 0xff)) return "jpeg";
  if (m(0x49, 0x49, 0x2a, 0x00) || m(0x4d, 0x4d, 0x00, 0x2a)) return "tiff";
  if (m(0x42, 0x4d)) return "bmp";
  if (m(0x47, 0x49, 0x46, 0x38)) return "gif";
  if (m(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45) return "webp";
  return "unknown";
}

interface UtifIfd {
  width: number;
  height: number;
  data: Uint8Array;
  t258?: number[];
  t277?: number[];
  t34683?: unknown;   // Phenom/FEI 메타데이터 XML
}

function gray16ToRGBA(ifd: UtifIfd, little: boolean): Uint8ClampedArray | null {
  const d = ifd.data;
  const n = (d.length / 2) | 0;
  if (n !== ifd.width * ifd.height) return null;
  let mn = 65535, mx = 0;
  const read = (i: number) => (little ? d[i * 2] | (d[i * 2 + 1] << 8) : (d[i * 2] << 8) | d[i * 2 + 1]);
  for (let i = 0; i < n; i++) {
    const v = read(i);
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  if (mx <= mn) return null;
  const out = new Uint8ClampedArray(n * 4);
  const s = 255 / (mx - mn);
  for (let i = 0; i < n; i++) {
    const g = (read(i) - mn) * s;
    out[i * 4] = g; out[i * 4 + 1] = g; out[i * 4 + 2] = g; out[i * 4 + 3] = 255;
  }
  return out;
}

async function tiffToPng(buf: ArrayBuffer): Promise<{ blob: Blob; width: number; height: number; deep: boolean; xml: string | null }> {
  const mod = await import("utif");
  const UTIF = ((mod as unknown as { default?: unknown }).default ?? mod) as {
    decode(b: ArrayBuffer): UtifIfd[];
    decodeImage(b: ArrayBuffer, ifd: UtifIfd, ifds: UtifIfd[]): void;
    toRGBA8(ifd: UtifIfd): Uint8Array;
  };
  const ifds = UTIF.decode(buf);
  if (!ifds?.length) throw new Error("TIFF 페이지 없음");
  UTIF.decodeImage(buf, ifds[0], ifds);
  const ifd = ifds[0];
  const little = new Uint8Array(buf, 0, 1)[0] === 0x49;
  const bps = ifd.t258?.[0] ?? 8, spp = ifd.t277?.[0] ?? 1;
  let rgba: Uint8ClampedArray | null = null, deep = false;
  if (bps === 16 && spp === 1) {
    rgba = gray16ToRGBA(ifd, little);
    deep = !!rgba;
  }
  if (!rgba) rgba = new Uint8ClampedArray(UTIF.toRGBA8(ifd));
  const { width, height } = ifd;
  if (!width || !height) throw new Error("빈 이미지");
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(width, height);
  img.data.set(rgba);
  ctx.putImageData(img, 0, 0);
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("PNG 변환 실패"))), "image/png"));
  return { blob, width, height, deep, xml: tagToString(ifd.t34683) };
}

function imageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res({ width: im.naturalWidth, height: im.naturalHeight });
    im.onerror = () => rej(new Error("이미지를 표시할 수 없습니다"));
    im.src = url;
  });
}

/** 업로드한 이미지 파일 → ImageAsset. 실패하면 사유를 담은 Error */
export async function loadImageFile(file: File, origin: DataOrigin): Promise<ImageAsset> {
  const buf = await file.arrayBuffer();
  const fmt = sniffBytes(new Uint8Array(buf, 0, Math.min(16, buf.byteLength)));
  if (fmt === "unknown") throw new Error(`이미지 형식을 인식할 수 없습니다(${file.name}). JPG·PNG·TIFF 파일을 올려 주세요.`);
  if (fmt === "tiff") {
    try {
      const r = await tiffToPng(buf);
      const instrument = r.xml ? parsePhenomXml(r.xml, r.width) : null;
      return {
        filename: file.name, url: URL.createObjectURL(r.blob), width: r.width, height: r.height, origin,
        note: r.deep ? "16비트 TIFF를 실제 값 범위에 맞춰 8비트로 변환해 표시(대비 변경됨)" : "TIFF를 PNG로 변환해 표시",
        synthetic: false,
        instrument,
      };
    } catch (e) {
      throw new Error(`TIFF 파일을 열지 못했습니다(${file.name}): ${(e as Error).message}. 압축 방식이 특수할 수 있습니다. PNG나 JPEG로 다시 저장해 주세요.`);
    }
  }
  const url = URL.createObjectURL(file);
  const size = await imageSize(url).catch(() => null);
  if (!size) {
    URL.revokeObjectURL(url);
    throw new Error(`이미지를 표시할 수 없습니다(${file.name}).`);
  }
  return { filename: file.name, url, width: size.width, height: size.height, origin, note: null, synthetic: false, instrument: null };
}
