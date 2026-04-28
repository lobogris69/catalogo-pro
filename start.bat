@echo off
REM ============================================================================
REM CatalogPRO - Script de Instalación para Windows
REM ============================================================================

setlocal enabledelayedexpansion

cls
echo.
echo.  ════════════════════════════════════════════
echo.    🏥 CatalogPRO Installer (Windows)
echo.     LOMHIFAR S.L. - Abril 2026
echo.  ════════════════════════════════════════════
echo.

REM Verificar Docker
echo [INFO] Verificando Docker...
docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker no está instalado
    echo.
    echo Descargalo de: https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

echo [OK] Docker instalado
docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Compose no está instalado
    pause
    exit /b 1
)

echo [OK] Docker Compose instalado
echo.

REM Crear archivos .env
echo [INFO] Configurando variables de entorno...
if not exist "backend\.env" (
    echo [INFO] Creando backend\.env...
    copy backend\.env.example backend\.env >nul
    echo [OK] backend\.env creado
) else (
    echo [WARN] backend\.env ya existe
)

if not exist "frontend\.env" (
    echo [INFO] Creando frontend\.env...
    copy frontend\.env.example frontend\.env >nul
    echo [OK] frontend\.env creado
) else (
    echo [WARN] frontend\.env ya existe
)

echo.
echo [INFO] Limpiando containers anteriores...
docker-compose down >nul 2>&1
echo [OK] Limpieza completada
echo.

echo [INFO] Construyendo images Docker...
echo (esto puede tomar 2-3 minutos)
echo.
docker-compose build

echo.
echo [INFO] Iniciando servicios...
docker-compose up -d

echo.
echo [INFO] Esperando a que los servicios arranquen...
timeout /t 10 /nobreak

echo.
echo [INFO] Verificando estado de los servicios...
docker-compose ps

echo.
echo ════════════════════════════════════════════
echo ✅ CATALOGO PRO INICIADO
echo ════════════════════════════════════════════
echo.

echo 📱 ACCESO A LA APLICACIÓN:
echo.
echo   Frontend:  http://localhost:3000
echo   Backend:   http://localhost:3001
echo   Health:    http://localhost:3001/health
echo.

echo 🔑 CREDENCIALES DE PRUEBA:
echo.
echo   Email:     admin@lomhifar.com
echo   Password:  admin123
echo.

echo 💾 BASE DE DATOS:
echo.
echo   Host:      localhost
echo   Port:      5432
echo   Database:  catalogo_pro
echo   User:      catalogo_user
echo   Password:  secure_password_change_me
echo.

echo 📝 COMANDOS ÚTILES:
echo.
echo   Ver logs:   docker-compose logs -f backend
echo   Detener:    docker-compose down
echo   Reiniciar:  docker-compose restart
echo.

echo ¡Listo! La aplicación está disponible en http://localhost:3000
echo.
pause
