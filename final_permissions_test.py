import requests
import sys
import json
from datetime import datetime

class FinalPermissionsTest:
    def __init__(self, base_url="https://cliniflow-1.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.admin_token = None
        self.consultor_token = None
        self.profissional_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.created_users = []

    def run_test(self, name, method, endpoint, expected_status, data=None, token=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if token:
            headers['Authorization'] = f'Bearer {token}'
        
        self.tests_run += 1
        print(f"\n🔍 {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            if isinstance(expected_status, list):
                success = response.status_code in expected_status
            else:
                success = response.status_code == expected_status
                
            if success:
                self.tests_passed += 1
                print(f"✅ PASS - Status: {response.status_code}")
                try:
                    return True, response.json() if response.content else {}
                except:
                    return True, {}
            else:
                print(f"❌ FAIL - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}")
                self.failed_tests.append({
                    "test": name,
                    "expected": expected_status,
                    "actual": response.status_code,
                    "response": response.text[:200]
                })
                return False, {}

        except Exception as e:
            print(f"❌ FAIL - Error: {str(e)}")
            self.failed_tests.append({"test": name, "error": str(e)})
            return False, {}

def main():
    print("🏥 CliniFlow - TESTE COMPLETO DAS NOVAS FUNCIONALIDADES")
    print("=" * 70)
    
    tester = FinalPermissionsTest()
    
    # 1. TESTE SISTEMA DE PERMISSÕES - REGISTRO
    print("\n1️⃣ TESTANDO REGISTRO COM NOVOS CAMPOS DE PERMISSÃO")
    print("-" * 50)
    
    # Registro Admin
    admin_data = {
        "name": "Administrador CliniFlow",
        "email": "admin.final@cliniflow.com",
        "password": "admin123456",
        "is_admin": True,
        "user_type": "admin",
        "professional_id": None
    }
    
    success, response = tester.run_test(
        "Registro usuário ADMIN com user_type",
        "POST", "auth/register", [200, 400], admin_data
    )
    
    if success and response.get('access_token'):
        tester.admin_token = response['access_token']
        user = response.get('user', {})
        print(f"   ✅ Admin criado: user_type={user.get('user_type')}, professional_id={user.get('professional_id')}")
    else:
        # Try login if registration failed
        success, response = tester.run_test(
            "Login Admin",
            "POST", "auth/login", 200, 
            {"email": "admin.final@cliniflow.com", "password": "admin123456"}
        )
        if success:
            tester.admin_token = response['access_token']
    
    # Registro Consultor
    consultor_data = {
        "name": "Consultor CliniFlow",
        "email": "consultor.final@cliniflow.com",
        "password": "consultor123",
        "is_admin": False,
        "user_type": "consultor",
        "professional_id": None
    }
    
    success, response = tester.run_test(
        "Registro usuário CONSULTOR com user_type",
        "POST", "auth/register", [200, 400], consultor_data
    )
    
    if success and response.get('access_token'):
        tester.consultor_token = response['access_token']
        user = response.get('user', {})
        print(f"   ✅ Consultor criado: user_type={user.get('user_type')}")
        tester.created_users.append(user.get('id'))
    else:
        success, response = tester.run_test(
            "Login Consultor",
            "POST", "auth/login", 200,
            {"email": "consultor.final@cliniflow.com", "password": "consultor123"}
        )
        if success:
            tester.consultor_token = response['access_token']
    
    # Criar profissional primeiro para vincular
    prof_data = {
        "name": "Dr. João Silva",
        "specialty": "Cardiologia",
        "email": "joao.silva@cliniflow.com",
        "phone": "(11) 99999-9999"
    }
    
    success, prof_response = tester.run_test(
        "Criar Profissional para vinculação",
        "POST", "professionals", 200, prof_data, tester.admin_token
    )
    
    professional_id = prof_response.get('id') if success else None
    
    # Registro Profissional
    profissional_data = {
        "name": "Dr. João Silva User",
        "email": "profissional.final@cliniflow.com",
        "password": "profissional123",
        "is_admin": False,
        "user_type": "profissional",
        "professional_id": professional_id
    }
    
    success, response = tester.run_test(
        "Registro usuário PROFISSIONAL com professional_id",
        "POST", "auth/register", [200, 400], profissional_data
    )
    
    if success and response.get('access_token'):
        tester.profissional_token = response['access_token']
        user = response.get('user', {})
        print(f"   ✅ Profissional criado: user_type={user.get('user_type')}, professional_id={user.get('professional_id')}")
        tester.created_users.append(user.get('id'))
    else:
        success, response = tester.run_test(
            "Login Profissional",
            "POST", "auth/login", 200,
            {"email": "profissional.final@cliniflow.com", "password": "profissional123"}
        )
        if success:
            tester.profissional_token = response['access_token']
    
    # 2. TESTE LOGIN COM CAMPOS user_type E professional_id
    print("\n2️⃣ TESTANDO LOGIN COM RETORNO DOS NOVOS CAMPOS")
    print("-" * 50)
    
    # Test admin login response
    success, response = tester.run_test(
        "Login Admin - validar campos user_type e professional_id",
        "POST", "auth/login", 200,
        {"email": "admin.final@cliniflow.com", "password": "admin123456"}
    )
    
    if success:
        user = response.get('user', {})
        required_fields = ['id', 'name', 'email', 'role', 'user_type', 'professional_id']
        missing = [f for f in required_fields if f not in user]
        if not missing:
            print(f"   ✅ Todos os campos presentes: user_type={user.get('user_type')}, professional_id={user.get('professional_id')}")
        else:
            print(f"   ❌ Campos ausentes: {missing}")
    
    # Test consultor login response
    success, response = tester.run_test(
        "Login Consultor - validar user_type",
        "POST", "auth/login", 200,
        {"email": "consultor.final@cliniflow.com", "password": "consultor123"}
    )
    
    if success:
        user = response.get('user', {})
        if user.get('user_type') == 'consultor':
            print(f"   ✅ Consultor user_type correto: {user.get('user_type')}")
        else:
            print(f"   ❌ Consultor user_type incorreto: {user.get('user_type')}")
    
    # Test profissional login response
    success, response = tester.run_test(
        "Login Profissional - validar user_type e professional_id",
        "POST", "auth/login", 200,
        {"email": "profissional.final@cliniflow.com", "password": "profissional123"}
    )
    
    if success:
        user = response.get('user', {})
        if user.get('user_type') == 'profissional' and user.get('professional_id'):
            print(f"   ✅ Profissional campos corretos: user_type={user.get('user_type')}, professional_id={user.get('professional_id')}")
        else:
            print(f"   ❌ Profissional campos incorretos: user_type={user.get('user_type')}, professional_id={user.get('professional_id')}")
    
    # 3. TESTE GERENCIAMENTO DE USUÁRIOS (APENAS ADMINS)
    print("\n3️⃣ TESTANDO GERENCIAMENTO DE USUÁRIOS (APENAS ADMINS)")
    print("-" * 50)
    
    # Admin list users
    success, response = tester.run_test(
        "GET /api/users - Admin listar usuários",
        "GET", "users", 200, token=tester.admin_token
    )
    
    if success and isinstance(response, list):
        print(f"   ✅ Admin listou {len(response)} usuários")
        user_types = [u.get('user_type') for u in response if u.get('id') in tester.created_users]
        print(f"   ✅ Tipos encontrados: {user_types}")
    
    # Admin update user
    if tester.created_users:
        user_id = tester.created_users[0]
        update_data = {
            "name": "Nome Atualizado",
            "user_type": "consultor",
            "professional_id": None
        }
        
        success, response = tester.run_test(
            "PUT /api/users/{id} - Admin atualizar usuário",
            "PUT", f"users/{user_id}", 200, update_data, tester.admin_token
        )
        
        if success:
            print("   ✅ Admin atualizou usuário com sucesso")
    
    # Admin delete user
    if len(tester.created_users) > 1:
        user_id = tester.created_users[-1]
        success, response = tester.run_test(
            "DELETE /api/users/{id} - Admin deletar usuário",
            "DELETE", f"users/{user_id}", 200, token=tester.admin_token
        )
        
        if success:
            print("   ✅ Admin deletou usuário com sucesso")
    
    # 4. TESTE VALIDAÇÃO DE PERMISSÕES (403 PARA NÃO-ADMINS)
    print("\n4️⃣ TESTANDO VALIDAÇÃO DE PERMISSÕES (403 PARA NÃO-ADMINS)")
    print("-" * 50)
    
    # Consultor try to access users
    success, response = tester.run_test(
        "GET /api/users - Consultor (deve retornar 403)",
        "GET", "users", 403, token=tester.consultor_token
    )
    
    if success:
        print("   ✅ Consultor corretamente negado acesso (403)")
    
    # Get fresh profissional token to avoid 401 issues
    success, login_response = tester.run_test(
        "Login Profissional Fresh Token",
        "POST", "auth/login", 200,
        {"email": "profissional.final@cliniflow.com", "password": "profissional123"}
    )
    
    if success:
        fresh_prof_token = login_response['access_token']
        
        # Profissional try to access users
        success, response = tester.run_test(
            "GET /api/users - Profissional (deve retornar 403)",
            "GET", "users", 403, token=fresh_prof_token
        )
        
        if success:
            print("   ✅ Profissional corretamente negado acesso (403)")
    
    # Consultor try to update user
    if tester.created_users:
        user_id = tester.created_users[0]
        update_data = {"name": "Tentativa Hacker", "user_type": "admin"}
        
        success, response = tester.run_test(
            "PUT /api/users/{id} - Consultor (deve retornar 403)",
            "PUT", f"users/{user_id}", 403, update_data, tester.consultor_token
        )
        
        if success:
            print("   ✅ Consultor corretamente negado atualização (403)")
    
    # RESULTADOS FINAIS
    print("\n" + "=" * 70)
    print(f"📊 RESULTADOS FINAIS DO TESTE")
    print(f"Testes executados: {tester.tests_run}")
    print(f"Testes aprovados: {tester.tests_passed}")
    print(f"Taxa de sucesso: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    if tester.failed_tests:
        print(f"\n❌ TESTES FALHARAM ({len(tester.failed_tests)}):")
        for i, test in enumerate(tester.failed_tests, 1):
            print(f"{i}. {test.get('test', 'Unknown')}")
            if 'error' in test:
                print(f"   Erro: {test['error']}")
            else:
                print(f"   Esperado: {test.get('expected')}, Recebido: {test.get('actual')}")
    else:
        print("\n🎉 TODOS OS TESTES PASSARAM!")
        print("✅ Sistema de permissões funcionando corretamente")
        print("✅ Campos user_type e professional_id implementados")
        print("✅ Gerenciamento de usuários restrito a admins")
        print("✅ Validação de permissões funcionando (403 para não-admins)")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())