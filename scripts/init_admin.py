#!/usr/bin/env python3
import asyncio
import sys
import os
sys.path.insert(0, '/app/backend')

from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from datetime import datetime, timezone
import uuid

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def create_admin():
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'test_database')
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    # Check if admin exists
    existing_admin = await db.users.find_one({"username": "admin"})
    if existing_admin:
        print("Admin user already exists")
    else:
        # Create admin user
        admin_user = {
            "id": str(uuid.uuid4()),
            "username": "admin",
            "email": "admin@wiitelecom.com",
            "phone": None,
            "password_hash": pwd_context.hash("admin123"),
            "role": "admin",
            "am_type": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.users.insert_one(admin_user)
        print("Admin user created successfully!")
        print("Username: admin")
        print("Password: admin123")
    
    # Create sample NOC user
    existing_noc = await db.users.find_one({"username": "noc_user"})
    if not existing_noc:
        noc_user = {
            "id": str(uuid.uuid4()),
            "username": "noc_user",
            "email": "noc@wiitelecom.com",
            "phone": None,
            "password_hash": pwd_context.hash("noc123"),
            "role": "noc",
            "am_type": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.users.insert_one(noc_user)
        print("\nNOC user created successfully!")
        print("Username: noc_user")
        print("Password: noc123")
    
    # Create sample AM users
    existing_am_sms = await db.users.find_one({"username": "am_sms"})
    if not existing_am_sms:
        am_user_sms = {
            "id": str(uuid.uuid4()),
            "username": "am_sms",
            "email": "am_sms@wiitelecom.com",
            "phone": None,
            "password_hash": pwd_context.hash("am123"),
            "role": "am",
            "am_type": "sms",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.users.insert_one(am_user_sms)
        print("\nSMS AM user created successfully!")
        print("Username: am_sms")
        print("Password: am123")
    
    existing_am_voice = await db.users.find_one({"username": "am_voice"})
    if not existing_am_voice:
        am_user_voice = {
            "id": str(uuid.uuid4()),
            "username": "am_voice",
            "email": "am_voice@wiitelecom.com",
            "phone": None,
            "password_hash": pwd_context.hash("am123"),
            "role": "am",
            "am_type": "voice",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.users.insert_one(am_user_voice)
        print("\nVoice AM user created successfully!")
        print("Username: am_voice")
        print("Password: am123")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(create_admin())
