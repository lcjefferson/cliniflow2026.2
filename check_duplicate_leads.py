import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from bson import json_util
import json
from dotenv import load_dotenv

load_dotenv("backend/.env")

MONGO_URI = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME")

async def check_duplicate_leads():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]
    
    print("Fetching all leads...")
    cursor = db.leads.find({}, {"_id": 0, "id": 1, "name": 1, "phone": 1, "created_at": 1})
    leads = await cursor.to_list(length=1000)
    
    print(f"Found {len(leads)} leads. Checking for potential duplicates...")
    
    phone_map = {}
    
    for lead in leads:
        phone = lead.get("phone")
        if not phone:
            continue
            
        # Clean phone: remove non-digits
        clean_phone = "".join(filter(str.isdigit, str(phone)))
        
        # Key by last 8 digits (ignoring country code, area code, and 9th digit)
        if len(clean_phone) >= 8:
            short_key = clean_phone[-8:]
            if short_key not in phone_map:
                phone_map[short_key] = []
            phone_map[short_key].append(lead)
            
    duplicates_found = False
    for key, lead_list in phone_map.items():
        if len(lead_list) > 1:
            duplicates_found = True
            print(f"\nPossible duplicates for number ending in ...{key}:")
            for l in lead_list:
                print(f"  - Name: {l.get('name')}, Phone: {l.get('phone')}, ID: {l.get('id')}, Created: {l.get('created_at')}")
                
    if not duplicates_found:
        print("\nNo obvious duplicates found based on last 8 digits.")

if __name__ == "__main__":
    asyncio.run(check_duplicate_leads())
