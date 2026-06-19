import { Server } from '../types/server';

/**
 * Opens Remote Desktop Connection (mstsc.exe) directly via the rdp:// protocol.
 *
 * One-time setup required on the monitoring machine — run in PowerShell as Administrator:
 *
 *   $reg = "HKCU:\SOFTWARE\Classes\rdp"
 *   New-Item -Path "$reg\shell\open\command" -Force | Out-Null
 *   Set-ItemProperty -Path $reg -Name "(Default)" -Value "URL:Remote Desktop Protocol"
 *   Set-ItemProperty -Path $reg -Name "URL Protocol" -Value ""
 *   Set-ItemProperty -Path "$reg\shell\open\command" -Name "(Default)" -Value "powershell -WindowStyle Hidden -Command ``"Start-Process mstsc -ArgumentList ('/v:' + ('%1' -replace 'rdp://', ''))``""
 */
export function launchRdp(server: Server, port = 3389): void {
  window.location.href = `rdp://${server.ipAddress}:${port}`;
}
