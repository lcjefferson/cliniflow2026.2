import requests

def test_unauthorized():
    base_url = "https://medmanage-47.preview.emergentagent.com/api"
    
    endpoints = [
        'professionals',
        'services', 
        'patients',
        'appointments',
        'rooms'
    ]
    
    print("🚫 Testando acesso não autorizado:")
    
    for endpoint in endpoints:
        try:
            response = requests.get(f"{base_url}/{endpoint}")
            if response.status_code == 401:
                print(f"✅ {endpoint}: Corretamente negado (401)")
            else:
                print(f"❌ {endpoint}: Esperado 401, recebido {response.status_code}")
                print(f"   Resposta: {response.text[:100]}")
        except Exception as e:
            print(f"❌ {endpoint}: Erro na requisição - {e}")

if __name__ == "__main__":
    test_unauthorized()