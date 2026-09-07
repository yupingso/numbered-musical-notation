# ==============================================================================
# CONFIGURATION (Edit these values as needed)
# ==============================================================================
# Target directory (or single .ppt file) to process (Windows path style).
# TIP: You can also set $FolderPath = $PSScriptRoot to automatically scan the folder where this script lives.
$FolderPath = "C:\Path\To\Your\PPTFolder"

# Maximum number of files to process in this run (0 = no limit)
$MaxProcessedFiles = 0

# Maximum processing time in minutes (0 = no limit)
$MaxProcessingMinutes = 0

# Skip files where *-jpg.ppt already exists ($true = skip, $false = overwrite/re-convert)
$SkipExisting = $true

# Scale multiplier: 2x gives crisp, high-DPI images on modern screens
$ScaleMultiplier = 2

# ==============================================================================
# SCRIPT EXECUTION
# ==============================================================================

# Resolve path safely without wildcard issues and guarantee standard filesystem path
try {
    $FolderPath = (Resolve-Path -LiteralPath $FolderPath -ErrorAction Stop).ProviderPath
} catch {
    Write-Host "Error: Invalid path: '$FolderPath'." -ForegroundColor Red
    Write-Host "Please open Overlay-JpgSlides.ps1 in Notepad and set `$FolderPath to your actual folder or file path." -ForegroundColor Yellow
    Read-Host "`nPress Enter to exit"
    return
}

# Determine if target is a single file or a directory
$isSingleFile = Test-Path -LiteralPath $FolderPath -PathType Leaf
$logDir = if ($isSingleFile) { [System.IO.Path]::GetDirectoryName($FolderPath) } else { $FolderPath }

# Initialize log file with local date and time (up to seconds)
$logTimestamp = (Get-Date).ToString("yyyyMMdd_HHmmss")
$logFileName  = "overlay-log_$logTimestamp.txt"
$logFilePath  = Join-Path $logDir $logFileName

function Write-Log {
    param([string]$Message)
    Add-Content -LiteralPath $logFilePath -Value $Message -Encoding UTF8
}

Write-Log "=============================================================================="
Write-Log "PowerPoint Slide Overlay Batch Converter - Log"
Write-Log "Started At            : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Log "Target Path           : $FolderPath"
Write-Log "Max Processed Files   : $(if ($MaxProcessedFiles -gt 0) { $MaxProcessedFiles } else { 'No limit' })"
Write-Log "Max Processing Time   : $(if ($MaxProcessingMinutes -gt 0) { "$MaxProcessingMinutes minute(s)" } else { 'No limit' })"
Write-Log "Skip Existing Targets : $SkipExisting"
Write-Log "Scale Multiplier      : ${ScaleMultiplier}x"
Write-Log "==============================================================================`r`n"

if ($isSingleFile) {
    Write-Host "Target file: $FolderPath" -ForegroundColor Cyan
    $pptFiles = @(Get-Item -LiteralPath $FolderPath | Where-Object {
        $_.Extension -ieq ".ppt" -and
        $_.Name -notlike "*-jpg.ppt" -and
        $_.Name -notlike "~$*"
    })
} else {
    Write-Host "Scanning directory recursively: $FolderPath" -ForegroundColor Cyan
    $pptFiles = @(Get-ChildItem -LiteralPath $FolderPath -Filter "*.ppt" -File -Recurse | Where-Object {
        $_.Extension -ieq ".ppt" -and
        $_.Name -notlike "*-jpg.ppt" -and
        $_.Name -notlike "~$*"
    })
}

if ($pptFiles.Count -eq 0) {
    Write-Host "No eligible .ppt files found at $FolderPath" -ForegroundColor Yellow
    Write-Log "No eligible .ppt files found. Exiting."
    Read-Host "`nPress Enter to exit"
    return
}

Write-Host "Found $($pptFiles.Count) file(s) to process." -ForegroundColor Green
Write-Host "Log file: $logFilePath" -ForegroundColor Cyan

# Abort if PowerPoint is already running to avoid modal dialog freezes or interfering with active work
if (Get-Process -Name POWERPNT -ErrorAction SilentlyContinue) {
    Write-Host "Error: PowerPoint is currently running. Please save your work and close PowerPoint before running this batch script." -ForegroundColor Red
    Write-Log "ABORT: PowerPoint process was already running. User must close PowerPoint first."
    Read-Host "`nPress Enter to exit"
    return
}

