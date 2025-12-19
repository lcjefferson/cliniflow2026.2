
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from bson import json_util
import json
from dotenv import load_dotenv

load_dotenv("backend/.env")

# MongoDB Connection
MONGO_URI = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "clinicflow")

async def check_messages():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]
    
    print("Checking latest 5 messages...")
    cursor = db.messages.find().sort("created_at", -1).limit(5)
    messages = await cursor.to_list(length=5)
    
    for msg in messages:
        print(json.dumps(msg, default=json_util.default, indent=2))

    print("\nChecking latest 5 leads...")
    cursor = db.leads.find().sort("created_at", -1).limit(5)
    leads = await cursor.to_list(length=5)
    for lead in leads:
        print(json.dumps(lead, default=json_util.default, indent=2))

    print("\nChecking latest 5 conversations...")
    cursor = db.conversations.find().sort("last_message_at", -1).limit(5)
    conversations = await cursor.to_list(length=5)
    for conv in conversations:
        print(json.dumps(conv, default=json_util.default, indent=2))

    print("\nChecking users...")
    cursor = db.users.find()
    users = await cursor.to_list(length=10)
    for user in users:
        if "password" in user:
            user["password"] = "***"
        print(json.dumps(user, default=json_util.default, indent=2))

if __name__ == "__main__":
    asyncio.run(check_messages())
