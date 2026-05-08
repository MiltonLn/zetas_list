# ============================================================
#  Zetas List — Comandos de desarrollo
# ============================================================

.PHONY: help up down restart logs logs-backend logs-db \
        shell-backend shell-db \
        migrate migrate-deploy seed reset-db generate studio \
        install build lint test \
        clean nuke

# Colores
CYAN  := \033[0;36m
GREEN := \033[0;32m
YELLOW:= \033[0;33m
RESET := \033[0m

help: ## Muestra esta ayuda
	@echo ""
	@echo "  $(CYAN)Zetas List — Comandos disponibles$(RESET)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ { printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@echo ""

# ── Contenedores ──────────────────────────────────────────

up: ## Levanta todos los servicios (DB + backend + frontend)
	docker compose up -d
	@echo "$(GREEN)✓ Servicios levantados$(RESET)"
	@echo "  Frontend: http://localhost:5173"
	@echo "  Backend:  http://localhost:3000"
	@echo "  API docs: http://localhost:3000/api/docs"

up-build: ## Levanta todos los servicios reconstruyendo imágenes
	docker compose up -d --build

down: ## Detiene todos los servicios
	docker compose down
	@echo "$(YELLOW)✓ Servicios detenidos$(RESET)"

restart: down up ## Reinicia todos los servicios

logs: ## Muestra logs de todos los servicios (Ctrl+C para salir)
	docker compose logs -f

logs-backend: ## Muestra logs del backend
	docker compose logs -f backend

logs-frontend: ## Muestra logs del frontend
	docker compose logs -f frontend

logs-db: ## Muestra logs de la base de datos
	docker compose logs -f db

# ── Shells ────────────────────────────────────────────────

shell-backend: ## Abre una shell en el contenedor del backend
	docker compose exec backend sh

shell-db: ## Abre psql en el contenedor de PostgreSQL
	docker compose exec db psql -U zetas -d zetas

# ── Base de datos ─────────────────────────────────────────

migrate: ## Crea y aplica una migración nueva (uso: make migrate name=nombre_migracion)
	docker compose exec backend npx prisma migrate dev --name $(name)

migrate-deploy: ## Aplica migraciones pendientes (para producción)
	docker compose exec backend npx prisma migrate deploy

seed: ## Ejecuta el seed de la base de datos (admins iniciales)
	docker compose exec backend npx ts-node prisma/seed.ts

generate: ## Regenera el cliente de Prisma
	docker compose exec backend npx prisma generate

studio: ## Abre Prisma Studio (interfaz visual de la DB) en http://localhost:5555
	docker compose exec -it backend npx prisma studio --port 5555

reset-db: ## ⚠️  Borra y recrea la base de datos con migraciones + seed
	@echo "$(YELLOW)⚠️  Esto borrará TODOS los datos. Continuar? [y/N]$(RESET)"
	@read ans; [ "$$ans" = "y" ] || (echo "Cancelado." && exit 1)
	docker compose exec backend npx prisma migrate reset --force
	$(MAKE) seed
	@echo "$(GREEN)✓ Base de datos reiniciada$(RESET)"

# ── Desarrollo ────────────────────────────────────────────

install: ## Instala dependencias en frontend y backend
	cd frontend && npm install --legacy-peer-deps
	cd backend && npm install
	cd backend && npx prisma generate
	@echo "$(GREEN)✓ Dependencias instaladas$(RESET)"

build: ## Construye frontend y backend para producción
	cd frontend && npm run build
	cd backend && npm run build
	@echo "$(GREEN)✓ Build completado$(RESET)"

lint: ## Ejecuta el linter en frontend y backend
	cd frontend && npm run lint
	cd backend && npm run lint

test: ## Ejecuta los tests en frontend y backend
	cd frontend && npm test
	cd backend && npm test

# ── Limpieza ──────────────────────────────────────────────

clean: ## Borra node_modules y dist de ambos proyectos
	rm -rf frontend/node_modules frontend/dist
	rm -rf backend/node_modules backend/dist
	@echo "$(GREEN)✓ Limpieza completada$(RESET)"

nuke: down clean ## ⚠️  Para TODO + borra volúmenes Docker y node_modules
	docker compose down -v
	@echo "$(YELLOW)✓ Todo limpiado (volúmenes Docker incluidos)$(RESET)"
