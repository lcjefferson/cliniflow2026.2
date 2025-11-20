#!/usr/bin/env python3
"""
Script para criar usuário administrador no CliniFlow
Uso: python3 create_admin.py
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from passlib.context import CryptContext
from datetime import datetime, timezone
import uuid

# Load environment
load_dotenv('/app/backend/.env')

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def create_admin():
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')
    
    if not mongo_url or not db_name:
        print("❌ ERRO: MONGO_URL ou DB_NAME não configurados no .env")
        return
    
    print(f"🔗 Conectando ao banco: {db_name}")
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    # Check if admin already exists
    existing_admin = await db.users.find_one({'email': 'admin@cliniflow.com'}, {'_id': 0})
    
    if existing_admin:
        print("⚠️  Usuário admin@cliniflow.com já existe!")
        print(f"   Nome: {existing_admin.get('name')}")
        
        # Ask if want to reset password
        response = input("\n🔄 Deseja redefinir a senha? (s/n): ")
        if response.lower() == 's':
            new_password = "Admin@2024"
            hashed = pwd_context.hash(new_password)
            
            await db.users.update_one(
                {'email': 'admin@cliniflow.com'},
                {'$set': {'password_hash': hashed}}
            )
            
            print(f"✅ Senha redefinida!")
            print(f"   Email: admin@cliniflow.com")
            print(f"   Senha: {new_password}")
        else:
            print("❌ Operação cancelada")
    else:
        # Create new admin
        password = "Admin@2024"
        hashed = pwd_context.hash(password)
        
        admin_user = {
            "id": str(uuid.uuid4()),
            "name": "Administrador",
            "email": "admin@cliniflow.com",
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
        
        print("✅ Administrador criado com sucesso!")
        print(f"   Email: admin@cliniflow.com")
        print(f"   Senha: {password}")
        print("\n⚠️  IMPORTANTE: Altere esta senha após o primeiro login!")
    
    client.close()

if __name__ == "__main__":
    print("=" * 60)
    print("🏥 CliniFlow - Criar Usuário Administrador")
    print("=" * 60)
    print()
    
    asyncio.run(create_admin())
    
    print()
    print("=" * 60)
