import requests
import json

class EdgeCaseTester:
    def __init__(self):
        self.base_url = "https://medmanage-47.preview.emergentagent.com/api"
        self.token = None
        
    def authenticate(self):
        """Get authentication token"""
        login_data = {"email": "admin@cliniflow.com", "password": "admin123"}
        response = requests.post(f"{self.base_url}/auth/login", json=login_data)
        if response.status_code == 200:
            self.token = response.json()['access_token']
            return True
        return False
    
    def make_request(self, method, endpoint, data=None):
        """Make authenticated request"""
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.token}'
        }
        
        url = f"{self.base_url}/{endpoint}"
        if method == 'GET':
            return requests.get(url, headers=headers)
        elif method == 'POST':
            return requests.post(url, json=data, headers=headers)
        elif method == 'PUT':
            return requests.put(url, json=data, headers=headers)
        elif method == 'DELETE':
            return requests.delete(url, headers=headers)
    
    def test_invalid_data(self):
        """Test endpoints with invalid data"""
        print("\n🧪 TESTANDO DADOS INVÁLIDOS")
        print("-" * 40)
        
        # Test invalid professional data
        invalid_prof = {"name": "", "specialty": "", "email": "invalid-email", "phone": ""}
        response = self.make_request('POST', 'professionals', invalid_prof)
        print(f"Profissional inválido: {response.status_code} - {'✅' if response.status_code == 422 else '❌'}")
        
        # Test invalid service data
        invalid_service = {"name": "", "duration_minutes": -1, "price": -100}
        response = self.make_request('POST', 'services', invalid_service)
        print(f"Serviço inválido: {response.status_code} - {'✅' if response.status_code == 422 else '❌'}")
        
        # Test invalid patient data
        invalid_patient = {"name": "", "email": "invalid", "phone": "", "birthdate": "invalid-date"}
        response = self.make_request('POST', 'patients', invalid_patient)
        print(f"Paciente inválido: {response.status_code} - {'✅' if response.status_code == 422 else '❌'}")
    
    def test_not_found_scenarios(self):
        """Test 404 scenarios"""
        print("\n🔍 TESTANDO CENÁRIOS 404")
        print("-" * 40)
        
        fake_id = "00000000-0000-0000-0000-000000000000"
        
        # Test get non-existent patient
        response = self.make_request('GET', f'patients/{fake_id}')
        print(f"Paciente inexistente: {response.status_code} - {'✅' if response.status_code == 404 else '❌'}")
        
        # Test update non-existent professional
        update_data = {"name": "Test", "specialty": "Test", "email": "test@test.com", "phone": "123"}
        response = self.make_request('PUT', f'professionals/{fake_id}', update_data)
        print(f"Atualizar profissional inexistente: {response.status_code} - {'✅' if response.status_code == 404 else '❌'}")
        
        # Test delete non-existent service
        response = self.make_request('DELETE', f'services/{fake_id}')
        print(f"Deletar serviço inexistente: {response.status_code} - {'✅' if response.status_code == 404 else '❌'}")
    
    def test_appointment_edge_cases(self):
        """Test appointment edge cases"""
        print("\n📅 TESTANDO CASOS EXTREMOS DE AGENDAMENTO")
        print("-" * 40)
        
        # Test appointment with non-existent IDs
        fake_id = "00000000-0000-0000-0000-000000000000"
        appointment_data = {
            "patient_id": fake_id,
            "professional_id": fake_id,
            "service_id": fake_id,
            "room_id": fake_id,
            "appointment_date": "2024-12-31",
            "appointment_time": "10:00"
        }
        
        response = self.make_request('POST', 'appointments', appointment_data)
        print(f"Agendamento com IDs inexistentes: {response.status_code} - {'✅' if response.status_code in [200, 400, 422] else '❌'}")
        
        # Test invalid date format
        invalid_appointment = appointment_data.copy()
        invalid_appointment['appointment_date'] = "invalid-date"
        response = self.make_request('POST', 'appointments', invalid_appointment)
        print(f"Agendamento com data inválida: {response.status_code} - {'✅' if response.status_code == 422 else '❌'}")
    
    def test_authentication_edge_cases(self):
        """Test authentication edge cases"""
        print("\n🔐 TESTANDO CASOS EXTREMOS DE AUTENTICAÇÃO")
        print("-" * 40)
        
        # Test with invalid token
        headers = {'Authorization': 'Bearer invalid-token', 'Content-Type': 'application/json'}
        response = requests.get(f"{self.base_url}/professionals", headers=headers)
        print(f"Token inválido: {response.status_code} - {'✅' if response.status_code in [401, 403] else '❌'}")
        
        # Test with expired token format
        headers = {'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c', 'Content-Type': 'application/json'}
        response = requests.get(f"{self.base_url}/professionals", headers=headers)
        print(f"Token expirado/inválido: {response.status_code} - {'✅' if response.status_code in [401, 403] else '❌'}")
    
    def test_ai_integration(self):
        """Test AI integration endpoints"""
        print("\n🤖 TESTANDO INTEGRAÇÃO COM IA")
        print("-" * 40)
        
        # Test auto message with invalid patient
        auto_msg_data = {
            "patient_id": "00000000-0000-0000-0000-000000000000",
            "message_type": "birthday"
        }
        response = self.make_request('POST', 'auto-messages/send', auto_msg_data)
        print(f"Mensagem automática - paciente inexistente: {response.status_code} - {'✅' if response.status_code == 404 else '❌'}")
        
        # Test document generation with invalid record
        doc_data = {
            "record_id": "00000000-0000-0000-0000-000000000000",
            "document_type": "prescription"
        }
        response = self.make_request('POST', 'medical-records/generate-document', doc_data)
        print(f"Geração de documento - prontuário inexistente: {response.status_code} - {'✅' if response.status_code == 404 else '❌'}")
    
    def run_all_tests(self):
        """Run all edge case tests"""
        print("🧪 TESTE DE CASOS EXTREMOS - CLINIFLOW")
        print("=" * 50)
        
        if not self.authenticate():
            print("❌ Falha na autenticação")
            return False
        
        self.test_invalid_data()
        self.test_not_found_scenarios()
        self.test_appointment_edge_cases()
        self.test_authentication_edge_cases()
        self.test_ai_integration()
        
        print("\n" + "=" * 50)
        print("✅ TESTES DE CASOS EXTREMOS CONCLUÍDOS")

if __name__ == "__main__":
    tester = EdgeCaseTester()
    tester.run_all_tests()