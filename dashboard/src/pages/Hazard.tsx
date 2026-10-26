/* 지점별 원소 위해성 — 위해성 정보가 있는 원소가 지점마다 얼마나 자주·얼마나 많이 검출되었는지와,
   그 원소(특정 화학종)에 대해 보고된 건강 영향·IARC 분류를 함께 본다. */
import { useMemo, useState } from "react";
import { hrefFor, useStore } from "../state/store";
import { Card, Notice, PageHeader } from "../components/ui";
import { GANGNAM_SITES } from "../lib/sites";
import { judgeParticle } from "../lib/sources";
import { ELEMENT_HAZARD, FILTER_ELEMENTS } from "../config/elementHazard";
import { elementNameKo } from "../lib/elements";
import { wilson } from "../lib/stats";
import type { Particle } from "../lib/types";
import { LitItems, SiteLiteratureBlock } from "../components/LiteratureList";
import { BACKGROUND_LITERATURE } from "../config/siteLiterature";

interface Cell { k: number; n: number; meanWt: number | null; maxWt: number | null }
const LEVEL_STYLE: Record<number, { label: string; cls: string }> = {
  1: { label: "1군 화학종 있음", cls: "bg-[#a42f2f] text-white" },
  2: { label: "2A·2B", cls: "bg-[#d4552f] text-white" },
  3: { label: "미분류·참고", cls: "bg-surface-2 text-ink-2 border border-line-2" },
};

function cellOf(ps: Particle[], el: string): Cell {
  const vals = ps.map((p) => p.elements[el]).filter((e) => e && e.status === "detected" && (e.wt ?? 0) > 0).map((e) => e!.wt!);
  return { k: vals.length, n: ps.length, meanWt: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, maxWt: vals.length ? Math.max(...vals) : null };
}

