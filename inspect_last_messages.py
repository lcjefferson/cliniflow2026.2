import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import json
from datetime import datetime

# Load env vars
env_path = Path('./backend/.env')
load_dotenv(env_path)

mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME', 'clinicflow')

async def main():
    print(f"Connecting to {mongo_url} ({db_name})...")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    # Find any message with audio mimetype
    print("Searching for audio messages...")
    cursor = db.messages.find({
        "$or": [
            {"content.mimetype": {"$regex": "audio"}},
            {"content.mimetype": {"$regex": "voice"}},
            {"content.mimetype": {"$regex": "ptt"}}
        ]
    }).sort('created_at', -1).limit(5)
    
    messages = await cursor.to_list(length=5)
    
    print(f"Found {len(messages)} audio messages.")
    for msg in messages:
         print("-" * 50)
         print(f"ID: {msg.get('id')}")
         content = msg.get('content')
         
         if isinstance(content, dict):
              print(f"Type: DICT - {content.get('mimetype')}")
              safe_content = content.copy()
              if 'file_data' in safe_content and safe_content['file_data']:
                 safe_content['file_data'] = f"<BASE64_DATA_LEN_{len(safe_content['file_data'])}>"
              print(json.dumps(safe_content, indent=2, default=str))
         else:
              print(f"Type: {type(content)}")
              print(f"Content: {content}")

if __name__ == "__main__":
    asyncio.run(main())
