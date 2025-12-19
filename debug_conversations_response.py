import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from bson import json_util
import json
from dotenv import load_dotenv

load_dotenv("backend/.env")

MONGO_URI = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME")

async def check_conversations_api_response():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]
    
    print("Simulating GET /conversations response...")
    # This matches the logic in server.py: 
    # conversations = await db.conversations.find({}, {"_id": 0}).sort("last_message_at", -1).to_list(1000)
    cursor = db.conversations.find({}, {"_id": 0}).sort("last_message_at", -1).limit(5)
    conversations = await cursor.to_list(length=5)
    
    print(f"Found {len(conversations)} conversations.")
    for i, conv in enumerate(conversations):
        print(f"--- Conversation {i+1} ---")
        print(json.dumps(conv, default=json_util.default, indent=2))

    print("\nSimulating GET /leads response...")
    cursor = db.leads.find({}, {"_id": 0}).limit(5)
    leads = await cursor.to_list(length=5)
    print(f"Found {len(leads)} leads.")
    for i, lead in enumerate(leads):
        print(f"--- Lead {i+1} ---")
        print(json.dumps(lead, default=json_util.default, indent=2))

if __name__ == "__main__":
    asyncio.run(check_conversations_api_response())
