/* CSV · XLSX 파일을 표(Table)로 읽는다. 브라우저와 테스트(Node) 양쪽에서 쓰도록 바이트 단위 입력을 받는다. */
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { canonicalHeader, type Row, type Table } from "./common";

/**
 * 바이트를 텍스트로. 엑셀에서 "CSV"로 저장한 한글 파일은 CP949(EUC-KR)인 경우가 많아
 * UTF-8로 엄격하게 디코딩해 보고 실패하면 EUC-KR로 다시 읽는다.
 */
export function decodeText(bytes: Uint8Array): { text: string; encoding: string } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text: text.replace(/^﻿/, ""), encoding: "UTF-8" };
  } catch {
    try {
      return { text: new TextDecoder("euc-kr").decode(bytes), encoding: "EUC-KR(CP949)" };
    } catch {
      return { text: new TextDecoder("utf-8").decode(bytes), encoding: "UTF-8(손상 문자 포함)" };
    }
  }
}

function canonicalizeRows(rawHeaders: string[], rawRows: Record<string, unknown>[]): { headers: string[]; rows: Row[] } {
  const headers = rawHeaders.map((h) => canonicalHeader(String(h ?? "")));
  const rows = rawRows.map((r) => {
    const o: Row = {};
    rawHeaders.forEach((h, i) => {
      const key = headers[i];
      // 같은 표준 이름이 둘 이상이면 첫 번째 열을 우선한다
      if (!(key in o) || o[key] == null || o[key] === "") o[key] = r[h];
    });
    return o;
  });
  return { headers, rows };
}

/** 주석(#으로 시작하는 줄)은 건너뛴다 — 템플릿 파일에 설명을 넣기 위함 */
export function parseCsvText(text: string, name: string): Table {
  const cleaned = text
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
  const res = Papa.parse<Record<string, unknown>>(cleaned, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: (h) => h.trim(),
  });
  const rawHeaders = (res.meta.fields ?? []).filter((h) => h !== "");
  const { headers, rows } = canonicalizeRows(rawHeaders, res.data);
  return { name, headers, rows };
}

export function parseXlsxBytes(bytes: Uint8Array, name: string): Table[] {
  const wb = XLSX.read(bytes, { type: "array", cellDates: true });
  const tables: Table[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
    // 주석 줄(#)과 빈 줄을 건너뛰고 첫 줄을 머리글로
    const lines = aoa.filter((r) => Array.isArray(r) && r.some((c) => c != null && String(c).trim() !== "") && !/^\s*#/.test(String(r[0] ?? "")));
    if (!lines.length) continue;
    const rawHeaders = (lines[0] as unknown[]).map((h) => String(h ?? "").trim());
    const objs = lines.slice(1).map((r) => {
      const o: Record<string, unknown> = {};
      rawHeaders.forEach((h, i) => {
        if (h) o[h] = (r as unknown[])[i];
      });
      return o;
    });
    const { headers, rows } = canonicalizeRows(rawHeaders.filter(Boolean), objs);
    tables.push({ name: wb.SheetNames.length > 1 ? `${name} › ${sheetName}` : name, headers, rows });
  }
  return tables;
}

export function isSpreadsheetName(name: string): boolean {
  return /\.(xlsx|xlsm|xls)$/i.test(name);
}
export function isCsvName(name: string): boolean {
  return /\.(csv|tsv|txt)$/i.test(name);
}
export function isImageName(name: string): boolean {
  return /\.(jpe?g|png|tiff?|bmp)$/i.test(name);
}

/** 파일 바이트를 표 목록으로 */
export function readTables(bytes: Uint8Array, name: string): { tables: Table[]; encoding: string | null } {
  if (isSpreadsheetName(name)) return { tables: parseXlsxBytes(bytes, name), encoding: null };
  const { text, encoding } = decodeText(bytes);
  return { tables: [parseCsvText(text, name)], encoding };
}
