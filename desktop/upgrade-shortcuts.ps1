param([Parameter(Mandatory=$true)][string]$Executable)
$root = Join-Path $env:LOCALAPPDATA 'CppStart'
$shell = New-Object -ComObject WScript.Shell
$dirs = @([Environment]::GetFolderPath('DesktopDirectory'), (Join-Path ([Environment]::GetFolderPath('Programs')) 'C++ Start'), $root)
foreach ($dir in $dirs) {
    if (-not [IO.Directory]::Exists($dir)) { continue }
    foreach ($f in [IO.Directory]::EnumerateFiles($dir, '*.lnk')) {
        if ([IO.Path]::GetFileNameWithoutExtension($f) -notmatch '^(?:C\+\+ Start(?: [\d.]+)?|CppStart)$') { continue }
        try {
            $link = $shell.CreateShortcut($f)
            $target = [IO.Path]::GetFullPath($link.TargetPath)
            if ($target.StartsWith($root+'\', [StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($target) -eq 'CppStart.exe') {
                $link.TargetPath=$Executable
                $link.Arguments=''
                $link.WorkingDirectory=[IO.Path]::GetDirectoryName($Executable)
                $link.IconLocation=$Executable+',0'
                $link.Save()
            }
        } catch {}
    }
}
