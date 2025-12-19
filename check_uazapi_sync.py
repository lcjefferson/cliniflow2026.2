import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv("backend/.env")
MONGO_URL = os.getenv("MONGO_URL")
DB_NAME = os.getenv("DB_NAME")

async def check_messages():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # IDs from UazApi response
    external_ids = [
        "558898508867:2A358B828B9CB63DAC9E",
        "558898508867:3EB0A6D31DAC6F6628EC60",
        "558898508867:2A088F65CA185861E3F0",
        "558898508867:2A6889A3264E8344ECA0"
    ]
    
    print(f"Checking for {len(external_ids)} external IDs in database...")
    
    found_count = 0
    for ext_id in external_ids:
        msg = await db.messages.find_one({"external_id": ext_id})
        if msg:
            print(f"[FOUND] {ext_id} -> DB ID: {msg['id']}")
            found_count += 1
        else:
            print(f"[MISSING] {ext_id}")
            
    print(f"\nSummary: Found {found_count}/{len(external_ids)} messages.")

if __name__ == "__main__":
    asyncio.run(check_messages())
