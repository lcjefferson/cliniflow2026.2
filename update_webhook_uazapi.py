import asyncio
import os
import json
import httpx
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv(dotenv_path="backend/.env")

mongo_url = os.getenv("MONGO_URL")
db_name = os.getenv("DB_NAME")

NEW_WEBHOOK_URL = "https://whole-colts-look.loca.lt/api/webhook/uazapi"

async def main():
    if not mongo_url:
        print("MONGO_URL not found")
        return

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print(f"Connected to {db_name}")
    
    # Get settings
    settings = await db.settings.find_one({"type": "omnichannel"})
    if not settings:
        print("Omnichannel settings not found.")
        return
        
    whatsapp = settings.get("whatsapp", {})
    provider = whatsapp.get("provider")
    uazapi_url = whatsapp.get("uazapi_url")
    uazapi_token = whatsapp.get("uazapi_token")
    # instance = whatsapp.get("uazapi_instance", "default") # FortaLabs often doesn't use instance in path in some versions, but let's check.
    
    print(f"Provider: {provider}")
    print(f"URL: {uazapi_url}")
    print(f"Token: {uazapi_token}")
    
    if provider != "uazapi" or not uazapi_url or not uazapi_token:
        print("UazApi not configured.")
        return

    # Clean URL
    base_url = uazapi_url.rstrip('/')
    
    # Payload to set webhook
    payload = {
        "enabled": True,
        "url": NEW_WEBHOOK_URL,
        "webhookByEvents": False,
        "events": [
            "messages", "messages_update", "send_message", 
            "MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE",
            "messages.upsert", "messages.update"
        ]
    }
    
    headers = {
        "apikey": uazapi_token,
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient() as http_client:
        # Try multiple endpoints as FortaLabs/UazApi versions vary
        
        # 1. /webhook/set (Standard)
        endpoints = [
            f"{base_url}/webhook/set?token={uazapi_token}",
            f"{base_url}/webhook?token={uazapi_token}",
            f"{base_url}/webhook/set/default?token={uazapi_token}"
        ]
        
        success = False
        for url in endpoints:
            print(f"\nTrying POST {url}...")
            try:
                resp = await http_client.post(url, json=payload, headers=headers, timeout=10)
                print(f"Status: {resp.status_code}")
                print(f"Response: {resp.text}")
                if resp.status_code in [200, 201]:
                    print("SUCCESS! Webhook updated.")
                    success = True
                    break
            except Exception as e:
                print(f"Error: {e}")
                
        if not success:
            print("\nFailed to update webhook on all attempted endpoints.")

if __name__ == "__main__":
    asyncio.run(main())
