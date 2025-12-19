import asyncio
import httpx
import json
import os
import uuid
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("backend/.env")

MONGO_URL = os.getenv("MONGO_URL")
DB_NAME = os.getenv("DB_NAME")
UAZAPI_URL = "https://fortalabs.uazapi.com"
UAZAPI_TOKEN = "43453e6c-6350-4eba-98e0-09448baf195d"

async def sync_messages(phone_number):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # 1. Prepare Phone and ChatID
    clean_phone = "".join(filter(str.isdigit, phone_number))
    chat_id = f"{clean_phone}@s.whatsapp.net"
    
    print(f"Syncing messages for {chat_id}...")
    
    # 2. Fetch from UazApi
    url = f"{UAZAPI_URL}/message/find"
    headers = {
        "Content-Type": "application/json",
        "token": UAZAPI_TOKEN
    }
    payload = {
        "chatid": chat_id,
        "limit": 50,
        "offset": 0
    }
    
    async with httpx.AsyncClient() as http_client:
        response = await http_client.post(url, json=payload, headers=headers, timeout=30)
        
    if response.status_code != 200:
        print(f"Error fetching from UazApi: {response.text}")
        return

    data = response.json()
    messages = data.get("messages", []) # It returns a list directly or inside 'messages'?
    # Based on curl output: It returns a list inside the root response? 
    # Curl output: {"nextOffset":20,"offset":0,"returnedMessages":20, "messages": [...]}?
    # Wait, the curl output was: 
    # [{"buttonOrListid":"","chatid":...}, {...}] 
    # NO, looking at the raw curl output again...
    # It started with `(some characters truncated)...` and then JSON objects.
    # It looks like a LIST of objects or a dict with a list.
    # Let's check the curl output structure again carefully.
    # The curl output ended with `],"nextOffset":20,"offset":0,"returnedMessages":20}`
    # So it IS a dictionary with a "messages" key? NO.
    # The structure must be `{"messages": [...], "nextOffset": 20...}` OR `[..., "nextOffset": 20]` is invalid JSON.
    # It must be `{ "messages": [ ... ], "nextOffset": 20 ... }`
    # Let's assume data is a dict and has "messages" or the list is directly there.
    # Actually, looking at the tail of the curl output: `... "text":"Boa noite"}],"nextOffset":20 ...`
    # This implies the list closes `]`, then comma, then `nextOffset`.
    # So the root is a Dict, and the key for the list is likely "messages" or similar.
    # I'll check `data.keys()` to be safe.
    
    if isinstance(data, list):
        msg_list = data
    elif isinstance(data, dict):
        # Try common keys
        msg_list = data.get("messages") or data.get("data") or []
        # If the dict itself is not the list container but contains the list
    else:
        msg_list = []

    print(f"Found {len(msg_list)} messages in UazApi response.")
    
    # 3. Find/Create Lead
    lead = await db.leads.find_one({"phone": clean_phone})
    if not lead:
        # Try without 55 if starts with 55
        if clean_phone.startswith("55"):
            lead = await db.leads.find_one({"phone": clean_phone[2:]})
            
    if not lead:
        print(f"Creating new lead for {clean_phone}...")
        lead_id = str(uuid.uuid4())
        lead = {
            "id": lead_id,
            "name": f"WhatsApp {clean_phone}", # Temporary name
            "phone": clean_phone,
            "status": "new",
            "source": "whatsapp_sync",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.leads.insert_one(lead)
    else:
        print(f"Found existing lead: {lead['name']} ({lead['id']})")
        
    # 4. Find/Create Conversation
    conversation = await db.conversations.find_one({"lead_id": lead["id"]})
    if not conversation:
        print("Creating new conversation...")
        conversation_id = str(uuid.uuid4())
        conversation = {
            "id": conversation_id,
            "lead_id": lead["id"],
            "channel": "whatsapp",
            "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_message_at": datetime.now(timezone.utc).isoformat()
        }
        await db.conversations.insert_one(conversation)
    else:
        print(f"Found existing conversation: {conversation['id']}")

    # 5. Process Messages
    inserted_count = 0
    
    for msg_data in msg_list:
        external_id = msg_data.get("id")
        if not external_id:
            continue
            
        # Check duplicate
        existing = await db.messages.find_one({"external_id": external_id})
        if existing:
            continue
            
        # Determine sender
        is_from_me = msg_data.get("fromMe", False)
        
        if is_from_me:
            sender_type = "consultant"
            sender_id = None
            sender_name = "Via WhatsApp"
        else:
            sender_type = "lead"
            sender_id = lead["id"]
            sender_name = msg_data.get("senderName") or lead["name"]
            
            # Update lead name if we found a better one
            if msg_data.get("senderName") and lead["name"].startswith("WhatsApp"):
                await db.leads.update_one({"id": lead["id"]}, {"$set": {"name": msg_data["senderName"]}})
                lead["name"] = msg_data["senderName"]

        # Content extraction
        content = msg_data.get("content")
        if isinstance(content, dict):
            # It's a complex object (media) or text wrapper
            if "text" in content:
                final_content = content["text"]
            else:
                # Media
                final_content = content # Save the whole dict for frontend to parse
        else:
            final_content = content or msg_data.get("text") or ""

        # Timestamp
        ts = msg_data.get("messageTimestamp")
        if isinstance(ts, int):
            # UazApi uses milliseconds? 1766094708000
            # 1766094708000 / 1000 = 1766094708 -> 2025-12-18
            created_at = datetime.fromtimestamp(ts/1000, timezone.utc).isoformat()
        else:
            created_at = datetime.now(timezone.utc).isoformat()

        message = {
            "id": str(uuid.uuid4()),
            "conversation_id": conversation["id"],
            "sender_type": sender_type,
            "sender_id": sender_id,
            "sender_name": sender_name,
            "content": final_content,
            "created_at": created_at,
            "external_id": external_id
        }
        
        await db.messages.insert_one(message)
        inserted_count += 1
        
    # Update conversation last_message_at
    if inserted_count > 0:
        await db.conversations.update_one(
            {"id": conversation["id"]},
            {"$set": {"last_message_at": datetime.now(timezone.utc).isoformat()}}
        )
        
    print(f"Synced {inserted_count} new messages.")

if __name__ == "__main__":
    # The number from the user's curl
    asyncio.run(sync_messages("558589409758"))