$pptApp = $null
$successCount = 0
$failCount = 0
$skippedCount = 0
$newCount = 0
$processedCount = 0
$currentPres = $null

# Track structured statuses for each file: DONE, NEW, SKIPPED, FAILED
$fileManifest = [System.Collections.Generic.List[PSCustomObject]]::new()
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

try {
    # Initialize PowerPoint COM object safely inside cleanup scope
    try {
        $pptApp = New-Object -ComObject PowerPoint.Application
    } catch {
        Write-Host "Error: Failed to initialize PowerPoint COM application. Is Microsoft Office installed?" -ForegroundColor Red
        Write-Log "FATAL: Failed to create PowerPoint COM application object."
        return
    }

    $pptApp.DisplayAlerts = 1      # ppAlertsNone
    $pptApp.AutomationSecurity = 3  # msoAutomationSecurityForceDisable (suppresses macro warning dialogs)

    foreach ($file in $pptFiles) {
        $origPath   = $file.FullName
        $baseName   = $file.BaseName
        $dir        = $file.DirectoryName
        $targetPath = Join-Path $dir "$baseName-jpg.ppt"
        $imgFolder  = Join-Path $dir "$baseName-jpgs"

        # Check if target already exists and should be skipped
        if ($SkipExisting -and (Test-Path -LiteralPath $targetPath)) {
            Write-Host "`nSkipping (Already exists): $($file.Name)" -ForegroundColor DarkGray
            $skippedCount++
            $fileManifest.Add([PSCustomObject]@{
                Status   = "SKIPPED"
                FilePath = $origPath
                Details  = "Target *-jpg.ppt exists"
            })
            Write-Log "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] [SKIPPED] $($file.Name) (Target already exists)"
            continue
        }

        # Check if limits were reached before processing this file
        $limitReason = $null
        if ($MaxProcessedFiles -gt 0 -and $processedCount -ge $MaxProcessedFiles) {
            $limitReason = "MaxProcessedFiles limit reached ($MaxProcessedFiles)"
        } elseif ($MaxProcessingMinutes -gt 0 -and $stopwatch.Elapsed.TotalMinutes -ge $MaxProcessingMinutes) {
            $limitReason = "MaxProcessingMinutes limit reached ($MaxProcessingMinutes min)"
        }

        if ($null -ne $limitReason) {
            Write-Host "`nQueued / Unprocessed ($limitReason): $($file.Name)" -ForegroundColor Yellow
            $newCount++
            $fileManifest.Add([PSCustomObject]@{
                Status   = "NEW"
                FilePath = $origPath
                Details  = "Unprocessed: $limitReason"
            })
            Write-Log "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] [NEW]     $($file.Name) ($limitReason)"
            continue
        }

        Write-Host "`nProcessing: $($file.Name)..." -ForegroundColor White
        $currentPres = $null
        $fileTimer = [System.Diagnostics.Stopwatch]::StartNew()

        try {
            # 1. Create or clean directory for exported JPGs
            if (Test-Path -LiteralPath $imgFolder) {
                Get-ChildItem -LiteralPath $imgFolder -Filter "slide_*.jpg" -File | Remove-Item -Force -ErrorAction SilentlyContinue
            } else {
                [System.IO.Directory]::CreateDirectory($imgFolder) | Out-Null
            }

            # 2. Copy some.ppt to some-jpg.ppt
            Copy-Item -LiteralPath $origPath -Destination $targetPath -Force

            # 3. Clear ReadOnly attribute and unblock Mark-of-the-Web to prevent Protected View
            Set-ItemProperty -LiteralPath $targetPath -Name IsReadOnly -Value $false -ErrorAction SilentlyContinue
            Unblock-File -LiteralPath $targetPath -ErrorAction SilentlyContinue

            # 4. Open presentation with active window (-1) so rendering engine initializes fonts accurately
            $currentPres = $pptApp.Presentations.Open($targetPath, 0, 0, -1)

            # Ensure application is visible to initialize GDI/DirectX rendering, but placed off-screen so user is uninterrupted
            try {
                $pptApp.Visible     = -1     # msoTrue (initializes full visual rendering engine)
                $pptApp.WindowState = 1      # ppWindowNormal
                $pptApp.Left        = -10000 # Place off-screen so user is not interrupted
                $pptApp.Top         = -10000
            } catch {}

            $slideWidth  = $currentPres.PageSetup.SlideWidth
            $slideHeight = $currentPres.PageSetup.SlideHeight
            $exportWidth = [int]($slideWidth * $ScaleMultiplier)
            $exportHeight = [int]($slideHeight * $ScaleMultiplier)

            # Clamp resolution to legacy PowerPoint's 3072px bitmap ceiling to prevent export errors
            if ($exportWidth -gt 3072 -or $exportHeight -gt 3072) {
                $scale = [Math]::Min(3072.0 / $exportWidth, 3072.0 / $exportHeight)
                $exportWidth  = [int]($exportWidth * $scale)
                $exportHeight = [int]($exportHeight * $scale)
            }

            $slides = $currentPres.Slides
            $slideCount = $slides.Count
            Write-Host "  Slides count: $slideCount" -ForegroundColor Gray

            for ($i = 1; $i -le $slideCount; $i++) {
                $slide   = $slides.Item($i)
                $imgName = "slide_$i.jpg"
                $imgPath = Join-Path $imgFolder $imgName

                # Remove existing image file if present to prevent overwrite prompts
                if (Test-Path -LiteralPath $imgPath) {
                    Remove-Item -LiteralPath $imgPath -Force -ErrorAction SilentlyContinue
                }

                # 5. Export slide to JPG
                $slide.Export($imgPath, "JPG", $exportWidth, $exportHeight)

                # Always remove timeline animations so hidden shapes don't swallow clicks in slide shows
                try {
                    $seq = $slide.TimeLine.MainSequence
                    for ($a = $seq.Count; $a -ge 1; $a--) {
                        try { $seq.Item($a).Delete() } catch {}
                    }
                    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($seq) | Out-Null
                } catch {}

                # 6. Insert picture overlay (LinkToFile=0, SaveWithDocument=-1)
                # Retry up to 5 times to absorb transient antivirus or file flush locks
                $pic = $null
                for ($retry = 0; $retry -lt 5; $retry++) {
                    try {
                        $pic = $slide.Shapes.AddPicture($imgPath, 0, -1, 0, 0, $slideWidth, $slideHeight)
                        break
                    } catch {
                        if ($retry -eq 4) { throw }
                        Start-Sleep -Milliseconds 100
                    }
                }
                $pic.ZOrder(0) # 0 = msoBringToFront

                [System.Runtime.InteropServices.Marshal]::ReleaseComObject($pic) | Out-Null
                [System.Runtime.InteropServices.Marshal]::ReleaseComObject($slide) | Out-Null
            }

            [System.Runtime.InteropServices.Marshal]::ReleaseComObject($slides) | Out-Null

            # 7. Save and close
            $currentPres.Save()
            $currentPres.Close()
            [System.Runtime.InteropServices.Marshal]::ReleaseComObject($currentPres) | Out-Null
            $currentPres = $null

            $fileTimer.Stop()
            $durationSec = [math]::Round($fileTimer.Elapsed.TotalSeconds, 1)

            Write-Host "  Done -> Saved to $([System.IO.Path]::GetFileName($targetPath)) (${durationSec}s)" -ForegroundColor Green
            $successCount++
            $processedCount++

            $fileManifest.Add([PSCustomObject]@{
                Status   = "DONE"
                FilePath = $origPath
                Details  = "$slideCount slides (${durationSec}s)"
            })
            Write-Log "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] [DONE]    $($file.Name) ($slideCount slides, ${durationSec}s)"
        }
        catch {
            $errMessage = ($_.Exception.Message -replace "[\r\n\t]+", " ").Trim()
            Write-Warning "  Failed processing '$($file.Name)': $errMessage"
            $failCount++
            $processedCount++

            # Discard unsaved changes cleanly so PowerPoint doesn't prompt
            if ($null -ne $currentPres) {
                try {
                    $currentPres.Saved = -1 # msoTrue
                    $currentPres.Close()
                    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($currentPres) | Out-Null
                } catch {}
                $currentPres = $null
            }

            # Atomic cleanup: remove partial target files on failure
            if (Test-Path -LiteralPath $targetPath) {
                Remove-Item -LiteralPath $targetPath -Force -ErrorAction SilentlyContinue
            }
            if (Test-Path -LiteralPath $imgFolder) {
                Remove-Item -LiteralPath $imgFolder -Recurse -Force -ErrorAction SilentlyContinue
            }

            $fileManifest.Add([PSCustomObject]@{
                Status   = "FAILED"
                FilePath = $origPath
                Details  = "Error: $errMessage"
            })
            Write-Log "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] [FAILED]  $($file.Name) - Error: $errMessage"
        }
    }

    $stopwatch.Stop()
    $totalMinutes = [math]::Round($stopwatch.Elapsed.TotalMinutes, 2)

    # Summary reporting placed after loop completes
    Write-Host "`n==============================================================================" -ForegroundColor Cyan
    Write-Host "BATCH PROCESSING SUMMARY (Total Time: $totalMinutes min)" -ForegroundColor Cyan
    Write-Host "==============================================================================" -ForegroundColor Cyan
    Write-Host "  DONE    : $successCount" -ForegroundColor Green
    Write-Host "  SKIPPED : $skippedCount" -ForegroundColor DarkGray
    Write-Host "  NEW     : $newCount" -ForegroundColor $(if ($newCount -gt 0) { "Yellow" } else { "Gray" })
    Write-Host "  FAILED  : $failCount" -ForegroundColor $(if ($failCount -gt 0) { "Red" } else { "Gray" })
    Write-Host "==============================================================================" -ForegroundColor Cyan
    Write-Host "Detailed log saved to: $logFilePath`n" -ForegroundColor White

    # Write summary & status manifest table to the log file
    Write-Log "`r`n=============================================================================="
    Write-Log "BATCH SUMMARY"
    Write-Log "=============================================================================="
    Write-Log "Total Files Found   : $($pptFiles.Count)"
    Write-Log "DONE (Converted)    : $successCount"
    Write-Log "SKIPPED (Existing)  : $skippedCount"
    Write-Log "NEW (Unprocessed)   : $newCount"
    Write-Log "FAILED (Errors)     : $failCount"
    Write-Log "Total Elapsed Time  : $totalMinutes minute(s)"
    Write-Log "Finished At         : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    Write-Log "==============================================================================`r`n"

    Write-Log "STATUS MANIFEST TABLE (1 line per file)"
    Write-Log "------------------------------------------------------------------------------------------------------------------------"
    Write-Log ("{0,-8} | {1} | {2}" -f "STATUS", "FILE PATH", "DETAILS")
    Write-Log "------------------------------------------------------------------------------------------------------------------------"
    foreach ($entry in $fileManifest) {
        Write-Log ("{0,-8} | {1} | {2}" -f $entry.Status, $entry.FilePath, $entry.Details)
    }
    Write-Log "------------------------------------------------------------------------------------------------------------------------"
}
finally {
    # If an unexpected crash left current presentation open, close it cleanly
    if ($null -ne $currentPres) {
        try {
            $currentPres.Saved = -1
            $currentPres.Close()
            [System.Runtime.InteropServices.Marshal]::ReleaseComObject($currentPres) | Out-Null
        } catch {}
    }

    if ($null -ne $pptApp) {
        # Cleanly close any lingering presentations and quit PowerPoint
        try {
            while ($pptApp.Presentations.Count -gt 0) {
                $p = $pptApp.Presentations.Item(1)
                $p.Saved = -1
                $p.Close()
                [System.Runtime.InteropServices.Marshal]::ReleaseComObject($p) | Out-Null
            }
        } catch {}

        try { $pptApp.Quit() } catch {}

        # Comprehensive RCW garbage collection safely wrapped
        try {
            [System.GC]::Collect()
            [System.GC]::WaitForPendingFinalizers()
            if ($null -ne $pptApp) {
                [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($pptApp) | Out-Null
                $pptApp = $null
            }
            [System.GC]::Collect()
        } catch {}
    }

    # Always pause before closing the console window
    Read-Host "Press Enter to close this window"
}
