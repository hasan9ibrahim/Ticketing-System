# Render + MongoDB Atlas Deployment Checklist

## Pre-Deployment (Do These First)

- [ ] MongoDB Atlas Account Created (https://www.mongodb.com/cloud/atlas)
- [ ] Free Cluster Created (M0 Shared)
- [ ] Database User Created (username + password saved)
- [ ] IP Whitelist Configured (0.0.0.0/0 for Render access)
- [ ] Connection String Saved (with password replaced)
- [ ] GitHub Repo Updated (latest code pushed)

## Render Deployment

### Backend
- [ ] Render Account Created (https://render.com)
- [ ] Backend Service Created with name: `ticketing-backend`
- [ ] Environment Variables Added:
  - [ ] `MONGO_URL` = Your MongoDB Atlas connection string
  - [ ] `DB_NAME` = `ticketdb`
  - [ ] `SECRET_KEY` = Your secret key
  - [ ] `PORT` = `8000`
- [ ] Deployment Successful (green checkmark, no 502 errors)
- [ ] Backend URL Copied (e.g., `https://ticketing-backend.onrender.com`)

### Frontend
- [ ] Frontend Service Created with name: `ticketing-frontend`
- [ ] Environment Variable Added:
  - [ ] `REACT_APP_API_URL` = Your backend URL (from above)
- [ ] Deployment Successful (green checkmark)
- [ ] Frontend URL Working (you can access the page)

## Testing

- [ ] Frontend loads without errors (F12 console is clear)
- [ ] Can create a new ticket
- [ ] Can view all tickets
- [ ] Can update/delete tickets
- [ ] Backend logs show no errors (check Render "Logs" tab)
- [ ] MongoDB connection working (data persists after refresh)

## Final Steps

- [ ] Share Frontend URL with colleagues
- [ ] Create documentation for team
- [ ] Monitor logs for first 24 hours
- [ ] Plan upgrade to paid tier if needed (free tier has limits)

## Troubleshooting Quick Links

| Issue | Check |
|-------|-------|
| Backend won't deploy | Render Logs → "Logs" tab |
| API returns 404 | Check `MONGO_URL` in Render environment |
| Frontend blank page | Browser DevTools (F12) → Console tab |
| MongoDB connection fails | Atlas "Network Access" whitelist includes 0.0.0.0/0 |
| Services spin down | Normal on free tier (5-10 sec cold start) |

---

## MongoDB Atlas Connection String Format

Make sure your connection string looks like this:
```
mongodb+srv://USERNAME:PASSWORD@cluster.mongodb.net/DBNAME?retryWrites=true&w=majority
```

Example:
```
mongodb+srv://ticketadmin:mypassword123@cluster.mongodb.net/ticketdb?retryWrites=true&w=majority
```

**Important:** Replace `PASSWORD` with your actual password!

---

## Support

If deployment fails:
1. Check Render service logs (Logs tab)
2. Verify MongoDB connection string in environment variables
3. Ensure GitHub repo has latest code
4. Check that Dockerfiles build locally: `docker compose build`
