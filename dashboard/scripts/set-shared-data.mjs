/* 팀 공유 데이터셋 지정: 대시보드에서 저장한 백업 파일(.json)을 배포판에 넣는다.
   사용:  npm run shared:set -- "C:\경로\SEM-EDS_backup_2026-10-12.json"
          npm run shared:clear          (공유 데이터셋 빼기)
   결과: public/shared-data/dataset.json
   - 웹 배포판(GitHub Pages 등)은 이 파일을 읽어 처음 방문한 팀원에게 그대로 보여준다.
   - 오프라인 HTML(npm run build:offline)은 이 파일을 HTML 안에 넣는다. */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "public", "shared-data", "dataset.json");
const args = process.argv.slice(2);

if (args[0] === "--clear") {
  if (existsSync(target)) rmSync(target);
  console.log("공유 데이터셋을 뺐습니다:", target);
  process.exit(0);
}
if (!args[0]) {
  console.error('사용법: npm run shared:set -- "<백업 파일 경로>.json"   (--allow-demo: DEMO 백업도 허용)');
  process.exit(1);
}

const src = args[0];
let obj;
try {
  obj = JSON.parse(readFileSync(src, "utf8"));
} catch (e) {
  console.error(`백업 파일을 읽을 수 없습니다: ${src}\n${e.message}`);
  process.exit(1);
}
if (obj?.format !== "semeds-dashboard-backup") {
  console.error("이 대시보드의 백업 파일이 아닙니다(format 불일치). 대시보드의 '데이터 보관 → 백업 파일 저장'으로 만든 파일을 지정하세요.");
  process.exit(1);
}
if (obj.data?.origin === "demo" && !args.includes("--allow-demo")) {
  console.error("DEMO(가상) 데이터 백업입니다. 실제 결과를 배포하려면 등록한 실제 데이터에서 백업을 다시 저장하세요. (DEMO를 일부러 넣으려면 --allow-demo)");
  process.exit(1);
}

const meta = obj.data?.meta ?? [];
const eds = obj.data?.eds ?? [];
const images = obj.images ?? [];
const samples = [...new Set(meta.map((m) => m.sample_id))];
const sizeMB = Buffer.byteLength(JSON.stringify(obj)) / 1024 / 1024;

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(obj));
console.log(`공유 데이터셋 지정 완료 → ${target}`);
console.log(`  백업 시각: ${obj.savedAt}`);
console.log(`  시료 ${samples.length}개(${samples.join(", ")}), 입자 메타데이터 ${meta.length}건, EDS ${eds.length}행, 이미지 ${images.length}장, 크기 ${sizeMB.toFixed(1)} MB`);
if (sizeMB > 90) console.warn("  ⚠ GitHub는 100 MB가 넘는 파일을 받지 않습니다. 입자 수를 나누거나 Git LFS를 쓰세요.");
else if (sizeMB > 40) console.warn("  ⚠ 파일이 큽니다. 배포판·오프라인 HTML을 여는 데 시간이 걸릴 수 있습니다.");
console.log("다음 단계: npm run build:offline (오프라인 HTML에 반영) / git commit & push (웹 배포판에 반영)");
