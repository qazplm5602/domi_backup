# domi_backup (Linux)

Linux 용 Bun / TypeScript 버전입니다.

## 주요 기능

- **DB 백업** — `mysqldump`를 이용한 MySQL/MariaDB 데이터베이스 덤프 (`0600` 자격증명 파일 사용 후 즉시 삭제)
- **파일 백업** — 재귀 복사, 중복 경로 검사, 실패 시 자동 재시도
- **압축** — 7-Zip LZMA2 최대 압축 (`.7z`)
- **NAS 저장** — `smbclient` 로 업로드, 업로드 실패 시 자동 재시도
- **보존 정책** — `retain_days` 설정 시 만료된 원격 백업을 자동 삭제
- **단일 바이너리** — `bun build --compile` 으로 Bun 런타임 없이 실행 가능한 바이너리 생성
- **로그** — 타임스탬프 로그 기록, 10MB 초과 시 자동 로테이션
- **Prometheus** — 백업 상태 메트릭 내보내기 (선택)

## 사전 준비

- [Bun](https://bun.sh/) (개발/빌드 시)
- `mysqldump` — MySQL/MariaDB 클라이언트
- `7z` — `p7zip-full`
- `smbclient` — Samba 클라이언트
- NAS/SMB 공유 폴더 접근 권한

Debian/Ubuntu 기준 의존 패키지:

```bash
sudo apt install mariadb-client p7zip-full smbclient
```

## 설정

`config.yaml` 을 환경에 맞게 수정합니다.

```yaml
temp_directory: '/var/tmp'

backup_storage:
  - type: smb
    host: your-nas-hostname
    share_path: 'share/backup'
    user: nas-username
    password_env: DOMI_NAS_PASSWORD
    retain_days: 30                  # 선택: 원격 백업 보존일수

sql:
  host: 127.0.0.1
  port: 3306
  user: root
  password_env: DOMI_SQL_PASSWORD    # 환경변수명 (생략 시 비밀번호 없이 연결)
  databases:
    - mydb1
    - mydb2

backup_targets:
  - name: my-project
    source_paths:
      - ['target', '/home/user/projects/my-project']

prometheus:
  enable: true
  path: './prometheus.prom'
```

비밀번호는 환경변수로 전달합니다:

```bash
export DOMI_SQL_PASSWORD='your-password'
export DOMI_NAS_PASSWORD='your-password'
```

## 실행

개발 모드 (Bun 필요):

```bash
bun install
bun run dev
```

단일 바이너리 빌드:

```bash
bun run build           # bin/domi-backup 생성 (linux-x64)
./bin/domi-backup
```

## 백업 흐름

1. 설정 파일 로드 및 임시 폴더 생성
2. 데이터베이스 덤프 (`mysqldump`, `0600` 임시 자격증명 파일 사용)
3. 백업 대상 파일 복사 (중복 경로 사전 검사, 재시도 포함)
4. 7z 압축 → `domiBackup_YYYY-MM-DD-HHmmss.7z`
5. `smbclient` 로 NAS 업로드 (재시도 포함)
6. `retain_days` 초과한 원격 백업 정리
7. 임시 폴더 삭제
8. Prometheus 메트릭 갱신 (활성화 시)
