/* 규칙 기반 AI 시뮬레이터(제출 초록 기준).
   ① 문헌 데이터베이스의 발생원별 지표 조건(규칙) → ② 입자별 조성·형상 조건 동시 적용(발생원 판정)과 건강 위해 연결
   → ③ 지점별 집계를 평면도에 표출, 기준값 변경에 따른 변화 확인
   → ④ 지점별 우선 관리 입자, 추가 분석이 필요한 원소·지점, 후속 세포 실험 시료 지점 판단. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loadLargeArea, type LargeAreaSet } from "../lib/largeArea";
import type { AnalysisSettings, Particle } from "../lib/types";
import { hashParams, hrefFor, teamShareUrl, useStore } from "../state/store";
import { Button, Card, Kpi, Notice, PageHeader } from "../components/ui";
import { SiteMap, type MapDisplay, type MapItem } from "../components/SiteMap";
import { atomicOrder, elementNameKo } from "../lib/elements";
import { SiteLiteratureBlock } from "../components/LiteratureList";
import {
  DEFAULT_SIM_CONFIG, SOURCE_RULES, THRESHOLD_LABELS, judgeParticle, mainElements, missingIndicators, ruleText, simulate, siteAdvice,
  type ParticleJudgement, type Rate, type RuleStat, type SimConfig, type SiteResult, type Simulation, type SourceRule,
} from "../lib/sources";
import { LITERATURE_DB } from "../config/siteLiterature";
import { seqColor } from "../lib/palette";

const pctTxt = (r: Rate | null | undefined) => (r && r.n ? `${(r.pct ?? 0).toFixed(1)}%` : "—");
const kn = (r: Rate | null | undefined) => (r && r.n ? `${r.k}/${r.n}` : "—");
const ruleById = (id: string) => SOURCE_RULES.find((r) => r.id === id)!;

export function SimulatorPage() {
  const { particles: semParticles, settings, sim, setSim, sharedInfo, data, loadShared, allIssues } = useStore();
  /** 데이터: SEM-EDS 단일입자(기본) 또는 대면적 자동 분석(Particle Inspector) */
  const [src, setSrc] = useState<"sem" | "large">(() => (hashParams().get("src") === "large" ? "large" : "sem"));
  const [la, setLa] = useState<LargeAreaSet | null | undefined>(undefined);
  useEffect(() => {
    if (src === "large" && la === undefined) loadLargeArea().then(setLa);
  }, [src, la]);
  const large = src === "large";
  const particles = large ? la?.particles ?? [] : semParticles;
  const feMissing = useMemo(() => (large ? new Set<string>() : new Set(allIssues.filter((i) => i.code === "FE_NOT_IN_ELEMENT_LIST" && i.particleKey).map((i) => i.particleKey!))), [allIssues, large]);
  const cfg = sim.config;
  const setCfg = (p: Partial<SimConfig>) => setSim((s) => ({ ...s, config: { ...s.config, ...p } }));
  /** 지도 표시: "shape"(비구형 비율), "el:Fe"(원소 검출 비율), "rule:rail"(입자 유형 비율), "top"(지점별 대표 판정) — 기본은 모든 지점을 같은 기준으로 */
  // 공유 링크로 열면 링크에 담긴 표시 기준·방식으로 시작
  const [mapMode, setMapMode] = useState<string>(() => {
    const m = hashParams().get("map") ?? "";
    return m === "shape" || m === "top" || /^el:[A-Z][a-z]?$/.test(m) || (m.startsWith("rule:") && SOURCE_RULES.some((r) => `rule:${r.id}` === m)) ? m : "shape";
  });
  /** 원(지점별 값) 또는 등고선(지점 사이를 면적 가중 평균으로 보간) */
  const [mapDisplay, setMapDisplay] = useState<MapDisplay>(() => (hashParams().get("view") === "contour" ? "contour" : "circle"));
  const [copied, setCopied] = useState(false);
  const copyShare = async () => {
    const url = teamShareUrl(mapMode, mapDisplay, src);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("이 링크를 복사해 팀원에게 보내세요", url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const [siteId, setSiteId] = useState("gate");
  const [editing, setEditing] = useState(false);
  const planInput = useRef<HTMLInputElement>(null);

  const res = useMemo(() => simulate(particles, cfg, settings), [particles, cfg, settings]);
  const base = useMemo(() => simulate(particles, DEFAULT_SIM_CONFIG, settings), [particles, settings]);
  const changed = JSON.stringify(cfg) !== JSON.stringify(DEFAULT_SIM_CONFIG);
  // 5개 지점 입자만 본다(공기청정기 참고 입자의 원소가 섞이지 않게)
  const missing = useMemo(() => missingIndicators(res.judgements.filter((j) => j.site).map((j) => j.particle)), [res]);
  const site = res.sites.find((s) => s.site.id === siteId)!;
  const advice = siteAdvice(site);
  const nJudged = res.sites.reduce((a, s) => a + s.judged.length, 0);
  const nMatched = res.sites.reduce((a, s) => a + s.judged.filter((j) => j.matched.length).length, 0);
  const mains = useMemo(() => mainElements(res), [res]);
  const nsSites = res.sites.filter((s) => s.nonSphere.n > 0);
  const nsMax = nsSites.length ? nsSites.reduce((a, b) => ((b.nonSphere.pct ?? 0) > (a.nonSphere.pct ?? 0) ? b : a)) : null;
  const nsMin = nsSites.length ? nsSites.reduce((a, b) => ((b.nonSphere.pct ?? 0) < (a.nonSphere.pct ?? 0) ? b : a)) : null;
  const dataElements = useMemo(() => [...new Set(res.sites.flatMap((s) => s.judged.flatMap((j) => Object.entries(j.particle.elements).filter(([, e]) => e.status === "detected" && (e.wt ?? 0) > 0).map(([el]) => el))))]
    .sort((a, b) => atomicOrder(a) - atomicOrder(b)), [res]);

  const mapView = useMemo((): { title: string; subtitle: ReactNode; items: MapItem[] } => {
    if (mapMode === "shape") {
      return {
        title: `비구형 입자 비율(종횡비 ${cfg.thresholds.nonSphereAr} 이상)`,
        subtitle: <>원 안 숫자 = 그 지점 분석 입자 중 <b>종횡비 {cfg.thresholds.nonSphereAr} 이상인 비구형 입자</b>의 비율, 원 아래 = 해당/측정 입자 수. 모든 지점이 같은 기준입니다.</>,
        items: res.sites.map((s) => ({ site: s.site, k: s.nonSphere.k, n: s.nonSphere.n, pct: s.nonSphere.pct, expected: false })),
      };
    }
    if (mapMode.startsWith("el:")) {
      const el = mapMode.slice(3);
      return {
        title: `${el}(${elementNameKo(el)}) 검출 입자 비율`,
        subtitle: <>원 안 숫자 = 그 지점 분석 입자 중 <b>{el}가 검출된 입자</b>의 비율({large ? "자동 분석 EDS에서 0 wt% 초과" : "스폿 3곳 중 한 곳 이상"}), 원 아래 = 검출 입자 수/분석 입자 수와 검출 입자의 평균 함량. 모든 지점이 같은 기준입니다.
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

  const groupRows = useMemo(() => (large && la ? groupStats(la, cfg, settings) : []), [large, la, cfg, settings]);
  const toggle = <SourceToggle src={src} setSrc={setSrc} semN={semParticles.length} la={la} />;

  if (large && !particles.length) {
    return (
      <>
        <PageHeader title="AI 시뮬레이터" />
        {toggle}
        <Notice kind={la === undefined ? "info" : "warning"} title={la === undefined ? "대면적 분석 데이터를 읽는 중입니다" : "대면적 분석 데이터가 없습니다"}>
          {la === undefined ? "잠시만 기다려 주세요." : <>배포판에 shared-data/large-area.json 파일이 없습니다. scripts/build-large-area.py로 만든 뒤 다시 배포하세요.</>}
        </Notice>
      </>
    );
  }

  if (!particles.length) {
    return (
      <>
        <PageHeader title="AI 시뮬레이터" />
        {toggle}
        <Notice kind="warning" title="데이터가 없습니다">
          {sharedInfo ? <>강남역 5개 지점 데이터(팀 공유 데이터셋, 입자 {sharedInfo.particles}개)를 열 수 있습니다. <Button small variant="primary" onClick={() => loadShared()}>공유 데이터셋 열기</Button> 또는 </> : null}
          <a className="text-accent underline" href={hrefFor({ page: "data" })}>데이터 관리</a>에서 Phenom 원본 폴더를 올려 주세요.
        </Notice>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="AI 시뮬레이터 — 지점별 발생원 판정"
        description="환승 거점형 지하상가의 지점별 단일입자 형상·조성 분석. 선행연구의 발생원별 지표 조건을 규칙으로 구성해 측정값에 적용하고, 입자마다 조성과 형상 조건을 동시에 적용해 발생원을 판정한 뒤 보고된 건강 위해를 연결합니다. 지점별 집계 결과는 지하상가 평면도에 표출합니다."
      />
      {toggle}
      {large && la && (
        <div className="mb-4">
          <Notice kind="warning" title="대면적 자동 분석 데이터로 보는 중입니다">
            Phenom Particle Inspector가 필터 위 넓은 면적에서 입자를 자동으로 찾아 짧은 시간 EDS를 얻은 값입니다(배율 {la.data.groups[0]?.mag.join(", ")}×, 최대 길이 5 µm 이상만 저장).
            입자 수가 많아 비율의 신뢰구간은 좁지만, 측정 시간이 짧아 미량 원소가 잘못 검출될 수 있고(Newbury 2009, 문헌 A36) 섬유 필터 배경이 섞입니다.
            아래 <a className="underline" href="#reference">참조 그룹 비교</a>에서 Free Filter·Bio Filter 값과 함께 보세요.
            {res.sites.some((s) => !la.data.groups.some((g) => g.siteId === s.site.id)) && (
              <> 대면적 파일이 없는 지점: <b>{res.sites.filter((s) => !la.data.groups.some((g) => g.siteId === s.site.id)).map((s) => s.site.label).join(", ")}</b>.</>
            )}
          </Notice>
        </div>
      )}

      {!large && res.sites.every((x) => x.total === 0) && (
        <div className="mb-4">
          <Notice kind="warning" title="지금 화면의 데이터에는 5개 지점 입자가 없습니다">
            이 브라우저에 예전에 저장한 데이터(입자 {particles.length}개)가 열려 있습니다.
            {sharedInfo && !data.shared ? <> 강남역 5개 지점 데이터(팀 공유 데이터셋, 입자 {sharedInfo.particles}개)를 보려면 <Button small variant="primary" onClick={() => loadShared()}>공유 데이터셋 열기</Button></> : <> <a className="text-accent underline" href={hrefFor({ page: "data" })}>데이터 관리</a>에서 원본 폴더를 올려 주세요.</>}
          </Notice>
        </div>
      )}
      <ol className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4 text-[13.5px]">
        {[
          ["문헌 데이터베이스", `등록 문헌 ${LITERATURE_DB.length}편 · 판정 규칙 ${SOURCE_RULES.length}개`, hrefFor({ page: "literature" })],
          ["입자별 판정", `분석 입자 ${nJudged}개에 조성·형상 조건 동시 적용, ${nMatched}개가 규칙에 해당`, "#judge"],
          ["평면도 표출", "지점별 집계와 기준값 변경에 따른 변화 확인", "#threshold"],
          ["관리·추가 분석 판단", "우선 관리 입자, 추가 분석 원소·지점, 세포 실험 시료", "#summary"],
        ].map(([t, d, h], i) => (
          <li key={t}>
            <button onClick={() => { if (h.startsWith("#/")) window.location.hash = h; else document.querySelector(h)?.scrollIntoView({ behavior: "smooth" }); }} className="w-full h-full text-left bg-surface border border-line rounded-[3px] px-3 py-2.5 hover:border-ink">
              <div className="font-mono text-[12px] text-accent">STEP {i + 1}</div>
              <div className="font-semibold">{t}</div>
              <div className="text-ink-2 text-[12.5px] mt-0.5 leading-snug">{d}</div>
            </button>
          </li>
        ))}
      </ol>

      {/* 분석 요약 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi label="분석 입자" value={nJudged} unit="개" detail={`${cfg.applySize ? `최대 길이 ${cfg.sizeMin}~${cfg.sizeMax} µm` : "크기 제한 없음"} · ${large ? `대면적 ${res.sites.filter((x) => x.total).length}개 지점` : "5개 지점"}`} />
        <Kpi label="주요 구성 원소" value={<span className="font-mono text-[0.72em]">{mains.map((m) => m.el).join(", ") || "—"}</span>} detail="분석 입자 평균 wt% 상위 4개" />
        <Kpi label={`비구형 입자 (종횡비 ≥ ${cfg.thresholds.nonSphereAr})`} value={pctTxt(res.overallNonSphere)} detail={`${kn(res.overallNonSphere)} 입자`} />
        <Kpi label="비구형 비율 최고·최저" value={<span className="text-[0.62em]">{nsMax ? `${nsMax.site.short} ${pctTxt(nsMax.nonSphere)}` : "—"}</span>} detail={nsMin ? `최저 ${nsMin.site.short} ${pctTxt(nsMin.nonSphere)}` : undefined} />
      </div>

      {/* 지도 + 지점 판단 */}
      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_440px] gap-4">
        <Card
          title={`지하상가 평면도 — ${mapView.title}`}
          subtitle={mapView.subtitle}
          actions={
            <select className="border border-line-2 rounded-[3px] px-2 py-1 text-[13.5px] bg-white max-w-[300px]" value={mapMode} onChange={(e) => setMapMode(e.target.value)} aria-label="지도에 표시할 기준">
              <optgroup label="형상">
                <option value="shape">비구형 입자 비율(종횡비 기준)</option>
              </optgroup>
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
            <button onClick={() => setMapMode("shape")} className={`px-2 py-0.5 border rounded-[3px] ${mapMode === "shape" ? "bg-block text-white border-block" : "border-line-2 hover:border-ink"}`}>비구형</button>
            <span className="w-2" />
            {["Fe", "Ca", "Na", "Cl", "S", "Mg", "K", "Ti", "Zn"].filter((el) => dataElements.includes(el)).map((el) => (
              <button key={el} onClick={() => setMapMode(`el:${el}`)} className={`font-mono px-2 py-0.5 border rounded-[3px] ${mapMode === `el:${el}` ? "bg-block text-white border-block" : "border-line-2 hover:border-ink"}`}>{el}</button>
            ))}
            <span className="w-2" />
            {["rail", "nacl", "cas", "tizn", "talc", "fiber", "cafe"].map((id) => { const r = ruleById(id); return (
              <button key={id} onClick={() => setMapMode(`rule:${id}`)} className={`px-2 py-0.5 border rounded-[3px] ${mapMode === `rule:${id}` ? "bg-block text-white border-block" : "border-line-2 hover:border-ink"}`}>{r.label.replace(" 입자", "").replace(" 불규칙 유기", " 유기")}</button>
            ); })}
          </div>
          <div className="flex flex-wrap items-center gap-1 mb-2 text-[12.5px]">
            <span className="text-ink-3 mr-1">표시 방식</span>
            {([["circle", "지점별 원"], ["contour", "등고선(면적 가중 보간)"]] as const).map(([v, label]) => (
              <button key={v} disabled={v === "contour" && mapMode === "top"} onClick={() => setMapDisplay(v)}
                className={`px-2 py-0.5 border rounded-[3px] disabled:opacity-40 ${mapDisplay === v && !(v === "contour" && mapMode === "top") || (v === "circle" && mapMode === "top") ? "bg-block text-white border-block" : "border-line-2 hover:border-ink"}`}>{label}</button>
            ))}
            {mapDisplay === "contour" && mapMode !== "top" && (
              <span className="text-ink-3 ml-1">지점 사이 값은 측정값이 아니라, 각 지점이 차지하는 면적 비율로 가중 평균한 추정값입니다(자연이웃 보간).</span>
            )}
          </div>
          <SiteMap items={mapView.items} sim={sim} setSim={setSim} selected={siteId} onSelect={setSiteId} editing={editing} display={mapMode === "top" ? "circle" : mapDisplay} />
          {mapMode === "top" && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[12.5px] text-ink-2">
              {SOURCE_RULES.map((r) => <span key={r.id} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 inline-block" style={{ background: r.color }} />{r.label}</span>)}
            </div>
          )}
          <p className="text-[12.5px] text-[#6b4b00] mt-1.5">주의: Ti·Zn, Na·Cl, Si는 유리섬유 필터에서도 검출될 수 있어 해당 유형(Ti 또는 Zn 함유, Na-Cl)은 실제보다 높게 판정될 수 있습니다. 원소 함량이 낮은 판정은 입자 상세에서 스폿 값을 확인하세요.</p>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-[13px]">
            <Button small variant={editing ? "primary" : "default"} onClick={() => setEditing((v) => !v)}>{editing ? "위치 옮기기 끝" : "마커 위치 옮기기"}</Button>
            <Button small onClick={() => planInput.current?.click()}>다른 평면도 올리기</Button>
            <Button small onClick={copyShare}>{copied ? "링크 복사됨" : "이 화면 공유 링크 복사"}</Button>
            {(sim.floorPlan || Object.keys(sim.positions).length > 0) && <Button small variant="ghost" onClick={() => setSim((s) => ({ ...s, floorPlan: null, positions: {} }))}>기본 배치도로</Button>}
            <input ref={planInput} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPlan(f); e.target.value = ""; }} />
          </div>
        </Card>

        <Card title={`${site.site.label} — 판단`} subtitle={`분석 대상 ${site.judged.length}개 (전체 ${site.total}개 중 ${cfg.applySize ? `최대 길이 ${cfg.sizeMin}~${cfg.sizeMax} µm` : "크기 제한 없음"})`}>
          <SiteJudgement siteId={site.site.id} siteName={site.site.short} expected={advice.expected} priority={advice.priority} />
        </Card>
      </div>

      {/* 지점별 판단 요약 */}
      <div className="mt-4" id="summary">
        <Card title="지점별 판단 요약" subtitle="지점별로 우선 관리할 입자, 추가 분석이 필요한 원소·입자 수, 후속 세포 실험 시료 후보입니다. 우선 관리 입자와 세포 실험 후보는 필터 영향이 큰 유형(Ti·Zn, Na-Cl)을 뒤로 돌리고, 그 입자 유형의 비율이 5개 지점 중 가장 높은 곳을 '시료 지점 우선'으로 표시합니다.">
          <SummaryTable sites={res.sites} missing={missing} selected={siteId} onSelect={setSiteId} />
        </Card>
      </div>

      {/* 지점 × 규칙 표 */}
      <div className="mt-4" id="judge">
        <Card title="지점별 발생원 판정 결과" subtitle="칸 = 해당 비율(해당/판정 가능 입자). 굵은 테두리 = 예상 지점, * = 이 지점이 다른 지점들과 유의하게 다름(Fisher 정확검정 p < 0.05). 칸을 누르면 지도와 오른쪽 판단이 바뀝니다.">
          <div className="overflow-x-auto">
            <table className="data text-[13px]">
              <thead>
                <tr><th>발생원 · 입자 유형</th><th>판정 조건</th>{res.sites.map((s) => <th key={s.site.id} className="num">{s.site.short}</th>)}<th className="num">전체</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td className="whitespace-nowrap"><span className="inline-block w-2.5 h-2.5 mr-1.5 align-middle bg-[#3d3b37]" />형상 · <b>비구형 입자</b></td>
                  <td className="text-[12.5px] text-ink-2">종횡비 ≥ {cfg.thresholds.nonSphereAr}</td>
                  {res.sites.map((s) => (
                    <td key={s.site.id} className="num cursor-pointer" onClick={() => { setMapMode("shape"); setSiteId(s.site.id); }} style={{ background: s.nonSphere.k ? seqColor((s.nonSphere.pct ?? 0) / 100) + "55" : undefined }}>
                      <div className="font-semibold">{pctTxt(s.nonSphere)}{s.nonSphere.p != null && s.nonSphere.p < 0.05 ? "*" : ""}</div>
                      <div className="text-[11.5px] text-ink-3">{kn(s.nonSphere)}</div>
                    </td>
                  ))}
                  <td className="num"><div className="font-semibold">{pctTxt(res.overallNonSphere)}</div><div className="text-[11.5px] text-ink-3">{kn(res.overallNonSphere)}</div></td>
                </tr>
                {SOURCE_RULES.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap"><span className="inline-block w-2.5 h-2.5 mr-1.5 align-middle" style={{ background: r.color }} />{r.source} · <b>{r.label}</b></td>
                    <td className="text-[12.5px] text-ink-2">{ruleText(r, cfg.thresholds)}{r.sub ? ` → 그중 ${r.sub.label}` : ""}</td>
                    {res.sites.map((s) => {
                      const st = s.rules[r.id];
                      const exp = r.siteId === s.site.id;
                      return (
                        <td key={s.site.id} className="num cursor-pointer" onClick={() => { setMapMode(`rule:${r.id}`); setSiteId(s.site.id); }}
                          style={{ background: st.n && st.k ? seqColor((st.pct ?? 0) / 100) + "55" : undefined, outline: exp ? "2px solid #282828" : undefined, outlineOffset: -2 }}>
                          <div className="font-semibold">{pctTxt(st)}{st.p != null && st.p < 0.05 ? "*" : ""}</div>
                          <div className="text-[11.5px] text-ink-3">{kn(st)}{st.sub && st.k ? ` · 그중 ${kn(st.sub)}` : ""}</div>
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

      {large && la && (
        <div className="mt-4" id="reference">
          <Card title="참조 그룹 비교 — 지점 vs Free Filter · Bio Filter" subtitle={<>같은 기준값으로 대면적 파일마다 판정한 비율입니다. 참조 그룹(지점이 아닌 파일)은 지점 통계·지도에 들어가지 않습니다. 참조 그룹에서도 비슷한 비율이 나오는 유형·원소는 필터 배경이나 자동 분석 오검출일 수 있으니, <b>지점 값이 참조보다 뚜렷하게 높은지</b>를 보세요.</>}>
            <ReferenceTable rows={groupRows} />
          </Card>
        </div>
      )}

      {/* 입자 목록 */}
      {!large && <div className="mt-4">
        <Card title={`${site.site.label} 입자 ${site.judged.length}개`} subtitle="사진을 누르면 입자 상세(스폿별 원소 구성비)로 이동합니다. 태그 = 해당한 규칙.">
          {site.judged.length === 0 ? <p className="text-[14px] text-ink-2">분석 대상 입자가 없습니다.</p> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-3">
              {site.judged.map((j) => <Tile key={j.particle.key} j={j} />)}
            </div>
          )}
        </Card>
      </div>}

      {/* 기준값 변경 */}
      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-4 mt-4" id="threshold">
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
        <Card title="기준값 변경에 따른 변화" subtitle={changed ? "초기 기준값으로 계산한 비율과 지금 기준값으로 계산한 비율을 비교합니다. 값이 달라진 유형은 강조됩니다." : "왼쪽에서 기준값을 바꾸면 초기값과의 차이가 여기에 나타납니다."}>
          <CompareTable base={base} now={res} siteId={siteId} />
        </Card>
      </div>

      <div className="mt-4">
        <Notice kind="info" title="해석할 때 주의할 점">
          {large ? <>대면적 자동 분석은 입자마다 짧은 시간 EDS를 얻어 미량 원소(Cu, Sb, Ba, Mn 등)가 잘못 검출될 수 있고, 종횡비는 자동 분할 결과라 섬유 필터와 겹친 입자에서 크게 나올 수 있습니다. 입자 사진이 없어 입자별 확인은 SEM-EDS 단일입자 데이터에서 하세요. </> : null}
          {large ? "" : "지점당 입자 수가 적고 "}종횡비 경계는 선행연구에 의해 설정된 값이며, 총량적 측면에서 건강에 미치는 위해 정도를 규명하려면 후속 검증이 필요합니다. 판정 비율은 노출량이나 건강 위험의 크기를 뜻하지 않습니다.
          원소 값은 입자 위 EDS 스폿 3곳의 평균이고 EDS로는 결정상을 구분할 수 없으며, 포집 지점이 곧 발생원은 아닙니다. 종횡비는 섬유 필터 배경 위 자동 측정값이라 검토가 필요합니다.
        </Notice>
      </div>
    </>
  );
}

const STAT_ROWS = [{ id: "shape", label: "비구형 입자" }, ...SOURCE_RULES.map((r) => ({ id: r.id, label: r.label }))];
const siteStat = (s: SiteResult, id: string): Rate => (id === "shape" ? s.nonSphere : s.rules[id]);
const allStat = (r: Simulation, id: string): Rate => (id === "shape" ? r.overallNonSphere : r.overall[id]);

function diffCell(a: Rate, b: Rate) {
  if (!a.n || !b.n) return <span className="text-ink-3">—</span>;
  const d = (b.pct ?? 0) - (a.pct ?? 0);
  if (Math.abs(d) < 0.05) return <span className="text-ink-3">변화 없음</span>;
  return <b className="text-accent tnum">{d > 0 ? "+" : ""}{d.toFixed(1)}%p</b>;
}

function CompareTable({ base, now, siteId }: { base: Simulation; now: Simulation; siteId: string }) {
  const sb = base.sites.find((s) => s.site.id === siteId)!, sn = now.sites.find((s) => s.site.id === siteId)!;
  return (
    <div className="overflow-x-auto">
      <table className="data text-[13px]">
        <thead>
          <tr><th>입자 유형</th><th className="num">전체: 초기</th><th className="num">현재</th><th className="num">변화</th><th className="num">{sn.site.short}: 초기</th><th className="num">현재</th><th className="num">변화</th></tr>
        </thead>
        <tbody>
          {STAT_ROWS.map(({ id, label }) => {
            const a = allStat(base, id), b = allStat(now, id), c = siteStat(sb, id), d = siteStat(sn, id);
            const moved = a.pct !== b.pct || c.pct !== d.pct || a.n !== b.n;
            return (
              <tr key={id} className={moved ? "bg-accent-soft" : ""}>
                <td>{label}</td>
                <td className="num">{pctTxt(a)}</td><td className="num">{pctTxt(b)}</td><td className="num">{diffCell(a, b)}</td>
                <td className="num">{pctTxt(c)}</td><td className="num">{pctTxt(d)}</td><td className="num">{diffCell(c, d)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SummaryTable({ sites, missing, selected, onSelect }: { sites: SiteResult[]; missing: Array<{ el: string; rules: SourceRule[] }>; selected: string; onSelect: (id: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="data text-[13px]">
        <thead><tr><th>지점</th><th className="num">분석 입자</th><th>우선 관리 입자</th><th>보고된 건강 위해</th><th>추가 분석 원소</th><th className="num">필요 입자 수</th><th>세포 실험 시료 후보</th></tr></thead>
        <tbody>
          {sites.map((s) => {
            const a = siteAdvice(s);
            const top = a.priority[0];
            const els = missing.filter((m) => m.rules.some((r) => r.siteId === s.site.id)).map((m) => m.el);
            return (
              <tr key={s.site.id} onClick={() => onSelect(s.site.id)} className={`cursor-pointer ${selected === s.site.id ? "bg-accent-soft" : ""}`}>
                <td className="whitespace-nowrap font-semibold">{s.site.label}</td>
                <td className="num">{s.judged.length}</td>
                <td>{top ? <><span className="inline-block w-2.5 h-2.5 mr-1.5" style={{ background: top.rule.color }} />{top.rule.label} <span className="text-ink-3 tnum">{pctTxt(top.stat)} ({kn(top.stat)})</span>{top.rule.filterSensitive ? <span className="ml-1 text-[11.5px] text-[#6b4b00]">필터 영향 가능</span> : null}</> : <span className="text-ink-3">해당 입자 없음</span>}</td>
                <td className="text-[12.5px] text-ink-2">{top ? top.rule.health.effect : "—"}</td>
                <td className="font-mono whitespace-nowrap">{els.length ? els.join(", ") : <span className="text-ink-3 font-sans">없음</span>}</td>
                <td className="num">{a.needN}개{s.judged.length >= a.needN ? <div className="text-[11.5px] text-ink-3">충족</div> : <div className="text-[11.5px] text-accent">{a.needN - s.judged.length}개 추가</div>}</td>
                <td>{a.target ? <>{a.target.rule.label} <span className="text-ink-3 tnum">({kn(a.target.stat)})</span>{(a.target.stat.pct ?? 0) >= Math.max(...sites.map((x) => x.rules[a.target!.rule.id].pct ?? 0)) && <span className="ml-1 text-[11.5px] px-1 rounded-sm bg-[#d4552f] text-white">시료 지점 우선</span>}</> : <span className="text-ink-3">후보 없음</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[12.5px] text-ink-3 mt-2">추가 분석 원소 = 그 지점의 판정 규칙에 필요한데 전체 데이터에서 한 번도 검출되지 않은 원소입니다. 측정 원소 목록에 넣었는지 확인하세요. 필요 입자 수 = 주요 비율을 ±15%p 이내로 추정하기 위한 값입니다.</p>
    </div>
  );
}

function SiteJudgement({ siteId, siteName, expected, priority }: {
  siteId: string;
  siteName: string;
  expected: Array<{ rule: SourceRule; stat: RuleStat }>;
  priority: Array<{ rule: SourceRule; stat: RuleStat }>;
}) {
  return (
    <div className="space-y-4 text-[13.5px]">
      <section>
        <h4 className="font-semibold mb-1">{siteName}에서 예상되는 발생원 판정</h4>
        <ul className="space-y-1">
          {expected.map(({ rule, stat }) => (
            <li key={rule.id} className="flex justify-between gap-2">
              <span>{rule.label}</span>
              <span className="tnum font-semibold">{pctTxt(stat)} <span className="font-normal text-ink-3">({kn(stat)}){stat.sub && stat.k ? ` · 그중 ${rule.sub!.label} ${kn(stat.sub)}` : ""}</span></span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h4 className="font-semibold mb-1">우선 관리 입자와 보고된 건강 위해</h4>
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
        <h4 className="font-semibold mb-1">관련 선행연구</h4>
        <SiteLiteratureBlock siteId={siteId} compact />
        <a className="inline-block mt-2 text-[12.5px] text-accent hover:underline" href={hrefFor({ page: "literature" })}>문헌 데이터베이스 전체 보기 →</a>
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

/* ---------- 대면적 자동 분석 ---------- */

function SourceToggle({ src, setSrc, semN, la }: { src: "sem" | "large"; setSrc: (v: "sem" | "large") => void; semN: number; la: LargeAreaSet | null | undefined }) {
  const opts: Array<["sem" | "large", string, string]> = [
    ["sem", "SEM-EDS 단일입자", semN ? `입자 ${semN}개 · 사진·스폿 3곳 평균` : "사진·스폿 3곳 평균"],
    ["large", "대면적 자동 분석", la ? `Particle Inspector · 입자 ${la.particles.length.toLocaleString()}개(지점) + 참조 ${(la.data.groups.filter((g) => !g.siteId).reduce((a, g) => a + g.n, 0)).toLocaleString()}개` : "Phenom Particle Inspector"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 text-[13.5px]" role="radiogroup" aria-label="분석 데이터">
      <span className="text-ink-3 mr-1">분석 데이터</span>
      {opts.map(([v, t, d]) => (
        <button key={v} role="radio" aria-checked={src === v} onClick={() => setSrc(v)}
          className={`text-left px-3 py-1.5 border rounded-[3px] ${src === v ? "bg-block text-white border-block" : "bg-surface border-line-2 hover:border-ink"}`}>
          <div className="font-semibold leading-tight">{t}</div>
          <div className={`text-[12px] leading-tight ${src === v ? "text-white/75" : "text-ink-3"}`}>{d}</div>
        </button>
      ))}
    </div>
  );
}

const REF_ELEMENTS = ["Fe", "Mn", "Cu", "Ba", "Sb", "Ti", "Zn", "Na", "Cl", "Ca", "S", "Mg", "K", "P"];

interface GroupRow {
  id: string;
  label: string;
  file: string;
  note: string | null;
  isSite: boolean;
  total: number;
  n: number;
  nonSphere: Rate;
  rules: Record<string, Rate>;
  els: Record<string, Rate>;
}

function groupStats(la: LargeAreaSet, cfg: SimConfig, settings: AnalysisSettings): GroupRow[] {
  const r = (k: number, n: number): Rate => ({ k, n, pct: n ? (k / n) * 100 : null, ci: null });
  const rows = la.data.groups.map((g) => {
    const ps: Particle[] = la.byGroup[g.id] ?? [];
    const js = ps.map((p) => judgeParticle(p, cfg, settings)).filter((j) => j.inSize === true);
    const rules: Record<string, Rate> = {};
    for (const rule of SOURCE_RULES) {
      const ev = js.filter((j) => j.results[rule.id].match !== null);
      rules[rule.id] = r(ev.filter((j) => j.results[rule.id].match).length, ev.length);
    }
    const ns = js.filter((j) => j.nonSphere !== null);
    const els: Record<string, Rate> = {};
    for (const el of REF_ELEMENTS) {
      if (!g.elements.includes(el)) { els[el] = r(0, 0); continue; }
      els[el] = r(js.filter((j) => (j.particle.elements[el]?.wt ?? 0) > 0).length, js.length);
    }
    return { id: g.id, label: g.label, file: g.file, note: g.note ?? null, isSite: !!g.siteId, total: ps.length, n: js.length, nonSphere: r(ns.filter((j) => j.nonSphere).length, ns.length), rules, els };
  });
  return [...rows.filter((x) => x.isSite), ...rows.filter((x) => !x.isSite)];
}

function ReferenceTable({ rows }: { rows: GroupRow[] }) {
  const refs = rows.filter((r) => !r.isSite);
  const refMax = (get: (r: GroupRow) => Rate) => Math.max(0, ...refs.map((r) => get(r).pct ?? 0));
  const cell = (row: GroupRow, get: (r: GroupRow) => Rate, key: string) => {
    const v = get(row);
    // 지점 값이 참조 그룹 최댓값의 2배 이상이고 5%p 이상 높으면 강조
    const hi = row.isSite && v.n > 0 && (v.pct ?? 0) >= 2 * refMax(get) && (v.pct ?? 0) - refMax(get) >= 5;
    return (
      <td key={key} className="num whitespace-nowrap" style={{ background: v.k ? seqColor((v.pct ?? 0) / 100) + "44" : undefined, fontWeight: hi ? 700 : undefined, outline: hi ? "2px solid #282828" : undefined, outlineOffset: -2 }}>
        {v.n ? `${(v.pct ?? 0).toFixed(1)}%` : "—"}
      </td>
    );
  };
  const head = (
    <tr>
      <th>파일</th><th className="num whitespace-nowrap">분석 입자</th>
      <th className="num whitespace-nowrap">비구형</th>
      {SOURCE_RULES.map((r) => <th key={r.id} className="num whitespace-nowrap" title={r.source}>{r.label.replace(" 입자", "")}</th>)}
    </tr>
  );
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="data text-[13px]">
          <thead>{head}</thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.isSite ? "" : "bg-[#f3f1ec]"}>
                <td className="whitespace-nowrap"><b>{row.label}</b>{row.isSite ? null : <span className="ml-1 text-[11.5px] text-ink-3">참조</span>}<div className="text-[11px] text-ink-3 font-mono break-all max-w-[200px]">{row.file}</div>{row.note && <div className="text-[11px] text-[#6b4b00] max-w-[200px]">{row.note}</div>}</td>
                <td className="num whitespace-nowrap">{row.n.toLocaleString()}{row.total !== row.n && <div className="text-[11.5px] text-ink-3">전체 {row.total.toLocaleString()}</div>}</td>
                {cell(row, (x) => x.nonSphere, "ns")}
                {SOURCE_RULES.map((r) => cell(row, (x) => x.rules[r.id], r.id))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto">
        <table className="data text-[13px]">
          <thead><tr><th>원소 검출 입자 비율</th>{REF_ELEMENTS.map((el) => <th key={el} className="num font-mono">{el}</th>)}</tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.isSite ? "" : "bg-[#f3f1ec]"}>
                <td className="whitespace-nowrap"><b>{row.label}</b>{row.isSite ? null : <span className="ml-1 text-[11.5px] text-ink-3">참조</span>}</td>
                {REF_ELEMENTS.map((el) => cell(row, (x) => x.els[el], el))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12.5px] text-ink-3">굵은 테두리 = 지점 값이 참조 그룹(Free·Bio Filter) 최댓값의 2배 이상이면서 5%p 이상 높은 칸. 비율은 지금 기준값(크기 범위·종횡비·함량 기준)으로 계산합니다. Free Filter·Bio Filter가 무엇을 채취한 시료인지(공시료인지, 공기청정기 필터인지)에 따라 해석이 달라지므로 확인이 필요합니다.</p>
    </div>
  );
}
