/* 규칙 기반 AI 시뮬레이터(초록 ver1.1).
   ① 문헌 데이터베이스의 발생원별 지표 조건(규칙) → ② 입자별 조성·형상 조건 동시 적용(발생원 판정)
   → ③ 지점별 집계를 평면도에 표시 → ④ 우선 관리 입자와 추가 분석이 필요한 원소·지점 판단. */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { hrefFor, useStore } from "../state/store";
import { Button, Card, Notice, PageHeader } from "../components/ui";
import { SiteMap, type MapItem } from "../components/SiteMap";
import { atomicOrder, elementNameKo } from "../lib/elements";
import {
  DEFAULT_SIM_CONFIG, SOURCE_RULES, THRESHOLD_LABELS, missingIndicators, ruleText, simulate, siteAdvice,
  type ParticleJudgement, type Rate, type RuleStat, type SimConfig, type SourceRule,
} from "../lib/sources";
import { seqColor } from "../lib/palette";

const pctTxt = (r: Rate | null | undefined) => (r && r.n ? `${(r.pct ?? 0).toFixed(1)}%` : "—");
const kn = (r: Rate | null | undefined) => (r && r.n ? `${r.k}/${r.n}` : "—");
const ruleById = (id: string) => SOURCE_RULES.find((r) => r.id === id)!;

