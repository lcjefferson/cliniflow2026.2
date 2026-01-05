import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("backend/.env")
MONGO_URI = os.getenv("MONGO_URL")

async def audit_users():
    client = AsyncIOMotorClient(MONGO_URI)
    dbs = await client.list_database_names()
    
    print(f"Auditando usuários em todos os bancos do cluster...")
    
    for db_name in dbs:
        if db_name in ['local', 'admin', 'config']:
            continue
            
        print(f"\n--- Banco: {db_name} ---")
        db = client[db_name]
        
        try:
            users = await db.users.find({}, {"password_hash": 0}).to_list(100)
            if not users:
                print("  (Nenhum usuário encontrado)")
            for u in users:
                print(f"  User: {u.get('email')} | Nome: {u.get('name')} | ID: {u.get('id')}")
        except Exception as e:
            print(f"  Erro ao ler users: {e}")

if __name__ == "__main__":
    asyncio.run(audit_users())
