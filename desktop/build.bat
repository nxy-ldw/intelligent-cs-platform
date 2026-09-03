@echo off
chcp 65001 >nul
title AI学习诊断 - Windows桌面端构建工具

echo ========================================
echo   AI学习诊断 - Windows桌面端构建工具
echo ========================================
echo.

cd /d "%~dp0"

REM 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

REM 检查依赖
if not exist "node_modules" (
    echo [信息] 首次运行，正在安装依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
    echo.
)

echo 请选择构建类型:
echo   1. 开发模式运行 (不打包)
echo   2. 打包安装版 + 便携版 (x64)
echo   3. 仅打包安装版 (NSIS)
echo   4. 仅打包便携版 (Portable)
echo   5. 重新安装依赖
echo   6. 退出
echo.
set /p choice=请输入选项 (1-6): 

if "%choice%"=="1" (
    echo [信息] 启动开发模式...
    call npm start
    goto end
)

if "%choice%"=="2" (
    echo [信息] 开始打包安装版 + 便携版...
    call npm run build:win64
    goto end
)

if "%choice%"=="3" (
    echo [信息] 开始打包安装版...
    npx electron-builder --win --x64 --target nsis
    goto end
)

if "%choice%"=="4" (
    echo [信息] 开始打包便携版...
    npx electron-builder --win --x64 --target portable
    goto end
)

if "%choice%"=="5" (
    echo [信息] 重新安装依赖...
    rmdir /s /q node_modules 2>nul
    del package-lock.json 2>nul
    call npm install
    echo.
    echo [完成] 依赖已重新安装
    goto end
)

if "%choice%"=="6" (
    goto end
)

echo [错误] 无效选项
pause

:end
echo.
echo ========================================
echo   操作完成
echo ========================================
echo.
echo 打包输出目录: %~dp0dist\
echo.
pause
