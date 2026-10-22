/* 위치별 기준 시뮬레이터(초록의 AI 시뮬레이터 프로토타입).
   강남역 지하상가 5개 위치의 단일입자에 형상 기준(종횡비)과 조성 기준(Fe·Mn·Cu·Ba·Sb 검출)을 적용하고,
   위치별 해당 입자 비율을 평면 지도에 표시한다. 기준값을 바꾸면 바로 다시 계산하고, 초록 '분석 결과' 빈칸 문장을 만든다. */
import { useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, ErrorBar, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { hrefFor, useStore } from "../state/store";
import { Button, Card, Formula, Kpi, Legend, Notice, PageHeader, Segmented } from "../components/ui";
import { ChartCard } from "../components/ChartCard";
import { SiteMap, METRIC_LABEL, type MapMetric } from "../components/SiteMap";
import { axisProps, gridProps, pctTick, tip } from "../components/chartKit";
import {
  DEFAULT_CRITERIA, MORENO_ELEMENTS, abstractBlanks, arSensitivity, compositionLabel, simulate, thresholdSteps,
  type CriteriaConfig, type GroupStats, type ParticleEval, type Rate,
} from "../lib/criteria";
import { elementsInData } from "../lib/composition";
import { DEFAULT_SEGMENT, measureImage } from "../lib/image/measure";
import { HEALTH_INFO } from "../config/healthInfo";
import { BOTH_NOTE, COMPOSITION_CASES, ELEMENT_NOTES, LIMITATIONS, SHAPE_CASES, type LiteratureCase } from "../config/criteriaLiterature";
import { INK_BAR, SERIES, seqColor } from "../lib/palette";
import type { ParticleMeta } from "../lib/types";

const C_SHAPE = INK_BAR;
const C_COMP = "#d4552f";
const C_BOTH = "#2a78d6";
const f1 = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(1)}%`);
const rateTxt = (r: Rate) => (r.n ? `${r.k}/${r.n}` : "—");

export function SimulatorPage() {
  const { particles, settings, sim, setSim, origin, updateMetaMany } = useStore();
  const cfg = sim.criteria;
  const setCfg = (p: Partial<CriteriaConfig>) => setSim((s) => ({ ...s, criteria: { ...s.criteria, ...p } }));
  const [metric, setMetric] = useState<MapMetric>("shape");
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [measuring, setMeasuring] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const planInput = useRef<HTMLInputElement>(null);

  const res = useMemo(() => simulate(particles, cfg, settings), [particles, cfg, settings]);
  const blanks = useMemo(() => abstractBlanks(res, cfg), [res, cfg]);
  const steps = useMemo(() => thresholdSteps(1, 3, 0.05), []);
  const curve = useMemo(() => arSensitivity([...res.sites, res.overall], steps), [res, steps]);
  const dataElements = useMemo(() => elementsInData(particles).filter((e) => !["C", "O"].includes(e)), [particles]);

  const onSite = res.evals.filter((e) => e.site);
  const unmeasured = particles.filter((p) => p.image && p.meta && p.meta.aspect_ratio == null);
  const autoMeasured = particles.filter((p) => /윤곽 미확인/.test(p.meta?.size_method ?? ""));
  const noScale = particles.filter((p) => p.image && p.meta?.aspect_ratio != null && p.meta.feret_diameter == null);

  const runAutoMeasure = async () => {
    const targets = unmeasured;
    if (!targets.length) return;
    setMeasuring({ done: 0, total: targets.length, failed: 0 });
    const patches: Record<string, Partial<ParticleMeta>> = {};
    let failed = 0;
    for (const [i, p] of targets.entries()) {
      const um = p.umPerPx ?? p.image!.instrument?.pixelWidthUm ?? null;
      try {
        const m = await measureImage(p.image!.url, um, { ...DEFAULT_SEGMENT, cropBottomPx: p.image!.instrument?.databarHeightPx ?? null });
        patches[p.key] = {
          feret_diameter: m.feretUm, equivalent_diameter: m.eqdUm, projected_area: m.areaUm2,
          circularity: m.props.circ, solidity: m.props.sol, aspect_ratio: m.props.ar,
          pixel_size_um: p.meta?.pixel_size_um ?? um,
          size_method: m.methodLabel.replace("윤곽 사용자 확인", "시뮬레이터 일괄 자동 측정(윤곽 미확인)"),
        };
      } catch {
        failed++;
      }
      setMeasuring({ done: i + 1, total: targets.length, failed });
    }
    updateMetaMany(patches);
    setMeasuring(null);
  };

  const uploadPlan = async (file: File) => {
    const url = URL.createObjectURL(file);
    try {
      const im = new Image();
      await new Promise<void>((ok, bad) => { im.onload = () => ok(); im.onerror = () => bad(new Error("이미지를 읽지 못했습니다")); im.src = url; });
      const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(im.naturalWidth * k);
      c.height = Math.round(im.naturalHeight * k);
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(im, 0, 0, c.width, c.height);
      setSim((s) => ({ ...s, floorPlan: { url: c.toDataURL("image/jpeg", 0.85), name: file.name, w: c.width, h: c.height } }));
      setEditing(true);
    } catch (e) {
      alert(`평면도를 읽지 못했습니다: ${(e as Error).message}\nPNG·JPG 이미지로 올려 주세요(PDF는 이미지로 저장한 뒤).`);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const selGroup = selected ? res.sites.find((g) => g.id === selected) ?? null : null;
  const gallery: ParticleEval[] = selGroup ? selGroup.inRange : res.overall.inRange;
  const outOfRangeList: ParticleEval[] = (selGroup ? res.evals.filter((e) => e.site?.id === selected) : onSite).filter((e) => e.inSize !== true);

  const barData = res.sites.map((g) => ({
    name: g.site!.short,
    shape: g.shape.pct ?? 0, comp: g.comp.pct ?? 0, both: g.both.pct ?? 0,
    shapeErr: err(g.shape), compErr: err(g.comp), bothErr: err(g.both),
    g,
  }));

  return (
    <>
      <PageHeader
        title="위치별 기준 시뮬레이터"
        description={<>강남역 지하상가 5개 위치에서 채취한 단일입자에 <b>형상 기준</b>(종횡비)과 <b>조성 기준</b>(Fe·Mn·Cu·Ba·Sb 검출; Moreno et al., 2017)을 적용해, 기준에 해당하는 입자의 비율을 평면 지도에 표시합니다. 기준값을 바꾸면 바로 다시 계산합니다.</>}
      />

      {/* 데이터 준비 상태 */}
      {onSite.length === 0 ? (
        <Notice kind="warning" title="5개 위치로 지정된 입자가 아직 없습니다">
          위치별 입자 사진(TIFF)과 성분 파일(CSV·XLSX)을 <a className="text-accent underline" href={hrefFor({ page: "data" })}>데이터 업로드</a>의 입자 등록 칸에 <b>위치별 폴더째</b> 끌어 놓으면,
          폴더·파일 이름(예: <code>개찰구</code>, <code>B-28</code>, <code>카페</code>, <code>F-1</code>, <code>의류</code>)으로 위치가 자동 지정됩니다.
          {particles.length > 0 && <> 지금 데이터의 입자 {particles.length}개는 위치가 5개 지점에 해당하지 않아 아래 표의 &lsquo;참고(지도 외)&rsquo;에만 나옵니다.</>}
          {origin === "demo" && <> 지금은 DEMO 데이터입니다.</>}
        </Notice>
      ) : null}
      {(unmeasured.length > 0 || measuring) && (
        <div className="mt-3">
          <Notice kind="info" title={`형상(종횡비·최대 길이)이 측정되지 않은 입자 ${unmeasured.length}개`}>
            사진에서 입자 윤곽을 자동으로 찾아 최대 길이(최대 Feret 지름)와 종횡비를 측정합니다. 결과는 &lsquo;윤곽 미확인&rsquo;으로 표시되며, 입자 상세 화면에서 윤곽을 겹쳐 보고 확인·수정할 수 있습니다.
            <div className="mt-2 flex items-center gap-3">
              <Button variant="primary" disabled={!!measuring} onClick={runAutoMeasure}>{measuring ? `측정 중… ${measuring.done}/${measuring.total}` : `${unmeasured.length}개 자동 측정`}</Button>
              {measuring?.failed ? <span className="text-[13.5px] text-[#a42f2f]">실패 {measuring.failed}개</span> : null}
            </div>
          </Notice>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mt-4">
        <Kpi label="분석 대상 입자" value={res.overall.inRange.length} unit="개" detail={cfg.applySize ? `${cfg.sizeBy === "feret" ? "최대 길이" : "등가원 지름"} ${cfg.sizeMin}–${cfg.sizeMax} µm · 5개 위치` : "크기 범위 미적용 · 5개 위치"} />
        <Kpi label={`형상 기준 (AR ≥ ${cfg.arThreshold})`} value={f1(res.overall.shape.pct)} detail={`${rateTxt(res.overall.shape)} 입자`} />
        <Kpi label="조성 기준" value={f1(res.overall.comp.pct)} detail={`${rateTxt(res.overall.comp)} · ${compositionLabel(cfg)}`} />
        <Kpi label="두 기준 모두" value={f1(res.overall.both.pct)} detail={`${rateTxt(res.overall.both)} 입자`} />
        <Kpi label={`AR ${cfg.arThreshold} → ${cfg.arCompare}`} value={<span className="text-[0.72em]">{f1(res.overall.shape.pct)}<span className="text-ink-3 mx-1">→</span>{f1(res.overall.shapeCompare.pct)}</span>} detail="형상 기준 해당 비율 변화" />
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_380px] gap-4 mt-4">
        <Card
          title="지하상가 위치별 기준 해당 비율"
          subtitle={<>원 안의 숫자 = 선택한 기준에 해당하는 입자 비율(분석 대상 중 판정 가능 입자 기준), 원 크기 = 분석 대상 입자 수, 색이 진할수록 비율이 높음. 원을 누르면 그 위치 입자만 아래에 보입니다.</>}
          actions={<>
            <Segmented value={metric} onChange={setMetric} options={(["shape", "comp", "both"] as MapMetric[]).map((m) => ({ value: m, label: METRIC_LABEL[m] }))} />
          </>}
        >
          <SiteMap sites={res.sites} sim={sim} setSim={setSim} metric={metric} selected={selected} onSelect={setSelected} editing={editing} />
          <div className="flex flex-wrap items-center gap-2 mt-3 text-[13.5px]">
            <Button small onClick={() => planInput.current?.click()}>{sim.floorPlan ? "평면도 바꾸기" : "실제 평면도 이미지 올리기"}</Button>
            {sim.floorPlan && <Button small variant="ghost" onClick={() => setSim((s) => ({ ...s, floorPlan: null }))}>모식도로 되돌리기</Button>}
            <Button small variant={editing ? "primary" : "default"} onClick={() => setEditing((v) => !v)}>{editing ? "위치 옮기기 끝" : "마커 위치 옮기기"}</Button>
            {Object.keys(sim.positions).length > 0 && <Button small variant="ghost" onClick={() => setSim((s) => ({ ...s, positions: {} }))}>마커 위치 초기화</Button>}
            <span className="text-ink-3">{sim.floorPlan ? `평면도: ${sim.floorPlan.name}` : "지금은 모식도입니다(구역 배치·거리는 실제와 다름)."}</span>
            <input ref={planInput} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPlan(f); e.target.value = ""; }} />
          </div>
          <div className="mt-2"><ColorScale /></div>
        </Card>

        <CriteriaPanel cfg={cfg} setCfg={setCfg} dataElements={dataElements} />
      </div>

      {/* 위치별 표 */}
      <div className="mt-4">
        <Card title="위치별 결과표" subtitle="k/n = 기준 해당 입자 / 판정 가능 입자(분석 대상 중). 괄호는 95% Wilson 신뢰구간 — 위치별 입자가 적어 구간이 넓습니다.">
          <div className="overflow-x-auto">
            <table className="data text-[13.5px]">
              <thead>
                <tr><th>위치</th><th className="num">전체</th><th className="num">분석 대상</th><th className="num">형상 기준</th><th className="num">조성 기준</th><th className="num">두 기준</th><th className="num">AR ≥ {cfg.arCompare}</th></tr>
              </thead>
              <tbody>
                {res.sites.map((g) => <ResultRow key={g.id} g={g} selected={selected === g.id} onClick={() => setSelected(selected === g.id ? null : g.id)} />)}
                <ResultRow g={res.overall} strong />
                {res.others.map((g) => <ResultRow key={g.id} g={g} muted note="참고(지도 외)" />)}
              </tbody>
            </table>
          </div>
          <p className="text-[13px] text-ink-2 mt-2 leading-relaxed">
            &lsquo;전체&rsquo;에서 &lsquo;분석 대상&rsquo;이 빠진 입자는 크기 범위 밖이거나 크기를 측정하지 못한 입자입니다. 종횡비를 측정하지 못한 입자는 형상 기준의 분모에서, EDS가 없거나 기준 원소 판정이 불가능한 입자는 조성 기준의 분모에서 뺍니다.
            {autoMeasured.length > 0 && <> 자동 측정(윤곽 미확인) 입자 {autoMeasured.length}개가 포함되어 있습니다.</>}
            {noScale.length > 0 && <> 픽셀 크기가 없어 µm 크기를 모르는 입자 {noScale.length}개는 크기 범위 판정에서 빠집니다.</>}
          </p>
        </Card>
      </div>

      {/* 막대 + 민감도 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <ChartCard title="위치별 기준 해당 비율" subtitle="막대 = 해당 비율(%), 오차막대 = 95% Wilson 신뢰구간"
          table={<table className="data"><thead><tr><th>위치</th><th className="num">형상</th><th className="num">조성</th><th className="num">두 기준</th></tr></thead><tbody>{res.sites.map((g) => <tr key={g.id}><td>{g.label}</td><td className="num">{rateTxt(g.shape)}</td><td className="num">{rateTxt(g.comp)}</td><td className="num">{rateTxt(g.both)}</td></tr>)}</tbody></table>}>
          <Legend items={[{ label: `형상 (AR ≥ ${cfg.arThreshold})`, color: C_SHAPE }, { label: "조성", color: C_COMP }, { label: "두 기준", color: C_BOTH }]} />
          <div className="h-[300px] mt-1">
            <ResponsiveContainer>
              <BarChart data={barData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }} barCategoryGap="22%">
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="name" {...axisProps} interval={0} />
                <YAxis {...axisProps} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={pctTick} allowDataOverflow width={44} />
                <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} content={tip<(typeof barData)[number]>((d) => ({
                  title: d.g.label,
                  lines: [`형상 ${rateTxt(d.g.shape)} (${f1(d.g.shape.pct)})`, `조성 ${rateTxt(d.g.comp)} (${f1(d.g.comp.pct)})`, `두 기준 ${rateTxt(d.g.both)} (${f1(d.g.both.pct)})`],
                }))} />
                <Bar dataKey="shape" fill={C_SHAPE} maxBarSize={26} isAnimationActive={false}><ErrorBar dataKey="shapeErr" width={4} stroke="#8a877f" /></Bar>
                <Bar dataKey="comp" fill={C_COMP} maxBarSize={26} isAnimationActive={false}><ErrorBar dataKey="compErr" width={4} stroke="#8a877f" /></Bar>
                <Bar dataKey="both" fill={C_BOTH} maxBarSize={26} isAnimationActive={false}><ErrorBar dataKey="bothErr" width={4} stroke="#8a877f" /></Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="종횡비 기준값을 바꾸면 — 형상 기준 해당 비율의 변화"
          subtitle={`가로축 = 종횡비 기준값(이 값 이상이면 비구형), 세로축 = 분석 대상 중 기준에 해당하는 입자 비율. 세로 점선 = 지금 기준값 ${cfg.arThreshold}과 비교값 ${cfg.arCompare}.`}
          table={<table className="data"><thead><tr><th className="num">AR 기준</th>{res.sites.map((g) => <th key={g.id} className="num">{g.site!.short}</th>)}<th className="num">전체</th></tr></thead><tbody>{curve.filter((_, i) => i % 5 === 0).map((r) => <tr key={r.t}><td className="num">{r.t.toFixed(2)}</td>{res.sites.map((g) => <td key={g.id} className="num">{f1(r[g.id])}</td>)}<td className="num">{f1(r.all)}</td></tr>)}</tbody></table>}>
          <Legend items={[...res.sites.map((g, i) => ({ label: g.site!.short, color: SERIES[i] })), { label: "5개 위치 전체", color: "#282828" }]} />
          <div className="h-[300px] mt-1">
            <ResponsiveContainer>
              <LineChart data={curve} margin={{ left: 0, right: 16, top: 10, bottom: 4 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="t" type="number" domain={[1, 3]} ticks={[1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3]} {...axisProps} />
                <YAxis {...axisProps} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={pctTick} allowDataOverflow width={44} />
                <Tooltip content={tip<(typeof curve)[number]>((r) => ({
                  title: `AR ≥ ${r.t.toFixed(2)}`,
                  lines: [...res.sites.map((g) => `${g.site!.short} ${f1(r[g.id])}`), `전체 ${f1(r.all)}`],
                }))} />
                <ReferenceLine x={cfg.arThreshold} stroke="#b5381a" strokeDasharray="4 3" label={{ value: `${cfg.arThreshold}`, position: "top", fill: "#b5381a", fontSize: 12 }} />
                <ReferenceLine x={cfg.arCompare} stroke="#66645e" strokeDasharray="4 3" label={{ value: `${cfg.arCompare}`, position: "top", fill: "#66645e", fontSize: 12 }} />
                {res.sites.map((g, i) => <Line key={g.id} dataKey={g.id} stroke={SERIES[i]} strokeWidth={1.6} dot={false} type="stepAfter" connectNulls isAnimationActive={false} />)}
                <Line dataKey="all" stroke="#282828" strokeWidth={2.6} dot={false} type="stepAfter" connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* 초록 빈칸 */}
      <div className="mt-4">
        <Card title="초록 '분석 결과' 빈칸 채우기" subtitle="지금 기준값으로 계산한 문장입니다. 기준값을 바꾸면 문장도 바뀝니다. 비율 뒤 괄호는 (해당 입자/판정 가능 입자)."
          actions={<Button small onClick={async () => { await navigator.clipboard.writeText(blanks.sentence).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "복사됨" : "문장 복사"}</Button>}>
          <p className="text-[15.5px] leading-[1.85] bg-surface-2 border border-line rounded-[3px] px-4 py-3">{blanks.sentence}</p>
          <table className="data text-[13.5px] mt-3">
            <tbody>
              <tr><th className="w-[260px]">형상 기준 비율이 가장 높은 위치</th><td>{blanks.shapeTop}</td></tr>
              <tr><th>조성 기준 비율이 가장 높은 위치</th><td>{blanks.compTop}</td></tr>
              <tr><th>두 기준을 모두 만족하는 입자(전체)</th><td>{blanks.bothOverall}</td></tr>
              <tr><th>AR 기준값 [ ] → [ ]</th><td>{blanks.arFrom} → {blanks.arTo}</td></tr>
              <tr><th>형상 기준 비율 [ ]% → [ ]%</th><td>{blanks.shapeFrom} → {blanks.shapeTo}</td></tr>
            </tbody>
          </table>
          {onSite.length === 0 && <p className="text-[13.5px] text-[#6b4b00] mt-2">⚠ 5개 위치 데이터가 없어 [ ]로 남아 있습니다.</p>}
          {onSite.length > 0 && res.sites.some((g) => g.inRange.length < 5) && <p className="text-[13.5px] text-[#6b4b00] mt-2">⚠ 분석 대상이 5개 미만인 위치가 있습니다 — 비율 차이를 단정하지 말고 경향으로 쓰세요.</p>}
        </Card>
      </div>

      {/* 입자 갤러리 */}
      <div className="mt-4">
        <Card title={selGroup ? `${selGroup.label} — 분석 대상 입자 ${gallery.length}개` : `5개 위치 분석 대상 입자 ${gallery.length}개`}
          subtitle="사진을 누르면 입자 상세(윤곽 확인·원소 조성)로 이동합니다. 주황 테두리 = 두 기준 모두 해당."
          actions={selGroup ? <Button small variant="ghost" onClick={() => setSelected(null)}>전체 위치 보기</Button> : undefined}>
          {gallery.length === 0 ? <p className="text-[14px] text-ink-2">표시할 입자가 없습니다.</p> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-3">
              {gallery.map((e) => <ParticleTile key={e.particle.key} e={e} />)}
            </div>
          )}
          {outOfRangeList.length > 0 && (
            <p className="text-[13px] text-ink-3 mt-3">분석 대상에서 빠진 입자 {outOfRangeList.length}개: {outOfRangeList.map((e) => `${e.particle.particle_id}(${e.size == null ? "크기 미측정" : `${e.size.toFixed(1)} µm`})`).join(", ")}</p>
          )}
        </Card>
      </div>

      {/* 선행연구 */}
      <div className="mt-4">
        <Card title="기준별 입자 특성과 선행연구의 인체 영향 사례" subtitle="아래 사례는 '이런 특성의 입자에서 이런 영향이 보고되었다'는 것이며, 기준에 해당하는 우리 입자가 같은 영향을 준다는 뜻이 아닙니다.">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <LitColumn title={`형상 기준 — 비구형(AR ≥ ${cfg.arThreshold})`} color={C_SHAPE} cases={SHAPE_CASES} />
            <div>
              <LitColumn title={`조성 기준 — ${cfg.elements.join("·")} 검출`} color={C_COMP} cases={COMPOSITION_CASES} />
              <div className="mt-3 space-y-2">
                {cfg.elements.map((el) => {
                  const info = HEALTH_INFO[el];
                  const note = ELEMENT_NOTES[el];
                  if (!info && !note) return null;
                  return (
                    <div key={el} className="text-[13px] leading-relaxed border-l-2 border-line-2 pl-2.5">
                      <b className="font-mono">{el}</b> {info ? <>— {info.health_effects} <span className="text-ink-3">(표적: {info.target_organs})</span></> : <>— {note}</>}
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <h4 className="text-[14.5px] font-semibold flex items-center gap-2"><span className="w-2.5 h-2.5" style={{ background: C_BOTH }} />두 기준 모두</h4>
              <p className="text-[13.5px] text-ink-2 mt-2 leading-relaxed">{BOTH_NOTE}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* 한계 */}
      <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="해석할 때 주의할 점(초록 한계)">
          <ul className="list-disc pl-5 space-y-1.5 text-[14px] text-ink-2 leading-relaxed">{LIMITATIONS.map((l) => <li key={l}>{l}</li>)}</ul>
        </Card>
        <Card title="계산 방법">
          <Formula title="판정 규칙">
            분석 대상 = {cfg.applySize ? `${cfg.sizeBy === "feret" ? "최대 Feret 지름" : "등가원 지름"} ${cfg.sizeMin}–${cfg.sizeMax} µm` : "크기 제한 없음"}<br />
            형상 기준 = 종횡비(타원 근사 장축/단축) ≥ {cfg.arThreshold}<br />
            조성 기준 = {compositionLabel(cfg)} 중 하나 이상 검출{settings.belowLoqCountsAsDetected ? "(정량한계 미만 포함)" : ""}<br />
            비율 = 기준 해당 입자 ÷ 판정 가능 입자 (위치별, 분석 대상 안에서)
          </Formula>
          <p className="text-[13px] text-ink-2 mt-2 leading-relaxed">
            파일에 없는 원소는 설정(분석 설정 → 행이 없는 원소: {settings.absentElementPolicy === "not_detected" ? "미검출로 간주" : "미분석(결측)"})을 따릅니다.
            Phenom 자동 원소 판정 목록에 기준 원소가 없으면 &lsquo;미검출&rsquo;로 처리되므로, Cu·Ba·Sb를 표적 원소로 지정해 측정했는지 확인하세요.
          </p>
        </Card>
      </div>
    </>
  );
}

function err(r: Rate): [number, number] {
  if (!r.ci || r.pct == null) return [0, 0];
  return [r.pct - r.ci.lo * 100, r.ci.hi * 100 - r.pct];
}

function ciTxt(r: Rate) {
  return r.ci ? ` [${(r.ci.lo * 100).toFixed(0)}–${(r.ci.hi * 100).toFixed(0)}]` : "";
}

function ResultRow({ g, selected, onClick, strong, muted, note }: { g: GroupStats; selected?: boolean; onClick?: () => void; strong?: boolean; muted?: boolean; note?: string }) {
  const cell = (r: Rate) => (
    <td className="num whitespace-nowrap">{r.n ? <>{f1(r.pct)} <span className="text-ink-3">({r.k}/{r.n}){ciTxt(r)}</span></> : "—"}</td>
  );
  return (
    <tr onClick={onClick} className={`${onClick ? "cursor-pointer" : ""} ${selected ? "bg-accent-soft" : ""} ${strong ? "font-semibold border-t-2 border-ink" : ""} ${muted ? "text-ink-3" : ""}`}>
      <td>{g.label}{note && <span className="ml-1.5 text-[12px] text-ink-3">{note}</span>}</td>
      <td className="num">{g.total}</td>
      <td className="num">{g.inRange.length}</td>
      {cell(g.shape)}
      {cell(g.comp)}
      {cell(g.both)}
      {cell(g.shapeCompare)}
    </tr>
  );
}

function CriteriaPanel({ cfg, setCfg, dataElements }: { cfg: CriteriaConfig; setCfg: (p: Partial<CriteriaConfig>) => void; dataElements: string[] }) {
  const extra = dataElements.filter((e) => !MORENO_ELEMENTS.includes(e));
  const toggle = (el: string) => setCfg({ elements: cfg.elements.includes(el) ? cfg.elements.filter((x) => x !== el) : [...cfg.elements, el] });
  const num = (v: string, d: number) => {
    const x = parseFloat(v);
    return Number.isFinite(x) ? x : d;
  };
  return (
    <Card title="기준값 조절" subtitle="바꾸는 즉시 지도·표·초록 문장이 다시 계산됩니다. 설정은 이 브라우저와 백업 파일에 저장됩니다."
      actions={<Button small variant="ghost" onClick={() => setCfg({ ...DEFAULT_CRITERIA, minWt: {} })}>초기값</Button>}>
      <div className="space-y-5 text-[14px]">
        <section>
          <h4 className="font-semibold mb-1.5">① 분석 대상 크기</h4>
          <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.applySize} onChange={(e) => setCfg({ applySize: e.target.checked })} />크기 범위 적용</label>
          <div className={`flex flex-wrap items-center gap-2 mt-1.5 ${cfg.applySize ? "" : "opacity-50 pointer-events-none"}`}>
            <select className="sim-inp" value={cfg.sizeBy} onChange={(e) => setCfg({ sizeBy: e.target.value as CriteriaConfig["sizeBy"] })}>
              <option value="feret">최대 길이(최대 Feret)</option>
              <option value="eqd">등가원 지름</option>
            </select>
            <input className="sim-inp w-16 tnum" type="number" step={0.5} value={cfg.sizeMin} onChange={(e) => setCfg({ sizeMin: num(e.target.value, 5) })} />–
            <input className="sim-inp w-16 tnum" type="number" step={0.5} value={cfg.sizeMax} onChange={(e) => setCfg({ sizeMax: num(e.target.value, 10) })} /> µm
          </div>
        </section>

        <section>
          <h4 className="font-semibold mb-1.5" style={{ color: C_SHAPE }}>② 형상 기준 — 종횡비(AR) ≥</h4>
          <div className="flex items-center gap-3">
            <input type="range" min={1} max={3} step={0.05} value={cfg.arThreshold} onChange={(e) => setCfg({ arThreshold: Number(e.target.value) })} className="flex-1 accent-[#f15534]" aria-label="종횡비 기준값" />
            <input className="sim-inp w-20 tnum" type="number" min={1} step={0.05} value={cfg.arThreshold} onChange={(e) => setCfg({ arThreshold: num(e.target.value, 1.5) })} />
          </div>
          <div className="flex items-center gap-2 mt-2 text-[13.5px]">
            비교할 기준값
            <input className="sim-inp w-20 tnum" type="number" min={1} step={0.05} value={cfg.arCompare} onChange={(e) => setCfg({ arCompare: num(e.target.value, 2) })} />
            <span className="text-ink-3">(초록: &ldquo;[ ]에서 [ ]로 바꾸면&rdquo;)</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {[1.2, 1.5, 2, 3].map((v) => <button key={v} className={`px-2 py-0.5 border rounded-[3px] text-[13px] tnum ${cfg.arThreshold === v ? "bg-block text-white border-block" : "border-line-2 hover:border-ink"}`} onClick={() => setCfg({ arThreshold: v })}>{v.toFixed(1)}</button>)}
          </div>
          <p className="text-[12.5px] text-ink-3 mt-1.5 leading-relaxed">AR = 입자 윤곽을 타원으로 근사했을 때 장축/단축(ImageJ 방식). 1이면 원, 클수록 길쭉함.</p>
        </section>

        <section>
          <h4 className="font-semibold mb-1.5" style={{ color: C_COMP }}>③ 조성 기준 — 아래 원소 중 하나 이상 검출</h4>
          <div className="space-y-1">
            {[...MORENO_ELEMENTS, ...cfg.elements.filter((e) => !MORENO_ELEMENTS.includes(e))].map((el) => (
              <div key={el} className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 w-16 font-mono"><input type="checkbox" checked={cfg.elements.includes(el)} onChange={() => toggle(el)} />{el}</label>
                <span className="text-[13px] text-ink-2">wt% 하한</span>
                <input className="sim-inp w-16 tnum" type="number" min={0} step={1} disabled={!cfg.elements.includes(el)} value={cfg.minWt[el] ?? 0}
                  onChange={(e) => setCfg({ minWt: { ...cfg.minWt, [el]: Math.max(0, num(e.target.value, 0)) } })} />
                <span className="text-[12.5px] text-ink-3">{(cfg.minWt[el] ?? 0) > 0 ? `${cfg.minWt[el]} wt% 이상만` : "검출만 되면"}</span>
              </div>
            ))}
          </div>
          {extra.length > 0 && (
            <div className="mt-2 text-[13px]">
              <span className="text-ink-2">데이터에 있는 다른 원소 추가:</span>{" "}
              {extra.filter((e) => !cfg.elements.includes(e)).map((e) => <button key={e} className="font-mono px-1.5 py-0.5 border border-line-2 rounded-[3px] mr-1 mt-1 hover:border-ink" onClick={() => toggle(e)}>+{e}</button>)}
            </div>
          )}
          <p className="text-[12.5px] text-ink-3 mt-1.5 leading-relaxed">
            Fe는 지하 공간 입자 대부분에서 검출되므로 &lsquo;검출만&rsquo;으로 두면 조성 기준이 거의 100%가 될 수 있습니다. 필요하면 Fe에 wt% 하한을 두고, 그 값을 초록 방법에 적으세요.
          </p>
        </section>
      </div>
      <style>{`.sim-inp{border:1px solid var(--color-line-2);border-radius:3px;padding:3px 6px;font-size:13.5px;background:#fff}`}</style>
    </Card>
  );
}

