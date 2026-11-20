@echo off
rem Lets "tabi" run from cmd and PowerShell without changing the execution policy.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tabi.ps1" %*
exit /b %ERRORLEVEL%
