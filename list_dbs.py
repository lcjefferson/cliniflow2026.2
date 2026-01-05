import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("backend/.env")
MONGO_URI = os.getenv("MONGO_URL")

async def list_dbs():
    client = AsyncIOMotorClient(MONGO_URI)
    dbs = await client.list_database_names()
    print("Bancos de dados disponíveis no cluster:")
    for db in dbs:
        print(f"- {db}")
        
    # Verificar usuários em cada banco 'provável'
    target_email = "admin@clinicflow.com"
    
    for db_name in dbs:
        if db_name in ['local', 'admin', 'config']:
            continue
            
        print(f"\nVerificando banco: {db_name}")
        db = client[db_name]
        collections = await db.list_collection_names()
        
        if 'users' in collections:
            user = await db.users.find_one({"email": target_email})
            if user:
                print(f"✅ Usuário ENCONTRADO em '{db_name}'!")
                print(f"   ID: {user.get('id')}")
                print(f"   Hash: {user.get('password_hash')[:20]}...")
            else:
                print(f"❌ Usuário NÃO encontrado em '{db_name}'.")
        else:
            print(f"ℹ️  Sem coleção 'users' em '{db_name}'.")

if __name__ == "__main__":
    asyncio.run(list_dbs())
