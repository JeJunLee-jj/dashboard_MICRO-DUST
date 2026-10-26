/* 입자 목록 — 지점별 SEM 입자 사진과 판정 결과. 사진을 누르면 상세(스폿별 원소 구성비)로 간다. */
import { useMemo, useState } from "react";
import { useStore, hrefFor } from "../state/store";
import { PageHeader, Notice } from "../components/ui";
import { GANGNAM_SITES } from "../lib/sites";
import { SOURCE_RULES, judgeParticle } from "../lib/sources";
import { ParticleDetail } from "./ParticleDetail";

export function ParticlesPage() {
  const { route, particles } = useStore();
  if (!particles.length) {
    return (<><PageHeader title="입자 목록" /><Notice kind="warning">데이터가 없습니다. <a className="text-accent underline" href={hrefFor({ page: "data" })}>데이터 관리</a>에서 원본 폴더를 올려 주세요.</Notice></>);
  }
  if (route.particleKey) return <ParticleDetail key={route.particleKey} particleKey={route.particleKey} />;
  return <Gallery />;
}

function Gallery() {
  const { particles, settings, sim } = useStore();
  const [site, setSite] = useState<string>("all");
  const rows = useMemo(() => particles.map((p) => judgeParticle(p, sim.config, settings)).filter((j) => site === "all" || j.site?.id === site), [particles, settings, sim, site]);
  const tabs = [{ id: "all", label: `전체 ${particles.length}` }, ...GANGNAM_SITES.map((s) => ({ id: s.id, label: `${s.short} ${particles.filter((p) => judgeParticle(p, sim.config, settings).site?.id === s.id).length}` }))];
  return (
    <>
      <PageHeader title="입자 목록" description="지점별 SEM 입자 사진과 판정 결과입니다. 회색 테두리 = 분석 크기 범위 밖(최대 길이 기준)." />
      <div className="flex flex-wrap gap-1.5 mb-3">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setSite(t.id)} className={`px-3 py-1.5 border rounded-[3px] text-[13.5px] ${site === t.id ? "bg-block text-white border-block" : "bg-surface border-line-2 hover:border-ink"}`}>{t.label}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-3">
        {rows.map((j) => {
          const p = j.particle;
          return (
            <a key={p.key} href={hrefFor({ page: "particles", particleKey: p.key })} className={`block border rounded-[3px] overflow-hidden bg-surface hover:border-ink ${j.inSize === false ? "opacity-60 border-dashed border-line-2" : "border-line"}`}>
              <div className="aspect-[4/3] bg-[#1b1f1e] relative">
                {p.image ? <img src={p.image.url} alt={p.particle_id} loading="lazy" className="absolute inset-0 w-full h-full object-contain" /> : <div className="absolute inset-0 grid place-items-center text-white/60 text-[12px]">사진 없음</div>}
                <span className="absolute left-1 top-1 bg-white/90 text-[11.5px] px-1 rounded-sm font-mono">{j.site?.short ?? "—"} · {p.particle_id}</span>
              </div>
              <div className="px-2 py-1.5 text-[12.5px] leading-snug">
                <div className="tnum text-ink-2">길이 {j.size != null ? `${j.size.toFixed(1)} µm` : "—"} · 종횡비 {p.meta?.aspect_ratio != null ? p.meta.aspect_ratio.toFixed(2) : "—"}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {j.matched.length ? j.matched.map((id) => { const r = SOURCE_RULES.find((x) => x.id === id)!; return <span key={id} className="text-[11.5px] px-1.5 rounded-sm text-white" style={{ background: r.color }}>{r.label}</span>; })
                    : <span className="text-[11.5px] text-ink-3">해당 규칙 없음</span>}
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </>
  );
}
