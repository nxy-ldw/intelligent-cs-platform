!include "MUI2.nsh"
!include "FileFunc.nsh"

Name "AI学习诊断"
OutFile "AI学习诊断-Setup-1.0.2.exe"
InstallDir "$LOCALAPPDATA\AI学习诊断"
InstallDirRegKey HKCU "Software\AI学习诊断" "InstallDir"
RequestExecutionLevel user
ShowInstDetails hide
ShowUnInstDetails hide
SetCompressor /SOLID lzma

!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\AI学习诊断.exe"
!define MUI_FINISHPAGE_RUN_TEXT "立即启动 AI学习诊断"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "dist\win-unpacked\*"

  WriteRegStr HKCU "Software\AI学习诊断" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AI学习诊断" "DisplayName" "AI学习诊断"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AI学习诊断" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AI学习诊断" "DisplayVersion" "1.0.2"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AI学习诊断" "Publisher" "AI Learning Platform"

  CreateDirectory "$SMPROGRAMS\AI学习诊断"
  CreateShortcut "$SMPROGRAMS\AI学习诊断\AI学习诊断.lnk" "$INSTDIR\AI学习诊断.exe"
  CreateShortcut "$SMPROGRAMS\AI学习诊断\卸载.lnk" "$INSTDIR\uninstall.exe"
  CreateShortcut "$DESKTOP\AI学习诊断.lnk" "$INSTDIR\AI学习诊断.exe"

  WriteUninstaller "$INSTDIR\uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\AI学习诊断.lnk"
  RMDir /r "$SMPROGRAMS\AI学习诊断"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AI学习诊断"
  DeleteRegKey HKCU "Software\AI学习诊断"
SectionEnd
