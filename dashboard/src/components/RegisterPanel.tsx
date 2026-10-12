/* 입자 등록: SEM 이미지 1장 + EDS 정량 CSV 1개 = 입자 1개.
   - 파일을 끌어 놓으면 이미지마다 한 행을 만들고, CSV는 아직 짝이 없는 행에 순서대로 붙인다(파일 수정 시각 순).
   - Phenom TIFF는 픽셀 크기·배율·촬영 시각·가속전압 등을 파일에서 읽어 채운다.
   - 형상 지표는 자동 측정하되, 윤곽을 겹쳐 보여주고 사용자가 확인한 경우에만 크기를 저장한다. 형상 분류는 사용자가 고른다. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore, hrefFor } from "../state/store";
import { Button, Notice } from "./ui";
import { loadImageFile } from "../lib/image/decode";
import { localDateTime } from "../lib/image/instrument";
import { readTables, isImageName, isCsvName, isSpreadsheetName } from "../lib/parse/tabular";
import { edsPreview, looksLikeSingleParticleEds, nextParticleId, type PairInput } from "../lib/register";
import { DEFAULT_SEGMENT, measureImage, type SegmentParams, type ShapeMeasurement } from "../lib/image/measure";
import { MORPHOLOGY_CLASSES, morphologyLabel } from "../lib/morphology";
import type { ImageAsset, MorphologyClass } from "../lib/types";
import type { Table } from "../lib/parse/common";

interface CsvItem {
  id: string;
  name: string;
  table: Table | null;
  error: string | null;
  preview: Array<{ symbol: string; wt: string; at: string }>;
}

interface Row {
  id: string;
  imageName: string | null;
  image: ImageAsset | null;
  imageError: string | null;
  loading: boolean;
  csvId: string | null;
  sample_id: string;
  particle_id: string;
  location: string;
  date: string;
  sample_type: string;
  morphology: MorphologyClass | "";
  notes: string;
  pixelSize: string;
  params: SegmentParams;
  measure: ShapeMeasurement | null;
  measuring: boolean;
  measureError: string | null;
  contourOk: boolean;
}

const LS_DEFAULTS = "semeds.registerDefaults.v1";
function readDefaults(): { sample_id: string; location: string; sample_type: string } {
  try {
    return { sample_id: "", location: "", sample_type: "측정", ...JSON.parse(localStorage.getItem(LS_DEFAULTS) ?? "{}") };
  } catch {
    return { sample_id: "", location: "", sample_type: "측정" };
  }
}
function writeDefaults(v: { sample_id: string; location: string; sample_type: string }) {
  try {
    localStorage.setItem(LS_DEFAULTS, JSON.stringify(v));
  } catch {
    /* 무시 */
  }
}

let seq = 0;
const uid = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;
const fmt = (v: number | null | undefined, d = 2) => (v == null ? "—" : v.toFixed(d));

