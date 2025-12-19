import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from bson import json_util
import json

# DB Config
MONGO_URI = "mongodb+srv://odonto:cKAYW5Tb697D8b2O@cluster-ia.eotgavq.mongodb.net/?appName=cluster-ia"
DB_NAME = "clinicflow"

async def inspect_messages():
    try:
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[DB_NAME]
        
        print("--- Inspecting Last 10 Messages ---")
        cursor = db.messages.find().sort("created_at", -1).limit(10)
        async for msg in cursor:
            print(json.dumps(msg, default=json_util.default, indent=2))
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(inspect_messages())
