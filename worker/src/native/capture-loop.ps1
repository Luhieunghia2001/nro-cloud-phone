# capture-loop.ps1 — vong lap ben vung: chup frame lien tuc -> stdout (NHỊ PHÂN)
# Protocol nhi phan tren stdout (binary stream, khong base64):
#   [1 byte type=0x01][2 byte LE len][len byte JSON meta]   (mot lan: {"w":cw,"h":ch})
#   [1 byte type=0x02][4 byte LE len][len byte JPEG]         (lap lai)
# Usage: powershell -File capture-loop.ps1 -ProcessId <pid> -Fps 15 -MaxWidth 240
param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [int]$Fps = 15,
  [int]$MaxWidth = 0
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Cap {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  public struct RECT { public int L, T, R, B; }
  public struct POINT { public int X, Y; }
}
"@

$stream = [Console]::OpenStandardOutput()

function Write-Frame([byte[]]$bytes) {
  $stream.WriteByte(2)
  $len = [BitConverter]::GetBytes([int]$bytes.Length)
  $stream.Write($len, 0, 4)
  $stream.Write($bytes, 0, $bytes.Length)
  $stream.Flush()
}

$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 60L)

$proc = Get-Process -Id $ProcessId -ErrorAction Stop
$hwnd = $proc.MainWindowHandle
if ($hwnd -eq [IntPtr]::Zero) { Write-Error "no-main-window"; exit 3 }

$origin = New-Object Cap+POINT; $origin.X = 0; $origin.Y = 0
[Cap]::ClientToScreen($hwnd, [ref]$origin) | Out-Null
$client = New-Object Cap+RECT; [Cap]::GetClientRect($hwnd, [ref]$client) | Out-Null
$cw = $client.R - $client.L
$ch = $client.B - $client.T
$win = New-Object Cap+RECT; [Cap]::GetWindowRect($hwnd, [ref]$win) | Out-Null
$ww = $win.R - $win.L
$wh = $win.B - $win.T
$ox = [Math]::Max(0, $origin.X - $win.L)
$oy = [Math]::Max(0, $origin.Y - $win.T)
if ($cw -le 0 -or $ch -le 0) { Write-Error "bad-client-rect"; exit 4 }

# Meta: [type=1][2-byte len][json]
$metaJson = '{"w":' + $cw + ',"h":' + $ch + '}'
$metaBytes = [System.Text.Encoding]::ASCII.GetBytes($metaJson)
$stream.WriteByte(1)
$stream.Write([BitConverter]::GetBytes([int16]$metaBytes.Length), 0, 2)
$stream.Write($metaBytes, 0, $metaBytes.Length)
$stream.Flush()

$targetW = if ($MaxWidth -gt 0 -and $cw -gt $MaxWidth) { $MaxWidth } else { $cw }
$targetH = [int][Math]::Round($ch * ($targetW / [double]$cw))

$full = New-Object System.Drawing.Bitmap($ww, $wh)
$frameMs = [int][Math]::Max(1, [Math]::Round(1000 / [double][Math]::Max(1, $Fps)))
$sw = [System.Diagnostics.Stopwatch]::StartNew()

while ([Cap]::IsWindow($hwnd)) {
  $sw.Restart()
  $g = [System.Drawing.Graphics]::FromImage($full)
  $hdc = $g.GetHdc()
  $ok = [Cap]::PrintWindow($hwnd, $hdc, 2)
  $g.ReleaseHdc($hdc)
  $g.Dispose()
  if ($ok) {
    $crop = $full.Clone([System.Drawing.Rectangle]::FromLTRB($ox, $oy, $ox + $cw, $oy + $ch), $full.PixelFormat)
    if ($targetW -ne $cw) {
      $scaled = New-Object System.Drawing.Bitmap($crop, $targetW, $targetH)
      $crop.Dispose()
      $crop = $scaled
    }
    $ms = New-Object System.IO.MemoryStream
    $crop.Save($ms, $enc, $ep)
    Write-Frame $ms.ToArray()
    $ms.Dispose()
    $crop.Dispose()
  }
  $sleep = $frameMs - $sw.ElapsedMilliseconds
  if ($sleep -gt 2) { Start-Sleep -Milliseconds $sleep }
}

$full.Dispose()
$stream.Flush()

