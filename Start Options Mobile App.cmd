@echo off
title Options Desk Mobile App (Expo)
cd /d "%~dp0\mobile-app"
echo ========================================================
echo   OPTIONS TRADING DESK - MOBILE APP EXPO SERVER
echo ========================================================
echo   1. Scan the QR code using the Expo Go app on your phone
echo   2. Make sure your phone is connected to the same Wi-Fi
echo ========================================================
echo.
npx expo start --tunnel -c
pause
