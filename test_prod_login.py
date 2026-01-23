import asyncio
import httpx
import json

async def test_prod_login():
    url = "https://clinicflow-lucj.onrender.com/api/auth/login"
    payload = {
        "email": "admin@clinicflow.com",
        "password": "admin@123"
    }
    
    print(f"Tentando login em: {url}")
    print(f"Payload: {payload}")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, json=payload, timeout=30.0)
            print(f"Status Code: {response.status_code}")
            try:
                print(f"Response: {response.json()}")
            except:
                print(f"Response Text: {response.text}")
                
            if response.status_code == 200:
                print("✅ SUCESSO! O login funcionou na API de produção.")
            elif response.status_code == 401:
                print("❌ ERRO 401: Senha incorreta ou usuário não encontrado no banco de produção.")
            else:
                print(f"❌ Outro erro: {response.status_code}")
                
        except Exception as e:
            print(f"Erro na requisição: {e}")

if __name__ == "__main__":
    asyncio.run(test_prod_login())
