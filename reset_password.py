import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from dotenv import load_dotenv

load_dotenv("backend/.env")

MONGO_URI = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def reset_password():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]
    
    email = "admin@clinicflow.com"
    new_password = "admin@123"
    hashed_password = pwd_context.hash(new_password)
    
    print(f"Resetting password for {email}...")
    result = await db.users.update_one(
        {"email": email},
        {"$set": {"password_hash": hashed_password}}
    )
    
    if result.modified_count > 0:
        print("Password updated successfully.")
    else:
        print("User not found or password unchanged.")

if __name__ == "__main__":
    asyncio.run(reset_password())
