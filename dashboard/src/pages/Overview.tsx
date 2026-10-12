import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ErrorBar, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore } from "../state/store";
import { FilterBar } from "../components/FilterBar";
import { NoData } from "../components/NoData";
import { ChartCard } from "../components/ChartCard";
import { Heatmap } from "../components/Heatmap";
import { Card, Formula, Kpi, Legend, LevelBadge, Notice, PageHeader, Pct, Segmented, fmtNum } from "../components/ui";
import { axisProps, gridProps, pctTick, tip } from "../components/chartKit";
import { computeKpis } from "../lib/filters";
import { hazardSummary, HAZARD_DISCLAIMER } from "../lib/hazard";
import { donutData, frequencyBars, morphologyDistribution, OTHER_KEY, type FrequencyBar, type MorphologyBar } from "../lib/viewModels";
import { SERIES, OTHER_COLOR, elementColor, seqColor } from "../lib/palette";
import { classifyParticleType, sourceCandidates } from "../lib/rules";
import { followUps } from "../lib/limitations";
import { compareGroupsBy, type GroupRow } from "../lib/samples";
import type { Basis } from "../lib/types";
import { elementNameKo } from "../lib/elements";

export function OverviewPage() {
  const s = useStore();
  const { filtered, settings, hazardRules, rules, colorOrder, origin, navigate, setFilters, data, unmatched } = s;
  const [basis, setBasis] = useState<Basis>(settings.displayBasis);

  const kpi = useMemo(() => computeKpis(filtered, settings), [filtered, settings]);
  const hz = useMemo(() => hazardSummary(filtered, settings, hazardRules), [filtered, settings, hazardRules]);
  const donut = useMemo(() => donutData(filtered, basis, colorOrder), [filtered, basis, colorOrder]);
  const morph = useMemo(() => morphologyDistribution(filtered), [filtered]);
  const freq = useMemo(() => frequencyBars(filtered, settings, settings.targetElements), [filtered, settings]);
  const groups = useMemo(() => compareGroupsBy(filtered, "sample_id", settings, rules, data.pm).rows, [filtered, settings, rules, data.pm]);
  const types = useMemo(() => {
    const t = new Map<string, number>(), src = new Map<string, number>();
    for (const p of filtered) {
      if (!p.edsValid) continue;
      const a = classifyParticleType(p, settings, rules).label;
      t.set(a, (t.get(a) ?? 0) + 1);
      const b = sourceCandidates(p, settings, rules).summaryLabel;
      src.set(b, (src.get(b) ?? 0) + 1);
    }
    return { types: [...t.entries()].sort((a, b) => b[1] - a[1]), sources: [...src.entries()].sort((a, b) => b[1] - a[1]) };
  }, [filtered, settings, rules]);
  const todo = useMemo(() => followUps(filtered, data.eds, settings, hazardRules, unmatched), [filtered, data.eds, settings, hazardRules, unmatched]);

  if (!s.particles.length) {
    return (
      <>
        <PageHeader title="종합 대시보드" description="SEM 이미지와 EDS 원소 분석을 통합해 입자의 형태, 원소 조성, 위해성 평가 대상 원소의 분포를 봅니다." />
        <NoData />
      </>
    );
  }
  const demo = origin === "demo";
  const issues = s.allIssues;
  const issueCount = { error: issues.filter((i) => i.level === "error").length, warning: issues.filter((i) => i.level === "warning").length };
  const basisLabel = basis === "wt" ? "wt%(중량%)" : "at%(원자%)";
  const morphTargets = settings.targetElements.filter((e) => hz.elementStats.find((x) => x.symbol === e && x.detected > 0));

  return (
    <>
      <PageHeader
        title="종합 대시보드"
        description="모든 값은 필터를 적용한 입자에서 다시 계산됩니다. 그래프의 막대·칸을 누르면 해당 입자 목록으로 이동합니다."
      />
      <FilterBar />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Kpi label="총 분석 입자 수" value={kpi.total.toLocaleString()} unit="개" demo={demo} detail="메타데이터 또는 EDS가 있는 입자" onClick={() => navigate({ page: "particles" })} />
        <Kpi label="유효 EDS 분석 입자 수" value={kpi.validEds.toLocaleString()} unit="개" demo={demo} detail={<>전체의 <Pct k={kpi.validEds} n={kpi.total} /> · EDS 기록이 있고 제외 조건에 해당하지 않음</>} />
        <Kpi label="검출된 원소 종류 수" value={kpi.elementKinds} unit="종" demo={demo} detail="유효 입자에서 '검출'로 판정된 원소" onClick={() => navigate({ page: "eds" })} />
        <Kpi
          label="대상 원소 검출 입자 비율"
          value={kpi.targetRatio == null ? "—" : `${(kpi.targetRatio * 100).toFixed(1)}`}
          unit={kpi.targetRatio == null ? undefined : "%"}
          demo={demo}
          onClick={() => navigate({ page: "hazard" })}
          detail={<>{kpi.targetPositive} / {kpi.targetDeterminable} 입자{hz.targetRatio.ci && <> · 95% CI {(hz.targetRatio.ci.lo * 100).toFixed(1)}–{(hz.targetRatio.ci.hi * 100).toFixed(1)}%</>}{kpi.targetUndetermined > 0 && <> · 판정 불가 {kpi.targetUndetermined}</>}</>}
        />
        <Kpi label="형상 분류 완료 비율" value={kpi.morphRatio == null ? "—" : (kpi.morphRatio * 100).toFixed(1)} unit={kpi.morphRatio == null ? undefined : "%"} demo={demo} detail={<>{kpi.morphClassified} / {kpi.total} 입자 · 판별 불가 {kpi.morphUndetermined}</>} />
      </div>

      <div className="mb-4 space-y-2">
        <Formula>
          대상 원소 검출 입자 비율 = 대상 원소({settings.targetElements.join("·")}) 중 하나 이상 검출된 입자 수 ÷ 판정 가능한 유효 분석 입자 수 × 100
          = {kpi.targetPositive} ÷ {kpi.targetDeterminable}. 한 입자에 여러 대상 원소가 있어도 한 번만 셉니다. 대상 원소가 검출되지 않았으나 일부가 결측인 입자({kpi.targetUndetermined}개)는 분모에서 제외.
        </Formula>
        <Notice kind="warning">{HAZARD_DISCLAIMER}</Notice>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <ChartCard
          title="주요 원소 조성 분포"
          subtitle={`입자별 조성(${basisLabel})의 산술평균 · 미검출=0 · n=${donut.n} 입자 · 출처: EDS 성분표`}
          actions={<Segmented value={basis} onChange={setBasis} options={[{ value: "wt", label: "wt%" }, { value: "at", label: "at%" }]} />}
          table={<table className="data"><thead><tr><th>원소</th><th className="num">평균 {basisLabel}</th></tr></thead><tbody>{donut.slices.map((d) => <tr key={d.name}><td>{d.name}</td><td className="num">{fmtNum(d.value)}</td></tr>)}</tbody></table>}
        >
          {donut.n === 0 ? (
            <div className="h-[260px] grid place-items-center text-[13px] text-ink-2 text-center px-4">이 기준({basisLabel})의 정량값이 있는 유효 입자가 없습니다.<br />다른 기준을 선택하세요(값을 환산해 만들지 않음).</div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-[200px] h-[220px] shrink-0">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={donut.slices} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={1} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                      {donut.slices.map((d) => <Cell key={d.name} fill={d.name === OTHER_KEY ? OTHER_COLOR : elementColor(d.name, colorOrder)} />)}
                    </Pie>
                    <Tooltip content={tip<{ name: string; value: number }>((d) => ({ title: d.name === OTHER_KEY ? "기타 원소 합" : `${d.name} (${elementNameKo(d.name)})`, lines: [`평균 ${fmtNum(d.value)} ${basis === "wt" ? "wt%" : "at%"}`, `n = ${donut.n} 입자`] }))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="text-[12.5px] space-y-1 flex-1">
                {donut.slices.map((d) => (
                  <li key={d.name} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.name === OTHER_KEY ? OTHER_COLOR : elementColor(d.name, colorOrder) }} />
                    <span className="w-10 font-medium">{d.name}</span>
                    <span className="tnum text-ink-2">{fmtNum(d.value, 1)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="입자 형상별 분포"
          subtitle="입자 개수 · 분모: 필터된 전체 입자 · 출처: 메타데이터 형상 판정값/사용자 판정"
          table={<table className="data"><thead><tr><th>형상</th><th className="num">입자 수</th><th className="num">비율</th></tr></thead><tbody>{morph.map((m) => <tr key={m.key}><td>{m.label}</td><td className="num">{m.count}</td><td className="num">{((m.count / kpi.total) * 100).toFixed(1)}%</td></tr>)}</tbody></table>}
        >
          <div style={{ height: Math.max(180, morph.length * 34 + 30) }}>
            <ResponsiveContainer>
              <BarChart data={morph} layout="vertical" margin={{ left: 8, right: 36, top: 4, bottom: 4 }}>
                <CartesianGrid {...gridProps} horizontal={false} vertical />
                <XAxis type="number" {...axisProps} allowDecimals={false} />
                <YAxis type="category" dataKey="label" {...axisProps} width={120} />
                <Tooltip cursor={{ fill: "#eef3f1" }} content={tip<MorphologyBar>((d) => ({ title: d.label, lines: [`${d.count}개 / ${kpi.total}개 (${((d.count / kpi.total) * 100).toFixed(1)}%)`, "누르면 해당 입자 목록"] }))} />
                <Bar dataKey="count" fill={SERIES[0]} radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false} label={{ position: "right", fontSize: 12, fill: "#4a5754" }}
                  onClick={(d: { payload?: MorphologyBar }) => { if (d.payload) { setFilters((f) => ({ ...f, morphologies: [d.payload!.key] })); navigate({ page: "particles" }); } }} style={{ cursor: "pointer" }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="대상 원소 검출 빈도"
          subtitle="원소별 검출 입자 비율 · 분모: 그 원소를 판정할 수 있는 유효 입자(원소마다 다를 수 있음) · 오차막대 95% Wilson CI"
          table={<FreqTable rows={freq} />}
        >
          <div className="h-[240px]">
            <ResponsiveContainer>
              <BarChart data={freq} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="symbol" {...axisProps} />
                <YAxis {...axisProps} domain={[0, 100]} tickFormatter={pctTick} width={42} />
                <Tooltip cursor={{ fill: "#eef3f1" }} content={tip<FrequencyBar>((d) => ({ title: `${d.symbol} (${elementNameKo(d.symbol)})`, lines: [`검출 ${d.detected} / 판정 가능 ${d.evaluable} 입자`, `${d.frequencyPct.toFixed(1)}% (95% CI ${d.ciLoPct?.toFixed(1)}–${d.ciHiPct?.toFixed(1)}%)`, "누르면 이 원소가 검출된 입자 목록"] }))} />
                <Bar dataKey="frequencyPct" fill={SERIES[0]} radius={[4, 4, 0, 0]} barSize={18} isAnimationActive={false} style={{ cursor: "pointer" }}
                  onClick={(d: { payload?: FrequencyBar }) => { if (d.payload) { setFilters((f) => ({ ...f, element: d.payload!.symbol })); navigate({ page: "particles" }); } }}>
                  <ErrorBar dataKey={(d: FrequencyBar) => [d.frequencyPct - (d.ciLoPct ?? d.frequencyPct), (d.ciHiPct ?? d.frequencyPct) - d.frequencyPct]} stroke="#5f6b68" width={4} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <ChartCard
          title="형상과 대상 원소 검출의 관계"
          subtitle="칸 = 해당 형상 입자 중 원소가 검출된 비율(검출/판정 가능) · 검출된 대상 원소만 표시 · 관계의 통계 검정은 형태–성분 통합 분석 화면"
        >
          {hz.byMorphology.length === 0 || morphTargets.length === 0 ? (
            <div className="text-[13px] text-ink-2 py-8 text-center">표시할 형상·대상 원소 조합이 없습니다.</div>
          ) : (
            <>
              <Heatmap
                rows={hz.byMorphology.map((m) => ({ key: m.morphology, label: `${m.label} (n=${m.particles})` }))}
                cols={morphTargets.map((e) => ({ key: e, label: e }))}
                rowLabelW={150}
                cell={(r, c) => {
                  const row = hz.byMorphology.find((m) => m.morphology === r)!;
                  const v = row.perElement[c];
                  if (!v || !v.evaluable) return null;
                  const t = v.detected / v.evaluable;
                  return {
                    color: seqColor(t), dark: t > 0.55, text: `${Math.round(t * 100)}%`,
                    tooltip: `${row.label} · ${c}\n검출 ${v.detected} / 판정 가능 ${v.evaluable} 입자 (${(t * 100).toFixed(1)}%)\n누르면 해당 입자 목록`,
                    onClick: () => { setFilters((f) => ({ ...f, morphologies: [r], element: c })); navigate({ page: "particles" }); },
                  };
                }}
              />
              <div className="mt-2"><Legend items={[{ label: "0%", color: seqColor(0) }, { label: "50%", color: seqColor(0.5) }, { label: "100%", color: seqColor(1) }]} /></div>
            </>
          )}
        </ChartCard>

        <ChartCard
          title="시료별 대상 원소 검출 입자 비율"
          subtitle="막대 = 검출 입자 / 판정 가능 입자 · 오차막대 95% Wilson CI · 누르면 시료 비교 화면"
          table={<GroupTable rows={groups} />}
        >
          <div className="h-[240px]">
            <ResponsiveContainer>
              <BarChart data={groups.map((g) => ({ ...g, pct: (g.ratio ?? 0) * 100, err: g.ci ? [((g.ratio ?? 0) - g.ci.lo) * 100, (g.ci.hi - (g.ratio ?? 0)) * 100] : [0, 0] }))} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="group" {...axisProps} />
                <YAxis {...axisProps} domain={[0, 100]} tickFormatter={pctTick} width={42} />
                <Tooltip cursor={{ fill: "#eef3f1" }} content={tip<GroupRow & { pct: number }>((d) => ({ title: d.group, lines: [d.location ?? "", `대상 원소 검출 ${d.positive} / 판정 가능 ${d.determinable} 입자`, d.ratio == null ? "판정 가능 입자 없음" : `${d.pct.toFixed(1)}% (95% CI ${(d.ci!.lo * 100).toFixed(1)}–${(d.ci!.hi * 100).toFixed(1)}%)`] }))} />
                <Bar dataKey="pct" fill={SERIES[0]} radius={[4, 4, 0, 0]} barSize={28} isAnimationActive={false} style={{ cursor: "pointer" }} onClick={() => navigate({ page: "samples" })}>
                  <ErrorBar dataKey="err" stroke="#5f6b68" width={5} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <Card title="대상 원소별 검출 현황" subtitle="원소마다 분모(판정 가능 입자)가 다를 수 있습니다" className="xl:col-span-2">
          <div className="overflow-auto">
            <table className="data">
              <thead>
                <tr><th>원소</th><th className="num">검출</th><th className="num">정량한계 미만</th><th className="num">검출한계 미만</th><th className="num">미검출</th><th className="num">결측</th><th className="num">검출 빈도(검출/판정 가능)</th><th>평가 범주(참고)</th></tr>
              </thead>
              <tbody>
                {hz.elementStats.map((e) => (
                  <tr key={e.symbol}>
                    <td><b>{e.symbol}</b> <span className="text-ink-3 text-[12px]">{elementNameKo(e.symbol)}</span></td>
                    <td className="num">{e.detected - (settings.belowLoqCountsAsDetected ? e.belowLoq : 0)}</td>
                    <td className="num">{e.belowLoq}</td>
                    <td className="num">{e.belowLod}</td>
                    <td className="num">{e.notDetected}</td>
                    <td className="num">{e.missing}</td>
                    <td className="num"><Pct k={e.detected} n={e.evaluable} /></td>
                    <td className="text-[12px] text-ink-2">{e.rule ? (e.rule.reference_name ? e.rule.assessment_category : "근거 미입력") : "규칙 없음"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-ink-3 mt-2">'검출 빈도'의 검출 수에는 정량한계 미만이 {settings.belowLoqCountsAsDetected ? "포함됩니다" : "포함되지 않습니다"}(설정에서 변경). 평가 범주는 화학종 기준 참고 정보이며 입자 위해도 판정에 쓰지 않습니다.</p>
        </Card>

        <Card title="복수 대상 원소 동시 검출" subtitle="판정 가능 입자 기준">
          <div className="space-y-1.5 text-[13px]">
            <div className="flex justify-between"><span>2개 이상 동시 검출</span><span className="tnum">{hz.multi[2].ratio == null ? "—" : <Pct k={hz.multi[2].numerator} n={hz.multi[2].denominator} />}</span></div>
            <div className="flex justify-between"><span>3개 이상 동시 검출</span><span className="tnum">{hz.multi[3].ratio == null ? "—" : <Pct k={hz.multi[3].numerator} n={hz.multi[3].denominator} />}</span></div>
          </div>
          <div className="mt-3 text-[12.5px] font-medium text-ink-2">자주 나타난 조합</div>
          {hz.combos.length === 0 ? <p className="text-[12.5px] text-ink-3 mt-1">2개 이상 동시 검출된 입자가 없습니다.</p> : (
            <ul className="mt-1 space-y-1 text-[12.5px]">
              {hz.combos.slice(0, 6).map((c) => <li key={c.combo} className="flex justify-between"><span className="font-mono">{c.combo}</span><span className="tnum text-ink-2">{c.particles}개</span></li>)}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card title="입자 유형 및 발생원 후보" subtitle="규칙 기반 1차 선별 결과 — 확정이 아님 · 유효 입자 기준" actions={<a className="text-[12px] text-accent hover:underline" href="#/integration">자세히</a>}>
          <div className="text-[12.5px] font-medium text-ink-2 mb-1">입자 유형(조성 규칙)</div>
          <ul className="space-y-0.5 text-[12.5px] mb-3">{types.types.map(([k, v]) => <li key={k} className="flex justify-between"><span>{k}</span><span className="tnum text-ink-2">{v}</span></li>)}</ul>
          <div className="text-[12.5px] font-medium text-ink-2 mb-1">발생원 후보 요약</div>
          <ul className="space-y-0.5 text-[12.5px]">{types.sources.map(([k, v]) => <li key={k} className="flex justify-between"><span>{k}</span><span className="tnum text-ink-2">{v}</span></li>)}</ul>
        </Card>
        <Card title="데이터 품질 및 분석 한계" actions={<a className="text-[12px] text-accent hover:underline" href="#/data">품질 검증</a>}>
          <div className="flex gap-2 mb-2"><LevelBadge level="error" /> <span className="text-[13px] tnum">{issueCount.error}건</span><LevelBadge level="warning" /> <span className="text-[13px] tnum">{issueCount.warning}건</span></div>
          <ul className="text-[12.5px] text-ink-2 space-y-1 list-disc pl-4">
            <li>EDS 정량값은 측정 조건·입자 크기·기판 신호에 영향을 받는 반정량 값입니다.</li>
            <li>탄소 코팅·기판 신호 영향: {settings.preparationChecked ? "확인함(설정)" : <b className="text-ink">확인되지 않음</b>}</li>
            <li>입자 개수 비율 ≠ 질량 비율 ≠ 대기 농도. 질량 비율·PM 농도는 계산하지 않습니다(분석 불가).</li>
            <li>형상은 보조 지표이며, 발생원은 후보로만 제시합니다.</li>
          </ul>
        </Card>
        <Card title="추가 조사가 필요한 항목" subtitle="현재 데이터 상태에서 자동 정리">
          <ul className="text-[12.5px] space-y-1.5">
            {todo.slice(0, 8).map((t) => (
              <li key={t.item}><b className="text-ink">{t.item}</b>{t.count != null && <span className="tnum text-ink-3"> ({t.count})</span>} <span className="text-ink-2">— {t.detail}</span></li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function FreqTable({ rows }: { rows: FrequencyBar[] }) {
  return (
    <table className="data">
      <thead><tr><th>원소</th><th className="num">검출</th><th className="num">판정 가능</th><th className="num">빈도</th><th className="num">95% CI</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.symbol}><td>{r.symbol}</td><td className="num">{r.detected}</td><td className="num">{r.evaluable}</td><td className="num">{r.frequencyPct.toFixed(1)}%</td><td className="num">{r.ciLoPct?.toFixed(1)}–{r.ciHiPct?.toFixed(1)}%</td></tr>)}</tbody>
    </table>
  );
}

function GroupTable({ rows }: { rows: GroupRow[] }) {
  return (
    <table className="data">
      <thead><tr><th>시료</th><th className="num">입자</th><th className="num">검출/판정 가능</th><th className="num">비율</th><th className="num">95% CI</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.group}><td>{r.group}</td><td className="num">{r.particles}</td><td className="num">{r.positive}/{r.determinable}</td><td className="num">{r.ratio == null ? "—" : (r.ratio * 100).toFixed(1) + "%"}</td><td className="num">{r.ci ? `${(r.ci.lo * 100).toFixed(1)}–${(r.ci.hi * 100).toFixed(1)}%` : "—"}</td></tr>)}</tbody>
    </table>
  );
}
