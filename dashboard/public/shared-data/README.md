# 팀 공유 데이터셋

이 폴더에 `dataset.json`이 있으면 배포판(GitHub Pages 웹판, 오프라인 HTML)을 연 팀원에게 그 데이터가 바로 보입니다.

1. 대시보드 **데이터 업로드 → 데이터 보관 → 백업 파일 저장**으로 `SEM-EDS_backup_날짜.json`을 받습니다.
2. `dashboard` 폴더에서 `npm run shared:set -- "<백업 파일 경로>"` 를 실행합니다(이 폴더에 `dataset.json`으로 복사됨).
3. 커밋하고 push하면 GitHub Actions가 웹판과 오프라인판을 다시 배포합니다.

공유 데이터셋을 빼려면 `npm run shared:clear`.
