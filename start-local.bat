@echo off
REM Local Development Startup Script for Windows
REM Usage: start-local.bat

echo 🚀 Starting Ticketing System - Local Development Mode
echo.

REM Check if docker is running
docker info > nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running. Please start Docker and try again.
    exit /b 1
)

echo 📦 Building and starting services...
docker compose -f docker-compose.dev.yml up -d

echo.
echo ✅ Services started!
echo.
echo 📍 Access the system:
echo    Frontend: http://localhost:8080
echo    Backend API: http://localhost:8000
echo    MongoDB: mongodb://localhost:27017
echo.
echo 📋 View logs:
echo    All: docker compose -f docker-compose.dev.yml logs -f
echo    Backend: docker compose -f docker-compose.dev.yml logs -f backend-local
echo    Frontend: docker compose -f docker-compose.dev.yml logs -f frontend-local
echo.
echo 🛑 Stop services:
echo    docker compose -f docker-compose.dev.yml down
echo.
pause
