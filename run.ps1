#################################################
# 경로 설정
#################################################

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logPath = Join-Path $scriptDir "log.txt"
$configPath = Join-Path $scriptDir "config.yaml"


#################################################
# 유틸리티
#################################################

function Write-Log {
    param(
        [string]$Level = "INFO",
        [string]$Message
    )

    # 10MB 넘으면 로테이션
    if ((Test-Path $logPath) -and (Get-Item $logPath).Length -gt 10MB) {
        $archiveName = $logPath -replace '\.txt$', "-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
        Move-Item -Path $logPath -Destination $archiveName -Force
    }

    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$Level] $Message" | Out-File -Append $logPath
    Write-Host "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$Level] $Message"
}

function Cleanup {
    param(
        [switch]$IsError,
        [long]$BackupSize = 0
    )

    # 임시 폴더 삭제
    if ($null -ne $tempRootPath -and (Test-Path $tempRootPath)) {
        Remove-Item -Path $tempRootPath -Recurse -Force
    }

    # 네트워크 드라이브 해제
    foreach ($storage in $networkStorages) {
        if ($storage._mount) {
            Remove-PSDrive -Name $storage._drive -Force -ErrorAction SilentlyContinue
        }
    }


    #################################################
    # Prometheus
    #################################################

    if ($config.prometheus.enable) {
        # 변수
        $prometheusPath = Join-Path $scriptDir $config.prometheus.path
        $nowTimestamp = [DateTimeOffset]::Now.ToUnixTimeSeconds()
    
        # Prometheus 로그 작성
        $prometheus = @{
            domi_backup_last_timestamp = 0
            domi_backup_last_success = 0
            domi_backup_last_success_timestamp = 0
            domi_backup_size_bytes = 0
        }
    
        # prometheus 파일 로드
        $prometheusContent = Get-Content $prometheusPath -ErrorAction SilentlyContinue
    
        foreach ($line in $prometheusContent) {
            # 주석 제외
            if ($line.StartsWith("#") -or -not $line.StartsWith("domi_")) {
                continue
            }
    
            # 원본 값 복원
            $cutLine = $line.Split(" ")
            $prometheus[$cutLine[0]] = $cutLine[1]
        }

        # 값 설정
        $prometheus.domi_backup_last_success = $IsError ? 0 : 1
        $prometheus.domi_backup_last_timestamp = $nowTimestamp
        
        if (-not $IsError) {
            $prometheus.domi_backup_last_success_timestamp = $nowTimestamp
            $prometheus.domi_backup_size_bytes = $BackupSize
        }
    
        # Prometheus 로그 저장
        "# 이 파일은 자동으로 반영됩니다." > $prometheusPath
        "# 수정하지 마세요." >> $prometheusPath

        foreach ($prometheusKey in $prometheus.Keys) {
            "$prometheusKey $($prometheus[$prometheusKey])" >> $prometheusPath
        }
    }
}


#################################################

Write-Log -Level "INFO" -Message ""
Write-Log -Level "INFO" -Message "백업 시작."


#################################################
# Init
#################################################

# 모듈 설치 검사
if (-not (Get-Module -ListAvailable -Name 'powershell-yaml')) {
    throw "powershell-yaml 모듈이 필요합니다. 'Install-Module powershell-yaml'로 설치하세요."
}

# 설정 파일 로드
$config = Get-Content $configPath -Raw | ConvertFrom-Yaml

# temp 폴더 생성
$tempFolderName = "domi_backup-$(Get-Date -Format 'yyyyMMdd')-$(Get-Random -Maximum 9999)"
$tempRootPath = "$($config.temp_directory)\\$tempFolderName"
$tempPath = "$tempRootPath\\src"

New-Item -ItemType Directory -Path $tempRootPath -Force | Out-Null
Write-Log -Level "INFO" -Message "$tempFolderName 임시 폴더 생성됨"

# 예외 발생 시 자동 클린업
trap { Cleanup -IsError; break }


