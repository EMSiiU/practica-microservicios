$ErrorActionPreference = "Stop"

$servicios = @(
  @("api-usuarios", 8001),
  @("api-productos", 8002),
  @("api-envios", 8003),
  @("api-inventario", 8004),
  @("api-carrito", 8005),
  @("api-pedidos", 8006),
  @("api-pagos", 8007),
  @("api-resenas", 8008)
)

$jobs = foreach ($s in $servicios) {
  Start-Job -ScriptBlock {
    param($name, $port)
    while ($true) {
      kubectl port-forward -n tienda-microservicios "svc/$name" "${port}:${port}" 2>$null
      Start-Sleep -Seconds 2
    }
  } -ArgumentList $s[0], $s[1]
}

Write-Host "Port-forwards activos en localhost:8001-8008 (Frontend: http://localhost:4200)" -ForegroundColor Green
Write-Host "Presiona Enter para detener los port-forwards..." -ForegroundColor Yellow
try {
  Read-Host
} finally {
  $jobs | Stop-Job -ErrorAction SilentlyContinue
  $jobs | Remove-Job -ErrorAction SilentlyContinue
}
