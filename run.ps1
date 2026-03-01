#################################################
# 유틸리티
#################################################

function Write-Log {
    param(
        [string]$Level = "INFO",
        [string]$Message
    )
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$Level] $Message" | Out-File -Append "./log.txt"
    Write-Host "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$Level] $Message"
}

#################################################

Write-Log -Level "INFO" -Message "백업 시작."


#################################################
# Init
#################################################

# 설정 파일 로드
$config = Get-Content ./domi.yaml -Raw | ConvertFrom-Yaml

# temp 폴더 생성
$tempFolderName = "domi_backup-$(Get-Date -Format 'yyyyMMdd')-$(Get-Random -Maximum 9999)"
$tempRootPath = "$($config.temp_directory)\\$tempFolderName"
$tempPath = "$tempRootPath\\src"

New-Item -ItemType Directory -Path $tempRootPath -Force | Out-Null
Write-Log -Level "INFO" -Message "$tempFolderName 임시 폴더 생성됨"


#################################################
# 네트워크 드라이브
#################################################

# 남은 드라이브 문자 계산
$used = (Get-PSDrive -PSProvider FileSystem).Name
$leftDriveChar = [char[]](67..90 | ForEach-Object { [char]$_ }) |
  Where-Object { $_ -notin $used }
  
$networkStorages = $config.backup_storage |
    Where-Object { $_.type -eq 'smb' }

# 드라이브 문자 할당 검증
if ($networkStorages.length -gt $leftDriveChar.length) {
    throw "할당 할 드라이브 문자가 부족합니다."
}

# 드라이브 문자 할당 및 연결
$stroageIdx = 0

foreach ($storage in $networkStorages) {
    $storage._drive = $leftDriveChar[$stroageIdx++]

    # 드라이브 연결
    $rootPath = "\\" + $storage.host + "\" + $storage.share_path

    try {
        New-PSDrive -Name $storage._drive -PSProvider FileSystem -Root $rootPath -ErrorAction Stop | Out-Null
    } catch {
        Write-Log -Level "ERROR" -Message "$rootPath 드라이브 연결 실패"
        throw $_
    }

    Write-Log -Level "INFO" -Message "$($storage._drive) 드라이브로 $rootPath 연결됨"
}


#################################################
# DB 덤프
#################################################

# 매개변수 설정
$sqlDumpArgs = New-Object System.Collections.ArrayList

# 인코딩 설정
$sqlDumpArgs.Add("--default-character-set=binary") | Out-Null

# 계정 이름 정보
$sqlDumpArgs.Add("-u") | Out-Null
$sqlDumpArgs.Add($config.sql.user) | Out-Null

#비밀번호 정보
if (-not [string]::IsNullOrEmpty($config.sql.password_env)) {
    $sqlPassword = [Environment]::GetEnvironmentVariable($config.sql.password_env)

    if ($sqlPassword -eq $null) {
        throw "SQL 비밀번호를 가져올 수 없습니다."
    }

    $sqlDumpArgs.Add("-p") | Out-Null
    $sqlDumpArgs.Add($sqlPassword) | Out-Null
    
    Remove-Item -Name "sqlPassword"
}

# 덤프 폴더 생성
New-Item -ItemType Directory -Path "$tempPath\\db" -Force | Out-Null

# 덤프 시작
foreach ($database in $config.sql.databases) {
    Write-Log -Level "INFO" -Message "$database 데이터베이스 덤프중..."

    $result = & "mysqldump.exe" $sqlDumpArgs $database 2>&1
    $errors = $result | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] }
    $dump = $result | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] }

    if ($null -ne $errors) {
        Write-Log -Level "ERROR" -Message "$database DB 덤프 실패"
        $errors

        throw "$database DB 덤프 실패"
    }

    # sql 파일로 저장
    $dump | Out-File -FilePath "$tempPath\\db\\$($database).sql" -Encoding utf8 -Force

    Write-Log -Level "INFO" -Message "$database 데이터베이스 덤프 완료"
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
        robocopy $path[1] "$tempPath\\$($target.name)\\$($path[0])" /E /MT:16 /R:3 /W:5 /NP
    }

    Write-Log -Level "INFO" -Message "$($target.name) 백업 완료"
}