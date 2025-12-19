import asyncio
import httpx
import uuid
import base64
from pathlib import Path

# Config
BASE_URL = "http://localhost:8002"
EMAIL = "jefferson@cliniflow.com.br" # Assuming this user exists or I'll register one
PASSWORD = "password123" # Dummy password, might need to register first if not exists

async def main():
    async with httpx.AsyncClient() as client:
        # 1. Login or Register
        print("Authenticating...")
        try:
            # Try login with correct endpoint and format
            resp = await client.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
            
            if resp.status_code != 200:
                # Try register
                print("User not found or login failed, registering...")
                resp = await client.post(f"{BASE_URL}/api/auth/register", json={
                    "name": "Jefferson Test",
                    "email": EMAIL,
                    "password": PASSWORD,
                    "user_type": "admin",
                    "is_admin": True
                })
                print(f"Register status: {resp.status_code}")
                
                # Login again
                resp = await client.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
        except Exception as e:
            print(f"Auth failed: {e}")
            return

        if resp.status_code != 200:
            print(f"Failed to login: {resp.text}")
            return
            
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # 2. Get a conversation
        print("Fetching conversations...")
        resp = await client.get(f"{BASE_URL}/api/conversations", headers=headers)
        if resp.status_code != 200:
            print(f"Failed to fetch conversations: {resp.text}")
            return
            
        conversations = resp.json()
        if not conversations:
            print("No conversations found. Please create one first.")
            return
            
        conversation_id = conversations[0]["id"]
        print(f"Using conversation {conversation_id}")
        
        # 3. Upload a file
        print("Uploading media...")
        
        # Create a dummy file
        dummy_content = b"Hello World PDF Content"
        files = {
            "file": ("test.txt", dummy_content, "text/plain")
        }
        
        resp = await client.post(
            f"{BASE_URL}/api/conversations/{conversation_id}/media",
            headers=headers,
            files=files,
            data={"caption": "Test media upload"}
        )
        
        if resp.status_code == 200:
            print("Success!")
            print(resp.json())
        else:
            print(f"Failed: {resp.status_code}")
            print(resp.text)

if __name__ == "__main__":
    asyncio.run(main())
