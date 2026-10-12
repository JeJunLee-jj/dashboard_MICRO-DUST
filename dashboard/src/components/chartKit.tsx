/* Recharts 공통 설정: 가는 막대·옅은 격자·텍스트 색 토큰, 툴팁 */
import type { ReactNode } from "react";
import { AXIS, GRID } from "../lib/palette";

export const axisProps = {
  stroke: AXIS,
  tickLine: false,
  tick: { fill: "#5f6b68", fontSize: 12 },
} as const;

export const gridProps = { stroke: GRID, vertical: false } as const;

export function TipBox({ title, lines }: { title: ReactNode; lines: Array<ReactNode> }) {
  return (
    <div className="bg-surface border border-line-2 rounded-md shadow-md px-3 py-2 text-[12px] max-w-[300px]">
      <div className="font-semibold text-ink mb-0.5">{title}</div>
      {lines.map((l, i) => (
        <div key={i} className="text-ink-2 tnum">{l}</div>
      ))}
    </div>
  );
}

/** Recharts 툴팁 content prop용 */
export function tip<T>(render: (p: T) => { title: ReactNode; lines: ReactNode[] }) {
  return function Tip(props: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) {
    if (!props.active || !props.payload?.length || !props.payload[0].payload) return null;
    const r = render(props.payload[0].payload as T);
    return <TipBox title={r.title} lines={r.lines} />;
  };
}

export const pctTick = (v: number) => `${v}%`;