function LitColumn({ title, color, cases }: { title: string; color: string; cases: LiteratureCase[] }) {
  return (
    <div>
      <h4 className="text-[14.5px] font-semibold flex items-center gap-2"><span className="w-2.5 h-2.5" style={{ background: color }} />{title}</h4>
      <ul className="mt-2 space-y-3">
        {cases.map((c) => (
          <li key={c.cite} className="text-[13.5px] leading-relaxed">
            <div className="font-semibold">{c.url ? <a className="text-accent hover:underline" href={c.url} target="_blank" rel="noreferrer">{c.cite}</a> : c.cite} <span className="text-[12px] font-normal text-ink-3 border border-line-2 rounded-[3px] px-1 ml-1">{c.checked}</span></div>
            <div className="text-ink-2 mt-0.5">{c.finding}</div>
            {c.caution && <div className="text-[12.5px] text-[#6b4b00] mt-0.5">주의: {c.caution}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ParticleTile({ e }: { e: ParticleEval }) {
  const p = e.particle;
  const both = e.both === true;
  const auto = /윤곽 미확인/.test(p.meta?.size_method ?? "");
  return (
    <a href={hrefFor({ page: "particles", particleKey: p.key })} className={`block border rounded-[3px] overflow-hidden bg-surface hover:border-ink ${both ? "border-signal border-2" : "border-line"}`}>
      <div className="aspect-[4/3] bg-[#1b1f1e] relative">
        {p.image ? <img src={p.image.url} alt={p.particle_id} loading="lazy" className="absolute inset-0 w-full h-full object-contain" /> : <div className="absolute inset-0 grid place-items-center text-white/60 text-[12px]">사진 없음</div>}
        <span className="absolute left-1 top-1 bg-white/90 text-[11.5px] px-1 rounded-sm font-mono">{e.site?.short ?? "—"} · {p.particle_id}</span>
      </div>
      <div className="px-2 py-1.5 text-[12.5px] leading-snug">
        <div className="tnum">길이 {e.size != null ? `${e.size.toFixed(1)} µm` : "—"} · AR {e.ar != null ? e.ar.toFixed(2) : "—"}{auto && <span className="text-ink-3"> (자동)</span>}</div>
        <div className="flex flex-wrap gap-1 mt-1">
          <Tag on={e.shape} label="형상" color={C_SHAPE} />
          <Tag on={e.comp} label={e.compHits.length ? e.compHits.join("·") : "조성"} color={C_COMP} />
        </div>
      </div>
    </a>
  );
}

function Tag({ on, label, color }: { on: boolean | null; label: string; color: string }) {
  if (on == null) return <span className="text-[11.5px] px-1.5 rounded-sm border border-dashed border-line-2 text-ink-3">{label} ?</span>;
  return on
    ? <span className="text-[11.5px] px-1.5 rounded-sm text-white" style={{ background: color }}>{label} ✓</span>
    : <span className="text-[11.5px] px-1.5 rounded-sm border border-line-2 text-ink-3">{label} ✕</span>;
}

function ColorScale() {
  const stops = [0, 0.2, 0.4, 0.6, 0.8, 1];
  return (
    <div className="flex items-center gap-2 text-[12.5px] text-ink-2">
      <span>비율</span>
      <div className="flex h-2.5 w-48 border border-line">
        {stops.map((t) => <div key={t} className="flex-1" style={{ background: seqColor(t) }} />)}
      </div>
      <span className="tnum">0% → 100%</span>
      <span className="ml-3 inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full border border-dashed border-[#8a877f]" />데이터 없음</span>
    </div>
  );
}
