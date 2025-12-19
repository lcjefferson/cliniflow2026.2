import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
import json

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL")
DB_NAME = os.getenv("DB_NAME")

async def dump_last_payload():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Get the very last payload
    doc = await db.debug_payloads.find_one(sort=[("received_at", -1)])
    
    if doc:
        print("Received At:", doc.get('received_at'))
        print(json.dumps(doc.get('payload'), default=str, indent=2))
    else:
        print("No payloads found.")

if __name__ == "__main__":
    asyncio.run(dump_last_payload())
