/* 문헌 데이터베이스 — 초록의 첫 단계. 발생원별 목표종·형상·인체 영향 사례를 다룬 선행연구(70편)와,
   거기서 뽑은 판정 규칙을 보여준다. 시뮬레이터의 판정은 이 규칙을 그대로 쓴다. */
import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { Card, PageHeader } from "../components/ui";
import { KIND_CLS } from "../components/LiteratureList";
import { SOURCE_RULES, ruleText } from "../lib/sources";
import { LITERATURE_DB, SITE_TARGETS, litByNo, type LitKind } from "../config/siteLiterature";

const KINDS: Array<"전체" | LitKind> = ["전체", "목표종·조성", "형상", "건강 영향", "배경", "분석 방법"];
const PARTS = [["전체", "전체"], ["A", "A부 · 목표종·형상·배경·방법 근거"], ["B", "B부 · 인체 영향 사례"]] as const;
const nA = LITERATURE_DB.filter((x) => x.part === "A").length;
const nB = LITERATURE_DB.length - nA;
const nUnverified = LITERATURE_DB.filter((x) => !x.verified).length;

export function LiteraturePage() {
  const { sim } = useStore();
  const sources = useMemo(() => ["전체", ...new Set(LITERATURE_DB.map((x) => x.source))], []);
  const [part, setPart] = useState<(typeof PARTS)[number][0]>("전체");
  const [source, setSource] = useState("전체");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("전체");
  const [onlyUnverified, setOnlyUnverified] = useState(false);
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return LITERATURE_DB.filter((x) => (part === "전체" || x.part === part) && (source === "전체" || x.source === source) && (kind === "전체" || x.kind === kind) &&
      (!onlyUnverified || !x.verified) && (!qq || `${x.no} ${x.cite} ${x.title} ${x.journal} ${x.use} ${x.element}`.toLowerCase().includes(qq)));
  }, [part, source, kind, onlyUnverified, q]);
  const sel = "border border-line-2 rounded-[3px] px-2 py-1 bg-white";

  return (
    <>
      <PageHeader title="문헌 데이터베이스" description={`5개 지점 유형의 발생원별 목표종, 형상, 인체 영향 사례를 다룬 선행연구 ${LITERATURE_DB.length}편입니다. 여기서 뽑은 목표종과 형상 조건이 AI 시뮬레이터의 판정 규칙이 됩니다.`} />

      <Card title="지점별 최종 목표종" subtitle="문헌 데이터베이스에서 정한 지점별 목표 원소와 핵심 근거 문헌입니다.">
        <div className="overflow-x-auto">
          <table className="data text-[13px]">
            <thead><tr><th>지점</th><th>목표종</th><th>핵심 근거 문헌</th></tr></thead>
            <tbody>
              {SITE_TARGETS.map((t) => (
                <tr key={t.site}>
                  <td className="whitespace-nowrap font-semibold">{t.site}</td>
                  <td className="font-mono">{t.elements.join(", ")}</td>
                  <td className="text-[12.5px]">{t.refs.map((no) => { const e = litByNo(no); return <div key={no}><span className="font-mono text-ink-3 mr-1">{no}</span>{e?.cite}</div>; })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4">
        <Card title="판정 규칙과 인체 영향 사례" subtitle="조건은 지금 설정된 기준값으로 표시됩니다. 인체 영향은 대부분 직업 노출·고농도 실험 연구에서 보고된 사례이며, 우리 입자의 위해 정도를 뜻하지 않습니다.">
          <div className="overflow-x-auto">
            <table className="data text-[13px]">
              <thead><tr><th>발생원 · 입자 유형</th><th>판정 조건</th><th>판정 근거</th><th>보고된 인체 영향 사례</th><th>출처·근거 종류</th></tr></thead>
              <tbody>
                {SOURCE_RULES.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap"><span className="inline-block w-2.5 h-2.5 mr-1.5 align-middle" style={{ background: r.color }} />{r.source}<br /><b>{r.label}</b></td>
                    <td className="text-[12.5px]">{ruleText(r, sim.config.thresholds)}{r.sub && <div className="text-ink-3">그중 {r.sub.label} 비율도 집계</div>}</td>
                    <td className="text-[12.5px]">{r.basis}{r.caution && <div className="text-[#6b4b00] mt-0.5">주의: {r.caution}</div>}</td>
                    <td className="text-[12.5px]">{r.health.effect}</td>
                    <td className="text-[12.5px]">{r.health.refs}<div className="text-ink-3">{r.health.evidence}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Card title={`등록 문헌 ${LITERATURE_DB.length}편`} subtitle={`A부 ${nA}편(목표종·형상·배경·방법 근거), B부 ${nB}편(인체 영향 사례). ● 서지 확인, ◐ 일부 정보 미확인(${nUnverified}편, 인용 전 DOI로 확인 필요).`}>
          <div className="flex flex-wrap items-center gap-2 mb-3 text-[13.5px]">
            <select className={sel} value={part} onChange={(e) => setPart(e.target.value as typeof part)} aria-label="구분">
              {PARTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select className={sel} value={source} onChange={(e) => setSource(e.target.value)} aria-label="지점·발생원">
              {sources.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select className={sel} value={kind} onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])} aria-label="분류">
              {KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={onlyUnverified} onChange={(e) => setOnlyUnverified(e.target.checked)} />확인 필요(◐)만</label>
            <input className={`${sel} w-56`} placeholder="저자·제목·원소 검색" value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="text-ink-3">{rows.length}편</span>
          </div>
          <div className="overflow-x-auto">
            <table className="data text-[13px]">
              <thead><tr><th>No</th><th>지점·발생원</th><th>분류</th><th>문헌</th><th>용도·핵심 내용</th><th>확인</th></tr></thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.no}>
                    <td className="font-mono whitespace-nowrap">{x.no}</td>
                    <td className="whitespace-nowrap">{x.source}{x.element && <div className="text-ink-3 text-[12px]">{x.element}</div>}</td>
                    <td className="whitespace-nowrap"><span className={`text-[11px] px-1.5 py-0.5 rounded-sm ${KIND_CLS[x.kind]}`}>{x.kind}</span>{x.type && <div className="text-ink-3 text-[12px] mt-0.5">{x.type}</div>}</td>
                    <td className="text-[12.5px] min-w-[260px]">
                      {x.url ? <a className="text-accent hover:underline font-semibold" href={x.url} target="_blank" rel="noreferrer">{x.cite}</a> : <b>{x.cite}</b>}
                      <div>{x.title}</div>
                      <div className="text-ink-3">{x.journal}</div>
                    </td>
                    <td className="text-[12.5px] min-w-[240px]">{x.use}</td>
                    <td className="text-center" title={x.verified ? "서지 확인" : "일부 정보 미확인"}>{x.verified ? "●" : "◐"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
