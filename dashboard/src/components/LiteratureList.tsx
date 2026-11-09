/* 지점별 선행연구 목록(링크 포함) */
import { BACKGROUND_LITERATURE, siteLiterature, type DbEntry, type LitKind } from "../config/siteLiterature";

export const KIND_CLS: Record<LitKind, string> = {
  "건강 영향": "bg-[#a42f2f] text-white",
  "목표종·조성": "bg-[#2a78d6] text-white",
  "형상": "bg-[#4a3aa7] text-white",
  "배경": "bg-surface-2 text-ink-2 border border-line-2",
  "분석 방법": "bg-surface-2 text-ink-2 border border-line-2",
};

export function LitItems({ items, compact }: { items: DbEntry[]; compact?: boolean }) {
  return (
    <ul className={compact ? "space-y-1.5" : "space-y-2.5"}>
      {items.map((it) => (
        <li key={it.no} className="text-[13px] leading-snug">
          <span className={`text-[11px] px-1.5 py-0.5 rounded-sm mr-1.5 ${KIND_CLS[it.kind]}`}>{it.kind}</span>
          <b>{it.use}</b>
          <div className={`text-ink-2 ${compact ? "text-[12px]" : "text-[12.5px]"} mt-0.5`}>
            <span className="font-mono text-ink-3 mr-1">{it.no}</span>
            {it.url ? <a className="text-accent hover:underline" href={it.url} target="_blank" rel="noreferrer">{it.cite}</a> : it.cite}
            {it.journal && <span className="text-ink-3">. {it.journal}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SiteLiteratureBlock({ siteId, compact }: { siteId: string; compact?: boolean }) {
  const lit = siteLiterature(siteId);
  if (!lit) return <LitItems items={BACKGROUND_LITERATURE} compact={compact} />;
  return (
    <div>
      <div className="text-[12.5px] text-ink-2 mb-1.5">목표종: <span className="font-mono font-semibold text-ink">{lit.indicators.join(", ")}</span></div>
      <LitItems items={lit.items} compact={compact} />
    </div>
  );
}
