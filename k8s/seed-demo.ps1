$ErrorActionPreference = "Stop"

$pfJobs = @(
  Start-Job { kubectl port-forward -n tienda-microservicios svc/api-usuarios 18001:8001 }
  Start-Job { kubectl port-forward -n tienda-microservicios svc/api-productos 18002:8002 }
  Start-Job { kubectl port-forward -n tienda-microservicios svc/api-inventario 18004:8004 }
)

try {
  Start-Sleep -Seconds 3

  Write-Host "1. Verificando cuenta admin en api-usuarios..."
  $prevPref = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  kubectl exec -n tienda-microservicios deployment/api-usuarios -- sh -c 'ADMIN_CORREO=admin@tienda.test ADMIN_CONTRASENA=AdminTienda-2026 php bin/crear-admin.php' 2>$null | Out-Null
  $ErrorActionPreference = $prevPref
  $LASTEXITCODE = 0

  Write-Host "2. Iniciando sesion como admin..."
  $loginBody = @{ correo = "admin@tienda.test"; contrasena = "AdminTienda-2026" } | ConvertTo-Json
  $loginResp = Invoke-RestMethod -Method Post -Uri "http://localhost:18001/api/usuarios/login" -ContentType "application/json" -Body $loginBody
  $headers = @{ Authorization = "Bearer $($loginResp.token)" }

  Write-Host "3. Consultando catalogo actual..."
  $existing = Invoke-RestMethod -Method Get -Uri "http://localhost:18002/api/productos"
  $existingNames = @{}
  foreach ($item in $existing) {
    $existingNames[$item.nombre.ToLowerInvariant()] = $true
  }

  $productos = @(
    # --- Hogar (14) ---
    @{ nombre = "Taza de ceramica"; descripcion = "Taza artesanal de 350 ml acabado mate."; precio = 199.90; categoria = "Hogar"; stock = 10; imagen_url = "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=600" },
    @{ nombre = "Termo Termico Acero 600 ml"; descripcion = "Mantiene bebidas frias 24h y calientes 12h."; precio = 349.00; categoria = "Hogar"; stock = 12; imagen_url = "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600" },
    @{ nombre = "Cafetera Prensa Francesa 800 ml"; descripcion = "Vidrio borosilicato resistente al calor con filtro doble de acero."; precio = 489.00; categoria = "Hogar"; stock = 15; imagen_url = "https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=600" },
    @{ nombre = "Juego de 4 Vasos Cristal Doble Pared"; descripcion = "Aislamiento termico para cafe espresso, te o bebidas frias."; precio = 560.00; categoria = "Hogar"; stock = 14; imagen_url = "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600" },
    @{ nombre = "Vela Aromatica de Cera de Soya"; descripcion = "Aroma lavanda y cedro con 45 horas de duracion continua."; precio = 245.00; categoria = "Hogar"; stock = 22; imagen_url = "https://images.unsplash.com/photo-1603006905003-be475563bc59?w=600" },
    @{ nombre = "Maceta Minimalista de Concreto"; descripcion = "Diseno geometrico ideal para suculentas e interiores modernos."; precio = 215.00; categoria = "Hogar"; stock = 18; imagen_url = "https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=600" },
    @{ nombre = "Manta Tejida de Algodon Organico"; descripcion = "Textura suave y transpirable de 130x180 cm en tono arena."; precio = 790.00; categoria = "Hogar"; stock = 9; imagen_url = "https://images.unsplash.com/photo-1580301762395-21ce84d00bc6?w=600" },
    @{ nombre = "Tabla de Cortar de Nogal"; descripcion = "Madera maciza tratada con aceite mineral grado alimenticio."; precio = 430.00; categoria = "Hogar"; stock = 11; imagen_url = "https://images.unsplash.com/photo-1594282486552-05b4d80fbb9f?w=600" },
    @{ nombre = "Difusor Ultrasonico de Aromas"; descripcion = "Capacidad de 300 ml con luz calida regulable y apagado automatico."; precio = 620.00; categoria = "Hogar"; stock = 16; imagen_url = "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600" },
    @{ nombre = "Tetera Cuello de Cisne 1 L"; descripcion = "Acero inoxidable negro mate con boquilla de precision para pour-over."; precio = 890.00; categoria = "Hogar"; stock = 8; imagen_url = "https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=600" },
    @{ nombre = "Set de 3 Frascos Hermeticos Bambu"; descripcion = "Vidrio grueso con tapa sellada de silicona para despensa."; precio = 410.00; categoria = "Hogar"; stock = 20; imagen_url = "https://images.unsplash.com/photo-1584589167171-541ce45f1eea?w=600" },
    @{ nombre = "Reloj de Pared Silencioso 30 cm"; descripcion = "Mecanismo de cuarzo sin tic-tac y marco de madera natural."; precio = 520.00; categoria = "Hogar"; stock = 13; imagen_url = "https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?w=600" },
    @{ nombre = "Cojin Decorativo Lino Natural"; descripcion = "Funda lavable con cierre oculto y relleno hipoalergenico."; precio = 310.00; categoria = "Hogar"; stock = 19; imagen_url = "https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?w=600" },
    @{ nombre = "Bascula Digital de Cocina 5 kg"; descripcion = "Precision de 1 gramo con pantalla LED y funcion tara."; precio = 285.00; categoria = "Hogar"; stock = 17; imagen_url = "https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=600" },

    # --- Tecnologia (15) ---
    @{ nombre = "Audifonos Inalambricos Studio"; descripcion = "Cancelacion activa de ruido y 30 horas de bateria."; precio = 1899.00; categoria = "Tecnologia"; stock = 10; imagen_url = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600" },
    @{ nombre = "Teclado Mecanico Compacto"; descripcion = "Distribucion 75% con switches silenciosos."; precio = 1450.50; categoria = "Tecnologia"; stock = 10; imagen_url = "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600" },
    @{ nombre = "Mouse Ergonomico Inalambrico Pro"; descripcion = "Sensor optico 4000 DPI, conexion Bluetooth y USB-C recargable."; precio = 899.00; categoria = "Tecnologia"; stock = 15; imagen_url = "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=600" },
    @{ nombre = "Bocina Bluetooth Portatil 20W"; descripcion = "Resistente al agua IPX7 con bajos profundos y 18 horas de autonomia."; precio = 1150.00; categoria = "Tecnologia"; stock = 12; imagen_url = "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600" },
    @{ nombre = "Cargador GaN 65W 3 Puertos"; descripcion = "Carga rapida USB-C PD para laptop, tablet y smartphone simultaneamente."; precio = 680.00; categoria = "Tecnologia"; stock = 25; imagen_url = "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600" },
    @{ nombre = "Hub USB-C 8 en 1 Aluminio"; descripcion = "HDMI 4K, Ethernet Gigabit, lector SD y carga pass-through 100W."; precio = 795.00; categoria = "Tecnologia"; stock = 18; imagen_url = "https://images.unsplash.com/photo-1625842268584-8f3296236761?w=600" },
    @{ nombre = "Camara Web Full HD 1080p"; descripcion = "Enfoque automatico, microfono dual y cubierta de privacidad."; precio = 920.00; categoria = "Tecnologia"; stock = 11; imagen_url = "https://images.unsplash.com/photo-1587826080692-f439cd0b70da?w=600" },
    @{ nombre = "SSD Externo Portatil 1 TB"; descripcion = "Transferencia USB 3.2 hasta 1050 MB/s en carcasa compacta resistente."; precio = 1990.00; categoria = "Tecnologia"; stock = 7; imagen_url = "https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=600" },
    @{ nombre = "Power Bank 20000 mAh PD"; descripcion = "Bateria externa con pantalla digital y salida de 30W."; precio = 740.00; categoria = "Tecnologia"; stock = 20; imagen_url = "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=600" },
    @{ nombre = "Microfono Condensador USB Estudio"; descripcion = "Patron cardioide ideal para podcasts, clases y streaming."; precio = 1380.00; categoria = "Tecnologia"; stock = 9; imagen_url = "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=600" },
    @{ nombre = "Monitor Portatil IPS 15.6 Full HD"; descripcion = "Pantalla antirreflejo USB-C/HDMI con funda magnetica incluida."; precio = 3290.00; categoria = "Tecnologia"; stock = 5; imagen_url = "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=600" },
    @{ nombre = "Audifonos In-Ear True Wireless"; descripcion = "Estuche compacto con carga inalambrica y modo transparencia."; precio = 1249.00; categoria = "Tecnologia"; stock = 16; imagen_url = "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600" },
    @{ nombre = "Soporte Cargador Inalambrico 3 en 1"; descripcion = "Estacion magnetica plegable para telefono, reloj y audifonos."; precio = 860.00; categoria = "Tecnologia"; stock = 14; imagen_url = "https://images.unsplash.com/photo-1586816879360-004f5b0c51e5?w=600" },
    @{ nombre = "Luz Barra LED para Monitor"; descripcion = "Iluminacion asimetrica sin reflejos en pantalla con control tactil."; precio = 699.00; categoria = "Tecnologia"; stock = 13; imagen_url = "https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=600" },
    @{ nombre = "Router Wi-Fi 6 Doble Banda"; descripcion = "Cobertura de alta velocidad hasta 3000 Mbps para hogar y oficina."; precio = 1650.00; categoria = "Tecnologia"; stock = 8; imagen_url = "https://images.unsplash.com/photo-1606904825846-647eb07f5be2?w=600" },

    # --- Accesorios (14) ---
    @{ nombre = "Mochila Urbana Impermeable"; descripcion = "Compartimento acolchado para laptop de 16 pulgadas."; precio = 980.00; categoria = "Accesorios"; stock = 10; imagen_url = "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600" },
    @{ nombre = "Funda Sleeve Minimalista 14"; descripcion = "Interior de microfibra suave y cierre magnetico para laptop."; precio = 490.00; categoria = "Accesorios"; stock = 18; imagen_url = "https://images.unsplash.com/photo-1544816155-12df9643f363?w=600" },
    @{ nombre = "Cartera Slim RFID de Piel"; descripcion = "Proteccion contra escaneo con capacidad para 8 tarjetas y billetes."; precio = 540.00; categoria = "Accesorios"; stock = 22; imagen_url = "https://images.unsplash.com/photo-1627123424574-724758594e93?w=600" },
    @{ nombre = "Lentes de Sol Polarizados Clasicos"; descripcion = "Filtro UV400 con armazon ligero de acetato negro mate."; precio = 670.00; categoria = "Accesorios"; stock = 15; imagen_url = "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=600" },
    @{ nombre = "Bolso Crossbody Compacto"; descripcion = "Tela repelente al agua con bolsillos organizadores de acceso rapido."; precio = 620.00; categoria = "Accesorios"; stock = 14; imagen_url = "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600" },
    @{ nombre = "Estuche Organizador de Cables"; descripcion = "Compartimentos elasticos acolchados para cargadores y adaptadores."; precio = 320.00; categoria = "Accesorios"; stock = 24; imagen_url = "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600" },
    @{ nombre = "Correa de Silicona para Smartwatch"; descripcion = "Ajuste transpirable de 42/44/45 mm en color verde olivo."; precio = 260.00; categoria = "Accesorios"; stock = 30; imagen_url = "https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=600" },
    @{ nombre = "Gorra Minimalista Algodon Lavado"; descripcion = "Ajuste trasero con hebilla metalica y visera curva."; precio = 310.00; categoria = "Accesorios"; stock = 20; imagen_url = "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=600" },
    @{ nombre = "Botella Deportiva Tritan 1 L"; descripcion = "Libre de BPA con marcador horario y tapa antiderrames."; precio = 275.00; categoria = "Accesorios"; stock = 25; imagen_url = "https://images.unsplash.com/photo-1523362628745-0c100150b504?w=600" },
    @{ nombre = "Paraguas Compacto Antiviento"; descripcion = "Apertura automatica de un boton y varillas de fibra de vidrio."; precio = 395.00; categoria = "Accesorios"; stock = 16; imagen_url = "https://images.unsplash.com/photo-1517686469429-8bdb88b9f907?w=600" },
    @{ nombre = "Llavero Organizador de Aluminio"; descripcion = "Almacena hasta 6 llaves sin ruido ni rayaduras en el bolsillo."; precio = 230.00; categoria = "Accesorios"; stock = 28; imagen_url = "https://images.unsplash.com/photo-1582139329536-e7284fece509?w=600" },
    @{ nombre = "Maleta Carry-On Cabina 20"; descripcion = "Carcasa rigida de policarbonato con ruedas 360 y candado TSA."; precio = 2190.00; categoria = "Accesorios"; stock = 6; imagen_url = "https://images.unsplash.com/photo-1565026057447-bc90a3dceb87?w=600" },
    @{ nombre = "Neceser de Viaje Impermeable"; descripcion = "Gancho colgante integrado y divisiones transparentes para liquidos."; precio = 440.00; categoria = "Accesorios"; stock = 17; imagen_url = "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=600" },
    @{ nombre = "Lentes Filtro Luz Azul"; descripcion = "Reduce la fatiga visual frente a pantallas con armazon ultraligero."; precio = 499.00; categoria = "Accesorios"; stock = 19; imagen_url = "https://images.unsplash.com/photo-1574258495973-f010dfbb5371?w=600" },

    # --- Oficina (13) ---
    @{ nombre = "Lampara de Escritorio LED"; descripcion = "Brazo articulado con 3 temperaturas de color."; precio = 649.00; categoria = "Oficina"; stock = 10; imagen_url = "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600" },
    @{ nombre = "Soporte de Aluminio para Laptop"; descripcion = "Elevacion ergonomica plegable compatible con equipos de 11 a 17 pulgadas."; precio = 580.00; categoria = "Oficina"; stock = 16; imagen_url = "https://images.unsplash.com/photo-1593642634315-48f5414c3ad9?w=600" },
    @{ nombre = "Tapete de Escritorio Fieltro 80x40"; descripcion = "Superficie suave antideslizante para teclado y mouse."; precio = 340.00; categoria = "Oficina"; stock = 22; imagen_url = "https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=600" },
    @{ nombre = "Cuaderno Pasta Dura Punteado A5"; descripcion = "192 paginas papel marfil 120 g/m2 ideal para bullet journal."; precio = 220.00; categoria = "Oficina"; stock = 30; imagen_url = "https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=600" },
    @{ nombre = "Set de 6 Plumas Gel Punta Fina"; descripcion = "Tinta negra de secado rapido 0.5 mm y agarre ergonomico."; precio = 165.00; categoria = "Oficina"; stock = 35; imagen_url = "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=600" },
    @{ nombre = "Organizador Modular de Bambu"; descripcion = "Bandeja multifuncion con soporte para telefono y notas adhesivas."; precio = 420.00; categoria = "Oficina"; stock = 14; imagen_url = "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600" },
    @{ nombre = "Pizarron Blanco Magnetico 60x45"; descripcion = "Marco de aluminio delgado con 2 plumones y borrador."; precio = 530.00; categoria = "Oficina"; stock = 12; imagen_url = "https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=600" },
    @{ nombre = "Reposamunecas Ergonomico de Gel"; descripcion = "Espuma viscoelastica con base de goma para sesiones largas."; precio = 250.00; categoria = "Oficina"; stock = 20; imagen_url = "https://images.unsplash.com/photo-1587614382346-4ec70e388b28?w=600" },
    @{ nombre = "Base Elevadora para Monitor Madera"; descripcion = "Libera espacio inferior para guardar teclado y libretas."; precio = 780.00; categoria = "Oficina"; stock = 9; imagen_url = "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=600" },
    @{ nombre = "Silla Ergonomica Malla Transpirable"; descripcion = "Soporte lumbar ajustable, reposabrazos abatibles y piston clase 4."; precio = 3490.00; categoria = "Oficina"; stock = 4; imagen_url = "https://images.unsplash.com/photo-1580480055273-228ff5388ef8?w=600" },
    @{ nombre = "Reposapies Ajustable Antideslizante"; descripcion = "Inclinacion ergonomica para mejorar postura en escritorio."; precio = 470.00; categoria = "Oficina"; stock = 13; imagen_url = "https://images.unsplash.com/photo-1497366216548-37526070297c?w=600" },
    @{ nombre = "Agenda Semanal Perpetua Minimalista"; descripcion = "Planificador sin fechas para metas, habitos y tareas diarias."; precio = 290.00; categoria = "Oficina"; stock = 24; imagen_url = "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=600" },
    @{ nombre = "Bandeja Organizadora de Cables Bajo Mesa"; descripcion = "Acero recubierto con pinzas sin taladro para ocultar regletas."; precio = 510.00; categoria = "Oficina"; stock = 15; imagen_url = "https://images.unsplash.com/photo-1497215842964-222b430dc094?w=600" }
  )

  $creados = 0
  $omitidos = 0
  foreach ($p in $productos) {
    if ($existingNames.ContainsKey($p.nombre.ToLowerInvariant())) {
      $omitidos++
      continue
    }
    $bodyObj = @{
      nombre = $p.nombre
      descripcion = $p.descripcion
      precio = $p.precio
      categoria = $p.categoria
      imagen_url = $p.imagen_url
    }
    $json = $bodyObj | ConvertTo-Json -Compress
    $creado = Invoke-RestMethod -Method Post -Uri "http://localhost:18002/api/productos" -Headers $headers -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($json))
    $invBody = @{ producto_id = [int]$creado.id; cantidad = [int]$p.stock } | ConvertTo-Json
    $inv = Invoke-RestMethod -Method Post -Uri "http://localhost:18004/api/inventario/reabastecer" -Headers $headers -ContentType "application/json" -Body $invBody
    $creados++
    Write-Host "  + [$($creado.id)] $($creado.nombre) ($($creado.categoria)) | `$$($creado.precio) | Stock: $($inv.disponible)" -ForegroundColor Green
  }

  $finalList = Invoke-RestMethod -Method Get -Uri "http://localhost:18002/api/productos"
  Write-Host "`nResumen: +$creados productos nuevos creados, $omitidos ya existian. Total en catalogo: $($finalList.Count)" -ForegroundColor Cyan

  Write-Host "4. Verificando usuario cliente demo (ana@example.test / DemoTienda-2026)..."
  try {
    $regBody = @{ nombre = "Ana Lopez"; correo = "ana@example.test"; contrasena = "DemoTienda-2026" } | ConvertTo-Json
    $reg = Invoke-RestMethod -Method Post -Uri "http://localhost:18001/api/usuarios/registro" -ContentType "application/json" -Body $regBody
    Write-Host "  + Cliente creado con ID $($reg.id)" -ForegroundColor Green
  } catch {
    Write-Host "  * Cliente ana@example.test ya existia." -ForegroundColor Yellow
  }
} finally {
  $pfJobs | Stop-Job -ErrorAction SilentlyContinue
  $pfJobs | Remove-Job -ErrorAction SilentlyContinue
}
