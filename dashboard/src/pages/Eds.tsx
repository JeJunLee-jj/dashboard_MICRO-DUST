import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { useStore, hrefFor } from "../state/store";
import { FilterBar } from "../components/FilterBar";
import { NoData } from "../components/NoData";
import { ChartCard } from "../components/ChartCard";
import { Heatmap } from "../components/Heatmap";
import { Card, Legend, Notice, PageHeader, Segmented, fmtNum, Pct } from "../components/ui";
import { axisProps, gridProps, pctTick, tip } from "../components/chartKit";
import { cooccurrence, correlationMatrix, elementSummaries, elementsInData } from "../lib/composition";
import { elementStatus } from "../lib/join";
import { particleTargetResult } from "../lib/hazard";
import { compositionStack, OTHER_KEY } from "../lib/viewModels";
import { divColor, elementColor, OTHER_COLOR, SERIES, seqColor } from "../lib/palette";
import { elementNameKo } from "../lib/elements";
import type { Basis, Particle } from "../lib/types";

const go = (key: string) => (window.location.hash = hrefFor({ page: "particles", particleKey: key }));

export function EdsPage() {
  const { particles, filtered, settings, colorOrder, data } = useStore();
  const [basis, setBasis] = useState<Basis>(settings.displayBasis);
  const [method, setMethod] = useState<"spearman" | "pearson">("spearman");
  const bl = basis === "wt" ? "wt%" : "at%";

  const summaries = useMemo(() => elementSummaries(filtered, settings), [filtered, settings]);
  const byFreq = useMemo(() => [...summaries].filter((s) => s.detected > 0).sort((a, b) => b.detected - a.detected), [summaries]);
  const matrixEls = useMemo(() => byFreq.slice(0, 12).map((s) => s.symbol), [byFreq]);
  const corr = useMemo(() => correlationMatrix(filtered, settings, matrixEls, basis, method, 5), [filtered, settings, matrixEls, basis, method]);
  const co = useMemo(() => cooccurrence(filtered, settings, matrixEls), [filtered, settings, matrixEls]);
  const stack = useMemo(() => compositionStack(filtered, basis, colorOrder), [filtered, basis, colorOrder]);
  const allEls = useMemo(() => elementsInData(filtered), [filtered]);
  const [xEl, setXEl] = useState<string>("Fe");
  const [yEl, setYEl] = useState<string>("Si");

  if (!particles.length) return (<><PageHeader title="EDS 원소 조성 분석" /><NoData /></>);

  const valid = filtered.filter((p) => p.edsValid);
  const quantN = valid.filter((p) => (basis === "wt" ? p.wtSum : p.atSum) != null).length;
  const stackKeys = [...colorOrder.filter((e) => stack.some((r) => r[e] != null)), OTHER_KEY];

  return (
    <>
      <PageHeader
        title="EDS 원소 조성 분석"
        description="원소별 조성 통계, 검출 빈도, 입자 간 편차와 원소 간 관계. wt%와 at%는 서로 다른 기준이므로 한 번에 하나만 표시하고 섞지 않습니다."
        actions={<Segmented label="조성 기준" value={basis} onChange={setBasis} options={[{ value: "wt", label: "wt% (중량)" }, { value: "at", label: "at% (원자)" }]} />}
      />
      <FilterBar />
      <div className="space-y-2 mb-4">
        <Notice kind="info" title="EDS 정량값 해석 주의">
          정량값은 가속전압·작동거리·입자 크기와 두께·표면 상태에 영향을 받습니다. 탄소 코팅·기판 신호·표면 오염·검출한계의 영향은 {settings.preparationChecked ? "설정에서 '확인함'으로 표시되어 있습니다." : <b>확인되지 않았으므로 분석 한계로 둡니다.</b>} 정량 통계는 상태가 '검출'이고 해당 기준 값이 있는 입자만 사용합니다(정량한계 미만 제외).
        </Notice>
        {quantN === 0 && <Notice kind="warning">현재 필터의 유효 입자 중 {bl} 값이 있는 입자가 없습니다. 다른 기준을 선택하세요. {bl} 값을 다른 기준에서 환산해 만들지 않습니다.</Notice>}
      </div>

      <Card title={`원소별 조성 통계 (${bl})`} subtitle={`유효 EDS 입자 ${valid.length}개 · 검출 빈도 분모 = 원소별 판정 가능 입자 · 정량 통계 n = 검출되고 ${bl} 값이 있는 입자 · 표준편차는 표본표준편차(n−1) · 사분위수는 선형보간`} className="mb-4">
        <div className="overflow-auto max-h-[420px]">
          <table className="data">
            <thead>
              <tr><th>원소</th><th className="num">검출 빈도</th><th className="num">정량 n</th><th className="num">평균</th><th className="num">중앙값</th><th className="num">표준편차</th><th className="num">Q1–Q3</th><th className="num">최소–최대</th><th className="num">변동계수</th><th className="num">LOQ 미만</th><th className="num">LOD 미만</th><th className="num">결측</th></tr>
            </thead>
            <tbody>
              {summaries.map((s) => {
                const d = basis === "wt" ? s.wt : s.at;
                return (
                  <tr key={s.symbol}>
                    <td><b>{s.symbol}</b> <span className="text-[11.5px] text-ink-3">{elementNameKo(s.symbol)}</span>{settings.targetElements.includes(s.symbol) && <span className="ml-1 text-[10.5px] border border-line-2 rounded px-1 text-ink-2">대상</span>}</td>
                    <td className="num"><Pct k={s.detected} n={s.evaluable} /></td>
                    <td className="num">{d.n}</td>
                    <td className="num">{fmtNum(d.mean)}</td>
                    <td className="num">{fmtNum(d.median)}</td>
                    <td className="num">{fmtNum(d.sd)}</td>
                    <td className="num">{d.n ? `${fmtNum(d.q1)}–${fmtNum(d.q3)}` : "—"}</td>
                    <td className="num">{d.n ? `${fmtNum(d.min)}–${fmtNum(d.max)}` : "—"}</td>
                    <td className="num">{d.cv != null ? fmtNum(d.cv) : "—"}</td>
                    <td className="num">{s.belowLoq}</td>
                    <td className="num">{s.belowLod}</td>
                    <td className="num">{s.missing}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <ChartCard title="원소별 검출 빈도" subtitle="검출 입자 / 판정 가능 입자 · 상위 20개 원소 · 출처: EDS 성분표"
          table={<table className="data"><thead><tr><th>원소</th><th className="num">검출/판정 가능</th></tr></thead><tbody>{byFreq.map((s) => <tr key={s.symbol}><td>{s.symbol}</td><td className="num">{s.detected}/{s.evaluable}</td></tr>)}</tbody></table>}>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <BarChart data={byFreq.slice(0, 20).map((s) => ({ ...s, pct: (s.frequency ?? 0) * 100 }))} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="symbol" {...axisProps} interval={0} />
                <YAxis {...axisProps} domain={[0, 100]} tickFormatter={pctTick} width={42} />
                <Tooltip cursor={{ fill: "#eef3f1" }} content={tip<{ symbol: string; detected: number; evaluable: number; pct: number }>((d) => ({ title: `${d.symbol} (${elementNameKo(d.symbol)})`, lines: [`검출 ${d.detected} / 판정 가능 ${d.evaluable}`, `${d.pct.toFixed(1)}%`] }))} />
                <Bar dataKey="pct" fill={SERIES[0]} radius={[4, 4, 0, 0]} barSize={16} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title={`조성 합계 분포 (${bl})`} subtitle={`입자별 기재된 ${bl} 값의 합 · 음영 = 허용 범위 100 ± ${settings.sumTolerance}%p · 범위 밖은 비정규화·원소 제외 가능성`}>
          <SumHistogram particles={valid} basis={basis} tol={settings.sumTolerance} />
        </ChartCard>
      </div>

      <ChartCard className="mb-4" title={`입자별 원소 조성 (${bl}, 누적 막대)`} subtitle={`검출된 원소의 정량값만 쌓음 · 색상 원소 외는 '기타' · n=${stack.length} 입자 · 막대를 누르면 입자 상세`}
        table={<table className="data"><thead><tr><th>입자</th>{stackKeys.map((k) => <th key={k} className="num">{k}</th>)}</tr></thead><tbody>{stack.map((r) => <tr key={r.key as string}><td>{r.label}</td>{stackKeys.map((k) => <td key={k} className="num">{r[k] != null ? fmtNum(r[k] as number, 1) : "—"}</td>)}</tr>)}</tbody></table>}>
        <Legend items={stackKeys.map((k) => ({ label: k, color: k === OTHER_KEY ? OTHER_COLOR : elementColor(k, colorOrder) }))} />
        <div className="overflow-x-auto mt-2">
          <BarChart width={Math.max(900, stack.length * 22 + 80)} height={300} data={stack} margin={{ left: 0, right: 8, top: 8, bottom: 40 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} angle={-60} textAnchor="end" interval={0} height={60} tick={{ fontSize: 10, fill: "#5f6b68" }} />
            <YAxis {...axisProps} width={42} domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]} />
            <Tooltip cursor={{ fill: "#eef3f1" }} content={tip<Record<string, number | string>>((d) => ({ title: String(d.label), lines: stackKeys.filter((k) => d[k] != null && (d[k] as number) > 0).map((k) => `${k}: ${fmtNum(d[k] as number)} ${bl}`) }))} />
            {stackKeys.map((k, i) => (
              <Bar key={k} dataKey={k} stackId="a" fill={k === OTHER_KEY ? OTHER_COLOR : elementColor(k, colorOrder)} stroke="#fff" strokeWidth={1} isAnimationActive={false} radius={i === stackKeys.length - 1 ? [3, 3, 0, 0] : 0} style={{ cursor: "pointer" }} onClick={(d: { payload?: { key: string } }) => d.payload && go(d.payload.key)} />
            ))}
          </BarChart>
        </div>
      </ChartCard>

      <ChartCard className="mb-4" title={`원소 조성 히트맵 (${bl})`} subtitle="행 = 입자, 열 = 검출 빈도 상위 원소 · 색 농도 ∝ √(값/100) · '–' 미검출, '<Q' 정량한계 미만, '<D' 검출한계 미만, '?' 결측 · 입자 이름을 누르면 상세">
        {valid.length === 0 ? <div className="text-[13px] text-ink-2 py-6 text-center">유효 입자가 없습니다.</div> : (
          <Heatmap
            maxHeight={460}
            rows={valid.map((p) => ({ key: p.key, label: `${p.sample_id}/${p.particle_id}` }))}
            cols={byFreq.slice(0, 16).map((s) => ({ key: s.symbol, label: s.symbol }))}
            cellW={46} cellH={22} rowLabelW={130}
            onRowClick={go}
            cell={(r, c) => {
              const p = valid.find((x) => x.key === r)!;
              const st = elementStatus(p, c, settings).status;
              const e = p.elements[c];
              const v = e && st === "detected" ? (basis === "wt" ? e.wt : e.at) : null;
              if (st === "missing") return { color: "#ffffff", text: "?", tooltip: `${r} · ${c}: 결측` };
              if (st === "not_detected") return { color: "#f3f5f4", text: "–", tooltip: `${r} · ${c}: 미검출` };
              if (st === "below_lod") return { color: "#eceeed", text: "<D", tooltip: `${r} · ${c}: 검출한계 미만` };
              if (st === "below_loq") return { color: "#e3ecf8", text: "<Q", tooltip: `${r} · ${c}: 정량한계 미만(값 ${e?.wt ?? "—"} wt%, 정량 통계 제외)` };
              if (v == null) return { color: "#f7f7f5", text: "·", tooltip: `${r} · ${c}: 검출, ${bl} 값 없음`, onClick: () => go(r) };
              const t = Math.sqrt(Math.min(100, v) / 100);
              return { color: seqColor(t), dark: t > 0.6, text: v >= 10 ? v.toFixed(0) : v.toFixed(1), tooltip: `${r} · ${c}: ${fmtNum(v)} ${bl}`, onClick: () => go(r) };
            }}
          />
        )}
      </ChartCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <ChartCard title={`원소 간 상관관계 (${method === "spearman" ? "Spearman ρ" : "Pearson r"}, ${bl})`}
          subtitle="두 원소 모두 판정 가능한 유효 입자 · 미검출·LOD 미만 = 0, LOQ 미만·결측 제외 · n < 5면 계산 안 함 · 파랑 양, 빨강 음"
          actions={<Segmented value={method} onChange={setMethod} options={[{ value: "spearman", label: "Spearman" }, { value: "pearson", label: "Pearson" }]} />}>
          {matrixEls.length < 2 ? <div className="text-[13px] text-ink-2 py-6 text-center">검출된 원소가 2종 이상이어야 합니다.</div> : (
            <>
              <Heatmap rows={matrixEls.map((e) => ({ key: e, label: e }))} cols={matrixEls.map((e) => ({ key: e, label: e }))} rowLabelW={40} cellW={40} cellH={28}
                cell={(a, b) => {
                  const c = corr.find((x) => x.a === a && x.b === b)!;
                  return { color: divColor(c.r), dark: c.r != null && Math.abs(c.r) > 0.75, text: c.r == null ? "n↓" : c.r.toFixed(2), tooltip: `${a}–${b}: ${c.r == null ? "계산 안 함(n 부족)" : (method === "spearman" ? "ρ = " : "r = ") + c.r.toFixed(3)}\nn = ${c.n} 입자` };
                }} />
              <p className="text-[12px] text-ink-3 mt-2">조성 자료는 합이 100인 폐쇄 자료라 한 원소가 크면 다른 원소가 작아지는 음의 상관이 인위적으로 생길 수 있습니다. 상관은 인과를 뜻하지 않습니다.</p>
            </>
          )}
        </ChartCard>

        <ChartCard title="원소 간 동시 검출" subtitle="칸 = 두 원소가 함께 검출된 입자 수 / 둘 다 판정 가능한 입자 수 · 대각선 = 해당 원소 검출 입자 수 · 색 = Jaccard 지수">
          {matrixEls.length < 2 ? <div className="text-[13px] text-ink-2 py-6 text-center">검출된 원소가 2종 이상이어야 합니다.</div> : (
            <Heatmap rows={matrixEls.map((e) => ({ key: e, label: e }))} cols={matrixEls.map((e) => ({ key: e, label: e }))} rowLabelW={40} cellW={40} cellH={28}
              cell={(a, b) => {
                const c = co.find((x) => x.a === a && x.b === b)!;
                return { color: seqColor(c.jaccard ?? 0), dark: (c.jaccard ?? 0) > 0.6, text: String(c.both), tooltip: `${a}+${b}: 함께 검출 ${c.both} / 판정 가능 ${c.evaluable}\nJaccard ${c.jaccard == null ? "—" : c.jaccard.toFixed(2)}` };
              }} />
          )}
        </ChartCard>
      </div>

      <ChartCard title={`입자별 원소 조성 산점도 (${bl})`} subtitle="두 원소 모두 판정 가능한 유효 입자 · 미검출은 0에 표시 · 정량한계 미만·결측 제외 · 점을 누르면 입자 상세"
        actions={
          <span className="flex items-center gap-1.5 text-[12.5px]">
            X <select className="border border-line-2 rounded px-1 py-0.5" value={xEl} onChange={(e) => setXEl(e.target.value)}>{allEls.map((e) => <option key={e}>{e}</option>)}</select>
            Y <select className="border border-line-2 rounded px-1 py-0.5" value={yEl} onChange={(e) => setYEl(e.target.value)}>{allEls.map((e) => <option key={e}>{e}</option>)}</select>
          </span>
        }>
        <ElementScatter particles={valid} x={xEl} y={yEl} basis={basis} />
      </ChartCard>

      <p className="text-[12px] text-ink-3 mt-4">데이터 출처: {data.files.filter((f) => f.kind === "eds").map((f) => f.name).join(", ") || "—"}</p>
    </>
  );
}

function SumHistogram({ particles, basis, tol }: { particles: Particle[]; basis: Basis; tol: number }) {
  const sums = particles.map((p) => (basis === "wt" ? p.wtSum : p.atSum)).filter((v): v is number => v != null);
  if (!sums.length) return <div className="text-[13px] text-ink-2 py-10 text-center">합계를 계산할 값이 없습니다.</div>;
  const lo = Math.floor(Math.min(80, ...sums) / 2.5) * 2.5, hi = Math.ceil(Math.max(120, ...sums) / 2.5) * 2.5;
  const bins: Array<{ x: number; label: string; n: number }> = [];
  for (let b = lo; b < hi; b += 2.5) bins.push({ x: b + 1.25, label: `${b}–${b + 2.5}`, n: sums.filter((v) => v >= b && v < b + 2.5).length });
  const out = sums.filter((v) => v < 100 - tol || v > 100 + tol).length;
  return (
    <>
      <div className="h-[220px]">
        <ResponsiveContainer>
          <BarChart data={bins} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} barCategoryGap={1}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="x" type="number" domain={[lo, hi]} {...axisProps} tickFormatter={(v) => `${v}`} />
            <YAxis {...axisProps} allowDecimals={false} width={32} />
            <ReferenceArea x1={100 - tol} x2={100 + tol} fill="#1baf7a" fillOpacity={0.12} />
            <Tooltip cursor={{ fill: "#eef3f1" }} content={tip<{ label: string; n: number }>((d) => ({ title: `합계 ${d.label}%`, lines: [`${d.n} 입자`] }))} />
            <Bar dataKey="n" fill={SERIES[0]} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[12.5px] text-ink-2 mt-1">허용 범위 밖: <b className="tnum">{out}</b> / {sums.length} 입자</p>
    </>
  );
}

function ElementScatter({ particles, x, y, basis }: { particles: Particle[]; x: string; y: string; basis: Basis }) {
  const { settings } = useStore();
  const val = (p: Particle, s: string) => {
    const st = elementStatus(p, s, settings).status;
    if (st === "missing" || st === "below_loq") return undefined;
    if (st === "not_detected" || st === "below_lod") return 0;
    const e = p.elements[s];
    const v = basis === "wt" ? e?.wt : e?.at;
    return v ?? undefined;
  };
  const groups: Record<string, Array<{ x: number; y: number; key: string; label: string }>> = { positive: [], negative: [], other: [] };
  for (const p of particles) {
    const a = val(p, x), b = val(p, y);
    if (a === undefined || b === undefined) continue;
    const t = particleTargetResult(p, settings).status;
    (t === "positive" ? groups.positive : t === "negative" ? groups.negative : groups.other).push({ x: a, y: b, key: p.key, label: `${p.sample_id}/${p.particle_id}` });
  }
  const n = groups.positive.length + groups.negative.length + groups.other.length;
  if (x === y) return <div className="text-[13px] text-ink-2 py-8 text-center">서로 다른 두 원소를 고르세요.</div>;
  if (!n) return <div className="text-[13px] text-ink-2 py-8 text-center">두 원소 모두 판정 가능한 입자가 없습니다.</div>;
  const series = [
    { k: "positive", name: "대상 원소 검출 입자", color: SERIES[0] },
    { k: "negative", name: "대상 원소 미검출 입자", color: SERIES[1] },
    { k: "other", name: "판정 불가", color: OTHER_COLOR },
  ].filter((s) => groups[s.k].length);
  return (
    <>
      <Legend items={series.map((s) => ({ label: `${s.name} (${groups[s.k].length})`, color: s.color }))} />
      <div className="h-[320px] mt-1">
        <ResponsiveContainer>
          <ScatterChart margin={{ left: 0, right: 16, top: 8, bottom: 16 }}>
            <CartesianGrid stroke="#e6eae8" />
            <XAxis type="number" dataKey="x" name={x} {...axisProps} label={{ value: `${x} (${basis}%)`, position: "insideBottom", offset: -8, fill: "#4a5754", fontSize: 12 }} />
            <YAxis type="number" dataKey="y" name={y} {...axisProps} width={44} label={{ value: `${y} (${basis}%)`, angle: -90, position: "insideLeft", fill: "#4a5754", fontSize: 12 }} />
            <ZAxis range={[64, 64]} />
            <Tooltip content={tip<{ x: number; y: number; label: string }>((d) => ({ title: d.label, lines: [`${x}: ${fmtNum(d.x)} ${basis}%`, `${y}: ${fmtNum(d.y)} ${basis}%`, "누르면 입자 상세"] }))} />
            {series.map((s) => (
              <Scatter key={s.k} name={s.name} data={groups[s.k]} fill={s.color} stroke="#fff" strokeWidth={1.5} isAnimationActive={false} style={{ cursor: "pointer" }} onClick={(d: { payload?: { key: string } }) => d.payload && go(d.payload.key)} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[12px] text-ink-3">n = {n} 입자</p>
    </>
  );
}
