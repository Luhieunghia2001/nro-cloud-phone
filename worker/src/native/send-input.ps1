# send-input.ps1 — gui input vao canvas game bang PostMessage (KHONG di chuot, KHONG doi vi tri chuot)
# Bo qua SetCursorPos/mouse_event vi no lam chuot "tele" sang cua so KE.
# Thay vao do: tim canvas (child lon nhat) va gui tin nhan WM_LBUTTONDOWN/UP truc tiep — chuot dung yen.
# Van ep foreground (khong anh huong chuot) vi cua so game can len tren moi nhan input on dinh.
# Usage:
#   powershell -File send-input.ps1 -ProcessId <pid> -Kind mouse -X <x> -Y <y> -Button left -Action click
#   powershell -File send-input.ps1 -ProcessId <pid> -Kind key   -Vk <vk> -Action press
# Toa do X,Y la toa do tren anh mirror (main-client). Script doi sang toa do canvas tu dong.
param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [Parameter(Mandatory = $true)][ValidateSet("mouse", "key")][string]$Kind,
  [int]$X = 0,
  [int]$Y = 0,
  [ValidateSet("left", "right", "middle")][string]$Button = "left",
  [ValidateSet("down", "up", "click")][string]$Action = "click",
  [int]$Vk = 0,
  [ValidateSet("down", "up", "press")][string]$KeyAction = "press"
)
$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class Inj {
  [StructLayout(LayoutKind.Sequential)] public struct P { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr p, Proc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref P p);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, int w, int l);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool t);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, int flags, int extra);
  public delegate bool Proc(IntPtr h, IntPtr l);
  public static IntPtr FindCanvas(IntPtr p) {
    var list = new List<IntPtr>();
    EnumChildWindows(p, (h, l) => { list.Add(h); return true; }, IntPtr.Zero);
    IntPtr best = IntPtr.Zero; long area = -1;
    foreach (var h in list) { RECT c; if (GetClientRect(h, out c)) { long a=(long)(c.R-c.L)*(c.B-c.T); if (a>area){area=a;best=h;} } }
    return best;
  }
  public const uint WM_MOUSEMOVE=0x0200, WM_LBUTTONDOWN=0x0201, WM_LBUTTONUP=0x0202;
  public const uint WM_RBUTTONDOWN=0x0204, WM_RBUTTONUP=0x0205;
  public const uint WM_KEYDOWN=0x0100, WM_KEYUP=0x0101;
  public const int MK_LBUTTON=1, MK_RBUTTON=2;
}
"@

$proc = Get-Process -Id $ProcessId -ErrorAction Stop
$hwnd = $proc.MainWindowHandle
if ($hwnd -eq [IntPtr]::Zero) { Write-Error "no-main-window"; exit 3 }

# Ep foreground (khong dung SetCursorPos -> chuot khong di). Can thiet de cua so game nhan input on dinh.
if ([Inj]::IsIconic($hwnd)) { [Inj]::ShowWindow($hwnd, 9) | Out-Null }
[Inj]::BringWindowToTop($hwnd) | Out-Null
$fg = [Inj]::GetForegroundWindow()
$dummy = [uint32]0
$gt = [Inj]::GetWindowThreadProcessId($hwnd, [ref]$dummy)
$ft = [Inj]::GetWindowThreadProcessId($fg, [ref]$dummy)
$att = $false
if ($gt -ne 0 -and $ft -ne 0 -and $gt -ne $ft) { $att = [Inj]::AttachThreadInput($ft, $gt, $true) }
[Inj]::SetForegroundWindow($hwnd) | Out-Null
if ($att) { [Inj]::AttachThreadInput($ft, $gt, $false) | Out-Null }
Start-Sleep -Milliseconds 100

$canvas = [Inj]::FindCanvas($hwnd)
if ($canvas -eq [IntPtr]::Zero) { $canvas = $hwnd }

# Doi toa do mirror (main-client) -> toa do canvas-client.
$o = New-Object Inj+P; $o.X = 0; $o.Y = 0
[Inj]::ClientToScreen($hwnd, [ref]$o) | Out-Null
$c = New-Object Inj+P; $c.X = 0; $c.Y = 0
[Inj]::ClientToScreen($canvas, [ref]$c) | Out-Null
$sx = $o.X + $X; $sy = $o.Y + $Y
$lx = $sx - $c.X; $ly = $sy - $c.Y
$lp = ($ly -shl 16) -bor ($lx -band 0xFFFF)

if ($Kind -eq "mouse") {
  $down = if ($Button -eq "right") { [Inj]::WM_RBUTTONDOWN } else { [Inj]::WM_LBUTTONDOWN }
  $up   = if ($Button -eq "right") { [Inj]::WM_RBUTTONUP }   else { [Inj]::WM_LBUTTONUP }
  $wp   = if ($Button -eq "right") { [Inj]::MK_RBUTTON }      else { [Inj]::MK_LBUTTON }
  if ($Action -eq "click" -or $Action -eq "down") {
    [Inj]::PostMessage($canvas, [Inj]::WM_MOUSEMOVE, $wp, $lp) | Out-Null
    Start-Sleep -Milliseconds 20
    [Inj]::PostMessage($canvas, $down, $wp, $lp) | Out-Null
    Start-Sleep -Milliseconds 40
  }
  if ($Action -eq "click" -or $Action -eq "up") {
    [Inj]::PostMessage($canvas, $up, 0, $lp) | Out-Null
  }
  Write-Output ("OK mouse(post) $Button $Action @mirror($X,$Y)->canvas($lx,$ly) hwnd=$canvas")
}
elseif ($Kind -eq "key") {
  if ($KeyAction -eq "down" -or $KeyAction -eq "press") {
    [Inj]::PostMessage($canvas, [Inj]::WM_KEYDOWN, $Vk, 1) | Out-Null
    Start-Sleep -Milliseconds 40
  }
  if ($KeyAction -eq "up" -or $KeyAction -eq "press") {
    [Inj]::PostMessage($canvas, [Inj]::WM_KEYUP, $Vk, 0xC0000001) | Out-Null
  }
  Write-Output ("OK key(post) vk=$Vk $KeyAction hwnd=$canvas")
}
