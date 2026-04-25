# domi_backup

데이터베이스와 파일을 백업해 압축 후 NAS로 업로드하는 스크립트입니다.
##### 내가 쓰려고 만들었음.

## 플랫폼

- [Windows (PowerShell)](./windows/README.md) — `windows/run.ps1`
- [Linux (Bun / TypeScript)](./linux/README.md) — `linux/src/run.ts`

## 기능

- 설정 파일 로드 및 임시 폴더 생성
- 데이터베이스 덤프 (`mysqldump`)
- 백업 대상 파일 복사
- 7z 압축 → `domiBackup_YYYY-MM-DD-HHmmss.7z`
- SMB 로 업로드
- 임시 폴더 정리
- Prometheus 메트릭 갱신 (활성화 시)

> 플랫폼에 따라 사전 요구사항과 실행 방법은 OS 별로 다르니 각 README 를 참고해 주세요.