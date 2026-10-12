/* 원소별 위해 정보와 검출 입자.
   원소를 고르면 ① 노출 시 알려진 건강 영향(문헌·출처) ② 그 원소가 검출된 입자들의 함량 분포도
   ③ 해당 입자의 SEM 사진과 입자별 조성 막대(선택 원소 강조)를 함께 보여준다.
   원소 검출 ≠ 위해: 건강 영향은 그 원소(화학종)에 노출됐을 때의 일반 정보이며, 입자의 독성을 판정하지 않는다. */
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore, hrefFor } from "../state/store";
import { Card, DemoTag, Notice, Pct, Segmented, fmtNum } from "./ui";
import { CompositionBar } from "./CompositionBar";
import { axisProps, gridProps, tip } from "./chartKit";
import { elementHealth, hasHealthInfo } from "../lib/elementHealth";
import { elementSummaries, elementsInData } from "../lib/composition";
import { elementStatus, isDetectedStatus } from "../lib/join";
import { STATUS_LABEL } from "../lib/exports";
import { SERIES } from "../lib/palette";
import { PM_GENERAL_NOTE } from "../config/healthInfo";
import type { Basis, Particle } from "../lib/types";

const PAGE = 12;

export function ElementHazardExplorer() {
  const { filtered, settings, hazardRules, colorOrder } = useStore();
  const [basis, setBasis] = useState<Basis>(settings.displayBasis);
  const [showAll, setShowAll] = useState(false);

  const valid = useMemo(() => filtered.filter((p) => p.edsValid), [filtered]);
  const present = useMemo(() => elementsInData(valid), [valid]);
  const summaries = useMemo(() => new Map(elementSummaries(filtered, settings, [...new Set([...present, ...settings.targetElements])]).map((s) => [s.symbol, s])), [filtered, settings, present]);

  // 보여줄 원소: 검출된 대상 원소 → 검출된 참고 원소(건강 정보 있음) → 검출되지 않은 대상 원소
  const list = useMemo(() => {
    const det = (s: string) => summaries.get(s)?.detected ?? 0;
    const targetsDetected = settings.targetElements.filter((s) => det(s) > 0).sort((a, b) => det(b) - det(a));
    const refsDetected = present.filter((s) => !settings.targetElements.includes(s) && det(s) > 0 && hasHealthInfo(s, hazardRules)).sort((a, b) => det(b) - det(a));
    const targetsAbsent = settings.targetElements.filter((s) => det(s) === 0);
    return { all: [...targetsDetected, ...refsDetected, ...targetsAbsent], noInfo: present.filter((s) => det(s) > 0 && !settings.targetElements.includes(s) && !hasHealthInfo(s, hazardRules)) };
  }, [summaries, settings.targetElements, present, hazardRules]);

  const [picked, setPicked] = useState<string | null>(null);
  const sel = picked && list.all.includes(picked) ? picked : list.all[0] ?? null;

  if (!sel) return null;
  const info = elementHealth(sel, hazardRules, settings.targetElements);
  const sum = summaries.get(sel);
  const value = (p: Particle) => {
    const e = p.elements[sel];
    return e && e.status === "detected" ? (basis === "wt" ? e.wt : e.at) : null;
  };
  const hits = valid
    .filter((p) => isDetectedStatus(elementStatus(p, sel, settings).status, settings))
    .sort((a, b) => (value(b) ?? -1) - (value(a) ?? -1));
  const chart = hits.map((p) => ({ key: p.key, label: `${p.sample_id}/${p.particle_id}`, v: value(p), status: elementStatus(p, sel, settings).status }));
  const desc = basis === "wt" ? sum?.wt : sum?.at;
  const shown = showAll ? hits : hits.slice(0, PAGE);
  const bl = basis === "wt" ? "wt%" : "at%";
  const go = (key: string) => (window.location.hash = hrefFor({ page: "particles", particleKey: key }));

  return (
    <Card
      className="mb-4"
      title="원소별 위해 정보와 검출 입자"
      subtitle="원소를 고르면 노출 시 알려진 건강 영향(문헌), 그 원소가 검출된 입자의 SEM 사진, 입자별 조성과 함량 분포를 함께 봅니다."
      actions={<Segmented value={basis} onChange={setBasis} options={[{ value: "wt", label: "wt%" }, { value: "at", label: "at%" }]} />}
    >
      {/* 요약 표: 어떤 원소가 어떤 위해와 관련되는가 */}
      <div className="overflow-auto mb-3">
        <table className="data">
          <thead><tr><th>원소</th><th>구분</th><th className="num">검출 입자</th><th>주요 표적 장기</th><th>노출 시 알려진 건강 영향(요약)</th></tr></thead>
          <tbody>
            {list.all.map((s) => {
              const h = elementHealth(s, hazardRules, settings.targetElements);
              const sm = summaries.get(s);
              return (
                <tr key={s} onClick={() => { setPicked(s); setShowAll(false); }} className={`cursor-pointer ${s === sel ? "bg-accent-soft" : ""}`} aria-selected={s === sel}>
                  <td className="whitespace-nowrap"><b>{s}</b> <span className="text-[11.5px] text-ink-3">{h.nameKo}</span>{s === sel && <span className="ml-1 text-accent text-[11px]">◀ 선택</span>}</td>
                  <td className="text-[12px] whitespace-nowrap">{h.isTarget ? "평가 대상" : "참고 원소"}</td>
                  <td className="num">{sm && sm.evaluable ? <Pct k={sm.detected} n={sm.evaluable} /> : "—"}</td>
                  <td className="text-[12px]">{h.organs ?? <span className="text-ink-3">정보 없음</span>}</td>
                  <td className="text-[12px] max-w-[520px]">{h.effects ? firstSentence(h.effects) : <span className="text-ink-3">등록된 정보 없음(설정에서 입력)</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.noInfo.length > 0 && <p className="text-[12px] text-ink-3 mt-1.5">건강 영향 정보가 등록되지 않은 검출 원소: {list.noInfo.join(", ")} — 근거가 확인되지 않은 내용은 만들지 않았습니다. 필요하면 분석 설정의 위해성 평가 규칙에 출처와 함께 입력하세요.</p>}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3" role="tablist" aria-label="원소 선택">
        {list.all.map((s) => {
          const n = summaries.get(s)?.detected ?? 0;
          return (
            <button key={s} role="tab" aria-selected={s === sel} onClick={() => { setPicked(s); setShowAll(false); }}
              className={`border rounded-md px-2.5 py-1 text-[12.5px] ${s === sel ? "bg-accent text-white border-accent" : n ? "bg-surface border-line-2 hover:bg-surface-2" : "bg-surface border-line text-ink-3"}`}>
              <b>{s}</b> <span className="tnum">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4">
        {/* 위해 정보 */}
        <div className="border border-line rounded-lg p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-[17px] font-semibold">{sel} <span className="text-[14px] font-normal text-ink-2">{info.nameKo}</span></h4>
            <span className="text-[11.5px] border border-line-2 rounded px-1.5 py-px">{info.isTarget ? "위해성 평가 대상 원소" : "참고 원소"}</span>
            {info.category && <span className="text-[11.5px] border border-line-2 rounded px-1.5 py-px bg-surface-2">{info.category}</span>}
          </div>
          <dl className="mt-3 space-y-2.5 text-[13px]">
            <div><dt className="text-ink-3 text-[12px]">주요 표적 장기</dt><dd>{info.organs ?? "정보 없음"}</dd></div>
            <div><dt className="text-ink-3 text-[12px]">노출 시 알려진 건강 영향</dt><dd className="leading-relaxed">{info.effects ?? "등록된 정보가 없습니다. 분석 설정의 위해성 평가 규칙에 출처와 함께 입력할 수 있습니다."}</dd></div>
            {info.condition && <div><dt className="text-ink-3 text-[12px]">화학종·적용 조건</dt><dd className="leading-relaxed">{info.condition}</dd></div>}
            <div>
              <dt className="text-ink-3 text-[12px]">출처 {info.source === "user" ? "(설정에서 입력한 내용)" : info.source === "default" ? "(기본 참고 정보 — 사용 전 원문 확인)" : ""}</dt>
              <dd>
                <ul className="list-disc pl-5 text-[12.5px] space-y-0.5">
                  {info.references.map((r, i) => <li key={i}>{r.url ? <a className="text-accent hover:underline" href={r.url} target="_blank" rel="noreferrer">{r.name}</a> : r.name}</li>)}
                  {info.classificationRef && !info.references.some((r) => r.name === info.classificationRef!.name) && (
                    <li>분류 근거: {info.classificationRef.url ? <a className="text-accent hover:underline" href={info.classificationRef.url} target="_blank" rel="noreferrer">{info.classificationRef.name}</a> : info.classificationRef.name}{info.classificationRef.year ? ` (${info.classificationRef.year})` : ""}</li>
                  )}
                  {!info.references.length && !info.classificationRef && <li className="text-ink-3">출처 없음</li>}
                </ul>
              </dd>
            </div>
          </dl>
          <Notice kind="warning">
            이 내용은 {sel}(또는 특정 화학종)에 <b>노출되었을 때</b> 문헌에 보고된 일반적인 영향입니다. 분석 입자에서 {sel}이(가) 검출되었다는 사실만으로 그 입자가 이런 위해를 일으킨다고 판단할 수 없습니다. 실제 위해는 화학종, 노출 농도·기간, 입자 크기에 따라 달라집니다.
          </Notice>
          <p className="text-[12px] text-ink-3 mt-2">{PM_GENERAL_NOTE.text} <a className="text-accent hover:underline" href={PM_GENERAL_NOTE.url} target="_blank" rel="noreferrer">{PM_GENERAL_NOTE.reference}</a></p>
        </div>

        {/* 원소 분포도 */}
        <div className="border border-line rounded-lg p-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-[15px] font-semibold">{sel} 원소 분포도 — 검출 입자별 함량({bl})</h4>
            <span className="text-[12.5px] text-ink-2 tnum">검출 {sum ? <Pct k={sum.detected} n={sum.evaluable} /> : "—"}{desc?.n ? ` · 중앙값 ${fmtNum(desc.median)} · 범위 ${fmtNum(desc.min)}–${fmtNum(desc.max)} ${bl}` : ""}</span>
          </div>
          {hits.length === 0 ? (
            <div className="text-[13px] text-ink-2 py-10 text-center">현재 데이터(필터)에서 {sel}이(가) 검출된 입자가 없습니다.</div>
          ) : (
            <>
              <div style={{ height: Math.min(420, Math.max(140, chart.length * 22 + 40)) }} className="mt-2 overflow-y-auto">
                <ResponsiveContainer width="100%" height={Math.max(140, chart.length * 22 + 40)}>
                  <BarChart data={chart} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
                    <CartesianGrid {...gridProps} horizontal={false} vertical />
                    <XAxis type="number" {...axisProps} domain={[0, (max: number) => Math.max(1, Math.ceil(max * 1.1))]} tickFormatter={(v) => `${v}`} />
                    <YAxis type="category" dataKey="label" {...axisProps} width={120} tick={{ fontSize: 11, fill: "#5f6b68" }} />
                    <Tooltip cursor={{ fill: "#eef3f1" }} content={tip<{ label: string; v: number | null; status: string }>((d) => ({ title: d.label, lines: [d.v != null ? `${sel} ${fmtNum(d.v)} ${bl}` : `${sel}: ${STATUS_LABEL[d.status]}(정량값 없음)`, "누르면 입자 상세"] }))} />
                    <Bar dataKey="v" fill={SERIES[1]} radius={[0, 4, 4, 0]} barSize={14} isAnimationActive={false} style={{ cursor: "pointer" }}
                      label={{ position: "right", fontSize: 11, fill: "#4a5754", formatter: (v: unknown) => (typeof v === "number" ? v.toFixed(1) : "") }}
                      onClick={(d: { payload?: { key: string } }) => d.payload && go(d.payload.key)} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[12px] text-ink-3 mt-1">입자 안의 조성비(EDS)이며 대기 중 농도나 질량 비율이 아닙니다. 막대가 없는 입자는 정량한계 미만 등 정량값이 없는 검출입니다.</p>
            </>
          )}
        </div>
      </div>

      {/* SEM 사진 갤러리 */}
      {hits.length > 0 && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between mb-2">
            <h4 className="text-[15px] font-semibold">{sel}이(가) 검출된 입자의 SEM 사진 <span className="text-[12.5px] font-normal text-ink-3">({hits.length}개, {bl} 높은 순)</span></h4>
            {hits.length > PAGE && <button className="text-[12.5px] text-accent hover:underline" onClick={() => setShowAll(!showAll)}>{showAll ? "접기" : `모두 보기(${hits.length})`}</button>}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {shown.map((p) => {
              const v = value(p);
              return (
                <a key={p.key} href={hrefFor({ page: "particles", particleKey: p.key })} className="border border-line rounded-lg overflow-hidden hover:border-accent bg-surface">
                  <div className="aspect-[4/3] bg-[#1b1f1e] relative">
                    {p.image ? <img src={p.image.url} alt={`${p.particle_id} SEM`} className="w-full h-full object-cover" loading="lazy" /> : <div className="w-full h-full grid place-items-center text-[12px] text-white/60">이미지 없음</div>}
                    <span className="absolute right-1.5 top-1.5 text-[11.5px] font-semibold rounded px-1.5 py-0.5 text-white" style={{ background: SERIES[1] }}>
                      {sel} {v != null ? `${v.toFixed(1)} ${bl}` : STATUS_LABEL[elementStatus(p, sel, settings).status]}
                    </span>
                    {p.image?.synthetic && <span className="absolute left-1.5 top-1.5"><DemoTag small /></span>}
                  </div>
                  <div className="px-2.5 py-2 space-y-1">
                    <div className="text-[13px] font-semibold truncate">{p.sample_id} / {p.particle_id}</div>
                    <CompositionBar p={p} basis={basis} order={colorOrder} highlight={sel} compact />
                    {p.meta?.equivalent_diameter != null && <div className="text-[11px] text-ink-3 tnum">등가원 지름 {fmtNum(p.meta.equivalent_diameter)} µm</div>}
                  </div>
                </a>
              );
            })}
          </div>
          <p className="text-[12px] text-ink-3 mt-2">조성 막대: 주황 = {sel}, 회색 = 다른 원소(입자 하나의 EDS 결과). 원소 분포 영상(EDS 매핑)은 현재 데이터에 없어 표시하지 않습니다.</p>
        </div>
      )}
    </Card>
  );
}

function firstSentence(s: string): string {
  const m = s.match(/^.*?다\./);
  return m ? m[0] : s.length > 90 ? s.slice(0, 90) + "…" : s;
}
