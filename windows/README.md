# domi_backup (Windows)

Windows 용 PowerShell 버전입니다.

## 주요 기능

- **DB 백업** — `mysqldump`를 이용한 MySQL/MariaDB 데이터베이스 덤프 (인증 파일 ACL 보호)
- **파일 백업** — `robocopy` 멀티스레드(16 threads) 복사, 중복 경로 검사
- **압축** — 7-Zip LZMA2 최대 압축 (`.7z`)
- **NAS 저장** — SMB 네트워크 드라이브 자동 마운트 후 업로드 (인증 지원)
- **자동 정리** — 백업 완료/실패 시 임시 폴더 및 네트워크 드라이브 자동 정리
- **로그** — 타임스탬프 로그 기록, 10MB 초과 시 자동 로테이션
- **Prometheus** — 백업 상태 메트릭 내보내기 (선택)

## 사전 준비

- PowerShell 7.0+
- [powershell-yaml](https://www.powershellgallery.com/packages/powershell-yaml) 모듈
- [MySQL](https://dev.mysql.com/downloads/) (`mysqldump.exe`가 PATH에 있어야 함)
- [7-Zip](https://www.7-zip.org/) (`7z.exe`가 PATH에 있어야 함)
- NAS/SMB 공유 폴더 접근 권한

```powershell
Install-Module powershell-yaml
```

## 설정

`config.yaml`을 환경에 맞게 수정합니다.

```yaml
temp_directory: 'C:\your\temp\path'

backup_storage:
  - type: smb
    host: your-nas-hostname
    share_path: 'share\backup'
    # user: backup-user              # 선택: SMB 인증 사용자
    # password_env: NAS_PASSWORD     # 선택: 비밀번호 환경변수명

sql:
  user: root
  password_env: DOMI_SQL_PASSWORD    # 환경변수명 (생략 시 비밀번호 없이 연결)
  databases:
    - mydb1
    - mydb2

backup_targets:
  - name: my-project
    source_paths:
      - ['target', 'C:\path\to\project']

prometheus:
  enable: true
  path: './prometheus.prom'
```

비밀번호는 환경변수로 설정합니다:

```powershell
# DB 비밀번호
[Environment]::SetEnvironmentVariable("DOMI_SQL_PASSWORD", "your-password", "User")

# NAS 비밀번호 (인증 사용 시)
[Environment]::SetEnvironmentVariable("NAS_PASSWORD", "your-password", "User")
```

## 실행

```powershell
.\run.ps1
```

또는

```powershell
pwsh -ExecutionPolicy Bypass -File .\run.ps1
```

## 백업 흐름

1. 설정 파일 로드 및 임시 폴더 생성
2. SMB 네트워크 드라이브 마운트 (인증 정보가 있으면 자동 적용)
3. 데이터베이스 덤프 (`mysqldump`, ACL 보호된 임시 인증 파일 사용)
4. 파일 복사 (`robocopy`, 중복 경로 사전 검사)
5. 7z 압축 → `domiBackup_YYYY-MM-DD-HHmmss.7z`
6. NAS로 업로드
7. 임시 폴더 삭제 및 네트워크 드라이브 해제
8. Prometheus 메트릭 갱신 (활성화 시)
