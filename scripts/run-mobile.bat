@echo off
echo ========================================================
echo   Zenify Mobile - Realme RMX5030 Live Dev Session
echo ========================================================
echo.
echo   Hot Reload is ACTIVE:
echo   - Press 'r' to Hot Reload changes instantly
echo   - Press 'R' to Hot Restart the app
echo   - Press 'q' to Quit
echo.
cd /d "%~dp0..\mobile"
flutter run -d BMAET8GASCRGZLJB
pause

