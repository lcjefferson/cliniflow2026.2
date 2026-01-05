import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from passlib.context import CryptContext
from datetime import datetime, timezone
import uuid

load_dotenv("backend/.env")
MONGO_URI = os.getenv("MONGO_URL")

# Vamos forçar a criação no banco 'cliniflow'
TARGET_DB = "cliniflow"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def create_admin_in_cliniflow():
    print(f"Conectando ao banco: {TARGET_DB}")
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[TARGET_DB]
    
    email = "admin@clinicflow.com"
    password = "admin@123"
    name = "Administrador"
    
    existing = await db.users.find_one({"email": email})
    
    hashed = pwd_context.hash(password)
    
    if existing:
        print(f"Usuário {email} já existe em {TARGET_DB}. Atualizando senha...")
        await db.users.update_one(
            {"email": email},
            {"$set": {"password_hash": hashed, "role.is_admin": True}}
        )
        print("✅ Senha atualizada!")
    else:
        print(f"Usuário {email} NÃO existe em {TARGET_DB}. Criando...")
        admin_user = {
            "id": str(uuid.uuid4()),
            "name": name,
            "email": email,
            "password_hash": hashed,
            "role": {
                "is_admin": True,
                "is_attendant": False
            },
            "user_type": "admin",
            "professional_id": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(admin_user)
        print("✅ Usuário criado com sucesso!")

if __name__ == "__main__":
    asyncio.run(create_admin_in_cliniflow())
