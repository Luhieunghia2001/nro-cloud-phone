# capture-frame.ps1 — chup 1 frame cua so game (PrintWindow) -> file JPEG
# Usage: powershell -File capture-frame.ps1 -Pid <pid> -Out <file.jpg> [-MaxWidth 240]
param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$MaxWidth = 0
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Cap {
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint c);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr p, IntPtr c, string cls, string title);
  public struct RECT { public int L, T, R, B; }
  public struct POINT { public int X, Y; }
}
"@

$proc = Get-Process -Id $ProcessId -ErrorAction Stop
$hwnd = $proc.MainWindowHandle
if ($hwnd -eq [IntPtr]::Zero) { Write-Error "no-main-window"; exit 3 }

# Toan do man hinh cua goc client (bo thanh title/menu) + kich thuoc client.
$origin = New-Object Cap+POINT
$origin.X = 0; $origin.Y = 0
[Cap]::ClientToScreen($hwnd, [ref]$origin) | Out-Null
$client = New-Object Cap+RECT
[Cap]::GetClientRect($hwnd, [ref]$client) | Out-Null
$cw = $client.R - $client.L
$ch = $client.B - $client.T
if ($cw -le 0 -or $ch -le 0) { Write-Error "bad-client-rect"; exit 4 }

$rect = New-Object Cap+RECT
[Cap]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$w = $rect.R - $rect.L
$h = $rect.B - $rect.T

$full = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($full)
$hdc = $g.GetHdc()
[Cap]::PrintWindow($hwnd, $hdc, 2) | Out-Null   # 2 = PW_RENDERFULLCONTENT
$g.ReleaseHdc($hdc)
$g.Dispose()

# Cat lay dung vung client (bo vien/thanh title).
$ox = $origin.X - $rect.L
$oy = $origin.Y - $rect.T
if ($ox -lt 0) { $ox = 0 }
if ($oy -lt 0) { $oy = 0 }
$cropW = [Math]::Min($cw, $w - $ox)
$cropH = [Math]::Min($ch, $h - $oy)
$crop = $full.Clone([System.Drawing.Rectangle]::FromLTRB($ox, $oy, $ox + $cropW, $oy + $cropH), $full.PixelFormat)
$full.Dispose()

$target = $crop
if ($MaxWidth -gt 0 -and $cropW -gt $MaxWidth) {
  $nh = [int]($cropH * ($MaxWidth / $cropW))
  $target = New-Object System.Drawing.Bitmap($crop, $MaxWidth, $nh)
  $crop.Dispose()
}

$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 70L)
$target.Save($Out, $enc, $ep)
$target.Dispose()

# Report kich thuoc client THAT (truoc downscale) de frontend map toa do dung.
Write-Output ("OK {0}x{1} {2}" -f $cw, $ch, $Out)
