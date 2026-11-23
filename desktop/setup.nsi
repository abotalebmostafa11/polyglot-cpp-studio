Unicode true
!include "LogicLib.nsh"
!include "x64.nsh"
Name "Polyglot C++ Studio 2.4.1"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Polyglot C++ Studio"
RequestExecutionLevel user
SetCompressor zlib
SetCompress force
ShowInstDetails show
Icon "${ICON}"
UninstallIcon "${ICON}"
VIProductVersion 2.4.1.0
VIAddVersionKey "ProductName" "Polyglot C++ Studio"
VIAddVersionKey "CompanyName" "Associate Professor Mostafa Abotaleb"
VIAddVersionKey "FileDescription" "Polyglot C++ Studio setup for ${EDITION}"
VIAddVersionKey "FileVersion" "2.4.1"
VIAddVersionKey "LegalCopyright" "Mostafa Abotaleb"
Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK "This edition requires 64-bit Windows."
    Abort
  ${EndIf}
FunctionEnd
Section
  SetShellVarContext current
  SetOverwrite try
  SetOutPath "$INSTDIR\2.4.1"
  ClearErrors
  File /r "${PAYLOAD}/*"
  IfErrors 0 doneCopy
    MessageBox MB_OK "Setup could not replace the app files. Close Polyglot C++ Studio and run setup again."
    Abort
  doneCopy:
  CreateShortCut "$DESKTOP\Polyglot C++ Studio.lnk" "$INSTDIR\2.4.1\PolyglotStudio.exe"
  CreateShortCut "$SMPROGRAMS\Polyglot C++ Studio.lnk" "$INSTDIR\2.4.1\PolyglotStudio.exe"
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\2.4.1\resources\app\upgrade-shortcuts.ps1" "$INSTDIR\2.4.1\PolyglotStudio.exe"'
  Pop $0
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PolyglotCppStudio" "DisplayName" "Polyglot C++ Studio"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PolyglotCppStudio" "DisplayVersion" "2.4.1"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PolyglotCppStudio" "Publisher" "Associate Professor Mostafa Abotaleb"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PolyglotCppStudio" "DisplayIcon" "$INSTDIR\2.4.1\PolyglotStudio.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PolyglotCppStudio" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  IfSilent +2
    Exec '"$INSTDIR\2.4.1\PolyglotStudio.exe"'
SectionEnd
Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\Polyglot C++ Studio.lnk"
  Delete "$SMPROGRAMS\Polyglot C++ Studio.lnk"
  RMDir /r "$INSTDIR\2.4.1"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PolyglotCppStudio"
SectionEnd
