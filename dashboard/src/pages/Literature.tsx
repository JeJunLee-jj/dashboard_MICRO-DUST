/* 문헌 데이터베이스 — 초록의 첫 단계. 발생원별 화학종·형상·건강 위해를 다룬 선행연구와,
   거기서 뽑은 판정 규칙을 보여준다. 시뮬레이터의 판정은 이 규칙을 그대로 쓴다. */
import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { Card, PageHeader } from "../components/ui";
import { SOURCE_RULES, ruleText } from "../lib/sources";
import { LITERATURE_DB } from "../config/siteLiterature";

const KINDS = ["전체", "건강 영향", "발생원·조성", "형상", "배경"] as const;

export function LiteraturePage() {
  const { sim } = useStore();
  const sources = useMemo(() => ["전체", ...new Set(LITERATURE_DB.map((x) => x.source))], []);
  const [source, setSource] = useState("전체");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("전체");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return LITERATURE_DB.filter((x) => (source === "전체" || x.source === source) && (kind === "전체" || x.kind === kind) && (!qq || `${x.topic} ${x.cite}`.toLowerCase().includes(qq)));
  }, [source, kind, q]);

  return (
    <>
      <PageHeader title="문헌 데이터베이스" description="5개 지점 유형의 발생원별 화학종, 형상, 건강 위해를 다룬 선행연구입니다. 여기서 뽑은 지표 조건이 AI 시뮬레이터의 판정 규칙이 됩니다." />

      <Card title="판정 규칙과 건강 영향" subtitle="조건은 지금 설정된 기준값으로 표시됩니다. 건강 영향은 그 특성의 입자에서 보고된 사례이며, 우리 입자의 위해 정도를 뜻하지 않습니다.">
        <div className="overflow-x-auto">
          <table className="data text-[13px]">
            <thead><tr><th>발생원 · 입자 유형</th><th>판정 조건</th><th>판정 근거</th><th>보고된 건강 영향</th><th>출처·근거 종류</th></tr></thead>
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

      <div className="mt-4">
        <Card title={`등록 문헌 ${LITERATURE_DB.length}편`} subtitle="초록에 인용된 문헌과 연구진이 정리한 문헌입니다. 나머지 문헌 목록을 추가하면 이 표가 늘어납니다.">
          <div className="flex flex-wrap items-center gap-2 mb-3 text-[13.5px]">
            <select className="border border-line-2 rounded-[3px] px-2 py-1 bg-white" value={source} onChange={(e) => setSource(e.target.value)} aria-label="발생원">
              {sources.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select className="border border-line-2 rounded-[3px] px-2 py-1 bg-white" value={kind} onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])} aria-label="분류">
              {KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
            <input className="border border-line-2 rounded-[3px] px-2 py-1 bg-white w-56" placeholder="주제·저자 검색" value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="text-ink-3">{rows.length}편</span>
          </div>
          <div className="overflow-x-auto">
            <table className="data text-[13px]">
              <thead><tr><th>발생원</th><th>분류</th><th>내용</th><th>문헌</th></tr></thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={`${x.cite}-${x.topic}`}>
                    <td className="whitespace-nowrap">{x.source}</td>
                    <td className="whitespace-nowrap">{x.kind}</td>
                    <td>{x.topic}</td>
                    <td className="text-[12.5px]">{x.url ? <a className="text-accent hover:underline" href={x.url} target="_blank" rel="noreferrer">{x.cite}</a> : x.cite}</td>
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
