import asyncio
import httpx

async def test_prod_login_variants():
    url = "https://clinicflow-lucj.onrender.com/api/auth/login"
    password = "admin@123"
    
    emails = [
        "admin@clinicflow.com",
        "admin@cliniflow.com"
    ]
    
    async with httpx.AsyncClient() as client:
        for email in emails:
            print(f"\nTentando login com: {email}")
            try:
                response = await client.post(url, json={"email": email, "password": password}, timeout=30.0)
                
                if response.status_code == 200:
                    print(f"✅ SUCESSO! Login funcionou para {email}")
                    print(f"   User ID: {response.json().get('user', {}).get('id')}")
                    print(f"   Name: {response.json().get('user', {}).get('name')}")
                else:
                    print(f"❌ FALHA ({response.status_code}) para {email}")
                    # print(response.text)
                    
            except Exception as e:
                print(f"Erro: {e}")

if __name__ == "__main__":
    asyncio.run(test_prod_login_variants())
