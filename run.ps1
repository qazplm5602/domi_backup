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
$tempPath = "$($config.temp_directory)\\$tempFolderName"

New-Item -ItemType Directory -Path $tempPath -Force | Out-Null
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