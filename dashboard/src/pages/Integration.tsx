import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore } from "../state/store";
import { FilterBar } from "../components/FilterBar";
import { NoData } from "../components/NoData";
import { ChartCard } from "../components/ChartCard";
import { Heatmap } from "../components/Heatmap";
import { Card, Formula, Legend, Notice, PageHeader, fmtNum } from "../components/ui";
import { axisProps, gridProps, tip } from "../components/chartKit";
import { evaluateHypotheses, morphologyCross, elementCountDistribution } from "../lib/integration";
import { elementSummaries } from "../lib/composition";
import { classifyParticleType, sourceCandidates } from "../lib/rules";
import { MORPHOLOGY_CLASSES, morphologyLabel } from "../lib/morphology";
import { OTHER_COLOR, SERIES, seqColor, INK_BAR } from "../lib/palette";

export function IntegrationPage() {
  const { particles, filtered, settings, rules, navigate, setFilters } = useStore();
  const [qEl, setQEl] = useState("Fe");

  const elements = useMemo(() => {
    const top = elementSummaries(filtered, settings).filter((s) => s.detected > 0).sort((a, b) => b.detected - a.detected).map((s) => s.symbol);
    return [...new Set([...settings.targetElements.filter((e) => top.includes(e)), ...top.filter((e) => e !== "C" && e !== "O").slice(0, 8)])];
  }, [filtered, settings]);
  const cross = useMemo(() => morphologyCross(filtered, [...new Set([...elements, "C", "O"])], settings, "wt"), [filtered, elements, settings]);
  const hyps = useMemo(() => evaluateHypotheses(filtered, settings, elementSummaries(filtered, settings).filter((s) => s.detected > 0).map((s) => s.symbol)), [filtered, settings]);
  const countDist = useMemo(() => elementCountDistribution(filtered, settings), [filtered, settings]);

  const typeLabels = useMemo(() => [...rules.particleTypes.map((t) => t.label), "기타/미분류", "분류 불가(wt% 없음)"], [rules]);
  const typeCross = useMemo(() => {
    const valid = filtered.filter((p) => p.edsValid);
    return [...MORPHOLOGY_CLASSES, "none"].map((m) => {
      const ps = valid.filter((p) => (p.morphology ?? "none") === m);
      const row: Record<string, number | string> = { key: m, label: morphologyLabel(m), n: ps.length };
      for (const t of typeLabels) row[t] = 0;
      for (const p of ps) {
        const l = classifyParticleType(p, settings, rules).label;
        row[l] = ((row[l] as number) ?? 0) + 1;
      }
      for (const t of typeLabels) row[`${t}%`] = ps.length ? ((row[t] as number) / ps.length) * 100 : 0;
      return row;
    }).filter((r) => (r.n as number) > 0);
  }, [filtered, settings, rules, typeLabels]);
  const typeColor = (t: string, i: number) => (t === "기타/미분류" ? OTHER_COLOR : t.startsWith("분류 불가") ? "#d9d5cc" : SERIES[i] ?? OTHER_COLOR);

  const sourceTable = useMemo(() => {
    const m = new Map<string, { both: number; elementOnly: number }>();
    let none = 0, noWt = 0;
    const valid = filtered.filter((p) => p.edsValid);
    for (const p of valid) {
      const r = sourceCandidates(p, settings, rules);
      if (r.summaryLabel.includes("wt%")) noWt++;
      else if (!r.matches.length) none++;
      for (const mt of r.matches) {
        const cur = m.get(mt.candidate) ?? { both: 0, elementOnly: 0 };
        if (mt.level === "원소 조건 + 보조 근거") cur.both++;
        else cur.elementOnly++;
        m.set(mt.candidate, cur);
      }
    }
    const composite = valid.filter((p) => sourceCandidates(p, settings, rules).composite).length;
    return { rows: [...m.entries()], none, noWt, composite, n: valid.length };
  }, [filtered, settings, rules]);

  if (!particles.length) return (<><PageHeader title="형태–성분 통합 분석" /><NoData /></>);

  return (
    <>
      <PageHeader title="형태–성분 통합 분석" description="입자 형상과 EDS 원소 조성을 연결해 입자 유형을 탐색합니다. 아래 가설은 미리 정한 결론이 아니라 실제 데이터에서 관찰되는지 검정하는 대상입니다." />
      <FilterBar />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
        <Formula title="분류 방식">
          형상: 메타데이터 판정값 또는 사용자 판정(이미지 지표는 후보 제안만). 입자 유형·발생원: <b>규칙 기반</b>(조성 임계값, 규칙 파일 {rules.version}). 통계·머신러닝 자동 분류는 구현하지 않았습니다.
        </Formula>
        <Formula title="통계 검정">
          형상 그룹 vs 그 밖의 형상 분류 입자의 원소 검출 빈도 비교 — Fisher 정확검정(양측), 같은 가설 안의 원소들에 Holm 보정. 각 그룹 3개 이상일 때만 검정.
        </Formula>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-4">
        <ChartCard title="형상 × 원소 검출 빈도" subtitle="칸 = 해당 형상 유효 입자 중 검출 비율(검출/판정 가능) · 칸을 누르면 해당 입자 목록">
          {cross.length === 0 ? <div className="text-[14px] text-ink-2 py-6 text-center">유효 입자가 없습니다.</div> : (
            <Heatmap
              rows={cross.map((r) => ({ key: r.morphology, label: `${r.label} (n=${r.n})` }))}
              cols={[...new Set([...elements, "C", "O"])].map((e) => ({ key: e, label: e }))}
              rowLabelW={150} cellW={44}
              cell={(r, c) => {
                const row = cross.find((x) => x.morphology === r)!;
                const v = row.perElement[c];
                if (!v?.evaluable) return null;
                const t = v.detected / v.evaluable;
                return { color: seqColor(t), dark: t > 0.55, text: `${Math.round(t * 100)}`, tooltip: `${row.label} · ${c}\n검출 ${v.detected}/${v.evaluable} (${(t * 100).toFixed(1)}%)`, onClick: () => { setFilters((f) => ({ ...f, morphologies: [r], element: c })); navigate({ page: "particles" }); } };
              }}
            />
          )}
          <p className="text-[13px] text-ink-3 mt-2">숫자 = 검출 비율(%). 형상 그룹 간 차이의 유의성은 아래 가설 검정을 보세요.</p>
        </ChartCard>

        <ChartCard title="형상별 입자 유형(조성 규칙) 구성" subtitle="유효 입자 · 각 형상 그룹 안의 비율(100% 누적) · 입자 유형은 규칙 기반 후보"
          table={<table className="data"><thead><tr><th>형상</th><th className="num">n</th>{typeLabels.map((t) => <th key={t} className="num">{t}</th>)}</tr></thead><tbody>{typeCross.map((r) => <tr key={r.key as string}><td>{r.label}</td><td className="num">{r.n}</td>{typeLabels.map((t) => <td key={t} className="num">{r[t]}</td>)}</tr>)}</tbody></table>}>
          <Legend items={typeLabels.map((t, i) => ({ label: t, color: typeColor(t, i) }))} />
          <div style={{ height: Math.max(180, typeCross.length * 36 + 40) }} className="mt-1">
            <ResponsiveContainer>
              <BarChart data={typeCross} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid {...gridProps} horizontal={false} vertical />
                <XAxis type="number" domain={[0, 100]} allowDataOverflow ticks={[0, 25, 50, 75, 100]} {...axisProps} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="label" {...axisProps} width={120} />
                <Tooltip cursor={{ fill: "#ebe7de" }} content={tip<Record<string, number | string>>((d) => ({ title: `${d.label} (n=${d.n})`, lines: typeLabels.filter((t) => (d[t] as number) > 0).map((t) => `${t}: ${d[t]}개 (${(d[`${t}%`] as number).toFixed(0)}%)`) }))} />
                {typeLabels.map((t, i) => <Bar key={t} dataKey={`${t}%`} stackId="a" fill={typeColor(t, i)} stroke="#fff" strokeWidth={1} isAnimationActive={false} barSize={18} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <Card className="mb-4" title="형상별 원소 조성(wt%) 비교" subtitle="검출되고 wt% 값이 있는 입자만 · 중앙값 [Q1–Q3] (n) · 표본이 작으면 차이를 해석하지 마세요"
        actions={<select className="border border-line-2 rounded px-1.5 py-0.5 text-[13.5px]" value={qEl} onChange={(e) => setQEl(e.target.value)}>{[...new Set([...elements, "C", "O"])].map((e) => <option key={e}>{e}</option>)}</select>}>
        <div className="overflow-auto">
          <table className="data">
            <thead><tr><th>형상</th><th className="num">유효 입자</th><th className="num">{qEl} 검출/판정 가능</th><th className="num">{qEl} wt% 중앙값 [Q1–Q3]</th><th className="num">평균 ± SD</th><th className="num">정량 n</th></tr></thead>
            <tbody>
              {cross.map((r) => {
                const q = r.quant[qEl], c = r.perElement[qEl];
                return (
                  <tr key={r.morphology}>
                    <td>{r.label}</td><td className="num">{r.n}</td><td className="num">{c ? `${c.detected}/${c.evaluable}` : "—"}</td>
                    <td className="num">{q?.n ? `${fmtNum(q.median)} [${fmtNum(q.q1)}–${fmtNum(q.q3)}]` : "—"}</td>
                    <td className="num">{q?.n ? `${fmtNum(q.mean)} ± ${q.sd != null ? fmtNum(q.sd) : "—"}` : "—"}</td>
                    <td className="num">{q?.n ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <h2 className="text-[17px] font-semibold mb-2">분석 가설 검토</h2>
      <Notice kind="info">각 가설을 <b>관측 사실</b>(실제 개수), <b>통계적 관계</b>(검정 결과), <b>해석 가설</b>(가능한 형성 과정·발생원), <b>확인되지 않은 사항</b>으로 나누어 표시합니다. 해석 가설은 문헌상 가능성이며 이 데이터로 입증된 것이 아닙니다.</Notice>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mt-3 mb-4">
        {hyps.map((h) => (
          <Card key={h.id} title={h.title} subtitle={`${h.groupLabel} ${h.groupN}개 vs ${h.restLabel} ${h.restN}개`}>
            {!h.available ? <p className="text-[14px] text-ink-2">현재 데이터(필터)에 해당 그룹 입자가 없어 검토할 수 없습니다.</p> : (
              <div className="space-y-2.5 text-[13.5px]">
                <Section title="1. 관측 사실" items={h.observed} />
                <Section title="2. 통계적 관계" items={h.statistical} />
                <Section title="3. 해석 가설(검증 필요)" items={h.interpretation} muted />
                <Section title="4. 확인되지 않은 사항" items={h.unconfirmed} muted />
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <ChartCard title="복합 입자 분포: 입자별 검출 원소 수" subtitle="C·O를 제외하고 '검출'된 원소 종류 수 · 유효 입자 · 여러 원소가 함께 나타나는 입자의 분포"
          table={<table className="data"><thead><tr><th>검출 원소 수</th><th className="num">입자 수</th></tr></thead><tbody>{countDist.map((d) => <tr key={d.k}><td>{d.k}</td><td className="num">{d.particles}</td></tr>)}</tbody></table>}>
          <div className="h-[220px]">
            <ResponsiveContainer>
              <BarChart data={countDist} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="k" {...axisProps} label={{ value: "검출 원소 수(C·O 제외)", position: "insideBottom", offset: -2, fontSize: 11, fill: "#4a4945" }} height={36} />
                <YAxis {...axisProps} allowDecimals={false} width={32} />
                <Tooltip cursor={{ fill: "#ebe7de" }} content={tip<{ k: number; particles: number }>((d) => ({ title: `원소 ${d.k}종 검출`, lines: [`${d.particles} 입자`] }))} />
                <Bar dataKey="particles" fill={INK_BAR} radius={[4, 4, 0, 0]} barSize={22} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <Card title="발생원 후보 집계" subtitle={`유효 입자 ${sourceTable.n}개 · 한 입자가 여러 후보와 일치할 수 있어 합계가 입자 수보다 클 수 있음`}>
          <table className="data">
            <thead><tr><th>후보 발생원</th><th className="num">원소+보조 근거</th><th className="num">원소 조건만</th></tr></thead>
            <tbody>
              {sourceTable.rows.map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{v.both}</td><td className="num">{v.elementOnly}</td></tr>)}
              <tr><td>복합 기원 후보(2개 이상 후보 일치)</td><td className="num" colSpan={2}>{sourceTable.composite}</td></tr>
              <tr><td>발생원 판별 불가(일치 규칙 없음)</td><td className="num" colSpan={2}>{sourceTable.none}</td></tr>
              <tr><td>판별 불가(wt% 없음)</td><td className="num" colSpan={2}>{sourceTable.noWt}</td></tr>
              <tr><td>외부 대기 유입</td><td colSpan={2} className="text-[13px] text-ink-2">개별 입자로 판별 불가 — 배경(외기) 시료와의 분포 비교 필요(시료 비교 화면)</td></tr>
            </tbody>
          </table>
          <p className="text-[13px] text-ink-3 mt-2">Fe 검출만으로 철도 마찰 분진이라고 하지 않습니다. 후보별 근거·대안적 설명·추가 검증 데이터는 입자 상세 화면에, 규칙은 분석 설정 화면에 있습니다.</p>
        </Card>
      </div>
    </>
  );
}

function Section({ title, items, muted }: { title: string; items: string[]; muted?: boolean }) {
  return (
    <div>
      <div className="font-semibold text-ink mb-0.5">{title}</div>
      <ul className={`list-disc pl-5 space-y-0.5 ${muted ? "text-ink-2" : ""}`}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}
