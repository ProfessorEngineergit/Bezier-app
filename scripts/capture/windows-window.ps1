# Photographs the real Windows app, window and all, the way a person would use it:
# with the keyboard. (The Edge WebDriver would not start the app on a runner,
# "DevToolsActivePort file doesn't exist", and this is the same method as the Mac
# script, scripts/capture/mac-window.sh, which keeps the pictures comparable.)
#
#   pwsh scripts/capture/windows-window.ps1 -Exe <bezier-desktop.exe> -Out <directory>
#
# Needs an interactive desktop session (a GitHub Windows runner has one).
param(
  [Parameter(Mandatory = $true)][string]$Exe,
  [Parameter(Mandatory = $true)][string]$Out
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $Out | Out-Null
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class Native {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint code, uint mapType);
  // The window's real edges: GetWindowRect includes an invisible border that shows what is behind it.
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attribute, out RECT r, int size);
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)] public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
    public short dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra; public int dmFields;
    public int dmPositionX, dmPositionY, dmDisplayOrientation, dmDisplayFixedOutput;
    public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
    public short dmLogPixels; public int dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency;
    public int dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
  }
  [DllImport("user32.dll", CharSet = CharSet.Ansi)] public static extern bool EnumDisplaySettings(string dev, int mode, ref DEVMODE dm);
  [DllImport("user32.dll", CharSet = CharSet.Ansi)] public static extern int ChangeDisplaySettings(ref DEVMODE dm, int flags);
}
'@

# A screen the window fits on: a runner starts at 1024 x 768. Best effort.
try {
  $dm = New-Object Native+DEVMODE
  $dm.dmSize = [System.Runtime.InteropServices.Marshal]::SizeOf($dm)
  [void][Native]::EnumDisplaySettings($null, -1, [ref]$dm)
  $dm.dmPelsWidth = 1920; $dm.dmPelsHeight = 1080; $dm.dmFields = 0x80000 -bor 0x100000
  $result = [Native]::ChangeDisplaySettings([ref]$dm, 0)
  "display change to 1920 x 1080: $result (0 is success)"
  Start-Sleep -Seconds 3
} catch { "display change failed: $_" }

$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
"screen: $($screen.Width) x $($screen.Height)"

$proc = Start-Process -FilePath $Exe -PassThru
for ($i = 0; $i -lt 60 -and $proc.MainWindowHandle -eq 0; $i++) { Start-Sleep -Milliseconds 500; $proc.Refresh() }
if ($proc.MainWindowHandle -eq 0) { throw 'The app opened no window.' }
$handle = $proc.MainWindowHandle
[void][Native]::ShowWindow($handle, 9)
Start-Sleep -Seconds 8

function Focus { [void][Native]::SetForegroundWindow($handle); Start-Sleep -Milliseconds 400 }
function Keys([string]$keys, [double]$wait = 1.0) {
  Focus
  [System.Windows.Forms.SendKeys]::SendWait($keys)
  Start-Sleep -Milliseconds ([int]($wait * 1000))
}
# A chord as the keyboard sends it: modifiers down, the key, then everything up, each with
# its hardware scan code. The scan code matters: the web view takes `event.code` ("Digit4")
# from it, and the app's workspace shortcut reads `code`, so a key sent without one is a key
# the app never sees (SendKeys sends none either, which is why it did not work).
function Chord([byte[]]$modifiers, [byte]$key, [double]$wait = 1.0) {
  Focus
  $scan = { param([byte]$vk) [byte][Native]::MapVirtualKey([uint32]$vk, 0) }
  foreach ($m in $modifiers) { [Native]::keybd_event($m, (& $scan $m), 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 80 }
  [Native]::keybd_event($key, (& $scan $key), 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 80
  [Native]::keybd_event($key, (& $scan $key), 2, [UIntPtr]::Zero); Start-Sleep -Milliseconds 80
  for ($i = $modifiers.Length - 1; $i -ge 0; $i--) { [Native]::keybd_event($modifiers[$i], (& $scan $modifiers[$i]), 2, [UIntPtr]::Zero); Start-Sleep -Milliseconds 80 }
  Start-Sleep -Milliseconds ([int]($wait * 1000))
}
$CTRL = [byte]0x11; $ALT = [byte]0x12

function Shot([string]$name) {
  Focus
  $rect = New-Object Native+RECT
  # DWMWA_EXTENDED_FRAME_BOUNDS (9): the visible frame; the plain rectangle if that is not
  # available.
  if ([Native]::DwmGetWindowAttribute($handle, 9, [ref]$rect, [System.Runtime.InteropServices.Marshal]::SizeOf($rect)) -ne 0) {
    [void][Native]::GetWindowRect($handle, [ref]$rect)
  }
  $width = $rect.Right - $rect.Left; $height = $rect.Bottom - $rect.Top
  $bitmap = New-Object System.Drawing.Bitmap $width, $height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size $width, $height))
  $bitmap.Save((Join-Path $Out "windows-window-$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  "kept windows-window-$name ($width x $height)"
}

Shot '1-start'

# Tab from nothing to New Project is eight presses (search, All Projects, Learn,
# New folder, Settings, the sidebar's edge, the Bezier crumb, New Project).
for ($i = 0; $i -lt 8; $i++) { Keys '{TAB}' 0.2 }
Keys '{ENTER}' 5                  # a new project
Keys 'e' 10                       # Extrude: the starter box, and the first notice gone
Shot '2-editor'

Chord @($CTRL, $ALT) ([byte][char]'4') 6   # Ctrl+Alt+4: Drawings
Shot '3-drawings'

Chord @($CTRL, $ALT) ([byte][char]'1') 3   # Modeling again
Keys '^,' 3                       # Settings
Shot '4-settings'

Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
