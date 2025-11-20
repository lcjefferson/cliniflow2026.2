import requests
import json
from datetime import datetime, timedelta

class DetailedCliniFlowTester:
    def __init__(self, base_url="https://clinic-portal-9.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.created_ids = {
            'professional': None,
            'service': None,
            'patient': None,
            'room': None,
            'appointment': None
        }

    def authenticate(self):
        """Register and login to get token"""
        # Try to register admin user
        register_data = {
            "name": "Admin Teste",
            "email": "admin.teste@cliniflow.com",
            "password": "senha123",
            "is_admin": True
        }
        
        try:
            response = requests.post(f"{self.base_url}/auth/register", json=register_data)
            if response.status_code == 200:
                data = response.json()
                self.token = data['access_token']
                self.user_id = data['user']['id']
                print("✅ Usuário registrado e autenticado com sucesso")
                return True
        except:
            pass
        
        # If registration failed, try login
        login_data = {
            "email": "admin.teste@cliniflow.com",
            "password": "senha123"
        }
        
        try:
            response = requests.post(f"{self.base_url}/auth/login", json=login_data)
            if response.status_code == 200:
                data = response.json()
                self.token = data['access_token']
                self.user_id = data['user']['id']
                print("✅ Login realizado com sucesso")
                return True
        except Exception as e:
            print(f"❌ Erro na autenticação: {e}")
            return False
        
        return False

    def make_request(self, method, endpoint, data=None):
        """Make authenticated request"""
        url = f"{self.base_url}/{endpoint}"
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.token}'
        }
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)
            
            return response
        except Exception as e:
            print(f"❌ Erro na requisição {method} {endpoint}: {e}")
            return None

    def test_authentication_endpoints(self):
        """Test authentication endpoints thoroughly"""
        print("\n🔐 TESTANDO AUTENTICAÇÃO")
        print("-" * 40)
        
        # Test registration with different scenarios
        test_cases = [
            {
                "name": "Registro usuário comum",
                "data": {
                    "name": "João Silva",
                    "email": "joao.silva@test.com",
                    "password": "senha123",
                    "is_admin": False
                },
                "expected": 200
            },
            {
                "name": "Registro email duplicado",
                "data": {
                    "name": "João Silva 2",
                    "email": "joao.silva@test.com",
                    "password": "senha123",
                    "is_admin": False
                },
                "expected": 400
            }
        ]
        
        for test in test_cases:
            response = requests.post(f"{self.base_url}/auth/register", json=test["data"])
            status = "✅" if response.status_code == test["expected"] else "❌"
            print(f"{status} {test['name']}: {response.status_code}")
        
        # Test login scenarios
        login_tests = [
            {
                "name": "Login válido",
                "data": {"email": "joao.silva@test.com", "password": "senha123"},
                "expected": 200
            },
            {
                "name": "Login senha incorreta",
                "data": {"email": "joao.silva@test.com", "password": "senhaerrada"},
                "expected": 401
            },
            {
                "name": "Login email inexistente",
                "data": {"email": "naoexiste@test.com", "password": "senha123"},
                "expected": 401
            }
        ]
        
        for test in login_tests:
            response = requests.post(f"{self.base_url}/auth/login", json=test["data"])
            status = "✅" if response.status_code == test["expected"] else "❌"
            print(f"{status} {test['name']}: {response.status_code}")

    def test_professionals_complete(self):
        """Test professionals endpoints completely"""
        print("\n👨‍⚕️ TESTANDO PROFISSIONAIS")
        print("-" * 40)
        
        # Create professional
        prof_data = {
            "name": "Dr. Maria Santos",
            "specialty": "Cardiologia",
            "email": "maria.santos@clinica.com",
            "phone": "(11) 99999-1234"
        }
        
        response = self.make_request('POST', 'professionals', prof_data)
        if response and response.status_code == 200:
            prof = response.json()
            self.created_ids['professional'] = prof['id']
            print(f"✅ Profissional criado: {prof['name']} (ID: {prof['id']})")
            
            # Test GET all
            response = self.make_request('GET', 'professionals')
            if response and response.status_code == 200:
                professionals = response.json()
                print(f"✅ Lista de profissionais obtida: {len(professionals)} encontrados")
            
            # Test UPDATE
            updated_data = prof_data.copy()
            updated_data['specialty'] = "Neurologia"
            response = self.make_request('PUT', f'professionals/{prof["id"]}', updated_data)
            if response and response.status_code == 200:
                print("✅ Profissional atualizado com sucesso")
            
            # Test DELETE
            response = self.make_request('DELETE', f'professionals/{prof["id"]}')
            if response and response.status_code == 200:
                print("✅ Profissional deletado com sucesso")
        else:
            print("❌ Falha ao criar profissional")

    def test_services_complete(self):
        """Test services endpoints completely"""
        print("\n🏥 TESTANDO SERVIÇOS")
        print("-" * 40)
        
        # Create service
        service_data = {
            "name": "Consulta Cardiológica",
            "description": "Consulta completa com cardiologista especializado",
            "duration_minutes": 45,
            "price": 250.00
        }
        
        response = self.make_request('POST', 'services', service_data)
        if response and response.status_code == 200:
            service = response.json()
            self.created_ids['service'] = service['id']
            print(f"✅ Serviço criado: {service['name']} - R$ {service['price']}")
            
            # Test GET all
            response = self.make_request('GET', 'services')
            if response and response.status_code == 200:
                services = response.json()
                print(f"✅ Lista de serviços obtida: {len(services)} encontrados")
            
            # Test UPDATE
            updated_data = service_data.copy()
            updated_data['price'] = 300.00
            response = self.make_request('PUT', f'services/{service["id"]}', updated_data)
            if response and response.status_code == 200:
                print("✅ Serviço atualizado com sucesso")
            
            # Test DELETE
            response = self.make_request('DELETE', f'services/{service["id"]}')
            if response and response.status_code == 200:
                print("✅ Serviço deletado com sucesso")
        else:
            print("❌ Falha ao criar serviço")

    def test_patients_complete(self):
        """Test patients endpoints completely"""
        print("\n👤 TESTANDO PACIENTES")
        print("-" * 40)
        
        # Create patient
        patient_data = {
            "name": "Ana Costa",
            "email": "ana.costa@email.com",
            "phone": "(11) 88888-5678",
            "birthdate": "1985-03-15",
            "address": "Rua das Flores, 123 - São Paulo/SP"
        }
        
        response = self.make_request('POST', 'patients', patient_data)
        if response and response.status_code == 200:
            patient = response.json()
            self.created_ids['patient'] = patient['id']
            print(f"✅ Paciente criado: {patient['name']} (ID: {patient['id']})")
            
            # Test GET all
            response = self.make_request('GET', 'patients')
            if response and response.status_code == 200:
                patients = response.json()
                print(f"✅ Lista de pacientes obtida: {len(patients)} encontrados")
            
            # Test GET specific patient
            response = self.make_request('GET', f'patients/{patient["id"]}')
            if response and response.status_code == 200:
                specific_patient = response.json()
                print(f"✅ Paciente específico obtido: {specific_patient['name']}")
            
            return patient['id']
        else:
            print("❌ Falha ao criar paciente")
            return None

    def test_rooms_complete(self):
        """Test rooms endpoints completely"""
        print("\n🏢 TESTANDO SALAS")
        print("-" * 40)
        
        # Create room
        room_data = {
            "name": "Sala de Consulta 1",
            "capacity": 3
        }
        
        response = self.make_request('POST', 'rooms', room_data)
        if response and response.status_code == 200:
            room = response.json()
            self.created_ids['room'] = room['id']
            print(f"✅ Sala criada: {room['name']} (Capacidade: {room['capacity']})")
            
            # Test GET all
            response = self.make_request('GET', 'rooms')
            if response and response.status_code == 200:
                rooms = response.json()
                print(f"✅ Lista de salas obtida: {len(rooms)} encontradas")
            
            return room['id']
        else:
            print("❌ Falha ao criar sala")
            return None

    def test_appointments_complete(self):
        """Test appointments endpoints completely"""
        print("\n📅 TESTANDO AGENDAMENTOS")
        print("-" * 40)
        
        # First create dependencies
        patient_id = self.test_patients_complete()
        room_id = self.test_rooms_complete()
        
        # Create professional and service for appointment
        prof_data = {
            "name": "Dr. Carlos Oliveira",
            "specialty": "Clínico Geral",
            "email": "carlos.oliveira@clinica.com",
            "phone": "(11) 99999-9999"
        }
        response = self.make_request('POST', 'professionals', prof_data)
        professional_id = response.json()['id'] if response and response.status_code == 200 else None
        
        service_data = {
            "name": "Consulta Geral",
            "description": "Consulta clínica geral",
            "duration_minutes": 30,
            "price": 150.00
        }
        response = self.make_request('POST', 'services', service_data)
        service_id = response.json()['id'] if response and response.status_code == 200 else None
        
        if all([patient_id, professional_id, service_id, room_id]):
            # Create appointment
            tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
            appointment_data = {
                "patient_id": patient_id,
                "professional_id": professional_id,
                "service_id": service_id,
                "room_id": room_id,
                "appointment_date": tomorrow,
                "appointment_time": "14:30",
                "notes": "Consulta de rotina"
            }
            
            response = self.make_request('POST', 'appointments', appointment_data)
            if response and response.status_code == 200:
                appointment = response.json()
                print(f"✅ Agendamento criado para {appointment['appointment_date']} às {appointment['appointment_time']}")
                
                # Test GET all appointments
                response = self.make_request('GET', 'appointments')
                if response and response.status_code == 200:
                    appointments = response.json()
                    print(f"✅ Lista de agendamentos obtida: {len(appointments)} encontrados")
                
                # Test GET appointments by date
                response = self.make_request('GET', f'appointments?date={tomorrow}')
                if response and response.status_code == 200:
                    date_appointments = response.json()
                    print(f"✅ Agendamentos por data obtidos: {len(date_appointments)} para {tomorrow}")
                
                # Test update appointment status
                response = self.make_request('PUT', f'appointments/{appointment["id"]}?status=confirmed')
                if response and response.status_code == 200:
                    print("✅ Status do agendamento atualizado")
            else:
                print("❌ Falha ao criar agendamento")
        else:
            print("❌ Falha ao criar dependências para agendamento")

    def test_unauthorized_access(self):
        """Test endpoints without authentication"""
        print("\n🚫 TESTANDO ACESSO NÃO AUTORIZADO")
        print("-" * 40)
        
        # Save current token
        original_token = self.token
        self.token = None
        
        endpoints_to_test = [
            'professionals',
            'services',
            'patients',
            'appointments',
            'rooms'
        ]
        
        for endpoint in endpoints_to_test:
            response = self.make_request('GET', endpoint)
            if response and response.status_code == 401:
                print(f"✅ {endpoint}: Acesso negado corretamente (401)")
            else:
                print(f"❌ {endpoint}: Deveria retornar 401, retornou {response.status_code if response else 'erro'}")
        
        # Restore token
        self.token = original_token

    def run_all_tests(self):
        """Run all comprehensive tests"""
        print("🏥 TESTE COMPLETO DO BACKEND CLINIFLOW")
        print("=" * 50)
        
        if not self.authenticate():
            print("❌ Falha na autenticação. Parando testes.")
            return False
        
        self.test_authentication_endpoints()
        self.test_unauthorized_access()
        self.test_professionals_complete()
        self.test_services_complete()
        self.test_patients_complete()
        self.test_rooms_complete()
        self.test_appointments_complete()
        
        print("\n" + "=" * 50)
        print("✅ TODOS OS TESTES CONCLUÍDOS")
        return True

if __name__ == "__main__":
    tester = DetailedCliniFlowTester()
    tester.run_all_tests()