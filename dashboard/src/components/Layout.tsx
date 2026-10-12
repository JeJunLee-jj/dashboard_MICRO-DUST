import { useEffect, useState, type ReactNode } from "react";
import { hrefFor, useStore, type Route } from "../state/store";
import { DemoTag } from "./ui";

const NAV: Array<{ page: Route["page"]; label: string; n: number }> = [
  { page: "overview", label: "종합 대시보드", n: 1 },
  { page: "particles", label: "SEM 이미지·입자 탐색", n: 2 },
  { page: "eds", label: "EDS 원소 조성 분석", n: 3 },
  { page: "integration", label: "형태–성분 통합 분석", n: 4 },
  { page: "hazard", label: "위해성 관련 원소 분포", n: 5 },
  { page: "samples", label: "시료·채취 지점 비교", n: 6 },
  { page: "data", label: "데이터 업로드·품질 검증", n: 7 },
  { page: "settings", label: "분석 설정·결과 내보내기", n: 8 },
];

/** 웹 배포판(GitHub Pages)에 함께 올라간 오프라인판이 있으면 내려받기 링크를 보여준다 */
function useOfflineLink(): string | null {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    if (import.meta.env.VITE_OFFLINE || location.protocol === "file:") return;
    const url = `${import.meta.env.BASE_URL}offline.html`;
    fetch(url, { method: "HEAD" })
      .then((r) => r.ok && (r.headers.get("content-type") ?? "").includes("html") && Number(r.headers.get("content-length") ?? "100000") > 50000 && setHref(url))
      .catch(() => undefined);
  }, []);
  return href;
}

export function Layout({ children }: { children: ReactNode }) {
  const offlineHref = useOfflineLink();
  const { route, origin, particles, busy, loadDemo, navigate, data } = useStore();
  return (
    <div className="min-h-full flex">
      <aside className="w-[232px] shrink-0 bg-[#10302c] text-[#d9ebe7] flex flex-col sticky top-0 h-screen no-print max-lg:hidden">
        <div className="px-4 pt-4 pb-3 border-b border-white/10">
          <div className="text-[11px] tracking-wider text-[#8fbab2] font-semibold">SEM-EDS PARTICLE</div>
          <div className="text-[15px] font-semibold leading-snug mt-0.5 text-white">미세먼지 입자 분석 대시보드</div>
        </div>
        <nav className="flex-1 overflow-auto py-2">
          {NAV.map((n) => {
            const active = route.page === n.page;
            return (
              <a key={n.page} href={hrefFor({ page: n.page })} className={`flex items-center gap-2.5 px-4 py-2 text-[13px] ${active ? "bg-white/10 text-white font-semibold border-l-[3px] border-[#5fd0bd] pl-[13px]" : "hover:bg-white/5"}`} aria-current={active ? "page" : undefined}>
                <span className="tnum text-[11px] w-4 text-[#8fbab2]">{n.n}</span>
                {n.label}
              </a>
            );
          })}
        </nav>
        <div className="px-4 py-3 text-[11.5px] text-[#9cc1ba] border-t border-white/10 leading-relaxed">
          {import.meta.env.VITE_OFFLINE && <div className="font-semibold text-[#cfe6e1] mb-1">오프라인판(HTML 파일 하나)</div>}
          {offlineHref && <a href={offlineHref} download="SEM-EDS 대시보드 (오프라인).html" className="block font-semibold text-white underline mb-1.5">오프라인판 내려받기(공유 데이터 포함)</a>}
          모든 처리는 이 브라우저 안에서만 이루어지며 파일은 외부로 전송되지 않습니다.
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 bg-surface/95 backdrop-blur border-b border-line no-print">
          <div className="flex items-center gap-3 px-6 py-2.5">
            <select className="lg:hidden border border-line-2 rounded px-2 py-1 text-[13px]" value={route.page} onChange={(e) => navigate({ page: e.target.value as Route["page"] })} aria-label="페이지">
              {NAV.map((n) => <option key={n.page} value={n.page}>{n.n}. {n.label}</option>)}
            </select>
            <span className="text-[12.5px] text-ink-2">데이터</span>
            {origin === "demo" && <DemoTag />}
            {origin === "user" && !data.shared && <span className="text-[12px] font-semibold text-accent border border-[#9fcfc6] bg-accent-soft rounded px-2 py-0.5">사용자 업로드 데이터</span>}
            {origin === "user" && data.shared && <span className="text-[12px] font-semibold text-accent border border-[#9fcfc6] bg-accent-soft rounded px-2 py-0.5" title={data.shared.note ?? ""}>팀 공유 데이터셋 · {new Date(data.shared.savedAt).toLocaleDateString("ko-KR")} 기준</span>}
            {!origin && <span className="text-[12px] text-ink-3 border border-line rounded px-2 py-0.5">없음</span>}
            <span className="text-[12.5px] text-ink-3 tnum">{particles.length ? `입자 ${particles.length}개` : ""}</span>
            {busy && <span className="text-[12.5px] text-accent animate-pulse">{busy}</span>}
            <div className="ml-auto flex items-center gap-2">
              {!origin && (
                <button onClick={loadDemo} className="text-[12.5px] border border-line-2 rounded px-2.5 py-1 hover:bg-surface-2">DEMO 데이터 보기</button>
              )}
              <a href={hrefFor({ page: "data" })} className="text-[12.5px] font-medium bg-accent text-white rounded px-2.5 py-1 hover:bg-accent-2">데이터 업로드</a>
            </div>
          </div>
          {origin === "demo" && (
            <div className="demo-stripes border-t border-[#e9c46a] px-6 py-1.5 text-[12.5px] text-[#5c3d00]" role="status">
              <b>DEMO 모드</b> — 화면에 보이는 입자·조성·이미지는 모두 <b>가상의 예시 데이터</b>입니다. 실제 측정 결과가 아니며 어떤 실제 시료(천안아산역·아산역·강남역 등)의 분석 결과로도 사용할 수 없습니다.
            </div>
          )}
        </header>
        <main className="flex-1 px-6 py-5 max-w-[1500px] w-full">{children}</main>
      </div>
    </div>
  );
}
