/* 데이터 관리 — Phenom 원본 폴더 올리기, 지점별 등록 현황, 백업·공유 데이터셋. */
import { useMemo, useRef, useState } from "react";
import { useStore } from "../state/store";
import { Button, Card, LevelBadge, Notice, PageHeader } from "../components/ui";
import { PhenomImportPanel } from "../components/PhenomImportPanel";
import { GANGNAM_SITES } from "../lib/sites";
import { siteOf } from "../lib/sources";

export function DataPage() {
  const { data, particles, allIssues, busy, origin, persist, restoreSaved, exportBackup, importBackup, sharedInfo, loadShared, clearData } = useStore();
  const backupInput = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const bySite = useMemo(() => GANGNAM_SITES.map((s) => {
    const ps = particles.filter((p) => siteOf(p)?.id === s.id);
    return { s, n: ps.length, photo: ps.filter((p) => p.image).length, eds: ps.filter((p) => p.edsValid).length, ar: ps.filter((p) => p.meta?.aspect_ratio != null).length };
  }), [particles]);
  const other = particles.filter((p) => !siteOf(p)).length;
  const warnings = allIssues.filter((i) => i.level !== "info");

  return (
    <>
      <PageHeader title="데이터 관리" description="Phenom 원본 폴더를 그대로 올려 입자 사진과 EDS 정량표를 등록하고, 등록 현황과 백업을 관리합니다. 파일은 이 브라우저 밖으로 전송되지 않습니다." />

      <PhenomImportPanel />

      <Card className="mb-4" title="지점별 등록 현황">
        <table className="data text-[13.5px]">
          <thead><tr><th>지점</th><th className="num">입자</th><th className="num">SEM 사진</th><th className="num">EDS 정량</th><th className="num">형상(종횡비) 측정</th></tr></thead>
          <tbody>
            {bySite.map(({ s, n, photo, eds, ar }) => (
              <tr key={s.id}><td>{s.label}</td><td className="num">{n}</td><td className="num">{photo}</td><td className="num">{eds}</td><td className="num">{ar}</td></tr>
            ))}
            {other > 0 && <tr className="text-ink-3"><td>그 밖(공기청정기 포집 등, 참고)</td><td className="num">{other}</td><td /><td /><td /></tr>}
          </tbody>
        </table>
        <p className="text-[13px] text-ink-2 mt-2 leading-relaxed">
          종횡비가 없는 입자는 형상 조건이 들어간 판정(섬유, C-rich 구형)에서 빠집니다. 입자 상세 화면에서 종횡비를 직접 입력할 수 있습니다.
        </p>
        {warnings.length > 0 && (
          <div className="mt-3">
            <div className="text-[14px] font-semibold mb-1">확인이 필요한 항목 {warnings.length}건</div>
            <ul className="space-y-1 text-[13px] max-h-48 overflow-auto">
              {warnings.slice(0, 50).map((w, i) => (
                <li key={i} className="flex gap-2"><LevelBadge level={w.level} /><span>{w.particleKey ? <b className="font-mono mr-1">{w.particleKey.replace("::", " / ")}</b> : null}{w.message}</span></li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card className="mb-4" title="백업과 공유 데이터셋" subtitle="등록한 입자는 이 브라우저에 자동 저장됩니다. 다른 PC·팀원과 나누려면 백업 파일(.json, 사진 포함)을 쓰세요.">
        <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
          <span className="border rounded px-2 py-0.5 border-line-2 text-ink-2">
            자동 저장: {{ idle: "대기", restored: "이전 작업을 복원함", saving: "저장 중…", saved: "저장됨", error: "실패", unavailable: "사용 불가" }[persist.status]}
            {persist.savedAt && persist.status !== "saving" ? ` (${new Date(persist.savedAt).toLocaleString("ko-KR")})` : ""}
          </span>
          <Button small disabled={!particles.length || !!busy} onClick={exportBackup}>백업 파일 저장</Button>
          <Button small disabled={!!busy} onClick={() => backupInput.current?.click()}>백업 파일 불러오기</Button>
          {(origin !== "user" || data.shared) && persist.hasSaved && <Button small onClick={restoreSaved}>저장된 내 데이터 다시 열기</Button>}
          {sharedInfo && !data.shared && <Button small onClick={() => confirm("화면의 데이터를 팀 공유 데이터셋으로 바꿉니다(내 데이터는 자동 저장본에 남아 있음). 계속할까요?") && loadShared()}>팀 공유 데이터셋 보기</Button>}
          {particles.length > 0 && <Button small variant="ghost" onClick={() => confirm("화면의 데이터를 모두 비웁니다. 계속할까요?") && clearData()}>데이터 비우기</Button>}
          <input ref={backupInput} type="file" accept=".json,application/json" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try { setMsg(await importBackup(f)); } catch (err) { setMsg((err as Error).message); }
          }} />
        </div>
        {sharedInfo && (
          <p className="text-[13px] text-ink-2 mt-2">
            팀 공유 데이터셋: 입자 {sharedInfo.particles}개, 사진 {sharedInfo.images}장 ({new Date(sharedInfo.savedAt).toLocaleString("ko-KR")} 기준){data.shared ? " — 지금 보고 있는 데이터" : ""}
          </p>
        )}
        {msg && <div className="mt-2"><Notice kind="info">{msg}</Notice></div>}
      </Card>
    </>
  );
}
