
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import json

load_dotenv("backend/.env")

mongo_url = os.getenv("MONGO_URL")
db_name = os.getenv("DB_NAME", "clinicflow")

async def main():
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    # Get the most recent debug payload
    cursor = db.debug_payloads.find().sort("received_at", -1).limit(1)
    async for doc in cursor:
        print(f"Inspecting most recent debug payload from {doc.get('received_at')}...")
        if '_id' in doc:
            doc['_id'] = str(doc['_id'])
        print(json.dumps(doc, indent=2, default=str))
        return

    print("No debug payloads found.")

if __name__ == "__main__":
    asyncio.run(main())
