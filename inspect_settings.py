import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import json

# Load env vars
env_path = Path('./backend/.env')
load_dotenv(env_path)

mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME', 'clinicflow')

async def main():
    print(f"Connecting to {mongo_url} ({db_name})...")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    settings = await db.settings.find_one({"type": "omnichannel"})
    if settings:
        print("Settings found:")
        # Hide sensitive data
        if 'whatsapp' in settings:
            wa = settings['whatsapp']
            if 'access_token' in wa:
                wa['access_token'] = wa['access_token'][:10] + "..."
            if 'apikey' in wa:
                wa['apikey'] = wa['apikey'][:5] + "..."
        print(json.dumps(settings, indent=2, default=str))
    else:
        print("No omnichannel settings found.")

if __name__ == "__main__":
    asyncio.run(main())
