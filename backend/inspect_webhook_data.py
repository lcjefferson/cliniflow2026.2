import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
import json
from datetime import datetime

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL")
DB_NAME = os.getenv("DB_NAME")

async def inspect_recent():
    print(f"Connecting to {MONGO_URL}...")
    try:
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        
        # 1. Check debug_payloads (last 3)
        print("\n--- RECENT DEBUG PAYLOADS ---")
        async for doc in db.debug_payloads.find().sort("received_at", -1).limit(3):
            print(f"Received At: {doc.get('received_at')}")
            # print(json.dumps(doc.get('payload'), default=str, indent=2))
            payload = doc.get('payload', {})
            # Try to summarize key fields
            msg_data = payload.get('data', {}).get('message') or payload.get('data') or payload.get('message') or {}
            print(f"Type: {msg_data.get('messageType') or msg_data.get('type')}")
            print(f"Mime: {msg_data.get('mimetype')}")
            print(f"URL: {msg_data.get('mediaUrl') or msg_data.get('url') or msg_data.get('URL')}")
            print("-" * 30)

        # 2. Check recent messages in DB (last 3)
        print("\n--- RECENT SAVED MESSAGES ---")
        async for msg in db.messages.find().sort("created_at", -1).limit(3):
            print(f"ID: {msg.get('id')}")
            print(f"Created: {msg.get('created_at')}")
            print(f"Content: {msg.get('content')}")
            print("-" * 30)
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(inspect_recent())
