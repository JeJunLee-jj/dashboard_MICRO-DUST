/* Phenom 원본 폴더 그대로 올리기 — 지점 폴더별로 SEM 입자 사진과 EDS 스폿 정량표를 번호로 짝지어 등록한다. */
import { useRef, useState } from "react";
import { useStore, hrefFor } from "../state/store";
import { Button, Notice } from "./ui";
import { loadImageFile } from "../lib/image/decode";
import { localDateTime } from "../lib/image/instrument";
import { averageSpots, bundledShape, scanPhenomFolder, type PhenomFile, type PhenomScan } from "../lib/phenomImport";
import type { PairInput } from "../lib/register";

async function pickedFromDrop(dt: DataTransfer): Promise<PhenomFile[]> {
  const entries = [...dt.items].map((i) => (i.kind === "file" ? i.webkitGetAsEntry?.() ?? null : null));
  if (!entries.some(Boolean)) return [...dt.files].map((f) => ({ file: f, path: f.name }));
  const out: PhenomFile[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const f = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ file: f, path: prefix + f.name });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const e of batch) await walk(e, `${prefix}${entry.name}/`);
      }
    }
  };
  for (const e of entries) if (e) await walk(e, "");
  return out;
}

export function PhenomImportPanel() {
  const { registerParticles, particles, origin } = useStore();
  const [scan, setScan] = useState<PhenomScan | null>(null);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const folder = useRef<HTMLInputElement>(null);

  const onFiles = (files: PhenomFile[]) => {
    setDone(null); setError(null);
    const s = scanPhenomFolder(files);
    if (!s.particles.length) setError("EDS 스폿 정량표(…_analysis_N_spot/quantification.csv)를 찾지 못했습니다. Phenom 원본 폴더(지점 폴더가 들어 있는 상위 폴더)를 통째로 올려 주세요.");
    setScan(s);
  };

  const run = async (replace: boolean) => {
    if (!scan) return;
    if (replace && particles.length && origin === "user" && !confirm(`지금 데이터(입자 ${particles.length}개)를 이 폴더의 입자 ${scan.particles.length}개로 바꿉니다. 계속할까요?`)) return;
    setProgress({ done: 0, total: scan.particles.length });
    const inputs: PairInput[] = [];
    try {
      for (const [i, p] of scan.particles.entries()) {
        const eds = await averageSpots(p.spots, `${p.name} 스폿 ${p.spots.length}곳 평균`);
        const image = p.photo ? await loadImageFile(p.photo.file, "user") : null;
        const inst = image?.instrument ?? null;
        const local = localDateTime(inst?.acquiredAtUtc ?? null);
        const shp = bundledShape(p.siteFolder, p.name);
        inputs.push({
          sample_id: p.siteFolder, particle_id: p.name, location: p.site.label, date: local?.date ?? null, sample_type: "측정",
          morphology: null, morphologyMethod: null,
          notes: p.photo ? null : "같은 번호의 SEM 사진이 없음",
          image, pixelSizeUm: inst?.pixelWidthUm ?? null,
          edsName: `${p.name} (스폿 ${p.spots.length}곳 평균)`, edsTable: eds.table, spotWt: eds.spotWt,
          measurement: shp ? {
            eqdUm: shp.eqd, areaUm2: shp.area, feretUm: shp.feret, circularity: null, solidity: shp.sol, aspectRatio: shp.ar,
            methodLabel: "EDS 스폿 위치를 씨앗으로 한 자동 분할(섬유 필터 배경) — 윤곽 미확인, 검토 필요",
          } : null,
        });
        setProgress({ done: i + 1, total: scan.particles.length });
      }
      registerParticles(inputs, { replace });
      setDone(`입자 ${inputs.length}개를 ${replace ? "새 데이터로" : "기존 데이터에 추가해"} 등록했습니다.`);
      setScan(null);
    } catch (e) {
      setError(`등록 중 오류: ${(e as Error).message}`);
    } finally {
      setProgress(null);
    }
  };

  const bySite = scan ? [...new Set(scan.particles.map((p) => p.siteFolder))].map((f) => {
    const ps = scan.particles.filter((p) => p.siteFolder === f);
    return { folder: f, label: ps[0].site.label, ps };
  }) : [];

  return (
    <div className="bg-surface border-2 border-accent/40 rounded-[3px] p-4 mb-4">
      <h2 className="text-[16px] font-semibold">Phenom 원본 폴더 그대로 올리기</h2>
      <p className="text-[13.5px] text-ink-2 mt-0.5 max-w-3xl leading-relaxed">
        지점 폴더(예: <code>261021_D</code>, <code>261022_B-28</code>)가 들어 있는 상위 폴더를 통째로 올리면, 지점마다 <b>SEM 폴더의 입자 사진</b>과
        <b> EDS 스폿 정량표(quantification.csv)</b>를 같은 번호끼리(예: SEM Local 7 ↔ EDS Local 7·Image 7) 짝지어 입자로 등록합니다.
        원소 구성비는 스폿 3곳의 평균이며, 스펙트럼 그래프·원소 맵 이미지·EDS 화면 캡처는 입자 사진으로 쓰지 않습니다.
      </p>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pickedFromDrop(e.dataTransfer).then(onFiles); }}
        className={`mt-3 border-2 border-dashed rounded-[3px] px-5 py-5 text-center ${over ? "border-accent bg-accent-soft" : "border-line-2 bg-surface-2"}`}
      >
        <div className="text-[14.5px] font-medium">원본 폴더를 여기로 끌어 놓기</div>
        <div className="mt-2.5"><Button variant="primary" onClick={() => folder.current?.click()}>폴더 선택</Button></div>
        <input ref={folder} type="file" multiple className="hidden" {...{ webkitdirectory: "", directory: "" }}
          onChange={(e) => { onFiles([...(e.target.files ?? [])].map((f) => ({ file: f, path: f.webkitRelativePath || f.name }))); e.target.value = ""; }} />
      </div>

      {error && <div className="mt-3"><Notice kind="warning">{error}</Notice></div>}
      {done && <div className="mt-3"><Notice kind="info">{done} <a className="text-accent underline" href={hrefFor({ page: "simulator" })}>시뮬레이터에서 보기 →</a></Notice></div>}

      {scan && scan.particles.length > 0 && (
        <div className="mt-4">
          <table className="data text-[13.5px]">
            <thead><tr><th>지점 폴더</th><th>지점</th><th className="num">입자</th><th className="num">스폿 정량표</th><th className="num">SEM 사진 짝</th><th>입자(번호)</th></tr></thead>
            <tbody>
              {bySite.map((s) => (
                <tr key={s.folder}>
                  <td className="font-mono">{s.folder}</td>
                  <td>{s.label}</td>
                  <td className="num">{s.ps.length}</td>
                  <td className="num">{s.ps.reduce((a, p) => a + p.spots.length, 0)}</td>
                  <td className="num">{s.ps.filter((p) => p.photo).length}/{s.ps.length}</td>
                  <td className="text-[12.5px] text-ink-2">{s.ps.map((p) => `${p.name}${p.photo ? "" : "(사진 없음)"}`).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[13px] text-ink-3 mt-1.5">
            건너뛴 파일 {scan.ignored}개(스펙트럼·원소 맵·EDS 화면 등){scan.unknownSite ? ` · 지점을 알 수 없는 파일 ${scan.unknownSite}개` : ""}
            {scan.unusedPhotos.length ? ` · 짝이 없는 SEM 사진 ${scan.unusedPhotos.length}장(${scan.unusedPhotos.map((p) => p.path.split("/").pop()).join(", ")})` : ""}
          </p>
          <div className="flex flex-wrap gap-2 mt-3 items-center">
            <Button variant="primary" disabled={!!progress} onClick={() => run(true)}>이 폴더 데이터로 바꾸기</Button>
            <Button disabled={!!progress} onClick={() => run(false)}>기존 데이터에 추가</Button>
            {progress && <span className="text-[13.5px] text-ink-2 tnum">사진·정량표 읽는 중… {progress.done}/{progress.total}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
