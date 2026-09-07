@echo off
title PowerPoint Slide Overlay Batch Converter
cd /d "%~dp0"
echo ===================================================
echo Starting PowerPoint Slide Overlay Batch Converter
echo ===================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Overlay-JpgSlides.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo PowerShell exited with an error code.
    pause
)
