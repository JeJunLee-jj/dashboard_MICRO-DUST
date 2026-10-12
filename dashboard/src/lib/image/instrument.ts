/* SEM 이미지 파일에 들어 있는 장비 메타데이터 읽기.
   Phenom(Thermo Fisher) TIFF는 34683번 태그에 FeiImage XML을 넣는다:
   픽셀 크기(pixelWidth, nm), 하단 정보바 높이(databarHeight), 촬영 시각(time, UTC), 가속전압, 작동거리, 검출기 등.
   이 값이 있으면 스케일 바를 손으로 재지 않아도 px → µm 보정이 된다. */

export interface InstrumentMeta {
  source: "phenom-xml";
  instrument: string | null;          // 예: Phenom G6 Phenom Pure2019
  softwareVersion: string | null;
  label: string | null;               // 정보바 라벨(예: 261008_Local)
  pixelWidthUm: number | null;        // µm/px
  pixelHeightUm: number | null;
  fieldWidthUm: number | null;        // 이미지 가로 시야(µm) = 픽셀 크기 × 가로 픽셀 수
  magnification: number | null;       // displayWidth ÷ 시야폭(Phenom 화면 기준 배율)
  databarHeightPx: number | null;     // 하단 정보바 높이 — 형상 측정에서 제외
  acquiredAtUtc: string | null;       // ISO(UTC)
  highVoltageKv: number | null;       // 절댓값
  workingDistanceMm: number | null;
  detector: string | null;
  spotSize: number | null;
  dwellTimeNs: number | null;
  integrations: number | null;
  pressurePa: number | null;
}

function tag(xml: string, name: string): { value: string; unit: string | null } | null {
  const m = xml.match(new RegExp(`<${name}(?:\\s+unit="([^"]*)")?[^>]*>([^<]*)</${name}>`));
  return m ? { value: m[2].trim(), unit: m[1] ?? null } : null;
}
function num(xml: string, name: string): number | null {
  const t = tag(xml, name);
  if (!t) return null;
  const v = parseFloat(t.value);
  return Number.isFinite(v) ? v : null;
}
/** 길이 값을 µm로 */
function lengthUm(xml: string, name: string): number | null {
  const t = tag(xml, name);
  if (!t) return null;
  const v = parseFloat(t.value);
  if (!Number.isFinite(v)) return null;
  const u = (t.unit ?? "m").toLowerCase();
  const k = u === "nm" ? 1e-3 : u === "um" || u === "µm" ? 1 : u === "mm" ? 1e3 : u === "m" ? 1e6 : NaN;
  return Number.isFinite(k) ? v * k : null;
}

/** Phenom FeiImage XML 해석. Phenom 형식이 아니면 null */
export function parsePhenomXml(xml: string, imageWidthPx: number | null): InstrumentMeta | null {
  if (!/<FeiImage[\s>]/.test(xml)) return null;
  const pw = lengthUm(xml, "pixelWidth");
  const ph = lengthUm(xml, "pixelHeight");
  const fieldWidthUm = pw != null && imageWidthPx ? pw * imageWidthPx : null;
  const displayWidthM = num(xml, "displayWidth");
  const time = tag(xml, "time")?.value ?? null;
  const hv = num(xml, "highVoltage");
  const instrument = [tag(xml, "type")?.value, tag(xml, "edition")?.value].filter(Boolean).join(" ") || null;
  return {
    source: "phenom-xml",
    instrument,
    softwareVersion: tag(xml, "softwareVersion")?.value ?? null,
    label: tag(xml, "databarLabel")?.value || null,
    pixelWidthUm: pw,
    pixelHeightUm: ph,
    fieldWidthUm,
    magnification: displayWidthM != null && fieldWidthUm ? Math.round(displayWidthM / (fieldWidthUm * 1e-6)) : null,
    databarHeightPx: num(xml, "databarHeight"),
    acquiredAtUtc: time ? (/[zZ]|[+-]\d\d:?\d\d$/.test(time) ? time : `${time}Z`) : null,
    highVoltageKv: hv != null ? Math.abs(hv) : null,
    workingDistanceMm: lengthUm(xml, "workingDistance") != null ? lengthUm(xml, "workingDistance")! / 1000 : null,
    detector: tag(xml, "detector")?.value?.toUpperCase() ?? null,
    spotSize: num(xml, "spotSize"),
    dwellTimeNs: num(xml, "dwellTime"),
    integrations: num(xml, "integrations"),
    pressurePa: num(xml, "samplePressureEstimate"),
  };
}

/** 촬영 시각(UTC)을 브라우저 지역 시간의 날짜·시각으로 */
export function localDateTime(isoUtc: string | null): { date: string; time: string } | null {
  if (!isoUtc) return null;
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}

/** UTIF가 읽은 태그 값(문자열 배열 또는 바이트 배열)을 문자열로 */
export function tagToString(v: unknown): string | null {
  if (v == null) return null;
  if (Array.isArray(v) && typeof v[0] === "string") return v.join("");
  if (v instanceof Uint8Array) return new TextDecoder("utf-8").decode(v);
  if (typeof v === "string") return v;
  return null;
}
