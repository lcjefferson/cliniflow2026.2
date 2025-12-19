import asyncio
import httpx
import json

BASE_URL = "http://localhost:8002/api"
EMAIL = "admin@clinicflow.com"
PASSWORD = "password123"
CONVERSATION_ID = "d279e2d9-7e6f-49f7-8d3f-801f662f19c4"

async def debug_api():
    async with httpx.AsyncClient() as client:
        # 1. Login
        print("Logging in...")
        response = await client.post(f"{BASE_URL}/auth/login", json={
            "email": EMAIL,
            "password": PASSWORD
        })
        
        if response.status_code != 200:
            print(f"Login failed: {response.text}")
            return
            
        token = response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("Login successful.")
        
        # 2. Fetch Messages
        print(f"Fetching messages for conversation {CONVERSATION_ID}...")
        response = await client.get(
            f"{BASE_URL}/conversations/{CONVERSATION_ID}/messages",
            headers=headers
        )
        
        if response.status_code == 200:
            messages = response.json()
            print(f"Found {len(messages)} messages.")
            for msg in messages:
                print(json.dumps(msg, indent=2))
        else:
            print(f"Failed to fetch messages: {response.status_code} - {response.text}")

if __name__ == "__main__":
    asyncio.run(debug_api())
