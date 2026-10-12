import { useMemo, useState } from "react";
import { useStore, hrefFor } from "../state/store";
import { FilterBar } from "../components/FilterBar";
import { NoData } from "../components/NoData";
import { PageHeader, TargetBadge, DemoTag, Segmented } from "../components/ui";
import { particleTargetResult } from "../lib/hazard";
import { classifyParticleType } from "../lib/rules";
import { morphologyLabel } from "../lib/morphology";
import { topElements } from "../lib/composition";
import { ParticleDetail } from "./ParticleDetail";

export function ParticlesPage() {
  const { route, particles } = useStore();
  if (!particles.length) {
    return (
      <>
        <PageHeader title="SEM 이미지·입자 탐색" />
        <NoData what="탐색" />
      </>
    );
  }
  if (route.particleKey) return <ParticleDetail key={route.particleKey} particleKey={route.particleKey} />;
  return <Gallery />;
}

function Gallery() {
  const { filtered, settings, rules } = useStore();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"id" | "targets" | "size">("id");
  const [view, setView] = useState<"grid" | "table">("grid");

  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const list = filtered
      .filter((p) => !qq || `${p.sample_id} ${p.particle_id} ${p.image?.filename ?? ""}`.toLowerCase().includes(qq))
      .map((p) => ({ p, t: particleTargetResult(p, settings), type: classifyParticleType(p, settings, rules), top: topElements(p, settings.displayBasis, 3) }));
    if (sort === "targets") list.sort((a, b) => b.t.detected.length - a.t.detected.length);
    if (sort === "size") list.sort((a, b) => (b.p.meta?.equivalent_diameter ?? -1) - (a.p.meta?.equivalent_diameter ?? -1));
    return list;
  }, [filtered, settings, rules, q, sort]);

  return (
    <>
      <PageHeader title="SEM 이미지·입자 탐색" description="입자를 누르면 원본 SEM 이미지, EDS 조성, 형상 판정, 입자 유형·발생원 후보와 근거, 데이터 품질 점검 결과를 볼 수 있습니다." />
      <FilterBar />
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="시료·입자 ID·파일명 검색" className="border border-line-2 rounded-md px-3 py-1.5 text-[13px] w-64 bg-surface" />
        <Segmented label="정렬" value={sort} onChange={setSort} options={[{ value: "id", label: "ID" }, { value: "targets", label: "대상 원소 수" }, { value: "size", label: "크기(실측)" }]} />
        <Segmented value={view} onChange={setView} options={[{ value: "grid", label: "갤러리" }, { value: "table", label: "표" }]} />
        <span className="text-[12.5px] text-ink-3 ml-auto">{rows.length}개 입자</span>
      </div>
      {rows.length === 0 && <div className="text-center text-ink-2 py-12 border border-dashed border-line-2 rounded-lg bg-surface">조건에 맞는 입자가 없습니다. 필터를 바꿔 보세요.</div>}
      {view === "grid" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {rows.map(({ p, t, type, top }) => (
            <a key={p.key} href={hrefFor({ page: "particles", particleKey: p.key })} className="bg-surface border border-line rounded-lg overflow-hidden hover:border-accent hover:shadow-sm group">
              <div className="aspect-[4/3] bg-[#1b1f1e] relative">
                {p.image ? (
                  <img src={p.image.url} alt={`${p.particle_id} SEM`} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-[12px] text-white/60 text-center px-2">이미지 없음{p.meta?.image_filename ? <><br />({p.meta.image_filename} 미업로드)</> : null}</div>
                )}
                {p.image?.synthetic && <span className="absolute left-1.5 top-1.5"><DemoTag small /></span>}
              </div>
              <div className="px-2.5 py-2 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold text-[13px] truncate">{p.sample_id} / {p.particle_id}</span>
                </div>
                <div className="text-[12px] text-ink-2 truncate">{morphologyLabel(p.morphology)} · {type.label}</div>
                <div className="text-[11.5px] text-ink-3 font-mono truncate">{top.map((x) => `${x.symbol} ${x.value.toFixed(1)}`).join(" · ") || "정량값 없음"}</div>
                <TargetBadge status={t.status} />
                {t.detected.length > 0 && <div className="text-[11.5px] text-ink-2">대상: {t.detected.join(", ")}</div>}
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-lg overflow-auto max-h-[70vh]">
          <table className="data">
            <thead><tr><th>시료</th><th>입자</th><th>채취일</th><th>위치</th><th>형상</th><th>입자 유형 후보</th><th>주요 원소({settings.displayBasis}%)</th><th>대상 원소</th><th className="num">등가직경(µm, 실측)</th><th>이미지</th></tr></thead>
            <tbody>
              {rows.map(({ p, t, type, top }) => (
                <tr key={p.key} className="cursor-pointer" onClick={() => (window.location.hash = hrefFor({ page: "particles", particleKey: p.key }))}>
                  <td>{p.sample_id}</td><td className="font-medium text-accent">{p.particle_id}</td><td className="tnum">{p.date ?? "—"}</td><td className="text-[12px]">{p.location ?? "—"}</td>
                  <td>{morphologyLabel(p.morphology)}</td><td>{type.label}</td>
                  <td className="font-mono text-[12px]">{top.map((x) => `${x.symbol} ${x.value.toFixed(1)}`).join(", ") || "—"}</td>
                  <td><TargetBadge status={t.status} /> <span className="text-[12px]">{t.detected.join(" ")}</span></td>
                  <td className="num">{p.meta?.equivalent_diameter?.toFixed(2) ?? "—"}</td>
                  <td className="text-[12px]">{p.image ? "있음" : "없음"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
