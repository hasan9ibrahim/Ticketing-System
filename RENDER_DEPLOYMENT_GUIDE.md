# Deploy to Render + MongoDB Atlas - Step by Step

## PART 1: Prepare MongoDB Atlas (15 minutes)

### Step 1.1: Create MongoDB Atlas Account
1. Go to https://www.mongodb.com/cloud/atlas
2. Click **"Sign Up"** 
3. Fill in your email, create password, accept terms
4. Click **"Create your Atlas account"**
5. Verify your email

### Step 1.2: Create a Free Cluster
1. After signing up, you'll see "Create a Deployment" page
2. Select **"M0 Shared"** (free tier)
3. Choose your preferred cloud provider and region (AWS recommended)
4. Click **"Create Deployment"**
5. Wait 2-3 minutes for cluster to initialize

### Step 1.3: Create Database User
1. In Atlas, go to **"Database Access"** (left sidebar)
2. Click **"Add New Database User"**
3. Select **"Password"** as Authentication Method
4. **Username:** `ticketadmin` (or any name)
5. **Password:** Generate a strong one (copy it!)
6. Select **"Built-in Role"** → **"Atlas admin"**
7. Click **"Add User"**

### Step 1.4: Configure IP Whitelist
1. Go to **"Network Access"** (left sidebar)
2. Click **"Add IP Address"**
3. Select **"Allow access from anywhere"** (0.0.0.0/0)
4. Click **"Confirm"**
5. (For production, restrict to specific IPs)

### Step 1.5: Get Your Connection String
1. Go back to **"Deployment"** (or "Databases")
2. Click **"Connect"** button next to your cluster
3. Select **"Drivers"** → **"Python"** (or Node.js)
4. Copy the connection string, it looks like:
   ```
   mongodb+srv://ticketadmin:PASSWORD@cluster.mongodb.net/?retryWrites=true&w=majority
   ```
5. Replace `PASSWORD` with the password you created in Step 1.3
6. Replace the database name:
   ```
   mongodb+srv://ticketadmin:PASSWORD@cluster.mongodb.net/ticketdb?retryWrites=true&w=majority
   ```
7. **Save this string** (you'll use it in Part 2)

---

## PART 2: Push Code to GitHub (5 minutes)

### Step 2.1: Commit and Push
```bash
cd C:\Users\USER\Ticketing-System
git add .
git commit -m "Prepare for Render deployment with MongoDB Atlas"
git push origin main
```

Make sure your GitHub repo is up to date.

---

## PART 3: Deploy Backend to Render (10 minutes)

### Step 3.1: Create Render Account
1. Go to https://render.com
2. Click **"Sign Up"**
3. Sign up with GitHub (recommended - easier deployment)
4. Authorize Render to access your GitHub account

### Step 3.2: Deploy Backend Service
1. In Render dashboard, click **"New +"** → **"Web Service"**
2. Select **"Build and deploy from a Git repository"**
3. Click **"Connect"** next to your Ticketing-System repo
4. Fill in the form:
   - **Name:** `ticketing-backend`
   - **Environment:** Docker
   - **Region:** Choose closest to you
   - **Branch:** main
   - **Build Command:** (leave blank - uses Dockerfile)
   - **Start Command:** (leave blank - uses Dockerfile CMD)
   - **Plan:** Free
5. Scroll down to **"Advanced"** → Click **"Add Environment Variable"**
6. Add these variables:
   - **Key:** `MONGO_URL` 
   - **Value:** `mongodb+srv://ticketadmin:PASSWORD@cluster.mongodb.net/ticketdb?retryWrites=true&w=majority`
     (Replace PASSWORD with your MongoDB password)
   
   - **Key:** `DB_NAME`
   - **Value:** `ticketdb`
   
   - **Key:** `SECRET_KEY`
   - **Value:** `supersecretkey123`
   
   - **Key:** `PORT`
   - **Value:** `8000`

7. Click **"Create Web Service"**
8. Wait for deployment (5-10 minutes)
9. Once deployed, you'll see a green checkmark and a URL like:
   `https://ticketing-backend.onrender.com`
10. **Copy this URL** (you'll use it for the frontend)

**Check if it's working:**
- Go to `https://ticketing-backend.onrender.com/health` (or any endpoint)
- You should see a response (not a 502 error)

---

## PART 4: Deploy Frontend to Render (10 minutes)

### Step 4.1: Deploy Frontend Service
1. In Render dashboard, click **"New +"** → **"Web Service"**
2. Select your Ticketing-System repo again
3. Fill in the form:
   - **Name:** `ticketing-frontend`
   - **Environment:** Docker
   - **Region:** Same as backend
   - **Branch:** main
   - **Build Command:** (leave blank)
   - **Start Command:** (leave blank)
   - **Plan:** Free
4. Scroll to **"Advanced"** → **"Add Environment Variable"**
5. Add this variable:
   - **Key:** `REACT_APP_API_URL`
   - **Value:** `https://ticketing-backend.onrender.com`
     (Use the backend URL from Step 3.2)

6. Click **"Create Web Service"**
7. Wait for deployment (5-10 minutes)
8. Once deployed, you'll see your frontend URL like:
   `https://ticketing-frontend.onrender.com`

---

## ✅ You're Done!

Your system is now live:

| Component | URL |
|-----------|-----|
| **Frontend** | `https://ticketing-frontend.onrender.com` |
| **Backend** | `https://ticketing-backend.onrender.com` |
| **Database** | MongoDB Atlas (cloud) |

**Share the frontend URL with your colleagues!**

---

## Monitoring & Troubleshooting

### Check Backend Logs
1. In Render dashboard, click `ticketing-backend`
2. Click **"Logs"** tab
3. Check for any errors

### Check Frontend Logs
1. Click `ticketing-frontend`
2. Click **"Logs"** tab

### Test MongoDB Connection
1. In MongoDB Atlas, go to **"Databases"** → Click **"Connect"**
2. Select **"MongoDB Shell"**
3. Run a simple query to verify connection

### If Services Won't Deploy
1. Check the **"Logs"** tab for error messages
2. Ensure `docker build` works locally: `docker compose build`
3. Verify Dockerfiles exist and are valid
4. Check that GitHub repo is updated

### If Frontend Shows Blank Page
1. Open browser DevTools (F12) → **"Console"** tab
2. Look for API error messages
3. Verify `REACT_APP_API_URL` environment variable is set correctly in Render

### If Backend API Returns 404
1. Check backend logs in Render
2. Ensure MongoDB connection string is correct
3. Verify backend health endpoint exists

---

## Important Notes

### Free Tier Limitations
- Services spin down after 15 minutes of inactivity (5-10 second cold start)
- Not recommended for production use
- 750 free hours/month (enough for 1 service running 24/7)

### Upgrade to Production (Optional)
When ready:
1. In Render dashboard, go to each service
2. Click **"Settings"** → **"Plan"** → Select **"Starter"** ($7/month)
3. Services will always be running (no spin-down)

### Costs
- **Free tier:** $0 (with limitations)
- **2 services on Starter:** $14/month
- **MongoDB Atlas:** Free tier (512MB database)

### Environment Variables
- All sensitive data (passwords, API keys) should be in Render environment variables
- **Never** commit `.env` files to GitHub
- Use `.env.example` template for reference

---

## Next Steps

1. **Test your deployment** — Try creating/updating tickets
2. **Share with team** — Give them the frontend URL
3. **Monitor performance** — Check logs if issues arise
4. **Plan for scale** — If needed, upgrade to paid tiers

Questions? Check the logs in Render or contact your admin!
