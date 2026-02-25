# Quick Render Deployment Guide

## Summary
This system will be deployed on **Render** (free tier available). Colleagues access via a public URL.

---

## QUICK START (5 steps)

### Step 1: Push Code to GitHub
```bash
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

### Step 2: Set Up MongoDB Atlas (Free)
1. Go to https://www.mongodb.com/cloud/atlas
2. Create account → Create free cluster
3. Create a database user (remember username/password)
4. Get connection string: `mongodb+srv://user:pass@cluster.mongodb.net/ticketdb`
5. Copy this string (you'll use it in Step 4)

### Step 3: Deploy Backend to Render
1. Go to https://render.com → Sign up
2. Click **"New +"** → **"Web Service"**
3. Connect GitHub repo
4. Fill in:
   - **Name:** ticketing-backend
   - **Runtime:** Docker
   - **Region:** Choose your location
   - **Plan:** Free
5. Click **"Create Web Service"** (takes 5-10 min)
6. Copy the service URL (e.g., `https://ticketing-backend.onrender.com`)

### Step 4: Add Environment Variables to Backend
In Render dashboard:
1. Go to your backend service
2. Go to **"Environment"** tab
3. Add these variables:
   - `MONGO_URL` = `mongodb+srv://username:password@cluster.mongodb.net/ticketdb`
   - `DB_NAME` = `ticketdb`
   - `SECRET_KEY` = Generate a random key or use existing
   - `PORT` = `8000`
4. Click **"Save"** (service redeploys automatically)

### Step 5: Deploy Frontend to Render
1. In Render, click **"New +"** → **"Web Service"**
2. Connect same GitHub repo
3. Fill in:
   - **Name:** ticketing-frontend
   - **Runtime:** Docker
4. Before creating, scroll to **"Environment"** section
5. Add: `REACT_APP_API_URL` = `https://ticketing-backend.onrender.com`
6. Click **"Create Web Service"**

---

## You're Done! 🎉

Your system is now live:
- **Frontend URL:** `https://ticketing-frontend.onrender.com`
- **Backend URL:** `https://ticketing-backend.onrender.com`
- **Share the frontend URL with colleagues**

---

## Important Notes

### Costs
- **Free tier:** 750 free hours/month (one service running all month)
- **Multiple services:** $7/month per service (standard tier)
- You have 2-3 services = ~$14-21/month or free with tier limits

### Free Tier Limitations
- Services spin down after 15 minutes of no activity (5-10 sec cold start)
- Database limited to 512MB (MongoDB Atlas free tier)
- 1 shared CPU

### Upgrade to Production (Optional)
When ready for production:
1. Upgrade backend/frontend to **Standard tier** ($7/month each)
2. Services won't spin down
3. Get dedicated resources

### If Free Tier Service Spins Down
- First request takes 5-10 seconds (cold start)
- Subsequent requests are instant
- Colleagues may see a brief delay first time of day

### Security Checklist
✅ MongoDB password is in `MONGO_URL` environment variable (not in code)
✅ `SECRET_KEY` is randomized (keep it secret)
✅ Backend is not exposed directly to the internet (only via frontend proxy)
✅ Git repo should have `.env` in `.gitignore` (never commit secrets)

---

## Troubleshooting

### Service won't deploy
1. Check **"Logs"** tab in Render for errors
2. Ensure Docker builds locally: `docker compose up`
3. Check that Dockerfiles exist and are valid

### Frontend shows blank page
1. Check browser console (F12) for errors
2. Ensure `REACT_APP_API_URL` environment variable is set correctly
3. Check frontend logs: `https://ticketing-frontend.onrender.com/logs`

### Backend API returns 404
1. Check backend logs in Render dashboard
2. Ensure MongoDB connection string is correct
3. Check that `MONGO_URL` environment variable is set

### Database connection fails
1. Go to MongoDB Atlas dashboard
2. Check your cluster is running
3. Verify IP whitelist includes Render IPs (or set to 0.0.0.0)
4. Test connection string locally: `mongosh "mongodb+srv://..."`

---

## Share With Colleagues

Once deployed, share this with your team:

> **Ticketing System is live!**
>
> Access it here: **https://ticketing-frontend.onrender.com**
>
> You can:
> - Create tickets
> - Assign tasks
> - Track progress
> - Update statuses
>
> Questions? Ask [your name]
