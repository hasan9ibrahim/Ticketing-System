## Deploy Ticketing System to Render

### Prerequisites
1. GitHub account with your repo pushed
2. Render account (free tier available at render.com)

### Deployment Steps

#### 1. Connect Your GitHub Repository
- Go to https://render.com
- Sign up/login
- Click "New +" → "Web Service"
- Select "Deploy an existing GitHub repo"
- Connect your GitHub account and select your ticketing-system repo

#### 2. Deploy Backend Service First
When creating the service:
- **Name:** ticketing-backend
- **Runtime:** Docker
- **Build Command:** (leave default)
- **Start Command:** (leave default - uses Dockerfile CMD)
- **Region:** Choose closest to your location
- **Plan:** Free tier works for testing

Add Environment Variables (click "Advanced"):
- `MONGO_URL`: Will be set after MongoDB is deployed
- `DB_NAME`: ticketdb
- `SECRET_KEY`: (Generate a secure key, or keep existing)
- `PORT`: 8000

Click "Create Web Service" and wait for deployment (~5-10 min)

#### 3. Deploy MongoDB Service
- In Render dashboard, click "New +" → "PostgreSQL"
  - Actually, for MongoDB, use **"Render Services"** or use MongoDB Atlas (free tier)
  
**EASIER OPTION: Use MongoDB Atlas (Free)**
1. Go to https://www.mongodb.com/cloud/atlas
2. Create a free cluster
3. Get your connection string: `mongodb+srv://username:password@cluster.mongodb.net/ticketdb`
4. Update backend `MONGO_URL` environment variable with this string

#### 4. Update Backend with MongoDB Connection
- Go to your backend service in Render
- Go to "Environment"
- Update `MONGO_URL` to your MongoDB Atlas connection string
- Redeploy

#### 5. Deploy Frontend Service
- Click "New +" → "Web Service" again
- Select your repo
- **Name:** ticketing-frontend
- **Runtime:** Docker
- **Port:** 80

Add Environment Variables:
- `REACT_APP_API_URL`: Set to your backend's public Render URL (e.g., https://ticketing-backend.onrender.com)

Click "Create Web Service"

#### 6. Test Your Deployment
Once all services are deployed:
- Frontend URL: `https://ticketing-frontend.onrender.com`
- Backend URL: `https://ticketing-backend.onrender.com`
- Share the frontend URL with colleagues

### Cost
- **Free tier:** Up to 750 hours/month (about 1 service always running)
- **For multiple services:** $7/month per service (standard plan)

### Important Notes
- Free tier services spin down after 15 minutes of inactivity
- For production: Upgrade to paid plans
- MongoDB Atlas free tier supports up to 512MB database
- Keep `SECRET_KEY` and MongoDB password secure - use Render's environment variable system

### Troubleshooting
- Check logs: In Render dashboard, click your service → "Logs"
- Ensure backend health check endpoint exists (or disable)
- Verify CORS settings in your backend for frontend domain
