@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  deploy.bat — Build Astro + Upload FTP vers O2Switch
::  Usage : double-clic ou  deploy.bat
::  Pré-requis : WinSCP installé (https://winscp.net)
:: ============================================================

set "ROOT=%~dp0"
set "DIST=%ROOT%dist"
set "ENV_FILE=%ROOT%deploy.env"
set "WINSCP=C:\Program Files (x86)\WinSCP\WinSCP.com"

:: -- Fallback 64-bit install path
if not exist "%WINSCP%" set "WINSCP=C:\Program Files\WinSCP\WinSCP.com"

:: ── 0. Vérifier WinSCP ───────────────────────────────────────
if not exist "%WINSCP%" (
  echo.
  echo  [ERREUR] WinSCP introuvable.
  echo  Telecharger : https://winscp.net/eng/download.php
  echo  Installer dans le dossier par defaut puis relancer.
  echo.
  pause
  exit /b 1
)

:: ── 1. Lire deploy.env ───────────────────────────────────────
if not exist "%ENV_FILE%" (
  echo.
  echo  [ERREUR] Fichier deploy.env manquant.
  echo  Copiez deploy.env.example en deploy.env et remplissez vos identifiants FTP.
  echo.
  pause
  exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
  set "%%A=%%B"
)

:: Vérification variables minimales
if not defined FTP_HOST   ( echo [ERREUR] FTP_HOST manquant dans deploy.env  & pause & exit /b 1 )
if not defined FTP_USER   ( echo [ERREUR] FTP_USER manquant dans deploy.env  & pause & exit /b 1 )
if not defined FTP_PASS   ( echo [ERREUR] FTP_PASS manquant dans deploy.env  & pause & exit /b 1 )
if not defined FTP_REMOTE ( echo [ERREUR] FTP_REMOTE manquant dans deploy.env & pause & exit /b 1 )

:: ── 2. Build Astro ───────────────────────────────────────────
echo.
echo  ════════════════════════════════════════
echo   ETAPE 1/2 — npm run build
echo  ════════════════════════════════════════
call npm run build
if %errorlevel% neq 0 (
  echo.
  echo  [ERREUR] Le build a echoue. Upload annule.
  pause
  exit /b 1
)

if not exist "%DIST%" (
  echo  [ERREUR] Dossier dist\ introuvable apres le build.
  pause
  exit /b 1
)

:: ── 3. Upload FTP via WinSCP ─────────────────────────────────
echo.
echo  ════════════════════════════════════════
echo   ETAPE 2/2 — Upload FTP vers O2Switch
echo   %FTP_HOST%%FTP_REMOTE%
echo  ════════════════════════════════════════

:: Script WinSCP inline (heredoc via temp file)
set "TMP_SCRIPT=%TEMP%\winscp_deploy_%RANDOM%.txt"

(
  echo option batch abort
  echo option confirm off
  echo open ftp://!FTP_USER!:!FTP_PASS!@!FTP_HOST!/ -passive=on -explicittls=on
  echo synchronize remote -delete -criteria=either "!DIST!" "!FTP_REMOTE!"
  echo exit
) > "!TMP_SCRIPT!"

"%WINSCP%" /script="!TMP_SCRIPT!" /log="%ROOT%deploy.log"
set "RESULT=%errorlevel%"

del /q "!TMP_SCRIPT!" 2>nul

if !RESULT! neq 0 (
  echo.
  echo  [ERREUR] Upload FTP echoue ^(code !RESULT!^).
  echo  Consultez deploy.log pour le detail.
  pause
  exit /b 1
)

:: ── 4. Succès ────────────────────────────────────────────────
echo.
echo  ════════════════════════════════════════
echo   DEPLOY TERMINE avec succes !
echo   https://www.tourdata2026.oceanphenix.fr
echo  ════════════════════════════════════════
echo.
pause
endlocal
