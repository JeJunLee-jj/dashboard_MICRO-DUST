import { useEffect, useState, type ReactNode } from "react";
import { hrefFor, useStore, type Route } from "../state/store";
import { DemoTag } from "./ui";

const NAV: Array<{ page: Route["page"]; label: string; n: number }> = [
  { page: "simulator", label: "위치별 기준 시뮬레이터", n: 1 },
  { page: "overview", label: "종합 대시보드", n: 2 },
  { page: "particles", label: "SEM 이미지·입자 탐색", n: 3 },
  { page: "eds", label: "EDS 원소 조성 분석", n: 4 },
  { page: "integration", label: "형태–성분 통합 분석", n: 5 },
  { page: "hazard", label: "위해성 관련 원소 분포", n: 6 },
  { page: "samples", label: "시료·채취 지점 비교", n: 7 },
  { page: "data", label: "데이터 업로드·품질 검증", n: 8 },
  { page: "settings", label: "분석 설정·결과 내보내기", n: 9 },
];

/** 웹 배포판(GitHub Pages)에 함께 올라간 오프라인판이 있으면 내려받기 링크를 보여준다 */
function useOfflineLink(): string | null {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    if (import.meta.env.VITE_OFFLINE || location.protocol === "file:") return;
    const url = `${import.meta.env.BASE_URL}offline.html`;
    fetch(url, { method: "HEAD" })
      // 크기 정보가 있고 충분히 큰 HTML일 때만(개발 서버는 없는 경로에도 index.html을 돌려주므로 구분)
      .then((r) => r.ok && (r.headers.get("content-type") ?? "").includes("html") && Number(r.headers.get("content-length") ?? "0") > 500_000 && setHref(url))
      .catch(() => undefined);
  }, []);
  return href;
}

export function Layout({ children }: { children: ReactNode }) {
  const offlineHref = useOfflineLink();
  const { route, origin, particles, busy, loadDemo, navigate, data } = useStore();
  return (
    <div className="min-h-full flex">
      <aside className="w-[248px] shrink-0 bg-[#ece9e2] border-r border-line-2 flex flex-col sticky top-0 h-screen no-print max-lg:hidden">
        <a href={hrefFor({ page: "simulator" })} className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-line-2">
          <svg aria-hidden width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="#282828" strokeWidth="1.4">
            <path d="M15 3 26 9v12l-11 6L4 21V9z" />
            <path d="M4 9l11 6 11-6M15 15v12" />
            <circle cx="15" cy="15" r="2.2" fill="#f15534" stroke="none" />
          </svg>
          <span className="leading-tight">
            <span className="block font-mono text-[12px] font-semibold tracking-[0.08em] text-ink">SEM-EDS / PM</span>
            <span className="block text-[15px] font-bold text-ink mt-0.5">미세먼지 입자 분석</span>
          </span>
        </a>
        <nav className="flex-1 overflow-auto py-3 px-2.5 space-y-0.5" aria-label="페이지">
          {NAV.map((n) => {
            const active = route.page === n.page;
            return (
              <a key={n.page} href={hrefFor({ page: n.page })} aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-[3px] text-[14.5px] leading-snug ${active ? "bg-block text-white font-semibold" : "text-ink hover:bg-surface"}`}>
                <span className={`font-mono text-[12px] tnum w-5 ${active ? "text-signal" : "text-ink-3"}`}>{String(n.n).padStart(2, "0")}</span>
                <span className="flex-1">{n.label}</span>
                {active && <span aria-hidden className="w-1.5 h-1.5 bg-signal" />}
              </a>
            );
          })}
        </nav>
        <div className="px-5 py-4 text-[13px] text-ink-2 border-t border-line-2 leading-relaxed">
          {import.meta.env.VITE_OFFLINE && <div className="font-semibold text-ink mb-1">오프라인판(HTML 파일 하나)</div>}
          {offlineHref && (
            <a href={offlineHref} download="SEM-EDS 대시보드 (오프라인).html" className="flex items-center justify-between gap-2 font-semibold text-ink border border-ink rounded-[3px] px-3 py-2 mb-3 hover:bg-block hover:text-white">
              오프라인판 내려받기 <span aria-hidden className="text-signal">↓</span>
            </a>
          )}
          모든 처리는 이 브라우저 안에서만 이루어지며 파일은 외부로 전송되지 않습니다.
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 bg-page/95 backdrop-blur border-b border-line-2 no-print">
          <div className="flex flex-wrap items-center gap-3 px-7 py-3">
            <select className="lg:hidden border border-line-2 rounded-[3px] px-2 py-1 text-[14px] bg-surface" value={route.page} onChange={(e) => navigate({ page: e.target.value as Route["page"] })} aria-label="페이지">
              {NAV.map((n) => <option key={n.page} value={n.page}>{String(n.n).padStart(2, "0")}. {n.label}</option>)}
            </select>
            <span className="font-mono text-[12px] font-semibold tracking-[0.06em] uppercase text-ink-3">Dataset</span>
            {origin === "demo" && <DemoTag />}
            {origin === "user" && !data.shared && <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink border border-line-2 bg-surface rounded-[3px] px-2.5 py-1"><span aria-hidden className="w-1.5 h-1.5 bg-signal" />사용자 업로드 데이터</span>}
            {origin === "user" && data.shared && <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink border border-line-2 bg-surface rounded-[3px] px-2.5 py-1" title={data.shared.note ?? ""}><span aria-hidden className="w-1.5 h-1.5 bg-signal" />팀 공유 데이터셋 · {new Date(data.shared.savedAt).toLocaleDateString("ko-KR")} 기준</span>}
            {!origin && <span className="text-[13.5px] text-ink-2 border border-line-2 rounded-[3px] px-2.5 py-1">데이터 없음</span>}
            {particles.length > 0 && <span className="text-[14px] text-ink-2 tnum">입자 <b className="text-ink">{particles.length}</b>개</span>}
            {busy && <span className="text-[14px] text-accent animate-pulse">{busy}</span>}
            <div className="ml-auto flex items-center gap-2">
              {!origin && (
                <button onClick={loadDemo} className="text-[14px] font-semibold border border-line-2 bg-surface rounded-[3px] px-3 py-1.5 hover:border-ink">DEMO 데이터 보기</button>
              )}
              <a href={hrefFor({ page: "data" })} className="inline-flex items-center gap-1.5 text-[14px] font-semibold bg-block text-white rounded-[3px] px-3.5 py-1.5 hover:bg-[#3d3b37]">데이터 업로드 <span aria-hidden className="text-signal">→</span></a>
            </div>
          </div>
          {origin === "demo" && (
            <div className="demo-stripes border-t border-[#e9c46a] px-7 py-2 text-[14px] text-[#4a3200]" role="status">
              <b>DEMO 모드</b> — 화면에 보이는 입자·조성·이미지는 모두 <b>가상의 예시 데이터</b>입니다. 실제 측정 결과가 아니며 어떤 실제 시료(천안아산역·아산역·강남역 등)의 분석 결과로도 사용할 수 없습니다.
            </div>
          )}
        </header>
        <main className="flex-1 px-7 py-6 max-w-[1480px] w-full">{children}</main>
      </div>
    </div>
  );
}
