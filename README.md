# domi_backup

Windows 환경에서 데이터베이스와 파일을 자동으로 백업하고, 압축하여 NAS에 저장하는 PowerShell 스크립트입니다.
##### 내가 쓰려고 만들었음.

## 주요 기능

- **DB 백업** — `mysqldump`를 이용한 MySQL/MariaDB 데이터베이스 덤프
- **파일 백업** — `robocopy` 멀티스레드(16 threads) 복사
- **압축** — 7-Zip LZMA2 최대 압축 (`.7z`)
- **NAS 저장** — SMB 네트워크 드라이브 자동 마운트 후 업로드
- **자동 정리** — 백업 완료 후 임시 폴더 자동 삭제

## 사전 준비

- Windows PowerShell 5.0+
- [MySQL](https://dev.mysql.com/downloads/) (`mysqldump.exe`가 PATH에 있어야 함)
- [7-Zip](https://www.7-zip.org/) (`7z.exe`가 PATH에 있어야 함)
- NAS/SMB 공유 폴더 접근 권한

## 설정

`config.yaml`을 환경에 맞게 수정합니다.

```yaml
temp_directory: 'C:\your\temp\path'

backup_storage:
  - type: smb
    host: your-nas-hostname
    share_path: 'share\backup'

sql:
  user: root
  password_env: DOMI_SQL_PASSWORD    # 환경변수명
  databases:
    - mydb1
    - mydb2

backup_targets:
  - name: my-project
    source_paths:
      - ['target', 'C:\path\to\project']
```

DB 비밀번호는 환경변수로 설정합니다:

```powershell
[Environment]::SetEnvironmentVariable("DOMI_SQL_PASSWORD", "your-password", "User")
```

## 실행

```powershell
.\run.ps1
```

또는

```powershell
powershell -ExecutionPolicy Bypass -File .\run.ps1
```

## 백업 흐름

1. 설정 파일 로드 및 임시 폴더 생성
2. SMB 네트워크 드라이브 마운트
3. 데이터베이스 덤프 (`mysqldump`)
4. 파일 복사 (`robocopy`)
5. 7z 압축 → `domiBackup_YYYY-MM-DD-HHmmss.7z`
6. NAS로 업로드
7. 임시 폴더 삭제
