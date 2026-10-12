import { useRef, useState } from "react";
import { useStore, hrefFor } from "../state/store";
import { Button, Card, LevelBadge, Notice, PageHeader, Segmented, DemoTag } from "../components/ui";
import type { IssueLevel } from "../lib/types";
import type { TableKind } from "../lib/parse/loader";
import { basisAvailability } from "../lib/dataset";
import { METADATA_COLUMNS } from "../lib/parse/metadata";
import { DEMO_FILES, TEMPLATE_FILES, withBom } from "../lib/bundledFiles";
import { downloadText } from "../lib/exports";
import { RegisterPanel } from "../components/RegisterPanel";

const KIND_LABEL: Record<string, string> = { metadata: "입자 메타데이터", eds: "EDS 성분표", image: "SEM 이미지", pair: "입자 등록(이미지+EDS)", hazard_rules: "위해성 평가 규칙", pm: "PM 측정값", unknown: "판별 실패" };

function DropZone({ title, accept, hint, onFiles, disabled }: { title: string; accept: string; hint: string; onFiles: (f: File[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) onFiles([...e.dataTransfer.files]); }}
      className={`border-2 border-dashed rounded-[3px] px-5 py-6 text-center transition ${over ? "border-accent bg-accent-soft" : "border-line-2 bg-surface"}`}
    >
      <div className="font-semibold text-[14px]">{title}</div>
      <div className="text-[13.5px] text-ink-2 mt-1">{hint}</div>
      <div className="mt-3">
        <Button variant="primary" disabled={disabled} onClick={() => input.current?.click()}>파일 선택</Button>
        <span className="text-[13px] text-ink-3 ml-2">또는 여기로 끌어 놓기</span>
      </div>
      <input ref={input} type="file" multiple accept={accept} className="hidden" onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
    </div>
  );
}

