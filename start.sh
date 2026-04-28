#!/bin/bash

# ============================================================================
# CatalogPRO - Script de Instalación y Ejecución
# ============================================================================

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         🏥 CatalogPRO Installer           ║${NC}"
echo -e "${BLUE}║       LOMHIFAR S.L. - Abril 2026          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

# Función para print
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# ============================================================================
# PASO 1: Verificar requisitos
# ============================================================================

log_info "Verificando requisitos del sistema..."
echo ""

# Verificar Docker
if ! command -v docker &> /dev/null; then
    log_error "Docker no está instalado"
    echo "   Descargalo de: https://www.docker.com/products/docker-desktop"
    exit 1
fi
log_success "Docker instalado: $(docker --version)"

# Verificar Docker Compose
if ! command -v docker-compose &> /dev/null; then
    log_error "Docker Compose no está instalado"
    echo "   Descargalo de: https://docs.docker.com/compose/install/"
    exit 1
fi
log_success "Docker Compose instalado: $(docker-compose --version)"

# Verificar puertos disponibles
log_info "Verificando puertos disponibles..."

for port in 3000 3001 5432 80 443; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        log_warning "Puerto $port ya está en uso. Detén el servicio o cambia el puerto en docker-compose.yml"
    else
        log_success "Puerto $port disponible"
    fi
done

echo ""

# ============================================================================
# PASO 2: Crear archivos .env
# ============================================================================

log_info "Configurando variables de entorno..."
echo ""

# Backend
if [ ! -f "backend/.env" ]; then
    log_info "Creando backend/.env..."
    cp backend/.env.example backend/.env
    log_success "backend/.env creado"
else
    log_warning "backend/.env ya existe, usando configuración actual"
fi

# Frontend
if [ ! -f "frontend/.env" ]; then
    log_info "Creando frontend/.env..."
    cp frontend/.env.example frontend/.env
    log_success "frontend/.env creado"
else
    log_warning "frontend/.env ya existe, usando configuración actual"
fi

# Infra
if [ ! -f "infra/.env" ]; then
    log_info "Creando infra/.env..."
    cp infra/.env.example infra/.env 2>/dev/null || cat > infra/.env << 'EOF'
POSTGRES_USER=catalogo_user
POSTGRES_PASSWORD=secure_password_change_me
POSTGRES_DB=catalogo_pro
DATABASE_URL=postgresql://catalogo_user:secure_password_change_me@postgres:5432/catalogo_pro
EOF
    log_success "infra/.env creado"
else
    log_warning "infra/.env ya existe"
fi

echo ""

# ============================================================================
# PASO 3: Limpiar containers anteriores (opcional)
# ============================================================================

log_info "Limpiando containers anteriores..."
docker-compose down 2>/dev/null || true
docker volume rm catalogo-pro_postgres_data 2>/dev/null || true
log_success "Limpieza completada"

echo ""

# ============================================================================
# PASO 4: Build de images
# ============================================================================

log_info "Construyendo images Docker (esto puede tomar 2-3 minutos)..."
echo ""

docker-compose build

log_success "Images construidas exitosamente"
echo ""

# ============================================================================
# PASO 5: Iniciar servicios
# ============================================================================

log_info "Iniciando servicios..."
echo ""

docker-compose up -d

log_success "Servicios iniciados"
echo ""

# ============================================================================
# PASO 6: Esperar a que arranquen
# ============================================================================

log_info "Esperando a que los servicios arranquen..."
echo ""

# Esperar a PostgreSQL
log_info "Esperando a PostgreSQL..."
for i in {1..30}; do
    if docker-compose exec -T postgres pg_isready -U catalogo_user -d catalogo_pro >/dev/null 2>&1; then
        log_success "PostgreSQL está listo"
        break
    fi
    echo -n "."
    sleep 1
done

echo ""

# Esperar a Backend
log_info "Esperando a Backend..."
sleep 5

# ============================================================================
# PASO 7: Verificar estado
# ============================================================================

echo ""
log_info "Verificando estado de los servicios..."
echo ""

docker-compose ps

echo ""

# ============================================================================
# PASO 8: Verificar conectividad
# ============================================================================

log_info "Realizando verificaciones de conectividad..."
echo ""

# Verificar Backend
log_info "Verificando Backend en http://localhost:3001/health..."
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    log_success "Backend responde correctamente"
else
    log_warning "Backend aún no responde, espera unos segundos más"
fi

# Verificar Frontend
log_info "Verificando Frontend en http://localhost:3000..."
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    log_success "Frontend está disponible"
else
    log_warning "Frontend aún no responde, espera unos segundos más"
fi

# Verificar BD
log_info "Verificando Base de Datos..."
if docker-compose exec -T postgres psql -U catalogo_user -d catalogo_pro -c "SELECT COUNT(*) FROM users;" >/dev/null 2>&1; then
    log_success "Base de Datos conectada y con tablas"
else
    log_warning "Base de Datos aún no está lista"
fi

echo ""

# ============================================================================
# PASO 9: Mostrar información final
# ============================================================================

echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     ✅ CATALOGO PRO INICIADO              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"

echo ""
echo -e "${BLUE}📱 ACCESO A LA APLICACIÓN:${NC}"
echo ""
echo -e "  Frontend:  ${YELLOW}http://localhost:3000${NC}"
echo -e "  Backend:   ${YELLOW}http://localhost:3001${NC}"
echo -e "  Health:    ${YELLOW}http://localhost:3001/health${NC}"
echo ""

echo -e "${BLUE}🔑 CREDENCIALES DE PRUEBA:${NC}"
echo ""
echo -e "  Email:      ${YELLOW}admin@lomhifar.com${NC}"
echo -e "  Password:   ${YELLOW}admin123${NC}"
echo ""
echo -e "  Email:      ${YELLOW}comercial1@lomhifar.com${NC}"
echo -e "  Password:   ${YELLOW}sales123${NC}"
echo ""

echo -e "${BLUE}💾 BASE DE DATOS:${NC}"
echo ""
echo -e "  Host:       ${YELLOW}localhost${NC}"
echo -e "  Port:       ${YELLOW}5432${NC}"
echo -e "  Database:   ${YELLOW}catalogo_pro${NC}"
echo -e "  User:       ${YELLOW}catalogo_user${NC}"
echo -e "  Password:   ${YELLOW}secure_password_change_me${NC}"
echo ""

echo -e "${BLUE}📝 COMANDOS ÚTILES:${NC}"
echo ""
echo -e "  Ver logs:           ${YELLOW}docker-compose logs -f backend${NC}"
echo -e "  Ver logs frontend:  ${YELLOW}docker-compose logs -f frontend${NC}"
echo -e "  Ver BD:             ${YELLOW}docker-compose exec postgres psql -U catalogo_user -d catalogo_pro${NC}"
echo -e "  Detener servicios:  ${YELLOW}docker-compose down${NC}"
echo -e "  Reiniciar:          ${YELLOW}docker-compose restart${NC}"
echo ""

echo -e "${BLUE}📚 DOCUMENTACIÓN:${NC}"
echo ""
echo -e "  README:   ${YELLOW}./README.md${NC}"
echo -e "  Resumen:  ${YELLOW}./GENERACION-COMPLETADA.txt${NC}"
echo ""

echo -e "${GREEN}¡Espera 10-15 segundos para que todo esté completamente listo!${NC}"
echo ""

# ============================================================================
# PASO 10: Monitoreo continuo (opcional)
# ============================================================================

log_info "Iniciando monitoreo de logs (presiona Ctrl+C para salir)..."
echo ""

docker-compose logs -f
