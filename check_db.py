
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("backend/.env")

mongo_url = os.getenv("MONGO_URL")
db_name = os.getenv("DB_NAME", "clinicflow")

async def main():
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    collections = await db.list_collection_names()
    print(f"Collections in {db_name}: {collections}")
    
    # Check count in debug_payloads
    count = await db.debug_payloads.count_documents({})
    print(f"Count in debug_payloads: {count}")

if __name__ == "__main__":
    asyncio.run(main())