export function RegisterPanel() {
  const { data, registerParticles, origin } = useStore();
  const [rows, setRows] = useState<Row[]>([]);
  const [csvs, setCsvs] = useState<CsvItem[]>([]);
  const [over, setOver] = useState(false);
  const [done, setDone] = useState<string[] | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const patch = (id: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const usedIds = (sample: string, exceptRow?: string) => {
    const s = new Set(data.meta.filter((m) => m.sample_id === sample).map((m) => m.particle_id));
    if (origin === "demo") s.clear();
    for (const r of rowsRef.current) if (r.id !== exceptRow && r.sample_id === sample) s.add(r.particle_id);
    return s;
  };

  /** fresh: 방금 patch한 값(상태 반영 전)을 넘길 때 사용 */
  const runMeasure = async (id: string, fresh?: Partial<Row>) => {
    const cur = rowsRef.current.find((x) => x.id === id);
    if (!cur) return;
    const r = { ...cur, ...fresh };
    if (!r.image) return;
    patch(id, { measuring: true, measureError: null });
    try {
      const px = parseFloat(r.pixelSize);
      const params = { ...r.params, cropBottomPx: r.params.cropBottomPx ?? r.image.instrument?.databarHeightPx ?? null };
      const m = await measureImage(r.image.url, Number.isFinite(px) && px > 0 ? px : null, params);
      patch(id, { measure: m, measuring: false, contourOk: false });
    } catch (e) {
      patch(id, { measure: null, measuring: false, measureError: (e as Error).message });
    }
  };

  const addFiles = async (files: File[]) => {
    setDone(null);
    const ordered = [...files].sort((a, b) => a.lastModified - b.lastModified || a.name.localeCompare(b.name));
    const imgs = ordered.filter((f) => isImageName(f.name));
    const tabs = ordered.filter((f) => isCsvName(f.name) || isSpreadsheetName(f.name));
    const defaults = readDefaults();

    // 이미지 → 행
    const newRows: Row[] = imgs.map((f) => ({
      id: uid(), imageName: f.name, image: null, imageError: null, loading: true, csvId: null,
      sample_id: defaults.sample_id, particle_id: "", location: defaults.location, date: "", sample_type: defaults.sample_type,
      morphology: "", notes: "", pixelSize: "", params: { ...DEFAULT_SEGMENT }, measure: null, measuring: false, measureError: null, contourOk: false,
    }));
    // CSV → 목록
    const newCsvs: CsvItem[] = [];
    for (const f of tabs) {
      try {
        const { tables } = readTables(new Uint8Array(await f.arrayBuffer()), f.name);
        const t = tables.find(looksLikeSingleParticleEds) ?? null;
        newCsvs.push({ id: uid(), name: f.name, table: t, error: t ? null : "원소·wt%/at% 열을 찾지 못했습니다(EDS 정량 파일이 아닌 것 같습니다).", preview: t ? edsPreview(t) : [] });
      } catch (e) {
        newCsvs.push({ id: uid(), name: f.name, table: null, error: (e as Error).message, preview: [] });
      }
    }
    const others = ordered.filter((f) => !imgs.includes(f) && !tabs.includes(f));
    if (others.length) alert(`지원하지 않는 파일: ${others.map((f) => f.name).join(", ")}\n이미지(TIFF·JPG·PNG)와 EDS CSV·XLSX만 올려 주세요.`);

    // 짝짓기: 짝 없는 행(기존+새 행) 순서대로 CSV를 붙이고, 남는 CSV는 이미지 없는 행으로
    setCsvs((c) => [...c, ...newCsvs]);
    setRows((rs) => {
      const all = [...rs, ...newRows].map((r) => ({ ...r }));
      const queue = newCsvs.filter((c) => c.table);
      for (const r of all) if (!r.csvId && queue.length) r.csvId = queue.shift()!.id;
      for (const c of queue) {
        all.push({
          id: uid(), imageName: null, image: null, imageError: null, loading: false, csvId: c.id,
          sample_id: defaults.sample_id, particle_id: "", location: defaults.location, date: "", sample_type: defaults.sample_type,
          morphology: "", notes: "", pixelSize: "", params: { ...DEFAULT_SEGMENT }, measure: null, measuring: false, measureError: null, contourOk: false,
        });
      }
      return all;
    });

    // 이미지 읽기(장비 메타데이터 포함) → 기본값 채우기 → 측정
    for (const [i, f] of imgs.entries()) {
      const id = newRows[i].id;
      try {
        const img = await loadImageFile(f, "user");
        const inst = img.instrument;
        const local = localDateTime(inst?.acquiredAtUtc ?? null);
        const cur = rowsRef.current.find((r) => r.id === id)!;
        const sample = cur.sample_id || inst?.label || "";
        const fresh: Partial<Row> = {
          image: img, loading: false,
          sample_id: sample,
          particle_id: cur.particle_id || nextParticleId(usedIds(sample, id)),
          date: cur.date || local?.date || "",
          pixelSize: inst?.pixelWidthUm != null ? String(inst.pixelWidthUm) : cur.pixelSize,
        };
        patch(id, fresh);
        await runMeasure(id, fresh);
      } catch (e) {
        patch(id, { loading: false, imageError: (e as Error).message });
      }
    }
    // 이미지 없는 CSV 행에도 ID 제안
    setRows((rs) => rs.map((r) => (r.particle_id || r.imageName ? r : { ...r, particle_id: nextParticleId(usedIds(r.sample_id, r.id)) })));
  };

  const keysInData = useMemo(() => new Set(origin === "user" ? data.meta.map((m) => `${m.sample_id}::${m.particle_id}`) : []), [data.meta, origin]);
  const check = (r: Row) => {
    const errors: string[] = [], warns: string[] = [];
    if (!r.sample_id.trim()) errors.push("시료 ID 필요");
    if (!r.particle_id.trim()) errors.push("입자 ID 필요");
    const key = `${r.sample_id.trim()}::${r.particle_id.trim()}`;
    if (rows.filter((x) => `${x.sample_id.trim()}::${x.particle_id.trim()}` === key).length > 1) errors.push("등록 목록 안에서 ID 중복");
    if (r.loading) errors.push("이미지 읽는 중");
    if (r.imageError) errors.push(r.imageError);
    const csv = csvs.find((c) => c.id === r.csvId);
    if (!r.image && !csv?.table) errors.push("이미지나 EDS 중 하나는 있어야 함");
    if (keysInData.has(key)) warns.push("이미 등록된 입자 — 등록하면 새 값으로 바뀜");
    if (!csv?.table) warns.push("EDS 없음 — 조성 분석 제외");
    if (!r.image) warns.push("이미지 없음");
    if (r.image && !(parseFloat(r.pixelSize) > 0)) warns.push("픽셀 크기 없음 — µm 크기 계산 안 함");
    if (r.measure && !r.contourOk) warns.push("윤곽 미확인 — 크기·형상 지표를 저장하지 않음");
    if (r.measure?.touchesBorder) warns.push("측정 영역이 이미지 가장자리에 닿음");
    return { errors, warns };
  };

  const submit = () => {
    const ready = rows.filter((r) => check(r).errors.length === 0);
    if (!ready.length) return;
    if (origin === "demo" && !confirm("DEMO 데이터를 비우고 등록한 실제 입자로 바꿉니다. 계속할까요?")) return;
    const inputs: PairInput[] = ready.map((r) => {
      const csv = csvs.find((c) => c.id === r.csvId);
      const px = parseFloat(r.pixelSize);
      const m = r.measure && r.contourOk ? r.measure : null;
      return {
        sample_id: r.sample_id.trim(), particle_id: r.particle_id.trim(),
        location: r.location.trim() || null, date: r.date || null, sample_type: r.sample_type.trim() || null,
        morphology: r.morphology || null, morphologyMethod: r.morphology ? "사용자 판정(등록 화면, SEM 이미지 확인)" : null,
        notes: r.notes.trim() || null,
        image: r.image, pixelSizeUm: Number.isFinite(px) && px > 0 ? px : null,
        edsName: csv?.name ?? null, edsTable: csv?.table ?? null,
        measurement: m ? { eqdUm: m.eqdUm, areaUm2: m.areaUm2, feretUm: m.feretUm, circularity: m.props.circ, solidity: m.props.sol, aspectRatio: m.props.ar, methodLabel: m.methodLabel } : null,
      };
    });
    const keys = registerParticles(inputs);
    const last = ready[ready.length - 1];
    writeDefaults({ sample_id: last.sample_id.trim(), location: last.location.trim(), sample_type: last.sample_type.trim() });
    const usedCsv = new Set(ready.map((r) => r.csvId));
    setRows((rs) => rs.filter((r) => !ready.includes(r)));
    setCsvs((cs) => cs.filter((c) => !usedCsv.has(c.id)));
    setDone(keys);
  };

  // 이미 측정된 행: 픽셀 크기를 바꾸면 µm 값만 다시 계산
  useEffect(() => {
    setRows((rs) => rs.map((r) => {
      if (!r.measure) return r;
      const px = parseFloat(r.pixelSize);
      const um = Number.isFinite(px) && px > 0 ? px : null;
      const m = r.measure;
      const eqdUm = um != null ? m.eqdPx * um : null;
      if (eqdUm === m.eqdUm) return r;
      return { ...r, measure: { ...m, eqdUm, areaUm2: um != null ? m.areaPx * um * um : null, feretUm: um != null ? m.feretPx * um : null } };
    }));
  }, [rows.map((r) => r.pixelSize).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const readyCount = rows.filter((r) => check(r).errors.length === 0).length;

  return (
    <div className="bg-surface border-2 border-accent/40 rounded-lg p-4 mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-[16px] font-semibold">입자 등록 — SEM 이미지 1장 + EDS 정량 CSV 1개 = 입자 1개</h2>
          <p className="text-[12.5px] text-ink-2 mt-0.5 max-w-3xl">
            입자 하나를 찍은 SEM 이미지(TIFF·JPG·PNG)와 그 입자의 EDS 정량 파일(Phenom 등 장비가 내보낸 CSV·XLSX)을 함께 올리세요. 여러 입자를 한꺼번에 올려도 됩니다.
            Phenom TIFF는 픽셀 크기·배율·촬영 시각·가속전압을 파일에서 자동으로 읽습니다.
          </p>
        </div>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); addFiles([...e.dataTransfer.files]); }}
        className={`border-2 border-dashed rounded-lg px-5 py-5 text-center ${over ? "border-accent bg-accent-soft" : "border-line-2 bg-surface-2"}`}
      >
        <div className="text-[13.5px] font-medium">이미지와 EDS 파일을 여기로 끌어 놓기</div>
        <div className="text-[12px] text-ink-3 mt-0.5">이미지와 CSV는 파일 수정 시각 순서대로 짝을 짓습니다 — 아래 표에서 확인하고 필요하면 바꾸세요.</div>
        <div className="mt-2.5"><Button variant="primary" onClick={() => input.current?.click()}>파일 선택</Button></div>
        <input ref={input} type="file" multiple accept=".tif,.tiff,.jpg,.jpeg,.png,.bmp,.csv,.tsv,.txt,.xlsx,.xls" className="hidden" onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
      </div>

      {done && (
        <div className="mt-3">
          <Notice kind="info">
            입자 {done.length}개를 등록했습니다: {done.map((k, i) => (<span key={k}>{i > 0 && ", "}<a className="text-accent underline" href={hrefFor({ page: "particles", particleKey: k })}>{k.replace("::", " / ")}</a></span>))}. 등록한 데이터는 이 브라우저에 자동 저장됩니다.
          </Notice>
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-4 space-y-3">
          {rows.map((r, idx) => {
            const csv = csvs.find((c) => c.id === r.csvId);
            const { errors, warns } = check(r);
            const inst = r.image?.instrument;
            const contour = r.measure ? r.measure.props.contour.map(([x, y]) => `${x / r.measure!.scale},${y / r.measure!.scale}`).join(" ") : "";
            return (
              <div key={r.id} className={`border rounded-lg p-3 ${errors.length ? "border-[#efc4c4]" : "border-line"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[13px] font-semibold">입자 {idx + 1}</div>
                  <button className="text-[12px] text-ink-3 hover:text-[#a42f2f]" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>목록에서 빼기</button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_minmax(0,1fr)] gap-4">
                  {/* 이미지와 윤곽 */}
                  <div>
                    <div className="relative bg-[#1b1f1e] rounded border border-line overflow-hidden aspect-[4/3]">
                      {r.image ? (
                        <>
                          <img src={r.image.url} alt={r.image.filename} className="absolute inset-0 w-full h-full object-contain" />
                          {r.measure && r.image.width && r.image.height && (
                            <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${r.image.width} ${r.image.height}`} preserveAspectRatio="xMidYMid meet">
                              <polygon points={contour} fill="rgba(42,120,214,0.15)" stroke="#5fb0ff" strokeWidth={Math.max(2, r.image.width / 300)} />
                            </svg>
                          )}
                        </>
                      ) : (
                        <div className="absolute inset-0 grid place-items-center text-[12px] text-white/60 px-3 text-center">{r.loading ? "이미지 읽는 중…" : r.imageError ?? "이미지 없음"}</div>
                      )}
                    </div>
                    <div className="text-[11.5px] text-ink-3 mt-1 font-mono break-all">{r.imageName ?? "—"}</div>
                    {inst && (
                      <div className="text-[11.5px] text-ink-2 mt-1 leading-relaxed">
                        {inst.instrument} · ×{inst.magnification?.toLocaleString()} · FW {fmt(inst.fieldWidthUm, 1)} µm · {inst.highVoltageKv} kV · {inst.detector} · WD {fmt(inst.workingDistanceMm)} mm
                        {inst.acquiredAtUtc && <> · 촬영 {localDateTime(inst.acquiredAtUtc)?.date} {localDateTime(inst.acquiredAtUtc)?.time}</>}
                      </div>
                    )}
                    {r.image && !inst && <div className="text-[11.5px] text-ink-3 mt-1">장비 메타데이터 없음 — 픽셀 크기를 직접 입력하세요.</div>}
                  </div>

                  {/* 정보 입력 */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[12.5px] content-start">
                    <Field label="시료 ID *"><input className="inp" value={r.sample_id} onChange={(e) => patch(r.id, { sample_id: e.target.value })} placeholder="예: 261008_Local" /></Field>
                    <Field label="입자 ID *"><input className="inp" value={r.particle_id} onChange={(e) => patch(r.id, { particle_id: e.target.value })} /></Field>
                    <Field label="채취 지점"><input className="inp" value={r.location} onChange={(e) => patch(r.id, { location: e.target.value })} placeholder="예: 천안아산역 승강장" /></Field>
                    <Field label="채취일"><input className="inp" type="date" value={r.date} onChange={(e) => patch(r.id, { date: e.target.value })} /></Field>
                    <Field label="시료 유형"><input className="inp" value={r.sample_type} onChange={(e) => patch(r.id, { sample_type: e.target.value })} placeholder="측정 / 배경(외기)" /></Field>
                    <Field label="픽셀 크기 (µm/px)"><input className="inp" value={r.pixelSize} onChange={(e) => patch(r.id, { pixelSize: e.target.value })} placeholder="장비 메타데이터 없으면 입력" /></Field>
                    <Field label="형상 판정(이미지를 보고 선택)" wide>
                      <div className="flex gap-2 items-center">
                        <select className="inp" value={r.morphology} onChange={(e) => patch(r.id, { morphology: e.target.value as MorphologyClass | "" })}>
                          <option value="">미분류(나중에 판정)</option>
                          {MORPHOLOGY_CLASSES.map((c) => <option key={c} value={c}>{morphologyLabel(c)}</option>)}
                        </select>
                        {r.measure?.candidate && r.morphology !== r.measure.candidate && (
                          <button className="text-[12px] text-accent whitespace-nowrap hover:underline" onClick={() => patch(r.id, { morphology: r.measure!.candidate! })}>후보 「{morphologyLabel(r.measure.candidate)}」 적용</button>
                        )}
                      </div>
                    </Field>
                    <Field label="메모" wide><input className="inp" value={r.notes} onChange={(e) => patch(r.id, { notes: e.target.value })} /></Field>
                  </div>

                  {/* EDS와 측정 */}
                  <div className="text-[12.5px] space-y-2">
                    <Field label="EDS 정량 파일">
                      <select className="inp" value={r.csvId ?? ""} onChange={(e) => patch(r.id, { csvId: e.target.value || null })}>
                        <option value="">(없음)</option>
                        {csvs.map((c) => <option key={c.id} value={c.id} disabled={!c.table}>{c.name}{!c.table ? " — 읽기 실패" : rows.some((x) => x.id !== r.id && x.csvId === c.id) ? " — 다른 입자에 지정됨" : ""}</option>)}
                      </select>
                    </Field>
                    {csv?.table && (
                      <table className="data text-[12px]">
                        <thead><tr><th>원소</th><th className="num">wt (원본)</th><th className="num">at (원본)</th></tr></thead>
                        <tbody>{csv.preview.map((p) => <tr key={p.symbol}><td>{p.symbol}</td><td className="num">{p.wt}</td><td className="num">{p.at}</td></tr>)}</tbody>
                      </table>
                    )}
                    {csv?.error && <div className="text-[#a42f2f]">{csv.error}</div>}
                    <div className="border border-line rounded p-2">
                      <div className="flex items-center justify-between">
                        <b>형상 지표(이미지 측정)</b>
                        {r.image && <button className="text-[12px] text-accent hover:underline" onClick={() => runMeasure(r.id)}>{r.measuring ? "측정 중…" : "다시 측정"}</button>}
                      </div>
                      {r.measureError && <div className="text-[#a42f2f] mt-1">{r.measureError}</div>}
                      {r.measure && (
                        <>
                          <div className="grid grid-cols-2 gap-x-3 mt-1 tnum">
                            <span>등가원 지름 {r.measure.eqdUm != null ? `${fmt(r.measure.eqdUm)} µm` : `${fmt(r.measure.eqdPx, 0)} px`}</span>
                            <span>최대 Feret {r.measure.feretUm != null ? `${fmt(r.measure.feretUm)} µm` : `${fmt(r.measure.feretPx, 0)} px`}</span>
                            <span>원형도 {fmt(r.measure.props.circ)}</span>
                            <span>고형도 {fmt(r.measure.props.sol)}</span>
                            <span>종횡비 {fmt(r.measure.props.ar)}</span>
                            <span>후보 {r.measure.candidate ? morphologyLabel(r.measure.candidate) : "없음"}</span>
                          </div>
                          <label className="flex items-center gap-1.5 mt-1.5 text-[12px]">
                            임계 계수 <input type="range" min={0.4} max={1.2} step={0.05} value={r.params.thresholdFactor} onChange={(e) => patch(r.id, { params: { ...r.params, thresholdFactor: Number(e.target.value) } })} onPointerUp={() => setTimeout(() => runMeasure(r.id), 50)} onKeyUp={() => setTimeout(() => runMeasure(r.id), 50)} /> <span className="tnum w-8">{r.params.thresholdFactor.toFixed(2)}</span>
                            <label className="flex items-center gap-1 ml-2"><input type="checkbox" checked={!r.params.bright} onChange={(e) => { patch(r.id, { params: { ...r.params, bright: !e.target.checked } }); setTimeout(() => runMeasure(r.id), 50); }} />어두운 입자</label>
                          </label>
                          <label className="flex items-start gap-1.5 mt-1.5 font-medium">
                            <input type="checkbox" className="mt-0.5" checked={r.contourOk} onChange={(e) => patch(r.id, { contourOk: e.target.checked })} />
                            파란 윤곽이 입자 외곽과 맞음 → 크기·형상 지표를 저장
                          </label>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {(errors.length > 0 || warns.length > 0) && (
                  <div className="mt-2 text-[12px] flex flex-wrap gap-x-4 gap-y-0.5">
                    {errors.map((e) => <span key={e} className="text-[#a42f2f]">✕ {e}</span>)}
                    {warns.map((w) => <span key={w} className="text-[#6b4b00]">⚠ {w}</span>)}
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" disabled={!readyCount} onClick={submit}>입자 {readyCount}개 등록</Button>
            <Button variant="ghost" onClick={() => { setRows([]); setCsvs([]); }}>목록 비우기</Button>
            {readyCount < rows.length && <span className="text-[12.5px] text-ink-2">오류(✕)가 있는 {rows.length - readyCount}개는 등록되지 않습니다.</span>}
          </div>
        </div>
      )}
      <style>{`.inp{width:100%;border:1px solid var(--color-line-2);border-radius:5px;padding:4px 7px;font-size:12.5px;background:#fff}`}</style>
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "col-span-2" : ""}`}>
      <span className="block text-[11.5px] text-ink-2 mb-0.5">{label}</span>
      {children}
    </label>
  );
}