export function DataPage() {
  const { data, particles, unmatched, allIssues: issues, uploadFiles, loadDemo, clearData, busy, origin, persist, restoreSaved, exportBackup, importBackup, sharedInfo, loadShared } = useStore();
  const backupInput = useRef<HTMLInputElement>(null);
  const [forced, setForced] = useState<TableKind | "auto">("auto");
  const [level, setLevel] = useState<IssueLevel | "all">("all");
  const [result, setResult] = useState<string | null>(null);

  const shown = issues.filter((i) => level === "all" || i.level === level);
  const basis = basisAvailability(data.eds);

  const onFiles = async (files: File[]) => {
    if (!files.length) return;
    if (origin === "demo" && !confirm("DEMO 데이터를 비우고 업로드한 실제 데이터로 바꿉니다. 계속할까요?")) return;
    const r = await uploadFiles(files, forced === "auto" ? undefined : forced);
    setResult(`${r.ok}개 파일 처리${r.failed.length ? ` · 실패 ${r.failed.length}개: ${r.failed.join(", ")}` : ""}`);
  };

  return (
    <>
      <PageHeader title="데이터 업로드 및 품질 검증" description="입자 하나를 찍은 SEM 이미지와 그 입자의 EDS 정량 파일을 한 쌍으로 등록합니다. 형식·결측·단위·검출 상태를 검사하며, 파일은 이 브라우저 밖으로 전송되지 않습니다." />

      <RegisterPanel />

      <Card className="mb-4" title="데이터 보관" subtitle="등록한 입자(이미지 포함)는 이 브라우저에 자동 저장되어 다시 열어도 남아 있습니다. 다른 PC·팀원과 나누려면 백업 파일을 쓰세요.">
        <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
          <span className={`border rounded px-2 py-0.5 ${persist.status === "error" || persist.status === "unavailable" ? "border-[#efc4c4] text-[#a42f2f]" : "border-line-2 text-ink-2"}`}>
            자동 저장: {{ idle: origin === "demo" ? "DEMO는 저장하지 않음" : "대기", restored: "이전 작업을 복원함", saving: "저장 중…", saved: "저장됨", error: "실패", unavailable: "사용 불가" }[persist.status]}
            {persist.savedAt && persist.status !== "saving" ? ` (${new Date(persist.savedAt).toLocaleString("ko-KR")})` : ""}
          </span>
          {persist.message && <span className="text-[#a42f2f]">{persist.message}</span>}
          <Button small disabled={!particles.length || !!busy} onClick={exportBackup}>백업 파일 저장(.json, 이미지 포함)</Button>
          <Button small disabled={!!busy} onClick={() => backupInput.current?.click()}>백업 파일 불러오기</Button>
          {(origin !== "user" || data.shared) && persist.hasSaved && <Button small onClick={restoreSaved}>저장된 내 데이터 다시 열기</Button>}
        </div>
        <div className="mt-2 text-[13.5px] text-ink-2">
          {sharedInfo ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              이 배포판에 들어 있는 <b className="text-ink">팀 공유 데이터셋</b>: 입자 {sharedInfo.particles}개, 이미지 {sharedInfo.images}장 ({new Date(sharedInfo.savedAt).toLocaleString("ko-KR")} 기준)
              {data.shared ? <span className="text-accent">— 지금 보고 있는 데이터</span> : <Button small onClick={() => (!particles.length || confirm("지금 화면의 데이터를 팀 공유 데이터셋으로 바꿉니다(내 데이터는 자동 저장본에 남아 있음). 계속할까요?")) && loadShared()}>공유 데이터셋 보기</Button>}
            </span>
          ) : (
            <span>이 배포판에는 팀 공유 데이터셋이 들어 있지 않습니다.</span>
          )}
          <input ref={backupInput} type="file" accept=".json,application/json" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (particles.length && !confirm("지금 화면의 데이터를 백업 파일의 데이터로 바꿉니다. 계속할까요?")) return;
            try { setResult(await importBackup(f)); } catch (err) { setResult(`불러오기 실패: ${(err as Error).message}`); }
          }} />
        </div>
      </Card>

      <details className="mb-4 bg-surface border border-line rounded-[3px]">
        <summary className="cursor-pointer px-4 py-3 text-[14px] font-semibold">여러 입자 일괄 업로드(고급) — 입자 ID 열이 있는 표·이미지 묶음</summary>
        <div className="px-4 pb-4">
          <p className="text-[13.5px] text-ink-2 mb-3">입자 메타데이터 표(sample_id, particle_id …)와 EDS 표(긴/넓은 형식)를 한꺼번에 올리는 방식입니다. 등록 화면에서 내보낸 CSV를 다시 올리거나, 다른 장비·소프트웨어 결과를 합칠 때 씁니다.</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-3">
            <DropZone title="표 파일 (CSV · XLSX)" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xls" hint="입자 메타데이터 · EDS 성분표(긴/넓은 형식) · 위해성 평가 규칙 · PM 측정값 — 열 구성으로 종류를 자동 판별합니다. XLSX는 시트마다 판별합니다." onFiles={onFiles} disabled={!!busy} />
            <DropZone title="SEM 이미지 (JPG · PNG · TIFF)" accept=".jpg,.jpeg,.png,.tif,.tiff,.bmp" hint="메타데이터의 image_filename과 같은 이름이면 연결됩니다(대소문자 무시). 파일명이 입자 ID(또는 시료ID_입자ID)와 같아도 연결됩니다." onFiles={onFiles} disabled={!!busy} />
          </div>
          <label className="text-[13.5px] text-ink-2 flex items-center gap-1.5">
            표 종류
            <select className="border border-line-2 rounded px-1.5 py-1 text-[13.5px]" value={forced} onChange={(e) => setForced(e.target.value as TableKind | "auto")}>
              <option value="auto">자동 판별</option>
              <option value="metadata">입자 메타데이터로 읽기</option>
              <option value="eds">EDS 성분표로 읽기</option>
              <option value="hazard_rules">위해성 평가 규칙으로 읽기</option>
              <option value="pm">PM 측정값으로 읽기</option>
            </select>
          </label>
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Button onClick={loadDemo} disabled={!!busy}>DEMO(가상) 데이터 보기</Button>
        <Button variant="danger" disabled={!particles.length && !data.files.length} onClick={() => confirm(origin === "user" ? "등록한 데이터를 모두 지웁니다(이 브라우저의 자동 저장본 포함, 설정·규칙은 유지). 먼저 백업 파일을 저장해 두는 것을 권합니다. 계속할까요?" : "불러온 데이터를 비웁니다. 계속할까요?") && clearData()}>데이터 비우기</Button>
        {busy && <span className="text-[13.5px] text-accent">{busy}</span>}
        {result && <span className="text-[13.5px] text-ink-2">{result}</span>}
      </div>

      <Card className="mb-4" title="입력 템플릿" subtitle="'#' 줄은 설명이며 불러올 때 무시됩니다. 측정값이 없는 칸은 비워 두세요.">
        <div className="flex flex-wrap gap-2 text-[14px]">
          {TEMPLATE_FILES.map((t) => (
            <button key={t.name} className="border border-line-2 rounded px-2.5 py-1 hover:bg-surface-2 text-accent" onClick={() => downloadText(t.name, withBom(t.text))}>{t.label} ↓</button>
          ))}
          {DEMO_FILES.slice(0, 2).map((d) => (
            <button key={d.name} className="border border-line-2 rounded px-2.5 py-1 hover:bg-surface-2 text-ink-2" onClick={() => downloadText(d.name, withBom(d.text))}>{d.name.includes("eds") ? "DEMO EDS 예시" : "DEMO 메타데이터 예시"} ↓</button>
          ))}
        </div>
        <details className="mt-3 text-[13.5px] text-ink-2">
          <summary className="cursor-pointer font-medium text-ink">열 정의 요약</summary>
          <div className="grid lg:grid-cols-2 gap-3 mt-2">
            <div><b>입자 메타데이터</b>: {METADATA_COLUMNS.join(", ")}. 필수: sample_id, particle_id. scale_bar_px(스케일 바 픽셀 길이)가 있어야 µm 보정이 됩니다.</div>
            <div><b>EDS(긴 형식)</b>: sample_id, particle_id, element_symbol, element_name, wt_percent, at_percent, detection_status(detected/below_loq/below_lod/not_detected), detection_limit, quantification_limit(wt% 가정), measurement_method, normalized(Y/N).</div>
            <div><b>EDS(넓은 형식)</b>: 원소 열 이름에 기준 표시 — Fe_wt, Fe_at, "Fe wt%". 표시가 없으면 행마다 basis 열(wt%/at%) 필요.</div>
            <div><b>위해성 평가 규칙</b>: element_symbol, assessment_category, reference_name, reference_year, reference_url, applicable_condition, classification_note.</div>
          </div>
        </details>
      </Card>

      {!data.files.length ? (
        <Notice kind="info">아직 불러온 파일이 없습니다. 파일을 올리거나 DEMO 데이터로 화면 흐름을 먼저 확인하세요.</Notice>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-5 mb-4">
            <Card title="불러온 파일" className="xl:col-span-2" subtitle={origin === "demo" ? "DEMO 데이터 — 실제 측정 결과 아님" : "사용자 업로드"}>
              <div className="overflow-auto max-h-[300px]">
                <table className="data">
                  <thead><tr><th>파일</th><th>종류</th><th className="num">행/개수</th><th>구분</th><th>비고</th></tr></thead>
                  <tbody>{data.files.map((f, i) => (
                    <tr key={i}><td className="font-mono text-[13px] break-all">{f.name}</td><td>{KIND_LABEL[f.kind]}</td><td className="num">{f.rows}</td><td>{f.origin === "demo" ? <DemoTag small /> : "실측 업로드"}</td><td className="text-[13px] text-ink-2">{f.note ?? ""}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </Card>
            <Card title="연결 요약" subtitle="입자 ID(시료 ID + 입자 ID) 기준">
              <dl className="text-[14px] grid grid-cols-[1fr_auto] gap-y-1">
                <dt>입자(메타데이터 ∪ EDS)</dt><dd className="tnum">{particles.length}</dd>
                <dt>메타데이터 입자</dt><dd className="tnum">{data.meta.length}</dd>
                <dt>EDS 입자</dt><dd className="tnum">{new Set(data.eds.map((r) => `${r.sample_id}::${r.particle_id}`)).size}</dd>
                <dt>EDS 행 · wt만/at만/둘 다/값 없음</dt><dd className="tnum">{data.eds.length} · {basis.wt}/{basis.at}/{basis.both}/{basis.none}</dd>
                <dt>이미지</dt><dd className="tnum">{data.images.length}</dd>
                <dt>이미지 연결된 입자</dt><dd className="tnum">{particles.filter((p) => p.image).length}</dd>
                <dt>유효 EDS 분석 입자</dt><dd className="tnum">{particles.filter((p) => p.edsValid).length}</dd>
              </dl>
            </Card>
          </div>

          <Card className="mb-4" title="미매칭 목록" subtitle="연결되지 않은 항목은 분석에서 일부 정보가 빠집니다">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-[13.5px]">
              <Unmatch title="EDS는 있으나 메타데이터 없음" items={unmatched.edsWithoutMeta} link />
              <Unmatch title="메타데이터는 있으나 EDS 없음" items={unmatched.metaWithoutEds} link />
              <Unmatch title="입자와 연결되지 않은 이미지" items={unmatched.imagesWithoutParticle} />
              <Unmatch title="업로드되지 않은 이미지 파일(메타데이터 기재)" items={unmatched.missingImageFiles.map((m) => `${m.key.replace("::", " / ")} → ${m.filename}`)} />
            </div>
          </Card>

          <Card title={`품질 검사 결과 (${issues.length}건)`} subtitle="파일 형식·필수 열·결측·중복 ID·수치 오류·단위·검출 상태·합계 검사"
            actions={<Segmented value={level} onChange={setLevel} options={[{ value: "all", label: "전체" }, { value: "error", label: `오류 ${issues.filter((i) => i.level === "error").length}` }, { value: "warning", label: `경고 ${issues.filter((i) => i.level === "warning").length}` }, { value: "info", label: `안내 ${issues.filter((i) => i.level === "info").length}` }]} />}>
            <div className="overflow-auto max-h-[420px]">
              <table className="data">
                <thead><tr><th>수준</th><th>내용</th><th>파일</th><th className="num">행</th><th>입자</th><th>코드</th></tr></thead>
                <tbody>
                  {shown.length === 0 && <tr><td colSpan={6} className="text-ink-3">해당 항목이 없습니다.</td></tr>}
                  {shown.map((i, k) => (
                    <tr key={k}>
                      <td><LevelBadge level={i.level} /></td>
                      <td className="text-[13.5px]">{i.message}</td>
                      <td className="font-mono text-[12.5px] break-all">{i.file ?? ""}</td>
                      <td className="num">{i.row ?? ""}</td>
                      <td className="text-[13px]">{i.particleKey ? <a className="text-accent hover:underline" href={hrefFor({ page: "particles", particleKey: i.particleKey })}>{i.particleKey.replace("::", " / ")}</a> : ""}</td>
                      <td className="font-mono text-[12px] text-ink-3">{i.code}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[13px] text-ink-3 mt-2">입자별 경고(합계 이탈, EDS 없음, 측정 방법 혼재 등)도 이 목록에 포함되며 입자 상세 화면에도 표시됩니다. 행 번호는 머리글을 1행으로 센 원본 파일 기준입니다('#' 설명 줄 제외).</p>
          </Card>
        </>
      )}
    </>
  );
}

function Unmatch({ title, items, link }: { title: string; items: string[]; link?: boolean }) {
  return (
    <div className="border border-line rounded-[3px] p-2.5">
      <div className="font-medium mb-1">{title} <span className="tnum text-ink-3">({items.length})</span></div>
      {items.length === 0 ? <div className="text-ink-3">없음</div> : (
        <ul className="max-h-[140px] overflow-auto space-y-0.5 font-mono text-[12.5px]">
          {items.map((x) => <li key={x}>{link ? <a className="text-accent hover:underline" href={hrefFor({ page: "particles", particleKey: x })}>{x.replace("::", " / ")}</a> : x}</li>)}
        </ul>
      )}
    </div>
  );
}