#################################################
# 네트워크 드라이브
#################################################

# 남은 드라이브 문자 계산
$used = (Get-PSDrive -PSProvider FileSystem).Name
$leftDriveChar = [char[]](67..90 | ForEach-Object { [char]$_ }) |
  Where-Object { $_ -notin $used }
  
[array]$networkStorages = $config.backup_storage |
    Where-Object { $_.type -eq 'smb' }

# 드라이브 문자 할당 검증
if ($networkStorages.length -gt $leftDriveChar.Count) {
    throw "할당 할 드라이브 문자가 부족합니다."
}

# 드라이브 문자 할당 및 연결
$storageIdx = 0

foreach ($storage in $networkStorages) {
    $storage._drive = $leftDriveChar[$storageIdx++]

    $rootPath = "\\$($storage.host)\$($storage.share_path)"

    # 인수
    $driveParams = @{
        Name        = $storage._drive
        PSProvider  = "FileSystem"
        Root        = $rootPath
        Persist     = $true
        ErrorAction = "Stop"
    }

    # 인증 정보 생성
    if (-not [string]::IsNullOrEmpty($storage.user) -and -not [string]::IsNullOrEmpty($storage.password_env)) {
        $storagePassword = [Environment]::GetEnvironmentVariable($storage.password_env)
        if ([string]::IsNullOrEmpty($storagePassword)) {
            Write-Log -Level "ERROR" -Message "$rootPath 드라이브 연결 실패 (비밀번호 환경 변수가 비어있습니다.)"
            throw "$rootPath 드라이브 연결 실패"
        }

        $securePass = ConvertTo-SecureString $storagePassword -AsPlainText -Force
        $driveParams.Credential = New-Object pscredential($storage.user, $securePass)
    }

    try {
        # 드라이브 연결
        New-PSDrive @driveParams | Out-Null
    } catch {
        Write-Log -Level "ERROR" -Message "$rootPath 드라이브 연결 실패"
        throw $_
    }

    # 플래그
    $storage._mount = $true
    Write-Log -Level "INFO" -Message "$($storage._drive) 드라이브로 $rootPath 연결됨"
}


#################################################
# DB 덤프
#################################################

#비밀번호 정보
if (-not [string]::IsNullOrEmpty($config.sql.password_env)) {
    $sqlPassword = [Environment]::GetEnvironmentVariable($config.sql.password_env)

    if ($sqlPassword -eq $null) {
        throw "SQL 비밀번호를 가져올 수 없습니다."
    }
}

# 인증 정보 파일 생성
$credFile = [System.IO.Path]::GetTempFileName()

# 현재 사용자만 접근 가능하도록 ACL 설정
$acl = Get-Acl $credFile
$acl.SetAccessRuleProtection($true, $false)  # 상속 차단, 기존 규칙 제거

# 규칙 추가
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    [System.Security.Principal.WindowsIdentity]::GetCurrent().Name,
    "FullControl", "Allow"
)
$acl.AddAccessRule($rule)

# 인증 파일 규칙 적용
Set-Acl -Path $credFile -AclObject $acl

$credContent = @"
[mysqldump]
user=$($config.sql.user)
"@

# 비밀번호 필드 추가
if ($null -ne $sqlPassword) {
    $credContent += "`npassword=$sqlPassword"
    Remove-Variable -Name "sqlPassword" # 변수 삭제
}

# 인증 정보 저장
$credContent | Set-Content -Path $credFile -Force -Encoding ASCII -ErrorAction Stop

# 덤프 폴더 생성
New-Item -ItemType Directory -Path "$tempPath\\db" -Force | Out-Null

