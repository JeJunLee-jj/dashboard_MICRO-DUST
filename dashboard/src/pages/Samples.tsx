import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ErrorBar, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore } from "../state/store";
import { FilterBar } from "../components/FilterBar";
import { NoData } from "../components/NoData";
import { ChartCard } from "../components/ChartCard";
import { Heatmap } from "../components/Heatmap";
import { Card, Formula, Legend, Notice, PageHeader, Pct, Segmented } from "../components/ui";
import { axisProps, gridProps, pctTick, tip } from "../components/chartKit";
import { compareGroupsBy, type GroupField, type GroupRow } from "../lib/samples";
import { MORPHOLOGY_CLASSES, morphologyLabel } from "../lib/morphology";
import { OTHER_COLOR, SERIES, seqColor } from "../lib/palette";

export function SamplesPage() {
  const { particles, filtered, settings, rules, data, setFilters, navigate } = useStore();
  const [field, setField] = useState<GroupField>("sample_id");
  const cmp = useMemo(() => compareGroupsBy(filtered, field, settings, rules, data.pm), [filtered, field, settings, rules, data.pm]);
  const typeLabels = useMemo(() => [...rules.particleTypes.map((t) => t.label), "기타/미분류", "분류 불가(wt% 없음)"], [rules]);

  if (!particles.length) return (<><PageHeader title="시료 및 채취 지점 비교" /><NoData /></>);
  const rows = cmp.rows;
  const hasBackground = rows.some((r) => /배경|background|외기|외부/i.test(r.sampleType ?? ""));
  const typeColor = (t: string, i: number) => (t === "기타/미분류" ? OTHER_COLOR : t.startsWith("분류 불가") ? "#d5dad8" : SERIES[i] ?? OTHER_COLOR);
  const typeData = rows.map((r) => {
    const o: Record<string, number | string> = { group: r.group, n: r.valid };
    for (const t of typeLabels) { o[t] = r.types[t] ?? 0; o[`${t}%`] = r.valid ? ((r.types[t] ?? 0) / r.valid) * 100 : 0; }
    return o;
  });

  return (
    <>
      <PageHeader title="시료 및 채취 지점 비교" description="시료(또는 채취 지점)별로 대상 원소 검출 비율, 원소별 검출 빈도, 입자 유형·형상 구성을 비교합니다."
        actions={<Segmented label="비교 단위" value={field} onChange={setField} options={[{ value: "sample_id", label: "시료 ID" }, { value: "location", label: "채취 지점" }]} />} />
      <FilterBar />
      <div className="space-y-2 mb-4">
        {!hasBackground && <Notice kind="info" title="배경 시료 없음">sample_type에 '배경'(외기) 시료가 표시되지 않았습니다. 외부 대기 유입과 역사 내 발생원을 구분하려면 동시간대 외부 배경 시료와 비교해야 합니다.</Notice>}
        <Formula title="비교 방법">
          그룹별 대상 원소 검출 입자 비율 = 검출 입자 ÷ 판정 가능 입자, 95% Wilson 신뢰구간. 두 그룹 비교는 Fisher 정확검정(양측)이며 여러 쌍을 비교하므로 Holm 보정 p값을 함께 표시합니다(각 그룹 판정 가능 입자 3개 이상일 때만).
          입자 선정이 그룹마다 다르게 이루어졌다면 차이는 선정 방식의 영향일 수 있습니다.
        </Formula>
      </div>

      <Card className="mb-4" title="그룹 요약" subtitle="필터 적용 후">
        <div className="overflow-auto">
          <table className="data">
            <thead><tr><th>{field === "sample_id" ? "시료" : "채취 지점"}</th><th>위치/시료 정보</th><th>채취일</th><th>시료 유형</th><th className="num">입자</th><th className="num">유효 EDS</th><th className="num">대상 원소 검출 비율</th><th className="num">95% CI</th><th>PM 측정값(보고값)</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.group} className="cursor-pointer" onClick={() => { setFilters((f) => (field === "sample_id" ? { ...f, samples: [r.group] } : { ...f, locations: [r.group] })); navigate({ page: "overview" }); }}>
                  <td className="font-medium text-accent">{r.group}</td>
                  <td className="text-[12px]">{field === "sample_id" ? r.location ?? "—" : [...new Set(filtered.filter((p) => (p.location ?? "(위치 미기재)") === r.group).map((p) => p.sample_id))].join(", ")}</td>
                  <td className="tnum text-[12px]">{r.dates.join(", ") || "—"}</td>
                  <td className="text-[12px]">{r.sampleType ?? "—"}</td>
                  <td className="num">{r.particles}</td><td className="num">{r.valid}</td>
                  <td className="num"><Pct k={r.positive} n={r.determinable} /></td>
                  <td className="num">{r.ci ? `${(r.ci.lo * 100).toFixed(1)}–${(r.ci.hi * 100).toFixed(1)}%` : "—"}</td>
                  <td className="text-[12px]">{r.pm.filter((x) => x.pm25 != null || x.pm10 != null).map((x) => `PM2.5 ${x.pm25 ?? "—"} / PM10 ${x.pm10 ?? "—"} ${x.unit ?? "단위 미상"}`).join("; ") || "없음"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-ink-3 mt-2">행을 누르면 그 그룹만 필터한 종합 대시보드로 이동합니다. PM 값은 업로드한 측정값을 그대로 보여주며 입자 분석 결과와 합산·환산하지 않습니다.</p>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <ChartCard title="그룹별 대상 원소 검출 입자 비율" subtitle="판정 가능 입자 기준 · 오차막대 95% Wilson CI"
          table={<table className="data"><thead><tr><th>그룹</th><th className="num">검출/판정 가능</th></tr></thead><tbody>{rows.map((r) => <tr key={r.group}><td>{r.group}</td><td className="num">{r.positive}/{r.determinable}</td></tr>)}</tbody></table>}>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <BarChart data={rows.map((r) => ({ ...r, pct: (r.ratio ?? 0) * 100, err: r.ci ? [((r.ratio ?? 0) - r.ci.lo) * 100, (r.ci.hi - (r.ratio ?? 0)) * 100] : [0, 0] }))} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="group" {...axisProps} interval={0} tick={{ fontSize: 11, fill: "#5f6b68" }} />
                <YAxis {...axisProps} domain={[0, 100]} tickFormatter={pctTick} width={42} />
                <Tooltip cursor={{ fill: "#eef3f1" }} content={tip<GroupRow & { pct: number }>((d) => ({ title: d.group, lines: [`${d.positive}/${d.determinable} 입자`, d.ci ? `${d.pct.toFixed(1)}% (95% CI ${(d.ci.lo * 100).toFixed(1)}–${(d.ci.hi * 100).toFixed(1)}%)` : "판정 가능 입자 없음"] }))} />
                <Bar dataKey="pct" fill={SERIES[0]} radius={[4, 4, 0, 0]} barSize={30} isAnimationActive={false}><ErrorBar dataKey="err" stroke="#5f6b68" width={5} /></Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <Card title="그룹 간 비교 (대상 원소 검출 입자 비율)" subtitle="Fisher 정확검정 · Holm 보정">
          {cmp.pairwise.length === 0 ? <p className="text-[13px] text-ink-2">비교할 수 있는 그룹 쌍이 없습니다(각 그룹 판정 가능 입자 3개 이상 필요).</p> : (
            <table className="data">
              <thead><tr><th>그룹 A</th><th>그룹 B</th><th className="num">A 비율</th><th className="num">B 비율</th><th className="num">p</th><th className="num">Holm 보정 p</th><th>판단</th></tr></thead>
              <tbody>{cmp.pairwise.map((x) => {
                const A = rows.find((r) => r.group === x.a)!, B = rows.find((r) => r.group === x.b)!;
                return (
                  <tr key={x.a + x.b}>
                    <td>{x.a}</td><td>{x.b}</td>
                    <td className="num">{((A.ratio ?? 0) * 100).toFixed(1)}%</td><td className="num">{((B.ratio ?? 0) * 100).toFixed(1)}%</td>
                    <td className="num">{x.p.toPrecision(2)}</td><td className="num">{x.pAdj.toPrecision(2)}</td>
                    <td className="text-[12px]">{x.pAdj < 0.05 ? "보정 후 p < 0.05" : "차이 확인 안 됨"}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
          <p className="text-[12px] text-ink-3 mt-2">'차이 확인 안 됨'은 차이가 없다는 뜻이 아니라 현재 표본으로 차이를 확인할 수 없다는 뜻입니다.</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <ChartCard title="그룹 × 대상 원소 검출 빈도" subtitle="칸 = 검출 입자 / 판정 가능 입자 비율(%)">
          <Heatmap rows={rows.map((r) => ({ key: r.group, label: `${r.group} (n=${r.valid})` }))} cols={settings.targetElements.map((e) => ({ key: e, label: e }))} rowLabelW={150} cellW={44}
            cell={(g, e) => {
              const r = rows.find((x) => x.group === g)!;
              const v = r.perElement[e];
              if (!v?.evaluable) return null;
              const t = v.detected / v.evaluable;
              return { color: seqColor(t), dark: t > 0.55, text: `${Math.round(t * 100)}`, tooltip: `${g} · ${e}\n검출 ${v.detected}/${v.evaluable} (${(t * 100).toFixed(1)}%)` };
            }} />
        </ChartCard>

        <ChartCard title="그룹별 입자 유형(조성 규칙) 구성" subtitle="유효 입자 내 비율(100% 누적) · 규칙 기반 후보"
          table={<table className="data"><thead><tr><th>그룹</th>{typeLabels.map((t) => <th key={t} className="num">{t}</th>)}</tr></thead><tbody>{typeData.map((r) => <tr key={r.group as string}><td>{r.group}</td>{typeLabels.map((t) => <td key={t} className="num">{r[t]}</td>)}</tr>)}</tbody></table>}>
          <Legend items={typeLabels.map((t, i) => ({ label: t, color: typeColor(t, i) }))} />
          <div style={{ height: Math.max(160, rows.length * 38 + 40) }} className="mt-1">
            <ResponsiveContainer>
              <BarChart data={typeData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid {...gridProps} horizontal={false} vertical />
                <XAxis type="number" domain={[0, 100]} allowDataOverflow ticks={[0, 25, 50, 75, 100]} {...axisProps} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="group" {...axisProps} width={110} tick={{ fontSize: 11, fill: "#5f6b68" }} />
                <Tooltip cursor={{ fill: "#eef3f1" }} content={tip<Record<string, number | string>>((d) => ({ title: `${d.group} (유효 ${d.n})`, lines: typeLabels.filter((t) => (d[t] as number) > 0).map((t) => `${t}: ${d[t]}개 (${(d[`${t}%`] as number).toFixed(0)}%)`) }))} />
                {typeLabels.map((t, i) => <Bar key={t} dataKey={`${t}%`} stackId="a" fill={typeColor(t, i)} stroke="#fff" strokeWidth={1} barSize={18} isAnimationActive={false} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <Card title="그룹별 형상 구성" subtitle="입자 수(유효 여부와 무관)">
        <div className="overflow-auto">
          <table className="data">
            <thead><tr><th>그룹</th>{[...MORPHOLOGY_CLASSES, "none"].map((m) => <th key={m} className="num">{morphologyLabel(m)}</th>)}</tr></thead>
            <tbody>{rows.map((r) => <tr key={r.group}><td>{r.group}</td>{[...MORPHOLOGY_CLASSES, "none"].map((m) => <td key={m} className="num">{r.morph[m] ?? 0}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
