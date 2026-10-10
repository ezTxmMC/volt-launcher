@echo off
setlocal enabledelayedexpansion

set VERSION=0.2.0
set APP_NAME=VoltLauncher
set BINARY_NAME=volt-launcher
set OUTPUT_DIR=build\windows
set ELECTRON_DIR=win-unpacked

REM Use GraalVM JDK if GRAALVM_HOME is set
if defined GRAALVM_HOME (
    set "JAVA_HOME=%GRAALVM_HOME%"
    set "PATH=%GRAALVM_HOME%\bin;%PATH%"
    echo Using GraalVM at: %GRAALVM_HOME%
    java -version 2>&1 | findstr /n "." | findstr "^1:"
)

echo === Building Volt Launcher for Windows ===

REM Step 1: Build Electron UI
echo [1/3] Building Electron UI...
cd ui
call pnpm install
call pnpm exec vite build
call pnpm exec electron-builder --win --dir
cd ..

REM Clean up builder metadata and other platform artifacts
del /q "volt-app\src\main\resources\electron-bin\builder-debug.yml" 2>nul
del /q "volt-app\src\main\resources\electron-bin\builder-effective-config.yaml" 2>nul
if exist "volt-app\src\main\resources\electron-bin\mac" rmdir /s /q "volt-app\src\main\resources\electron-bin\mac"
if exist "volt-app\src\main\resources\electron-bin\mac-arm64" rmdir /s /q "volt-app\src\main\resources\electron-bin\mac-arm64"
if exist "volt-app\src\main\resources\electron-bin\linux-unpacked" rmdir /s /q "volt-app\src\main\resources\electron-bin\linux-unpacked"

if not exist "volt-app\src\main\resources\electron-bin\%ELECTRON_DIR%" (
    echo ERROR: %ELECTRON_DIR% not found in volt-app\src\main\resources\electron-bin!
    exit /b 1
)

REM Step 2: Build GraalVM native image
echo [2/3] Building GraalVM native image...
call mvn clean package -Pnative -DskipTests

if not exist "target\%BINARY_NAME%.exe" (
    echo ERROR: Native image build failed - target\%BINARY_NAME%.exe not found!
    exit /b 1
)

REM Step 3: Assemble build output
echo [3/3] Assembling build output in %OUTPUT_DIR%...
if exist "%OUTPUT_DIR%" rmdir /s /q "%OUTPUT_DIR%"
mkdir "%OUTPUT_DIR%\electron"

REM Copy native binary
copy "target\%BINARY_NAME%.exe" "%OUTPUT_DIR%\%BINARY_NAME%.exe"

REM Embed the app icon - GraalVM native-image leaves the exe with a default icon
if exist "packaging\windows\voltlauncher.ico" (
    where rcedit >nul 2>nul
    if errorlevel 1 (
        echo WARNING: rcedit not found in PATH - %BINARY_NAME%.exe keeps the default icon.
        echo   Install it with: npm install -g rcedit
    ) else (
        rcedit "%OUTPUT_DIR%\%BINARY_NAME%.exe" --set-icon "packaging\windows\voltlauncher.ico"
        echo Icon embedded into %BINARY_NAME%.exe
    )
) else (
    echo WARNING: No icon found at packaging\windows\voltlauncher.ico
)

copy "packaging\windows\voltlauncher.ico" "%OUTPUT_DIR%\voltlauncher.ico" >nul 2>nul

REM Copy electron binary alongside main binary
xcopy /e /i /q "volt-app\src\main\resources\electron-bin\%ELECTRON_DIR%" "%OUTPUT_DIR%\electron\%ELECTRON_DIR%\"

REM Clean electron-bin after copying
if exist "volt-app\src\main\resources\electron-bin\win-unpacked" rmdir /s /q "volt-app\src\main\resources\electron-bin\win-unpacked"

echo.
echo === Build complete ===
echo   Output directory: %OUTPUT_DIR%\
echo   Native binary:    %OUTPUT_DIR%\%BINARY_NAME%.exe
echo   Electron:         %OUTPUT_DIR%\electron\%ELECTRON_DIR%

endlocal
