/* 강남역 지하상가 채취 위치(초록의 5개 지점) — 파일 경로·채취 지점 입력값에서 위치를 알아낸다.
   - 사진·EDS 파일을 위치별 폴더에 넣거나 파일 이름에 위치명(예: 개찰구, B-28)을 넣으면 자동으로 지정된다.
   - 지도 좌표(x, y)는 모식도(0–1 정규화) 기준의 기본값이다. 실제 평면도를 올리면 화면에서 옮길 수 있다. */

export interface SiteDef {
  id: string;
  /** 화면·채취 지점 값으로 쓰는 이름 */
  label: string;
  short: string;
  /** 지하상가 구역·점포 번호 */
  zone: string;
  pattern: RegExp;
  x: number;
  y: number;
}

export const GANGNAM_SITES: SiteDef[] = [
  { id: "gate", label: "개찰구 (D구역)", short: "개찰구", zone: "D구역", pattern: /개찰구|게이트|\bgate\b|D\s*-?\s*구역/i, x: 0.405, y: 0.53 },
  { id: "food", label: "음식점 (B-28)", short: "음식점", zone: "B-28", pattern: /음식점|식당|restaurant|(?<![A-Za-z0-9])B\s*-?\s*28(?!\d)/i, x: 0.15, y: 0.53 },
  { id: "cafe", label: "카페·간편식 (E-43)", short: "카페", zone: "E-43", pattern: /카페|간편식|\bcafe\b|(?<![A-Za-z0-9])E\s*-?\s*43(?!\d)/i, x: 0.6, y: 0.53 },
  { id: "cosmetic", label: "화장품 (F-1)", short: "화장품", zone: "F-1", pattern: /화장품|cosmetic|(?<![A-Za-z0-9])F\s*-?\s*1(?![\d.])/i, x: 0.895, y: 0.53 },
  { id: "clothing", label: "의류매장 (E-2)", short: "의류", zone: "E-2", pattern: /의류|옷가게|clothing|(?<![A-Za-z0-9])E\s*-?\s*2(?![\d.])/i, x: 0.745, y: 0.48 },
];

/** 한 문자열(채취 지점 값·파일 이름)에서 위치 찾기 */
export function matchSiteText(text: string | null | undefined): SiteDef | null {
  if (!text) return null;
  const hits = GANGNAM_SITES.filter((s) => s.pattern.test(text));
  return hits.length === 1 ? hits[0] : null;
}

/** 파일 경로(폴더/…/파일)에서 위치 찾기: 가장 안쪽 폴더부터 바깥쪽으로, 파일 이름은 마지막에 본다 */
export function matchSitePath(path: string): SiteDef | null {
  const parts = path.split(/[\\/]/).filter(Boolean);
  const file = parts.pop() ?? "";
  for (let i = parts.length - 1; i >= 0; i--) {
    const s = matchSiteText(parts[i]);
    if (s) return s;
  }
  return matchSiteText(file.replace(/\.[^.]+$/, ""));
}

export function siteById(id: string): SiteDef | undefined {
  return GANGNAM_SITES.find((s) => s.id === id);
}
