import { hrefFor, useStore } from "../state/store";
import { Button, EmptyState } from "./ui";

/** 데이터가 없을 때 분석 화면 대신 보여준다 — 빈 데이터로 0% 같은 결과를 만들지 않는다 */
export function NoData({ what = "분석" }: { what?: string }) {
  const { loadDemo, busy } = useStore();
  return (
    <EmptyState
      title={`${what}할 데이터가 없습니다`}
      action={
        <>
          <a href={hrefFor({ page: "data" })} className="inline-flex items-center border rounded-[3px] text-[14px] px-3 py-1.5 font-medium bg-block border-block text-white hover:bg-[#3d3b37]">데이터 업로드</a>
          <Button onClick={loadDemo} disabled={!!busy}>DEMO(가상) 데이터로 화면 확인</Button>
        </>
      }
    >
      데이터 업로드 화면에서 입자마다 SEM 이미지 1장과 EDS 정량 파일(CSV·XLSX) 1개를 한 쌍으로 등록하면, 이 화면의 통계와 그래프가 등록한 데이터에서 계산됩니다. 데이터 없이 결과를 추정해 표시하지 않습니다.
    </EmptyState>
  );
}
