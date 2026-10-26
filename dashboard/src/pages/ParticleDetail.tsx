/* 입자 상세 — SEM 사진, 스폿별·평균 원소 구성비, 형상 값(종횡비 직접 입력 가능), 규칙별 판정. */
import { useState } from "react";
import { useStore, hrefFor } from "../state/store";
import { Button, Card, PageHeader } from "../components/ui";
import { atomicOrder } from "../lib/elements";
import { SOURCE_RULES, condText, judgeParticle } from "../lib/sources";

const f2 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(2));

export function ParticleDetail({ particleKey }: { particleKey: string }) {
  const { particles, settings, sim, updateMeta } = useStore();
  const p = particles.find((x) => x.key === particleKey);
  const [ar, setAr] = useState("");
  if (!p) return (<><PageHeader title="입자를 찾을 수 없습니다" /><a className="text-accent underline" href={hrefFor({ page: "particles" })}>입자 목록으로</a></>);
  const j = judgeParticle(p, sim.config, settings);
  const m = p.meta;
  const spot = m?.spot_wt ?? null;
  const nSpot = spot ? Math.max(...Object.values(spot).map((v) => v.length)) : 0;
  const els = Object.keys(p.elements).sort((a, b) => atomicOrder(a) - atomicOrder(b));
  const idx = particles.indexOf(p);
  const prev = particles[idx - 1], next = particles[idx + 1];

  return (
    <>
      <PageHeader title={`${j.site?.label ?? p.sample_id} · ${p.particle_id}`} description={`${p.sample_id} / ${p.particle_id}${m?.acquired_at ? ` · 촬영 ${m.acquired_at}` : ""}`}
        actions={<>
          {prev && <a className="text-[13.5px] border border-line-2 rounded-[3px] px-2.5 py-1 hover:border-ink" href={hrefFor({ page: "particles", particleKey: prev.key })}>← 이전</a>}
          <a className="text-[13.5px] border border-line-2 rounded-[3px] px-2.5 py-1 hover:border-ink" href={hrefFor({ page: "particles" })}>목록</a>
          {next && <a className="text-[13.5px] border border-line-2 rounded-[3px] px-2.5 py-1 hover:border-ink" href={hrefFor({ page: "particles", particleKey: next.key })}>다음 →</a>}
        </>} />
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
        <Card title="SEM 입자 사진" subtitle={p.image?.filename ?? undefined}>
          {p.image ? <img src={p.image.url} alt={p.particle_id} className="w-full rounded-[3px] bg-[#1b1f1e]" /> : <p className="text-ink-2 text-[14px]">사진이 없습니다.</p>}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13.5px] mt-3">
            <dt className="text-ink-3">최대 길이(최대 Feret)</dt><dd className="tnum">{m?.feret_diameter != null ? `${f2(m.feret_diameter)} µm` : "—"}{j.inSize === false ? " (분석 범위 밖)" : ""}</dd>
            <dt className="text-ink-3">등가원 지름</dt><dd className="tnum">{m?.equivalent_diameter != null ? `${f2(m.equivalent_diameter)} µm` : "—"}</dd>
            <dt className="text-ink-3">종횡비</dt><dd className="tnum">{f2(m?.aspect_ratio)}</dd>
            <dt className="text-ink-3">측정 방법</dt><dd className="text-[12.5px] text-ink-2">{m?.size_method ?? "측정값 없음"}</dd>
          </dl>
          <div className="flex items-center gap-2 mt-3 text-[13.5px]">
            종횡비 직접 입력
            <input className="w-20 border border-line-2 rounded-[3px] px-1.5 py-0.5 text-right" value={ar} onChange={(e) => setAr(e.target.value)} placeholder={f2(m?.aspect_ratio)} />
            <Button small disabled={!(parseFloat(ar) >= 1)} onClick={() => { updateMeta(p.key, { aspect_ratio: parseFloat(ar), size_method: "종횡비 사용자 입력" }); setAr(""); }}>저장</Button>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="발생원 판정" subtitle="조성·형상 조건을 동시에 적용한 결과">
            <ul className="space-y-1.5 text-[13.5px]">
              {SOURCE_RULES.map((r) => {
                const v = j.results[r.id];
                return (
                  <li key={r.id} className="flex items-start justify-between gap-2">
                    <span><span className="inline-block w-2.5 h-2.5 mr-1.5" style={{ background: r.color }} />{r.source} · <b>{r.label}</b>
                      <span className="block text-[12px] text-ink-3 ml-4">{r.conds.map((c) => condText(c, sim.config.thresholds)).join(" 그리고 ")}</span></span>
                    <span className={`whitespace-nowrap font-semibold ${v.match ? "text-accent" : v.match === null ? "text-ink-3" : "text-ink-2"}`}>
                      {v.match ? "해당" : v.match === null ? "판정 불가" : "해당 없음"}{v.match && r.sub ? ` · ${r.sub.label} ${v.sub ? "○" : "✕"}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card title="원소 구성비 (wt%)" subtitle={nSpot ? `스폿 ${nSpot}곳과 평균 — 평균이 판정에 쓰입니다.` : "입자 평균"}>
            <table className="data text-[13px]">
              <thead><tr><th>원소</th>{Array.from({ length: nSpot }, (_, i) => <th key={i} className="num">스폿 {i + 1}</th>)}<th className="num">평균</th></tr></thead>
              <tbody>
                {els.map((e) => (
                  <tr key={e}>
                    <td className="font-mono">{e}</td>
                    {Array.from({ length: nSpot }, (_, i) => <td key={i} className="num">{f2(spot?.[e]?.[i] ?? 0)}</td>)}
                    <td className="num font-semibold">{f2(p.elements[e]?.wt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </>
  );
}
