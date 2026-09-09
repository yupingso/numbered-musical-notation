@echo off
setlocal EnableExtensions
title PowerPoint Slide Overlay - Updater
cd /d "%~dp0"

echo ===================================================
echo PowerPoint Slide Overlay - Updater
echo ===================================================
echo.

set "TOOL_DIR=%~dp0"
set "BRANCH=main"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ErrorActionPreference = 'Stop'; " ^
    "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; " ^
    "$toolDir = $env:TOOL_DIR.TrimEnd('\'); " ^
    "$branch = $env:BRANCH; " ^
    "$configPath = Join-Path $toolDir 'config.ps1'; " ^
    "$oldLegacy = Join-Path $toolDir 'Overlay-JpgSlides.ps1'; " ^
    "if (-not (Test-Path -LiteralPath $configPath) -and (Test-Path -LiteralPath $oldLegacy)) { " ^
    "    $txt = Get-Content -LiteralPath $oldLegacy -Raw; " ^
    "    $p = 'C:\Path\To\Your\PPTFolder'; " ^
    "    if ($txt -match '\$FolderPath\s*=\s*[''\""](.*?)[''\""]') { $p = $matches[1].Trim() }; " ^
    "    $pEscaped = $p.Replace(\"'\", \"''\"); " ^
    "    $skip = '$true'; " ^
    "    if ($txt -match '\$SkipExisting\s*=\s*\$(true|false)' -and $matches[1].ToLower() -eq 'false') { $skip = '$false' }; " ^
    "    $maxFiles = '0'; " ^
    "    if ($txt -match '\$MaxProcessedFiles\s*=\s*([0-9]+)') { $maxFiles = $matches[1].Trim() }; " ^
    "    $maxMins = '0'; " ^
    "    if ($txt -match '\$MaxProcessingMinutes\s*=\s*([0-9]+)') { $maxMins = $matches[1].Trim() }; " ^
    "    $scale = '2'; " ^
    "    if ($txt -match '\$ScaleMultiplier\s*=\s*([0-9]+)') { $scale = $matches[1].Trim() }; " ^
    "    $fmt = 'JPG'; " ^
    "    if ($txt -match '\$ImageFormat\s*=\s*[''\""](.*?)[''\""]') { " ^
    "        $f = $matches[1].Trim(); " ^
    "        if ($f -and ($f -ieq 'JPG' -or $f -ieq 'PNG')) { $fmt = $f.ToUpper() }; " ^
    "    }; " ^
    "    $outPptx = '$false'; " ^
    "    if ($txt -match '\$OutputPptx\s*=\s*\$(true|false)' -and $matches[1].ToLower() -eq 'true') { $outPptx = '$true' }; " ^
    "    $restoreNums = '$true'; " ^
    "    if ($txt -match '\$RestoreSlideNumbers\s*=\s*\$(true|false)' -and $matches[1].ToLower() -eq 'false') { $restoreNums = '$false' }; " ^
    "    $lines = @( " ^
    "        '# ==============================================================================', " ^
    "        '# PowerPoint Slide Overlay - User Configuration', " ^
    "        '# For descriptions of each setting and new options, see CONFIGURATION in Overlay-Slides.ps1.', " ^
    "        '# ==============================================================================', " ^
    "        '', " ^
    "        \"`$FolderPath           = '$pEscaped'\", " ^
    "        \"`$ImageFormat          = '$fmt'\", " ^
    "        \"`$OutputPptx           = $outPptx\", " ^
    "        \"`$SkipExisting         = $skip\", " ^
    "        \"`$ScaleMultiplier      = $scale\", " ^
    "        \"`$MaxProcessedFiles    = $maxFiles\", " ^
    "        \"`$MaxProcessingMinutes = $maxMins\", " ^
    "        \"`$RestoreSlideNumbers  = $restoreNums\" " ^
    "    ); " ^
    "    Set-Content -LiteralPath $configPath -Value ($lines -join [System.Environment]::NewLine) -Encoding UTF8; " ^
    "    Write-Host '[MIGRATE] Migrated settings from Overlay-JpgSlides.ps1 to config.ps1.' -ForegroundColor Green; " ^
    "} " ^
    "$apiUrl = \"https://api.github.com/repos/yupingso/numbered-musical-notation/contents/tools/ppt-overlay?ref=$branch\"; " ^
    "try { " ^
    "    Write-Host \"Querying GitHub for files on branch '$branch'...\" -ForegroundColor White; " ^
    "    $items = Invoke-RestMethod -Uri $apiUrl -Headers @{ 'User-Agent' = 'PowerPoint-Tool-Updater' } -UseBasicParsing; " ^
    "    foreach ($item in $items) { " ^
    "        if ($item.type -eq 'file' -and $item.name -notin @('config.ps1', '.gitignore', 'Update-Tool.bat')) { " ^
    "            Write-Host \"Downloading $($item.name)...\" -ForegroundColor White; " ^
    "            Invoke-WebRequest -Uri $item.download_url -OutFile (Join-Path $toolDir $item.name) -UseBasicParsing; " ^
    "        } " ^
    "    } " ^
    "} catch { " ^
    "    Write-Host \"Notice: Could not query directory API ($($_.Exception.Message)).\" -ForegroundColor Yellow; " ^
    "    Write-Host 'Falling back to direct downloads...' -ForegroundColor Yellow; " ^
    "    $rawUrl = \"https://raw.githubusercontent.com/yupingso/numbered-musical-notation/$branch/tools/ppt-overlay\"; " ^
    "    foreach ($fn in @('Overlay-Slides.ps1', 'Run-OverlayConverter.bat', 'config.ps1.example')) { " ^
    "        Write-Host \"Downloading $fn...\" -ForegroundColor White; " ^
    "        Invoke-WebRequest -Uri \"$rawUrl/$fn\" -OutFile (Join-Path $toolDir $fn) -UseBasicParsing; " ^
    "    } " ^
    "} " ^
    "if (Test-Path -LiteralPath $oldLegacy) { Remove-Item -LiteralPath $oldLegacy -Force -ErrorAction SilentlyContinue }; " ^
    "Write-Host '`nUpdate completed successfully!' -ForegroundColor Green;"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ===================================================
    echo [SUCCESS] Tool updated successfully!
    echo.
    echo Tip: Check CONFIGURATION in Overlay-Slides.ps1
    echo      for descriptions and newly added options.
    echo ===================================================
) else (
    echo.
    echo ===================================================
    echo [ERROR] Update failed. Please check internet connection.
    echo ===================================================
)
echo.
pause
