# Local Development Guide

## Overview
This guide helps you run the Ticketing System locally for testing without affecting production files.

## Files Created for Local Development

- **docker-compose.dev.yml** - Local development compose file (separate from production)
- **start-local.sh** - Startup script for Linux/Mac
- **start-local.bat** - Startup script for Windows
- **.env.local** - Local environment variables (optional, for reference)

## Production Files (Unchanged)
- **docker-compose.yml** - Production setup (not touched)
- **Dockerfile** (backend & frontend) - Production Dockerfiles (not touched)
- **render.yaml** - Render configuration (not touched)

---

## Quick Start - Local Development

### Windows Users:
```bash
# Double-click:
start-local.bat

# Or run in PowerShell:
docker compose -f docker-compose.dev.yml up -d
```

### Mac/Linux Users:
```bash
# Make script executable
chmod +x start-local.sh

# Run it
./start-local.sh

# Or run directly
docker compose -f docker-compose.dev.yml up -d
```

---

## Access the System

Once started, access:
- **Frontend**: http://localhost:8080
- **Backend API**: http://localhost:8000
- **MongoDB**: mongodb://localhost:27017

---

## View Logs

```bash
# View all services
docker compose -f docker-compose.dev.yml logs -f

# View specific service
docker compose -f docker-compose.dev.yml logs -f backend-local
docker compose -f docker-compose.dev.yml logs -f frontend-local
docker compose -f docker-compose.dev.yml logs -f mongodb-local

# Live tail
docker compose -f docker-compose.dev.yml logs -f --tail=100
```

---

## Stop Local Development

```bash
docker compose -f docker-compose.dev.yml down

# Or with volume cleanup (removes all data)
docker compose -f docker-compose.dev.yml down -v
```

---

## Make Changes and Test

1. **Edit code** in `backend/` or `frontend/` folders
2. **Restart services** to see changes:
   ```bash
   docker compose -f docker-compose.dev.yml restart backend-local
   # OR
   docker compose -f docker-compose.dev.yml restart frontend-local
   ```
3. **Test locally** at http://localhost:8080
4. **Verify** everything works
5. **Commit and push** to production

---

## Differences: Local vs Production

| Aspect | Local (docker-compose.dev.yml) | Production (Render) |
|--------|------|----------|
| **MongoDB** | Local container (mongodb-local) | MongoDB Atlas (cloud) |
| **Frontend URL** | http://localhost:8080 | https://ticketing-system-frontend-k4eo.onrender.com |
| **Backend URL** | http://localhost:8000 | https://ticketing-system-b7ik.onrender.com |
| **Build Context** | Root (for docker-compose) | backend/ and frontend/ (Render settings) |
| **Volumes** | Mounted for hot reload | Not available on free tier |

---

## Troubleshooting

### Port Already in Use
```bash
# Find what's using port 8080, 8000, 27017
# Windows
netstat -ano | findstr :8080

# Mac/Linux
lsof -i :8080

# Kill the process or change port in docker-compose.dev.yml
```

### Container Won't Start
```bash
# Check logs
docker compose -f docker-compose.dev.yml logs

# Rebuild without cache
docker compose -f docker-compose.dev.yml build --no-cache
```

### Database Issues
```bash
# Clean up and restart
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d
```

---

## Production Deployment Workflow

1. **Make changes locally**
   ```bash
   docker compose -f docker-compose.dev.yml up -d
   # Test at http://localhost:8080
   ```

2. **Verify everything works**
   - Test all features
   - Check logs for errors
   - Test with different user roles

3. **Commit to GitHub**
   ```bash
   git add .
   git commit -m "Add feature X"
   git push origin main
   ```

4. **Production auto-deploys**
   - Render watches GitHub
   - Auto-rebuilds and deploys
   - Monitor at https://dashboard.render.com

5. **Verify production**
   - Test at https://ticketing-system-frontend-k4eo.onrender.com
   - Check Render logs if issues

---

## Docker Compose Dev File Structure

```yaml
services:
  mongodb-local:         # Separate from production MongoDB
    # Local MongoDB instance
    
  backend-local:         # Separate from production backend
    # Builds from ./backend/Dockerfile
    # Uses ./backend/.env
    # Port 8000 (local only)
    
  frontend-local:        # Separate from production frontend
    # Builds from ./frontend/Dockerfile
    # Port 8080 (local only)

volumes:
  mongo_data_local:      # Separate local volume
```

---

## Key Points

✅ **Production files are untouched** - No risk of breaking production
✅ **Isolated local environment** - Separate containers with `-local` suffix
✅ **Same codebase** - Tests production exactly
✅ **Easy to switch** - Use different docker-compose file for local
✅ **Quick startup** - One command to start everything

---

## Questions?

Check logs, test locally, then deploy with confidence!
