/* 한 입자의 원소 조성 막대. highlight를 주면 그 원소만 진하게, 나머지는 옅게 그린다(색만이 아니라 라벨도 함께 표시). */
import { topElements } from "../lib/composition";
import { elementColor, OTHER_COLOR, SERIES } from "../lib/palette";
import type { Basis, Particle } from "../lib/types";

export function CompositionBar({ p, basis, order, highlight, compact }: { p: Particle; basis: Basis; order: string[]; highlight?: string; compact?: boolean }) {
  const all = topElements(p, basis, 99);
  const total = all.reduce((a, b) => a + b.value, 0);
  const label = basis === "wt" ? "wt%" : "at%";
  if (!all.length) return <div className="text-[12px] text-ink-3">{label}: 정량값 없음(환산해 만들지 않음)</div>;
  const color = (sym: string) => {
    if (highlight) return sym === highlight ? SERIES[1] : "#d9dedc";
    return order.includes(sym) ? elementColor(sym, order) : OTHER_COLOR;
  };
  const hv = highlight ? all.find((e) => e.symbol === highlight)?.value : undefined;
  return (
    <div>
      {!compact && (
        <div className="flex items-center justify-between text-[12px] text-ink-2 mb-1">
          <span>{label} 조성 · TOP 5: {all.slice(0, 5).map((t) => `${t.symbol} ${t.value.toFixed(1)}`).join(", ")}</span>
          <span className="tnum text-ink-3">합 {total.toFixed(1)}</span>
        </div>
      )}
      <div className="flex h-3.5 rounded overflow-hidden border border-line" role="img" aria-label={`${label} 조성: ${all.map((e) => `${e.symbol} ${e.value.toFixed(1)}`).join(", ")}`}>
        {all.map((e) => (
          <div key={e.symbol} title={`${e.symbol} ${e.value.toFixed(2)} ${label}`} style={{ width: `${(e.value / Math.max(total, 100)) * 100}%`, background: color(e.symbol), borderRight: "2px solid #fff" }} />
        ))}
      </div>
      {compact && (
        <div className="text-[11px] text-ink-3 mt-0.5 truncate tnum">
          {highlight && <b className="text-ink">{highlight} {hv != null ? hv.toFixed(1) : "정량값 없음"}</b>}
          {highlight && " · "}
          {all.filter((e) => e.symbol !== highlight).slice(0, 4).map((e) => `${e.symbol} ${e.value.toFixed(1)}`).join(" · ")} ({label})
        </div>
      )}
    </div>
  );
}
