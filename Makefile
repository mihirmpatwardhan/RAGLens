# Makefile for RAGLense

.PHONY: help dev build test lint type-check compose-up compose-down

help:
	@echo "RAGLense CLI commands:"
	@echo "  make dev          - Start both backend and frontend development servers"
	@echo "  make build        - Build both backend and frontend for production"
	@echo "  make test         - Run tests on both backend and frontend"
	@echo "  make lint         - Run linting checks"
	@echo "  make type-check   - Run TypeScript type checking on the frontend"
	@echo "  make compose-up   - Launch full docker compose stack in background"
	@echo "  make compose-down - Stop and remove docker compose containers"

dev:
	@echo "Starting development servers..."
	@echo "Ensure python environment is activated and frontend node_modules is installed."
	# Starting servers in parallel
	cd backend && uvicorn app.main:app --reload --port 8000 & \
	cd frontend && npm run dev

build:
	@echo "Building production builds..."
	cd frontend && npm run build

test:
	@echo "Running tests..."
	cd backend && python -m pytest
	cd frontend && npm run test

lint:
	@echo "Running code checkers..."
	cd backend && ruff check .
	cd frontend && npm run lint

type-check:
	@echo "Running frontend type check..."
	cd frontend && npm run type-check

compose-up:
	@echo "Launching docker composition..."
	docker-compose up -d

compose-down:
	@echo "Tearing down composition..."
	docker-compose down
