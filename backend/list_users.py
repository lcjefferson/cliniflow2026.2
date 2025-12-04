
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ.get("MONGO_URL")

async def main():
    if not MONGO_URL:
        print("MONGO_URL not found in .env file.")
        return

    client = AsyncIOMotorClient(MONGO_URL)
    db_name = os.environ.get('DB_NAME', 'clinicflow')
    db = client[db_name]
    
    print(f"Connecting to {MONGO_URL}...")
    
    try:
        # Test connection
        await client.admin.command('ping')
        print("Connection successful.")
        
        print(f"Querying 'users' collection in '{db_name}' database...")
        users = await db.users.find().to_list(100)
        
        if users:
            print("Found users:")
            for user in users:
                print(user)
        else:
            print("No users found in the collection.")
            
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(main())
