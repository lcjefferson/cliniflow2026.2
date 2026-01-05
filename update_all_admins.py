import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from dotenv import load_dotenv

load_dotenv("backend/.env")
MONGO_URI = os.getenv("MONGO_URL")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def update_all_admins():
    client = AsyncIOMotorClient(MONGO_URI)
    dbs = await client.list_database_names()
    
    new_password = "admin@123"
    hashed = pwd_context.hash(new_password)
    
    print(f"Definindo senha '{new_password}' para TODOS os admins em TODOS os bancos...")
    
    for db_name in dbs:
        if db_name in ['local', 'admin', 'config']:
            continue
            
        print(f"\n--- Processando banco: {db_name} ---")
        db = client[db_name]
        
        # Buscar usuários que parecem admin
        cursor = db.users.find({
            "$or": [
                {"email": {"$regex": "^admin"}},
                {"role.is_admin": True}
            ]
        })
        
        async for user in cursor:
            email = user.get('email')
            print(f"  Atualizando senha para: {email} (ID: {user.get('id')})")
            
            await db.users.update_one(
                {"_id": user["_id"]},
                {"$set": {"password_hash": hashed}}
            )
            print("    ✅ Senha atualizada.")

if __name__ == "__main__":
    asyncio.run(update_all_admins())
