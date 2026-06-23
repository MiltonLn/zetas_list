# ============================================================
#  Zetas List — Comandos de desarrollo (Docker-first)
# ============================================================

.PHONY: help up up-build down restart logs logs-backend logs-frontend logs-db \
        restart-frontend restart-backend \
        shell-backend shell-db \
        migrate migrate-deploy seed seed-players cleanup-players seed-tournaments cleanup-tournaments reset-db generate studio \
        build lint test hooks clean nuke

# Colores
CYAN  := \033[0;36m
GREEN := \033[0;32m
YELLOW:= \033[0;33m
RESET := \033[0m

help: ## Muestra esta ayuda
	@echo ""
	@echo "  $(CYAN)Zetas List — Comandos disponibles$(RESET)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ { printf "  $(GREEN)%-22s$(RESET) %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@echo ""

# ── Contenedores ──────────────────────────────────────────

up: ## Levanta todos los servicios en background (DB + backend + frontend)
	docker compose up -d
	@echo ""
	@echo "  $(GREEN)✓ Servicios levantados$(RESET)"
	@echo "  Frontend: http://localhost:5173"
	@echo "  Backend:  http://localhost:3000"
	@echo "  API docs: http://localhost:3000/api/docs"
	@echo ""

up-build: ## Levanta todos los servicios reconstruyendo las imágenes Docker
	docker compose up -d --build

down: ## Detiene todos los servicios
	docker compose down
	@echo "$(YELLOW)✓ Servicios detenidos$(RESET)"

restart: down up ## Reinicia todos los servicios

restart-frontend: ## Reinicia solo el contenedor del frontend (limpia cache de Vite)
	docker compose restart frontend

restart-backend: ## Reinicia solo el contenedor del backend
	docker compose restart backend

# ── Logs ──────────────────────────────────────────────────

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

migrate: ## Crea y aplica una migración nueva (uso: make migrate name=descripcion)
	docker compose exec backend npx prisma migrate dev --name $(name)

migrate-deploy: ## Aplica migraciones pendientes en producción
	docker compose exec backend npx prisma migrate deploy

seed: ## Ejecuta el seed (crea los admins iniciales)
	docker compose exec backend node -r ts-node/register prisma/seed.ts

seed-players: ## Crea jugadores de prueba (uso: make seed-players count=20 game=ID)
	docker compose exec backend node -r ts-node/register prisma/seed-test-players.ts --count $(or $(count),20) $(if $(game),--gameId $(game))

cleanup-players: ## Elimina todos los jugadores de prueba (testplayer*)
	docker compose exec backend node -r ts-node/register prisma/seed-test-players.ts --cleanup

seed-tournaments: ## Crea 2 torneos de prueba: 8 equipos (knockout) y 4 equipos (grupos+knockout)
	docker compose exec backend node -r ts-node/register prisma/seed-tournaments.ts

cleanup-tournaments: ## Elimina los torneos de prueba ([TEST] prefijo)
	docker compose exec backend node -r ts-node/register prisma/seed-tournaments.ts --cleanup

generate: ## Regenera el cliente de Prisma
	docker compose exec backend npx prisma generate

studio: ## Abre Prisma Studio en http://localhost:5555
	docker compose exec -it backend npx prisma studio --port 5555

reset-db: ## ⚠️  Borra y recrea la base de datos completa + seed
	@printf "$(YELLOW)⚠️  Esto borrará TODOS los datos. Continuar? [y/N] $(RESET)"; \
	read ans; [ "$$ans" = "y" ] || (echo "Cancelado." && exit 1)
	docker compose exec backend npx prisma migrate reset --force
	$(MAKE) seed
	@echo "$(GREEN)✓ Base de datos reiniciada$(RESET)"

# ── Build y calidad ───────────────────────────────────────

hooks: ## Activa los pre-commit hooks (solo se necesita hacer una vez por clon)
	git config core.hooksPath .husky
	@echo "$(GREEN)✓ Pre-commit hooks activados$(RESET)"

build: ## Build de producción (dentro de Docker)
	docker compose exec frontend npm run build
	docker compose exec backend npm run build

lint: ## Linter en frontend y backend (dentro de Docker)
	docker compose exec frontend npm run lint
	docker compose exec backend npm run lint

test: ## Tests en frontend y backend (dentro de Docker)
	docker compose exec frontend npm test
	docker compose exec backend npm test

# ── Limpieza ──────────────────────────────────────────────

clean: ## ⚠️  Para TODO y borra volúmenes Docker (DB incluida)
	@printf "$(YELLOW)⚠️  Esto borrará los volúmenes Docker (base de datos incluida). Continuar? [y/N] $(RESET)"; \
	read ans; [ "$$ans" = "y" ] || (echo "Cancelado." && exit 1)
	docker compose down -v
	@echo "$(GREEN)✓ Volúmenes Docker eliminados$(RESET)"

nuke: ## ⚠️  Para TODO, borra volúmenes e imágenes Docker
	@printf "$(YELLOW)⚠️  Esto borrará TODO (volúmenes + imágenes). Continuar? [y/N] $(RESET)"; \
	read ans; [ "$$ans" = "y" ] || (echo "Cancelado." && exit 1)
	docker compose down -v --rmi local
	@echo "$(GREEN)✓ Limpieza total completada$(RESET)"
