/* DEMO 데이터와 입력 템플릿을 번들 안에 문자열로 포함한다.
   fetch를 쓰지 않으므로 오프라인판(HTML 파일 하나, file://로 열기)에서도 동작한다. */
import demoMeta from "../../public/sample-data/demo_particle_metadata.csv?raw";
import demoEds from "../../public/sample-data/demo_eds_long.csv?raw";
import demoPm from "../../public/sample-data/demo_pm_measurements.csv?raw";
import tMeta from "../../public/templates/particle_metadata_template.csv?raw";
import tEdsLong from "../../public/templates/eds_long_template.csv?raw";
import tEdsWide from "../../public/templates/eds_wide_template.csv?raw";
import tRules from "../../public/templates/hazard_rules_template.csv?raw";
import tPm from "../../public/templates/pm_measurements_template.csv?raw";

export const DEMO_FILES: Array<{ name: string; text: string }> = [
  { name: "demo_particle_metadata.csv", text: demoMeta },
  { name: "demo_eds_long.csv", text: demoEds },
  { name: "demo_pm_measurements.csv", text: demoPm },
];

export const TEMPLATE_FILES: Array<{ name: string; label: string; text: string }> = [
  { name: "particle_metadata_template.csv", label: "입자 메타데이터", text: tMeta },
  { name: "eds_long_template.csv", label: "EDS 긴 형식(권장)", text: tEdsLong },
  { name: "eds_wide_template.csv", label: "EDS 넓은 형식", text: tEdsWide },
  { name: "hazard_rules_template.csv", label: "위해성 평가 규칙", text: tRules },
  { name: "pm_measurements_template.csv", label: "PM 측정값", text: tPm },
];

/** 엑셀에서 한글이 깨지지 않도록 BOM을 보장한다 */
export function withBom(text: string): string {
  return text.startsWith("﻿") ? text : "﻿" + text;
}