export function HazardPage() {
  const { particles, settings, sim } = useStore();
  const groups = useMemo(() => {
    const js = particles.map((p) => judgeParticle(p, sim.config, settings));
    const inRange = (j: (typeof js)[number]) => j.inSize === true && j.particle.edsValid;
    const g = GANGNAM_SITES.map((s) => ({ id: s.id, label: s.short, full: s.label, ps: js.filter((j) => j.site?.id === s.id && inRange(j)).map((j) => j.particle) }));
    const ref = js.filter((j) => !j.site && inRange(j)).map((j) => j.particle);
    if (ref.length) g.push({ id: "ref", label: "공기청정기(참고)", full: "공기청정기 포집(참고)", ps: ref });
    return g;
  }, [particles, settings, sim]);
  const elements = useMemo(() => Object.keys(ELEMENT_HAZARD)
    .map((el) => ({ el, cells: Object.fromEntries(groups.map((g) => [g.id, cellOf(g.ps, el)])) as Record<string, Cell> }))
    .sort((a, b) => ELEMENT_HAZARD[a.el].level - ELEMENT_HAZARD[b.el].level || Object.values(b.cells).reduce((s, c) => s + c.k, 0) - Object.values(a.cells).reduce((s, c) => s + c.k, 0)), [groups]);
  const detected = elements.filter((e) => Object.values(e.cells).some((c) => c.k > 0));
  const notDetected = elements.filter((e) => !Object.values(e.cells).some((c) => c.k > 0)).map((e) => e.el);
  const [siteId, setSiteId] = useState("gate");
  const [el, setEl] = useState<string>("Fe");
  const site = groups.find((g) => g.id === siteId) ?? groups[0];
  const siteList = detected.map((e) => ({ el: e.el, c: e.cells[site.id] })).filter((x) => x.c.k > 0).sort((a, b) => b.c.k / b.c.n - a.c.k / a.c.n);
  const info = ELEMENT_HAZARD[el];

  if (!particles.length) return (<><PageHeader title="지점별 원소 위해성" /><Notice kind="warning">데이터가 없습니다. <a className="text-accent underline" href={hrefFor({ page: "data" })}>데이터 관리</a>에서 올려 주세요.</Notice></>);

  return (
    <>
      <PageHeader title="지점별 원소 위해성" description={`위해성 정보가 있는 원소가 지점마다 얼마나 자주(검출 입자 비율), 얼마나 많이(검출 입자 평균 wt%) 나왔는지와, 그 원소의 화학종에 대해 보고된 건강 영향·IARC 분류를 함께 봅니다. 분석 대상: ${sim.config.applySize ? `최대 길이 ${sim.config.sizeMin}~${sim.config.sizeMax} µm 입자` : "전체 입자"}.`} />

      <Card title="지점 × 원소 검출 현황" subtitle="칸 위 = 검출 입자 비율(검출/분석 입자), 칸 아래 = 검출 입자의 평균 wt%. 진할수록 자주 검출. 원소 이름을 누르면 아래에 건강 영향이 나옵니다.">
        <div className="overflow-x-auto">
          <table className="data text-[13px]">
            <thead>
              <tr><th>원소</th><th>IARC 분류(화학종)</th>{groups.map((g) => <th key={g.id} className="num">{g.label}<div className="text-[11px] font-normal text-ink-3">n={g.ps.length}</div></th>)}</tr>
            </thead>
            <tbody>
              {detected.map(({ el: e, cells }) => {
                const h = ELEMENT_HAZARD[e];
                return (
                  <tr key={e} className={el === e ? "bg-accent-soft" : ""}>
                    <td className="whitespace-nowrap"><button className="font-mono font-semibold text-accent hover:underline" onClick={() => setEl(e)}>{e}</button> <span className="text-ink-3">{elementNameKo(e)}</span>{FILTER_ELEMENTS.has(e) && <span className="ml-1 text-[11px] text-[#6b4b00]" title="유리섬유 필터에서도 나올 수 있음">필터?</span>}</td>
                    <td><span className={`text-[11.5px] px-1.5 py-0.5 rounded-sm ${LEVEL_STYLE[h.level].cls}`}>{h.iarc}</span></td>
                    {groups.map((g) => {
                      const c = cells[g.id];
                      const f = c.n ? c.k / c.n : 0;
                      return (
                        <td key={g.id} className="num" style={{ background: c.k ? `rgba(212,85,47,${0.12 + 0.6 * f})` : undefined, color: f > 0.6 ? "#fff" : undefined }}>
                          <div className="font-semibold">{c.n ? `${Math.round(f * 100)}%` : "—"} <span className="text-[11px] font-normal opacity-80">{c.k}/{c.n}</span></div>
                          <div className="text-[11.5px] opacity-80">{c.meanWt != null ? `${c.meanWt.toFixed(1)} wt%` : "미검출"}</div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {notDetected.length > 0 && <p className="text-[13px] text-ink-2 mt-2">어느 지점에서도 검출되지 않은 원소: <span className="font-mono">{notDetected.join(", ")}</span> — 측정 원소 목록에 넣었는지도 함께 확인하세요.</p>}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <Card title="지점별 위해 원소" subtitle="선택한 지점에서 검출된 위해성 정보 원소(검출 비율 순)"
          actions={<div className="flex flex-wrap gap-1">{groups.map((g) => <button key={g.id} onClick={() => setSiteId(g.id)} className={`px-2 py-0.5 border rounded-[3px] text-[12.5px] ${siteId === g.id ? "bg-block text-white border-block" : "border-line-2 hover:border-ink"}`}>{g.label}</button>)}</div>}>
          <div className="text-[13.5px] font-semibold mb-2">{site.full} · 분석 입자 {site.ps.length}개</div>
          {siteList.length === 0 ? <p className="text-[14px] text-ink-2">검출된 위해성 정보 원소가 없습니다.</p> : (
            <ul className="space-y-2.5">
              {siteList.map(({ el: e, c }) => {
                const h = ELEMENT_HAZARD[e];
                const ci = wilson(c.k, c.n);
                return (
                  <li key={e} className="border-l-4 pl-2.5" style={{ borderColor: h.level === 1 ? "#a42f2f" : h.level === 2 ? "#d4552f" : "#b9b4a9" }}>
                    <div className="flex justify-between gap-2 text-[13.5px]">
                      <button className="font-semibold hover:underline" onClick={() => setEl(e)}><span className="font-mono">{e}</span> {elementNameKo(e)}</button>
                      <span className="tnum">{Math.round((c.k / c.n) * 100)}% ({c.k}/{c.n}){ci ? <span className="text-ink-3"> [{Math.round(ci.lo * 100)}–{Math.round(ci.hi * 100)}]</span> : null} · 평균 {c.meanWt!.toFixed(1)}, 최대 {c.maxWt!.toFixed(1)} wt%</span>
                    </div>
                    <div className="text-[12.5px] text-ink-2 mt-0.5"><span className={`text-[11px] px-1 rounded-sm mr-1 ${LEVEL_STYLE[h.level].cls}`}>{h.iarc}</span>표적: {h.target_organs}</div>
                    <div className="text-[12.5px] text-ink-2 mt-0.5 line-clamp-2">{h.health_effects}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title={`${el} ${elementNameKo(el)} — 건강 영향`} subtitle={info.iarc}>
          <dl className="text-[13.5px] space-y-2">
            <div><dt className="text-ink-3">주요 표적 장기</dt><dd>{info.target_organs}</dd></div>
            <div><dt className="text-ink-3">보고된 건강 영향</dt><dd className="leading-relaxed">{info.health_effects}</dd></div>
            <div><dt className="text-ink-3">출처</dt><dd className="text-[12.5px]">{info.health_references.split(" ; ").map((r) => { const [name, url] = r.split(" | "); return <div key={name}>{url ? <a className="text-accent hover:underline" href={url} target="_blank" rel="noreferrer">{name}</a> : name}</div>; })}</dd></div>
          </dl>
          <div className="mt-3">
            <div className="text-ink-3 text-[13px] mb-1">지점별 검출 비율</div>
            {groups.map((g) => {
              const c = detected.find((d) => d.el === el)?.cells[g.id] ?? cellOf(g.ps, el);
              const f = c.n ? c.k / c.n : 0;
              return (
                <div key={g.id} className="flex items-center gap-2 text-[13px] mb-1">
                  <span className="w-28 shrink-0">{g.label}</span>
                  <span className="flex-1 h-2.5 bg-[#efece5] relative"><span className="absolute inset-y-0 left-0 bg-[#d4552f]" style={{ width: `${f * 100}%` }} /></span>
                  <span className="w-36 text-right tnum">{c.n ? `${Math.round(f * 100)}% (${c.k}/${c.n})` : "—"}{c.meanWt != null ? ` · ${c.meanWt.toFixed(1)} wt%` : ""}</span>
                </div>
              );
            })}
          </div>
          {FILTER_ELEMENTS.has(el) && <p className="text-[12.5px] text-[#6b4b00] mt-2">주의: {el}는 유리섬유 필터에서도 검출될 수 있어, 낮은 함량의 검출은 필터 신호일 수 있습니다.</p>}
        </Card>
      </div>

      <div className="mt-4">
        <Card title={`선행연구 — ${site.full}의 발생원과 건강 영향`} subtitle="연구진이 정리한 지점별 문헌입니다. 위의 '지점별 위해 원소'에서 지점을 바꾸면 함께 바뀝니다. 위해성은 그 발생원·화학종에서 보고된 사례이며 우리 입자의 위해 정도를 뜻하지 않습니다.">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
            <SiteLiteratureBlock siteId={site.id} />
            <div>
              <div className="text-[13px] font-semibold mb-1.5">대상지 배경</div>
              <LitItems items={BACKGROUND_LITERATURE} />
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Notice kind="info" title="해석할 때 주의할 점">
          IARC 분류와 건강 영향은 그 원소를 포함한 특정 화학종(예: 결정형 실리카, 6가 크롬, TiO₂)에 대한 것이며, EDS는 원소만 확인하므로 우리 입자가 그 화학종이라는 뜻은 아닙니다.
          검출 비율은 노출량이나 건강 위험의 크기를 뜻하지 않습니다(농도·흡입량 자료 없음). 원소 값은 입자 위 스폿 3곳의 평균입니다.
        </Notice>
      </div>
    </>
  );
}
