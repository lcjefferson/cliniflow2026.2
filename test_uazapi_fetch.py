import asyncio
import os
import httpx
import json
from dotenv import load_dotenv

# Hardcoded for testing based on user input
UAZAPI_URL = "https://fortalabs.uazapi.com"
# Using the token provided by the user in the prompt
UAZAPI_TOKEN = "43453e6c-6350-4eba-98e0-09448baf195d" 

async def fetch_messages(phone_number):
    url = f"{UAZAPI_URL}/message/find"
    
    # Format chatid
    # Ensure only digits
    clean_phone = "".join(filter(str.isdigit, phone_number))
    if not clean_phone.startswith("55"):
        clean_phone = "55" + clean_phone
        
    chat_id = f"{clean_phone}@s.whatsapp.net"
    
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "token": UAZAPI_TOKEN
    }
    
    payload = {
        "chatid": chat_id,
        "limit": 20,
        "offset": 0
    }
    
    print(f"Fetching messages for {chat_id}...")
    print(f"URL: {url}")
    print(f"Headers: {headers}")
    print(f"Payload: {payload}")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, json=payload, headers=headers, timeout=30)
            print(f"Status Code: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"Response Data: {json.dumps(data, indent=2)[:500]}...") # Print first 500 chars
                return data
            else:
                print(f"Error: {response.text}")
                return None
        except Exception as e:
            print(f"Exception: {e}")
            return None

if __name__ == "__main__":
    # Test with one of the numbers found in previous steps
    # Jefferson Leonel: 558589409758
    asyncio.run(fetch_messages("558589409758"))