export function SimulatorPage() {
  const { particles, settings, sim, setSim, sharedInfo, data, loadShared, allIssues } = useStore();
  const feMissing = useMemo(() => new Set(allIssues.filter((i) => i.code === "FE_NOT_IN_ELEMENT_LIST" && i.particleKey).map((i) => i.particleKey!)), [allIssues]);
  const cfg = sim.config;
  const setCfg = (p: Partial<SimConfig>) => setSim((s) => ({ ...s, config: { ...s.config, ...p } }));
  /** 지도 표시: "el:Fe"(원소 검출 비율), "rule:rail"(입자 유형 비율), "top"(지점별 대표 판정) — 기본은 모든 지점을 같은 기준으로 */
  const [mapMode, setMapMode] = useState<string>("el:Fe");
  const [siteId, setSiteId] = useState("gate");
  const [editing, setEditing] = useState(false);
  const planInput = useRef<HTMLInputElement>(null);

  const res = useMemo(() => simulate(particles, cfg, settings), [particles, cfg, settings]);
  const missing = useMemo(() => missingIndicators(particles), [particles]);
  const site = res.sites.find((s) => s.site.id === siteId)!;
  const advice = siteAdvice(site);
  const nJudged = res.sites.reduce((a, s) => a + s.judged.length, 0);
  const nMatched = res.sites.reduce((a, s) => a + s.judged.filter((j) => j.matched.length).length, 0);
  const dataElements = useMemo(() => [...new Set(res.sites.flatMap((s) => s.judged.flatMap((j) => Object.entries(j.particle.elements).filter(([, e]) => e.status === "detected" && (e.wt ?? 0) > 0).map(([el]) => el))))]
    .sort((a, b) => atomicOrder(a) - atomicOrder(b)), [res]);

  const mapView = useMemo((): { title: string; subtitle: ReactNode; items: MapItem[] } => {
    if (mapMode.startsWith("el:")) {
      const el = mapMode.slice(3);
      return {
        title: `${el}(${elementNameKo(el)}) 검출 입자 비율`,
        subtitle: <>원 안 숫자 = 그 지점 분석 입자 중 <b>{el}가 검출된 입자</b>의 비율(스폿 3곳 중 한 곳 이상), 원 아래 = 검출 입자 수/분석 입자 수와 검출 입자의 평균 함량. 모든 지점이 같은 기준입니다.
          {el === "Fe" && feMissing.size > 0 && <span className="block text-[#6b4b00] mt-1">주의: 화장품(F-1) 입자 {feMissing.size}개는 Phenom 원소 목록에 Fe가 빠진 채 정량되어, 화장품 지점의 Fe 비율은 실제보다 낮게 나옵니다.</span>}</>,
        items: res.sites.map((s) => {
          const ps = s.judged.filter((j) => j.particle.edsValid).map((j) => j.particle);
          const wts = ps.map((p) => p.elements[el]).filter((e) => e && e.status === "detected" && (e.wt ?? 0) > 0).map((e) => e!.wt!);
          const mean = wts.length ? wts.reduce((a, b) => a + b, 0) / wts.length : null;
          return { site: s.site, k: wts.length, n: ps.length, pct: ps.length ? (wts.length / ps.length) * 100 : null, expected: false, caption: mean != null ? `평균 ${mean.toFixed(1)} wt%` : "미검출" };
        }),
      };
    }
    if (mapMode.startsWith("rule:")) {
      const r = ruleById(mapMode.slice(5));
      return {
        title: `${r.label} 비율`,
        subtitle: <>원 안 숫자 = 그 지점 분석 입자 중 <b>{r.label}</b>({ruleText(r, cfg.thresholds)})에 해당하는 입자의 비율, 원 아래 = 해당/판정 가능 입자 수. 굵은 테두리 = 이 발생원({r.source})이 예상되는 지점. 모든 지점이 같은 기준입니다.</>,
        items: res.sites.map((s) => ({ site: s.site, k: s.rules[r.id].k, n: s.rules[r.id].n, pct: s.rules[r.id].pct, expected: r.siteId === s.site.id })),
      };
    }
    return {
      title: "지점별 대표 판정",
      subtitle: <>원 안 숫자 = 그 지점에서 <b>가장 많이 해당한 입자 유형</b>의 비율(지점마다 기준이 달라 숫자끼리 비교하지 마세요), 원 아래 = 그 유형 이름.</>,
      items: res.sites.map((s) => {
        const best = SOURCE_RULES.map((r) => ({ r, st: s.rules[r.id] })).filter((x) => x.st.k > 0).sort((a, b) => (b.st.pct ?? 0) - (a.st.pct ?? 0))[0];
        return best
          ? { site: s.site, k: best.st.k, n: best.st.n, pct: best.st.pct, expected: false, caption: best.r.label, color: best.r.color }
          : { site: s.site, k: 0, n: s.judged.length, pct: 0, expected: false, caption: "해당 유형 없음" };
      }),
    };
  }, [mapMode, res, cfg.thresholds, feMissing]);

  const uploadPlan = async (file: File) => {
    const url = URL.createObjectURL(file);
    try {
      const im = new Image();
      await new Promise<void>((ok, bad) => { im.onload = () => ok(); im.onerror = () => bad(new Error("이미지를 읽지 못했습니다")); im.src = url; });
      const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(im, 0, 0, c.width, c.height);
      setSim((s) => ({ ...s, floorPlan: { url: c.toDataURL("image/jpeg", 0.85), name: file.name, w: c.width, h: c.height } }));
      setEditing(true);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  if (!particles.length) {
    return (
      <>
        <PageHeader title="AI 시뮬레이터" />
        <Notice kind="warning" title="데이터가 없습니다">
          <a className="text-accent underline" href={hrefFor({ page: "data" })}>데이터 관리</a>에서 Phenom 원본 폴더를 올려 주세요.
        </Notice>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="AI 시뮬레이터 — 지점별 발생원 판정"
        description="선행연구에서 제시된 발생원별 지표 조건을 규칙으로 구성하여, 입자마다 조성과 형상 조건을 동시에 적용해 발생원을 판정하고 보고된 건강 영향을 연결합니다. 판정 결과는 지점별로 집계해 지하상가 평면도에 표시합니다."
      />

      {res.sites.every((x) => x.total === 0) && (
        <div className="mb-4">
          <Notice kind="warning" title="지금 화면의 데이터에는 5개 지점 입자가 없습니다">
            이 브라우저에 예전에 저장한 데이터(입자 {particles.length}개)가 열려 있습니다.
            {sharedInfo && !data.shared ? <> 강남역 5개 지점 데이터(팀 공유 데이터셋, 입자 {sharedInfo.particles}개)를 보려면 <Button small variant="primary" onClick={() => loadShared()}>공유 데이터셋 열기</Button></> : <> <a className="text-accent underline" href={hrefFor({ page: "data" })}>데이터 관리</a>에서 원본 폴더를 올려 주세요.</>}
          </Notice>
        </div>
      )}
      <ol className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4 text-[13.5px]">
        {[
          ["문헌 규칙", `발생원 ${new Set(SOURCE_RULES.map((r) => r.source)).size}종 · 판정 규칙 ${SOURCE_RULES.length}개`],
          ["입자별 판정", `분석 대상 ${nJudged}개 중 ${nMatched}개가 하나 이상의 규칙에 해당`],
          ["지점별 집계", "평면도·비율·95% 신뢰구간·지점 간 차이 검정"],
          ["관리·추가 분석 판단", "우선 관리 입자, 필요 입자 수, 측정 원소 확인"],
        ].map(([t, d], i) => (
          <li key={t} className="bg-surface border border-line rounded-[3px] px-3 py-2.5">
            <div className="font-mono text-[12px] text-accent">STEP {i + 1}</div>
            <div className="font-semibold">{t}</div>
            <div className="text-ink-2 text-[12.5px] mt-0.5 leading-snug">{d}</div>
          </li>
        ))}
      </ol>

      {/* 지도 + 지점 판단 */}
      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_440px] gap-4">
        <Card
          title={`지하상가 평면도 — ${mapView.title}`}
          subtitle={mapView.subtitle}
          actions={
            <select className="border border-line-2 rounded-[3px] px-2 py-1 text-[13.5px] bg-white max-w-[300px]" value={mapMode} onChange={(e) => setMapMode(e.target.value)} aria-label="지도에 표시할 기준">
              <optgroup label="원소 — 검출된 입자 비율">
                {dataElements.map((el) => <option key={el} value={`el:${el}`}>{el} ({elementNameKo(el)}) 검출 비율</option>)}
              </optgroup>
              <optgroup label="입자 유형 — 판정 규칙에 해당하는 비율">
                {SOURCE_RULES.map((r) => <option key={r.id} value={`rule:${r.id}`}>{r.label} ({r.source})</option>)}
              </optgroup>
              <optgroup label="기타">
                <option value="top">지점별 대표 판정(지점마다 기준 다름)</option>
              </optgroup>
            </select>
          }
        >
          <div className="flex flex-wrap items-center gap-1 mb-2 text-[12.5px]">
            <span className="text-ink-3 mr-1">빠른 선택</span>
            {["Fe", "Ca", "Na", "Cl", "S", "Mg", "K", "Ti", "Zn"].filter((el) => dataElements.includes(el)).map((el) => (
              <button key={el} onClick={() => setMapMode(`el:${el}`)} className={`font-mono px-2 py-0.5 border rounded-[3px] ${mapMode === `el:${el}` ? "bg-block text-white border-block" : "border-line-2 hover:border-ink"}`}>{el}</button>
            ))}
            <span className="w-2" />
            {["rail", "nacl", "cas", "tizn", "talc", "fiber", "cafe"].map((id) => { const r = ruleById(id); return (
              <button key={id} onClick={() => setMapMode(`rule:${id}`)} className={`px-2 py-0.5 border rounded-[3px] ${mapMode === `rule:${id}` ? "bg-block text-white border-block" : "border-line-2 hover:border-ink"}`}>{r.label.replace(" 입자", "")}</button>
            ); })}
          </div>
          <SiteMap items={mapView.items} sim={sim} setSim={setSim} selected={siteId} onSelect={setSiteId} editing={editing} />
          {mapMode === "top" && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[12.5px] text-ink-2">
              {SOURCE_RULES.map((r) => <span key={r.id} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 inline-block" style={{ background: r.color }} />{r.label}</span>)}
            </div>
          )}
          <p className="text-[12.5px] text-[#6b4b00] mt-1.5">주의: Ti·Zn, Na·Cl, Si는 유리섬유 필터에서도 검출될 수 있어 해당 유형(Ti 또는 Zn 함유, Na-Cl)은 실제보다 높게 판정될 수 있습니다. 원소 함량이 낮은 판정은 입자 상세에서 스폿 값을 확인하세요.</p>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-[13px]">
            <Button small variant={editing ? "primary" : "default"} onClick={() => setEditing((v) => !v)}>{editing ? "위치 옮기기 끝" : "마커 위치 옮기기"}</Button>
            <Button small onClick={() => planInput.current?.click()}>다른 평면도 올리기</Button>
            {(sim.floorPlan || Object.keys(sim.positions).length > 0) && <Button small variant="ghost" onClick={() => setSim((s) => ({ ...s, floorPlan: null, positions: {} }))}>기본 배치도로</Button>}
            <input ref={planInput} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPlan(f); e.target.value = ""; }} />
          </div>
        </Card>

        <Card title={`${site.site.label} — 판단`} subtitle={`분석 대상 ${site.judged.length}개 (전체 ${site.total}개 중 ${cfg.applySize ? `최대 길이 ${cfg.sizeMin}~${cfg.sizeMax} µm` : "크기 제한 없음"})`}>
          <SiteJudgement siteName={site.site.short} expected={advice.expected} priority={advice.priority} needN={advice.needN} n={site.judged.length} missing={missing.filter((m) => m.rules.some((r) => r.siteId === site.site.id))} />
        </Card>
      </div>

      {/* 지점 × 규칙 표 */}
      <div className="mt-4">
        <Card title="지점별 발생원 판정 결과" subtitle="칸 = 해당 비율(해당/판정 가능 입자). 굵은 테두리 = 예상 지점, * = 이 지점이 다른 지점들과 유의하게 다름(Fisher 정확검정 p < 0.05). 칸을 누르면 지도와 오른쪽 판단이 바뀝니다.">
          <div className="overflow-x-auto">
            <table className="data text-[13px]">
              <thead>
                <tr><th>발생원 · 입자 유형</th><th>판정 조건</th>{res.sites.map((s) => <th key={s.site.id} className="num">{s.site.short}</th>)}<th className="num">전체</th></tr>
              </thead>
              <tbody>
                {SOURCE_RULES.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap"><span className="inline-block w-2.5 h-2.5 mr-1.5 align-middle" style={{ background: r.color }} />{r.source} · <b>{r.label}</b></td>
                    <td className="text-[12.5px] text-ink-2">{ruleText(r, cfg.thresholds)}{r.sub ? ` (부가: ${r.sub.label})` : ""}</td>
                    {res.sites.map((s) => {
                      const st = s.rules[r.id];
                      const exp = r.siteId === s.site.id;
                      return (
                        <td key={s.site.id} className="num cursor-pointer" onClick={() => { setMapMode(`rule:${r.id}`); setSiteId(s.site.id); }}
                          style={{ background: st.n && st.k ? seqColor((st.pct ?? 0) / 100) + "55" : undefined, outline: exp ? "2px solid #282828" : undefined, outlineOffset: -2 }}>
                          <div className="font-semibold">{pctTxt(st)}{st.p != null && st.p < 0.05 ? "*" : ""}</div>
                          <div className="text-[11.5px] text-ink-3">{kn(st)}{st.sub && st.k ? ` · ${r.sub!.label.split(" ")[0]} ${kn(st.sub)}` : ""}</div>
                        </td>
                      );
                    })}
                    <td className="num"><div className="font-semibold">{pctTxt(res.overall[r.id])}</div><div className="text-[11.5px] text-ink-3">{kn(res.overall[r.id])}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* 입자 목록 */}
      <div className="mt-4">
        <Card title={`${site.site.label} 입자 ${site.judged.length}개`} subtitle="사진을 누르면 입자 상세(스폿별 원소 구성비)로 이동합니다. 태그 = 해당한 규칙.">
          {site.judged.length === 0 ? <p className="text-[14px] text-ink-2">분석 대상 입자가 없습니다.</p> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-3">
              {site.judged.map((j) => <Tile key={j.particle.key} j={j} />)}
            </div>
          )}
        </Card>
      </div>

      {/* 기준값 + 문헌 DB */}
      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-4 mt-4">
        <Card title="기준값" subtitle="바꾸면 판정·지도·표가 바로 다시 계산됩니다." actions={<Button small variant="ghost" onClick={() => setCfg({ ...DEFAULT_SIM_CONFIG })}>초기값</Button>}>
          <div className="space-y-2 text-[13.5px]">
            <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.applySize} onChange={(e) => setCfg({ applySize: e.target.checked })} />최대 길이 범위</label>
            <div className={`flex items-center gap-1.5 ${cfg.applySize ? "" : "opacity-50"}`}>
              <NumIn v={cfg.sizeMin} step={0.5} on={(v) => setCfg({ sizeMin: v })} /> ~ <NumIn v={cfg.sizeMax} step={0.5} on={(v) => setCfg({ sizeMax: v })} /> µm
            </div>
            <hr className="border-line" />
            {Object.entries(THRESHOLD_LABELS).map(([k, t]) => (
              <div key={k} className="flex items-center justify-between gap-2">
                <span>{t.label}</span>
                <span className="flex items-center gap-1"><NumIn v={cfg.thresholds[k]} step={t.step} on={(v) => setCfg({ thresholds: { ...cfg.thresholds, [k]: v } })} /><span className="w-8 text-ink-3">{t.unit}</span></span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="문헌 데이터베이스 — 판정 규칙과 건강 영향" subtitle="건강 영향은 그 특성의 입자에서 보고된 사례이며, 우리 입자의 위해 정도를 뜻하지 않습니다.">
          <div className="overflow-x-auto">
            <table className="data text-[13px]">
              <thead><tr><th>발생원 · 입자 유형</th><th>판정 근거</th><th>보고된 건강 영향</th><th>근거</th></tr></thead>
              <tbody>
                {SOURCE_RULES.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{r.source}<br /><b>{r.label}</b></td>
                    <td className="text-[12.5px]">{r.basis}{r.caution && <div className="text-[#6b4b00] mt-0.5">주의: {r.caution}</div>}</td>
                    <td className="text-[12.5px]">{r.health.effect}</td>
                    <td className="text-[12.5px] whitespace-nowrap">{r.health.refs}<div className="text-ink-3">{r.health.evidence}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Notice kind="info" title="해석할 때 주의할 점">
          원소 값은 입자 위 EDS 스폿 3곳의 평균이며 EDS로는 결정상을 구분할 수 없습니다. 포집 지점이 곧 발생원은 아닙니다. 종횡비는 섬유 필터 배경 위 자동 측정값이라 검토가 필요합니다.
          지점당 입자 수가 적어 비율의 불확실성이 크고, 판정 비율은 노출량이나 건강 위험의 크기를 뜻하지 않습니다.
        </Notice>
      </div>
    </>
  );
}

function SiteJudgement({ siteName, expected, priority, needN, n, missing }: {
  siteName: string;
  expected: Array<{ rule: SourceRule; stat: RuleStat }>;
  priority: Array<{ rule: SourceRule; stat: RuleStat }>;
  needN: number;
  n: number;
  missing: Array<{ el: string; rules: SourceRule[] }>;
}) {
  return (
    <div className="space-y-4 text-[13.5px]">
      <section>
        <h4 className="font-semibold mb-1">예상 발생원 판정</h4>
        <ul className="space-y-1">
          {expected.map(({ rule, stat }) => (
            <li key={rule.id} className="flex justify-between gap-2">
              <span>{rule.label}</span>
              <span className="tnum font-semibold">{pctTxt(stat)} <span className="font-normal text-ink-3">({kn(stat)}){stat.sub && stat.k ? ` · ${rule.sub!.label} ${kn(stat.sub)}` : ""}</span></span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h4 className="font-semibold mb-1">우선 관리 입자</h4>
        {priority.length === 0 ? <p className="text-ink-2">어느 규칙에도 해당하는 입자가 없습니다.</p> : (
          <ul className="space-y-2">
            {priority.slice(0, 3).map(({ rule, stat }) => (
              <li key={rule.id} className="border-l-4 pl-2" style={{ borderColor: rule.color }}>
                <div className="flex justify-between gap-2"><b>{rule.label}</b><span className="tnum">{pctTxt(stat)} ({kn(stat)}){stat.p != null && stat.p < 0.05 ? " *" : ""}</span></div>
                <div className="text-[12.5px] text-ink-2">{rule.health.effect} <span className="text-ink-3">({rule.health.refs})</span></div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h4 className="font-semibold mb-1">추가 분석 판단</h4>
        <ul className="list-disc pl-5 space-y-1 text-ink-2">
          <li>현재 {n}개 — 주요 비율을 ±15%p 이내로 추정하려면 약 <b className="text-ink">{needN}개</b>가 필요합니다{n >= needN ? "(충족)." : `(${Math.max(0, needN - n)}개 추가).`}</li>
          {missing.map((m) => (
            <li key={m.el}><b className="text-ink">{m.el}</b>는 전체 데이터에서 한 번도 검출되지 않았습니다 — {siteName}의 {m.rules.map((r) => r.label).join("·")} 판정에 필요하므로 측정 원소 목록에 넣었는지 확인하세요.</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Tile({ j }: { j: ParticleJudgement }) {
  const p = j.particle;
  return (
    <a href={hrefFor({ page: "particles", particleKey: p.key })} className="block border border-line rounded-[3px] overflow-hidden bg-surface hover:border-ink">
      <div className="aspect-[4/3] bg-[#1b1f1e] relative">
        {p.image ? <img src={p.image.url} alt={p.particle_id} loading="lazy" className="absolute inset-0 w-full h-full object-contain" /> : <div className="absolute inset-0 grid place-items-center text-white/60 text-[12px]">사진 없음</div>}
        <span className="absolute left-1 top-1 bg-white/90 text-[11.5px] px-1 rounded-sm font-mono">{p.particle_id}</span>
      </div>
      <div className="px-2 py-1.5 text-[12.5px] leading-snug">
        <div className="tnum text-ink-2">길이 {j.size != null ? `${j.size.toFixed(1)} µm` : "—"} · 종횡비 {p.meta?.aspect_ratio != null ? p.meta.aspect_ratio.toFixed(2) : "—"}</div>
        <div className="flex flex-wrap gap-1 mt-1">
          {j.matched.length ? j.matched.map((id) => { const r = ruleById(id); return <span key={id} className="text-[11.5px] px-1.5 rounded-sm text-white" style={{ background: r.color }}>{r.label}</span>; })
            : <span className="text-[11.5px] text-ink-3">해당 규칙 없음</span>}
        </div>
      </div>
    </a>
  );
}

function NumIn({ v, on, step }: { v: number; on: (v: number) => void; step: number }) {
  return (
    <input type="number" step={step} value={v} onChange={(e) => { const x = parseFloat(e.target.value); if (Number.isFinite(x)) on(x); }}
      className="w-20 border border-line-2 rounded-[3px] px-1.5 py-0.5 text-right tnum bg-white" />
  );
}