# 덤프 시작
try {
    foreach ($database in $config.sql.databases) {
        Write-Log -Level "INFO" -Message "$database 데이터베이스 덤프중..."
    
        $sqlPath = "$tempPath\\db\\$($database).sql"
        $errPath = "$tempPath\\db\\$($database).err"

        # 덤프
        & "mysqldump.exe" "--defaults-extra-file=$credFile" "--default-character-set=binary" $database > $sqlPath 2> $errPath
    
        if ($LASTEXITCODE -ne 0) {
            Write-Log -Level "ERROR" -Message "$database DB 덤프 실패"
            Get-Content -Path $errPath -Raw # 오류 출력
    
            throw "$database DB 덤프 실패"
        }
    
        Write-Log -Level "INFO" -Message "$database 데이터베이스 덤프 완료"
    }
} finally {
    # DB 인증정보 삭제
    Remove-Item -Path $credFile -Force -ErrorAction SilentlyContinue
}


#################################################
# 파일 백업
#################################################

foreach ($target in $config.backup_targets) {
    Write-Log -Level "INFO" -Message "$($target.name) 백업중..."
    
    # 폴더 생성
    New-Item -ItemType Directory -Path "$tempPath\\$($target.name)" -Force | Out-Null
    
    foreach ($path in $target.source_paths) {
        # 대상 경로 확인
        if ([string]::IsNullOrEmpty($path[1])) {
            Write-Log -Level "ERROR" -Message "$($target.name) 백업 실패 ($($path[1]) -> $($path[0]) 경로가 지정되지 않음)"
            throw "$($target.name) 백업 실패"
        }
        
        # 파일 복사
        robocopy $path[1] "$tempPath\\$($target.name)\\$($path[0])" /E /MT:16 /R:3 /W:5 /NP /NFL /NDL /NJH /NJS
        
        # 오류 검사
        if ($LASTEXITCODE -ge 8) {
            Write-Log -Level "ERROR" -Message "파일 복사 실패 (exit code: $LASTEXITCODE)"
            throw "파일 복사 실패: $($path[1])"
        }
    }

    Write-Log -Level "INFO" -Message "$($target.name) 백업 완료"
}


#################################################
# 백업 파일 압축
#################################################

$backupFileName = "domiBackup_$(Get-Date -Format 'yyyy-MM-dd-HHmmss').7z"
$backupPath = "$tempRootPath\\compress"

Write-Log -Level "INFO" -Message "압축중..."

# 폴더 생성
New-Item -ItemType Directory -Path $backupPath -Force | Out-Null

# 7z 최대로 압축
& 7z a -t7z "$backupPath\\$backupFileName" $tempPath -mx=9 -m0=lzma2 -mfb=64 -md=64m -bso0 -bsp0

# 오류 검사
if ($LASTEXITCODE -ne 0) {
    Write-Log -Level "ERROR" -Message "압축 실패 (exit code: $LASTEXITCODE)"
    throw "압축 실패"
}

# 크기 가져오기 (Prometheus에서 사용)
$backupFileSize = (Get-Item -Path "$backupPath\\$backupFileName").Length

Write-Log -Level "INFO" -Message "압축 완료"


#################################################
# 백업 장치에 저장
#################################################

# 나중에 네트워크 드라이브 이외에서도 할 예정

foreach ($storage in $networkStorages) {
    Write-Log -Level "INFO" -Message "$($storage.share_path)($($storage.host))으로 파일 복사중..."
    
    # 네트워크 드라이브로 복사
    robocopy $backupPath "$($storage._drive):\\" /E /Z /R:5 /W:10 /IPG:10 /NP /NFL /NDL /NJH /NJS

    # 오류 검사
    if ($LASTEXITCODE -ge 8) {
        Write-Log -Level "ERROR" -Message "파일 복사 실패 (exit code: $LASTEXITCODE)"
        throw "파일 복사 실패: $($storage.share_path)($($storage.host))"
    }
    
    Write-Log -Level "INFO" -Message "$($storage.share_path)($($storage.host))으로 파일 복사 완료"
}

#################################################
# 정리
#################################################

Write-Log -Level "INFO" -Message "정리중..."
Cleanup -BackupSize $backupFileSize
Write-Log -Level "INFO" -Message "정리 완료"


#################################################

Write-Log -Level "INFO" -Message "백업 완료!"