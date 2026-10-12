import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { useStore, hrefFor } from "../state/store";
import { FilterBar } from "../components/FilterBar";
import { ElementHazardExplorer } from "../components/ElementHazardExplorer";
import { NoData } from "../components/NoData";
import { ChartCard } from "../components/ChartCard";
import { Card, Formula, Kpi, Legend, Notice, PageHeader, Pct, Segmented, fmtNum, NotAvailable } from "../components/ui";
import { axisProps, gridProps, tip } from "../components/chartKit";
import { hazardSummary, massConcentrationAssessment, HAZARD_DISCLAIMER } from "../lib/hazard";
import { quantValue } from "../lib/join";
import {STATUS_COLOR, INK_BAR } from "../lib/palette";
import { STATUS_LABEL } from "../lib/exports";
import { elementNameKo } from "../lib/elements";

/** 같은 원소 열 안에서 점이 겹치지 않도록 입자 키로 정한 고정 흔들림(±0.2) */
function jitter(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 1000) / 1000 - 0.5) * 0.4;
}

const STATUS_ORDER = ["detected", "below_loq", "below_lod", "not_detected", "missing"] as const;

export function HazardPage() {
  const { particles, filtered, settings, hazardRules, origin, data, navigate, setFilters } = useStore();
  const [groupBy, setGroupBy] = useState<"sample_id" | "location">("sample_id");
  const hz = useMemo(() => hazardSummary(filtered, settings, hazardRules), [filtered, settings, hazardRules]);
  const groups = useMemo(() => hz.byGroup(groupBy), [hz, groupBy]);
  const strip = useMemo(() => {
    const valid = filtered.filter((p) => p.edsValid);
    return settings.targetElements.map((s, i) => ({ s, i, pts: valid.map((p) => ({ x: i, y: quantValue(p, s, "wt"), key: p.key, label: `${p.sample_id}/${p.particle_id}`, el: s })).filter((d) => d.y != null) as Array<{ x: number; y: number; key: string; label: string; el: string }> }));
  }, [filtered, settings]);

  if (!particles.length) return (<><PageHeader title="위해성 관련 원소 분포 분석" /><NoData /></>);
  const demo = origin === "demo";
  const statusData = hz.elementStats.map((e) => {
    const detectedOnly = e.detected - (settings.belowLoqCountsAsDetected ? e.belowLoq : 0);
    const total = e.evaluable + e.missing;
    const row: Record<string, number | string> = { symbol: e.symbol, total };
    const counts: Record<string, number> = { detected: detectedOnly, below_loq: e.belowLoq, below_lod: e.belowLod, not_detected: e.notDetected, missing: e.missing };
    for (const k of STATUS_ORDER) {
      row[k] = counts[k];
      row[`${k}%`] = total ? (counts[k] / total) * 100 : 0;
    }
    return row;
  });

  return (
    <>
      <PageHeader title="위해성 관련 원소 분포 분석" description={`위해성 평가 대상 원소(${settings.targetElements.join(", ")})가 분석 입자에 어느 정도 분포하는지 봅니다. 목록은 초기 설정이며 모든 원소를 같은 위해성 등급으로 보지 않습니다.`} />
      <FilterBar />
      <Notice kind="warning">{HAZARD_DISCLAIMER}</Notice>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 my-4">
        <Kpi label="전체 분석 입자 수" value={hz.totalParticles} unit="개" demo={demo} />
        <Kpi label="유효 EDS 분석 입자" value={hz.validEds} unit="개" demo={demo} detail={`제외 ${hz.totalParticles - hz.validEds}개(EDS 없음·결측·사용자 제외 등)`} />
        <Kpi label="대상 원소 1개 이상 검출 입자" value={hz.positive} unit="개" demo={demo} detail={`미검출 ${hz.negative} · 판정 불가 ${hz.undetermined}`} onClick={() => { setFilters((f) => ({ ...f, targetStatus: "positive" })); navigate({ page: "particles" }); }} />
        <Kpi label="대상 원소 검출 입자 비율" value={hz.targetRatio.ratio == null ? "—" : (hz.targetRatio.ratio * 100).toFixed(1)} unit={hz.targetRatio.ratio == null ? undefined : "%"} demo={demo}
          detail={hz.targetRatio.ci ? `${hz.positive}/${hz.targetRatio.denominator} · 95% CI ${(hz.targetRatio.ci.lo * 100).toFixed(1)}–${(hz.targetRatio.ci.hi * 100).toFixed(1)}%` : "판정 가능 입자 없음"} />
        <Kpi label="2개 이상 동시 검출 입자 비율" value={hz.multi[2].ratio == null ? "—" : (hz.multi[2].ratio * 100).toFixed(1)} unit={hz.multi[2].ratio == null ? undefined : "%"} demo={demo} detail={`${hz.multi[2].numerator}/${hz.multi[2].denominator} 입자`} />
      </div>

      <div className="space-y-2 mb-4">
        <Formula>
          대상 원소 검출 입자 비율(%) = 대상 원소가 하나 이상 검출된 입자 수({hz.positive}) ÷ 판정 가능한 유효 분석 입자 수({hz.targetRatio.denominator}) × 100.
          유효 분석 입자 = EDS 기록이 있고 제외 조건에 해당하지 않는 입자({hz.validEds}). 이 중 대상 원소가 검출되지 않았으나 일부 대상 원소가 결측인 {hz.undetermined}개는 음성으로 단정할 수 없어 분모에서 뺍니다.
          한 입자에서 여러 대상 원소가 검출돼도 1개로 셉니다(원소별 검출 수 합계 {hz.elementStats.reduce((a, e) => a + e.detected, 0)} ≠ 검출 입자 수 {hz.positive}).
        </Formula>
        <Formula title="원소별 검출 빈도">
          원소 X 검출 빈도 = X가 검출된 입자 수 ÷ X를 판정할 수 있는 유효 입자 수(X가 결측인 입자 제외) — 원소마다 분모가 다를 수 있어 표에 분모를 함께 적습니다.
          정량한계 미만은 {settings.belowLoqCountsAsDetected ? "검출로 셉니다" : "검출로 세지 않습니다"}. 파일에 행이 없는 원소는 {settings.absentElementPolicy === "not_detected" ? "미검출로 간주합니다(가정)" : "결측(미분석)으로 봅니다"}. (설정에서 변경)
        </Formula>
      </div>

      <ElementHazardExplorer />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-4">
        <ChartCard title="대상 원소별 검출 상태 구성" subtitle="유효 입자 기준 · 상태별 입자 수 비율(100% 누적) · 막대를 누르면 그 원소가 검출된 입자 목록"
          table={<table className="data"><thead><tr><th>원소</th>{STATUS_ORDER.map((k) => <th key={k} className="num">{STATUS_LABEL[k]}</th>)}</tr></thead><tbody>{statusData.map((r) => <tr key={r.symbol as string}><td>{r.symbol}</td>{STATUS_ORDER.map((k) => <td key={k} className="num">{r[k]}</td>)}</tr>)}</tbody></table>}>
          <Legend items={STATUS_ORDER.map((k) => ({ label: STATUS_LABEL[k], color: STATUS_COLOR[k] }))} />
          <div className="h-[300px] mt-1">
            <ResponsiveContainer>
              <BarChart data={statusData} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid {...gridProps} horizontal={false} vertical />
                <XAxis type="number" domain={[0, 100]} allowDataOverflow ticks={[0, 25, 50, 75, 100]} {...axisProps} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="symbol" {...axisProps} width={36} />
                <Tooltip cursor={{ fill: "#ebe7de" }} content={tip<Record<string, number | string>>((d) => ({ title: `${d.symbol} (${elementNameKo(String(d.symbol))}) — 유효 입자 ${d.total}`, lines: STATUS_ORDER.map((k) => `${STATUS_LABEL[k]}: ${d[k]}개 (${(d[`${k}%`] as number).toFixed(1)}%)`) }))} />
                {STATUS_ORDER.map((k) => <Bar key={k} dataKey={`${k}%`} stackId="s" fill={STATUS_COLOR[k]} stroke={k === "missing" ? "#b9b4a9" : "#fff"} strokeWidth={1} barSize={18} isAnimationActive={false} style={{ cursor: "pointer" }}
                  onClick={(d: { payload?: { symbol: string } }) => { if (d.payload) { setFilters((f) => ({ ...f, element: d.payload!.symbol })); navigate({ page: "particles" }); } }} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="대상 원소의 입자별 조성비 분포 (wt%)" subtitle="점 = 한 입자에서 검출되고 wt% 값이 있는 원소의 조성비 · 입자 내 조성이며 대기 중 질량 비율이 아님 · 점을 누르면 입자 상세">
          {strip.every((s) => !s.pts.length) ? <NotAvailable>대상 원소의 wt% 정량값이 없습니다.</NotAvailable> : (
            <div className="h-[330px]">
              <ResponsiveContainer>
                <ScatterChart margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid stroke="#e2ded5" />
                  <XAxis type="number" dataKey="x" domain={[-0.5, settings.targetElements.length - 0.5]} ticks={settings.targetElements.map((_, i) => i)} tickFormatter={(i) => settings.targetElements[i] ?? ""} {...axisProps} />
                  <YAxis type="number" dataKey="y" scale="log" domain={[0.05, 100]} allowDataOverflow ticks={[0.1, 1, 10, 100]} tickFormatter={(v) => `${v}`} {...axisProps} width={44} label={{ value: "wt% (로그 눈금)", angle: -90, position: "insideLeft", fontSize: 11, fill: "#4a4945" }} />
                  <ZAxis range={[44, 44]} />
                  <Tooltip content={tip<{ label: string; el: string; y: number }>((d) => ({ title: d.label, lines: [`${d.el}: ${fmtNum(d.y)} wt%`] }))} />
                  <Scatter data={strip.flatMap((s) => s.pts.map((p) => ({ ...p, x: s.i + jitter(p.key) })))} fill={INK_BAR} fillOpacity={0.75} stroke="#fff" strokeWidth={1} isAnimationActive={false} style={{ cursor: "pointer" }}
                    onClick={(d: { payload?: { key: string } }) => d.payload && (window.location.hash = hrefFor({ page: "particles", particleKey: d.payload.key }))} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      <Card className="mb-4" title="대상 원소별 검출 현황과 조성 통계" subtitle="검출 빈도 분모 = 원소별 판정 가능 입자 · 조성 통계는 검출되고 정량값이 있는 입자만 · 평가 범주는 원소별 참고 정보(입자 위해도 판정에 사용하지 않음)">
        <div className="overflow-auto">
          <table className="data">
            <thead><tr><th>원소</th><th className="num">검출 입자 / 판정 가능</th><th className="num">95% CI</th><th className="num">LOQ 미만</th><th className="num">LOD 미만</th><th className="num">미검출</th><th className="num">결측</th><th className="num">wt% 중앙값 [Q1–Q3] (n)</th><th className="num">at% 중앙값 (n)</th><th>평가 범주(참고) · 근거</th></tr></thead>
            <tbody>
              {hz.elementStats.map((e) => (
                <tr key={e.symbol}>
                  <td><b>{e.symbol}</b> <span className="text-[12.5px] text-ink-3">{elementNameKo(e.symbol)}</span></td>
                  <td className="num"><Pct k={e.detected} n={e.evaluable} /></td>
                  <td className="num">{e.ci && e.evaluable ? `${(e.ci.lo * 100).toFixed(1)}–${(e.ci.hi * 100).toFixed(1)}%` : "—"}</td>
                  <td className="num">{e.belowLoq}</td><td className="num">{e.belowLod}</td><td className="num">{e.notDetected}</td><td className="num">{e.missing}</td>
                  <td className="num">{e.wt.n ? `${fmtNum(e.wt.median)} [${fmtNum(e.wt.q1)}–${fmtNum(e.wt.q3)}] (${e.wt.n})` : "—"}</td>
                  <td className="num">{e.at.n ? `${fmtNum(e.at.median)} (${e.at.n})` : "—"}</td>
                  <td className="text-[13px] max-w-[320px]">
                    {e.rule ? (
                      <>
                        <div>{e.rule.assessment_category}</div>
                        <div className="text-ink-3">{e.rule.reference_name ? <>{e.rule.reference_url ? <a className="text-accent hover:underline" href={e.rule.reference_url} target="_blank" rel="noreferrer">{e.rule.reference_name}</a> : e.rule.reference_name}{e.rule.reference_year ? ` (${e.rule.reference_year})` : ""}</> : "근거 미입력"}</div>
                        {e.rule.applicable_condition && <div className="text-ink-3">조건: {e.rule.applicable_condition}</div>}
                      </>
                    ) : <span className="text-ink-3">규칙 없음</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-5 mb-4">
        <ChartCard title="입자당 검출된 대상 원소 수" subtitle="판정 가능 입자(판정 불가 제외)" table={<table className="data"><thead><tr><th>원소 수</th><th className="num">입자</th></tr></thead><tbody>{hz.countDistribution.map((d) => <tr key={d.k}><td>{d.k}</td><td className="num">{d.particles}</td></tr>)}</tbody></table>}>
          <div className="h-[220px]">
            <ResponsiveContainer>
              <BarChart data={hz.countDistribution} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="k" {...axisProps} />
                <YAxis {...axisProps} allowDecimals={false} width={32} />
                <Tooltip cursor={{ fill: "#ebe7de" }} content={tip<{ k: number; particles: number }>((d) => ({ title: `대상 원소 ${d.k}개 검출`, lines: [`${d.particles} 입자`] }))} />
                <Bar dataKey="particles" fill={INK_BAR} radius={[4, 4, 0, 0]} barSize={24} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <Card title="복수 대상 원소 동시 검출 조합" subtitle="2개 이상 검출된 입자의 원소 조합 · 입자 수">
          {hz.combos.length === 0 ? <p className="text-[14px] text-ink-2">2개 이상 동시 검출된 입자가 없습니다.</p> : (
            <table className="data"><thead><tr><th>조합</th><th className="num">입자</th></tr></thead><tbody>{hz.combos.slice(0, 12).map((c) => <tr key={c.combo}><td className="font-mono text-[13.5px]">{c.combo}</td><td className="num">{c.particles}</td></tr>)}</tbody></table>
          )}
          <p className="text-[13px] text-ink-3 mt-2">3개 이상 동시 검출: {hz.multi[3].ratio == null ? "—" : <Pct k={hz.multi[3].numerator} n={hz.multi[3].denominator} />}</p>
        </Card>
        <Card title="입자 형상별 대상 원소 검출" subtitle="형상 그룹마다 1개 이상 검출 입자 / 판정 가능 입자">
          <table className="data">
            <thead><tr><th>형상</th><th className="num">유효 입자</th><th className="num">검출 비율</th></tr></thead>
            <tbody>{hz.byMorphology.map((m) => <tr key={m.morphology}><td>{m.label}</td><td className="num">{m.particles}</td><td className="num"><Pct k={m.positive} n={m.determinable} /></td></tr>)}</tbody>
          </table>
        </Card>
      </div>

      <Card className="mb-4" title="시료별·채취 지점별 대상 원소 분포" subtitle="그룹마다 판정 가능 입자 기준 · 95% Wilson CI · 그룹 간 통계 비교는 시료 비교 화면"
        actions={<Segmented value={groupBy} onChange={setGroupBy} options={[{ value: "sample_id", label: "시료" }, { value: "location", label: "채취 지점" }]} />}>
        <div className="overflow-auto">
          <table className="data">
            <thead><tr><th>{groupBy === "sample_id" ? "시료" : "채취 지점"}</th><th className="num">유효 입자</th><th className="num">검출 비율</th><th className="num">95% CI</th>{settings.targetElements.map((e) => <th key={e} className="num">{e}</th>)}</tr></thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.group}>
                  <td>{g.group}</td><td className="num">{g.particles}</td><td className="num"><Pct k={g.positive} n={g.determinable} /></td>
                  <td className="num">{g.ratio.ci ? `${(g.ratio.ci.lo * 100).toFixed(1)}–${(g.ratio.ci.hi * 100).toFixed(1)}%` : "—"}</td>
                  {settings.targetElements.map((e) => <td key={e} className="num text-[12.5px]">{g.perElement[e].evaluable ? `${g.perElement[e].detected}/${g.perElement[e].evaluable}` : "—"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[13px] text-ink-3 mt-2">원소 칸 = 검출 입자 / 판정 가능 입자. 표본 수가 작은 그룹의 비율은 신뢰구간이 넓습니다.</p>
      </Card>

      <Card title="계산하지 않는 지표" subtitle="아래 지표는 필요한 자료가 없어 분석 불가로 표시합니다 — 입자별 wt%로 추정하지 않습니다" className="mb-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {massConcentrationAssessment().map((m) => (
            <div key={m.metric} className="border border-line rounded-[3px] p-3">
              <div className="flex items-center gap-2"><span className="text-[12.5px] font-semibold border border-line-2 rounded px-1.5 py-px bg-surface-2">분석 불가</span><b className="text-[14px]">{m.metric}</b></div>
              <ul className="list-disc pl-5 mt-1.5 text-[13.5px] text-ink-2 space-y-0.5">{m.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <div className="text-[14px] font-medium mb-1">보고된 PM 측정값(업로드한 경우)</div>
          {data.pm.filter((r) => r.pm25 != null || r.pm10 != null).length === 0 ? (
            <p className="text-[13.5px] text-ink-2">업로드된 PM 측정값이 없습니다{data.pm.length ? `(파일은 있으나 값이 비어 있음: ${data.pm.length}행)` : ""}. 측정값은 입자 분석에서 유도하지 않습니다.</p>
          ) : (
            <table className="data"><thead><tr><th>시료</th><th>위치</th><th>날짜</th><th className="num">PM2.5</th><th className="num">PM10</th><th>단위</th><th>방법</th><th>출처</th></tr></thead>
              <tbody>{data.pm.map((r, i) => <tr key={i}><td>{r.sample_id ?? "—"}</td><td>{r.collection_location ?? "—"}</td><td>{r.collection_date ?? "—"}</td><td className="num">{r.pm25 ?? "—"}</td><td className="num">{r.pm10 ?? "—"}</td><td>{r.unit ?? "단위 미상"}</td><td>{r.method ?? "—"}</td><td>{r.source ?? r.sourceFile}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </Card>
    </>
  );
}
