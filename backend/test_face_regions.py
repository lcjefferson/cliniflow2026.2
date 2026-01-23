import requests
import json
from datetime import datetime

# URL base da API (ajuste se necessário)
BASE_URL = "http://localhost:8000/api"

def register_and_login():
    # 1. Register a test user (admin)
    email = f"test_admin_{int(datetime.now().timestamp())}@example.com"
    password = "password123"
    
    # Try to register
    register_payload = {
        "email": email,
        "password": password,
        "name": "Test Admin",
        "user_type": "admin"
    }
    
    print(f"Registering user: {email}")
    try:
        reg_res = requests.post(f"{BASE_URL}/auth/register", json=register_payload)
        print(f"Registration response: {reg_res.status_code} {reg_res.text}")
        # Ignore error if already exists (though timestamp makes it unique)
    except Exception as e:
        print(f"Registration note: {e}")

    # 2. Login
    login_payload = {
        "email": email,
        "password": password
    }
    
    print("Logging in...")
    # Using JSON payload for /auth/login
    response = requests.post(f"{BASE_URL}/auth/login", json=login_payload)
    if response.status_code != 200:
        print(f"Login failed: {response.text}")
        return None
    
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

def test_face_regions_persistence():
    headers = register_and_login()
    if not headers:
        print("Aborting test due to login failure")
        return

    # 1. Criar um paciente de teste
    patient_payload = {
        "name": "Paciente Teste Harmonização",
        "email": "paciente.harmonizacao@example.com",
        "phone": "11999999999",
        "cpf": "123.456.789-00"
    }
    
    print("\nCriando paciente...")
    response = requests.post(f"{BASE_URL}/patients/", json=patient_payload, headers=headers)
    if response.status_code not in [200, 201]:
        # Tentar buscar se já existe
        print("Paciente pode já existir, tentando buscar...")
        patients = requests.get(f"{BASE_URL}/patients/", headers=headers).json()
        patient = next((p for p in patients if p["email"] == patient_payload["email"]), None)
        if not patient:
            print(f"Erro ao criar/buscar paciente: {response.text}")
            return
        patient_id = patient["id"]
    else:
        patient_id = response.json()["id"]
        
    print(f"ID do Paciente: {patient_id}")

    # 2. Criar um orçamento com tratamentos mistos (Dentes + Face)
    budget_payload = {
        "patient_id": patient_id,
        "description": "Plano Misto: Clareamento + Harmonização",
        "date": datetime.now().strftime("%Y-%m-%d"),
        "total_value": 3500.0,
        "treatments": [
            {
                "name": "Clareamento Dental",
                "value": 1500.0,
                "teeth": ["11", "21"],
                "face_regions": [] # Tratamento dentário
            },
            {
                "name": "Botox Testa e Glabela",
                "value": 2000.0,
                "teeth": [],
                "face_regions": ["forehead", "glabella"] # Tratamento facial
            }
        ],
        "observations": "Teste de persistência de regiões faciais"
    }

    print("\nCriando orçamento misto...")
    # Correção: O endpoint correto é /budgets, e o patient_id vai no corpo
    response = requests.post(f"{BASE_URL}/budgets", json=budget_payload, headers=headers)
    
    if response.status_code not in [200, 201]:
        print(f"Erro ao criar orçamento: {response.text}")
        return

    budget_data = response.json()
    budget_id = budget_data["id"]
    print(f"Orçamento criado com ID: {budget_id}")

    # 3. Verificar se os dados foram salvos corretamente
    print("\nVerificando dados salvos no orçamento...")
    treatments = budget_data.get("treatments", [])
    
    found_face_regions = False
    for t in treatments:
        print(f"Tratamento: {t['name']}")
        print(f"  Dentes: {t.get('teeth')}")
        print(f"  Regiões da Face: {t.get('face_regions')}")
        
        if t['name'] == "Botox Testa e Glabela":
            if "forehead" in t.get('face_regions', []) and "glabella" in t.get('face_regions', []):
                found_face_regions = True
                print("  [SUCESSO] Regiões faciais persistidas corretamente!")
            else:
                print("  [ERRO] Regiões faciais NÃO conferem.")

    if found_face_regions:
        print("\nTeste Concluído com SUCESSO: Suporte a Harmonização Facial validado no Backend.")
    else:
        print("\nTeste FALHOU: Regiões faciais não foram salvas ou recuperadas corretamente.")

if __name__ == "__main__":
    test_face_regions_persistence()
