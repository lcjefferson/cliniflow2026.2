import requests
import sys
import json
from datetime import datetime

class CliniFlowDeleteTester:
    def __init__(self, base_url="https://clinic-portal-9.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.user_id = None
        self.created_items = {}  # Store created items for deletion

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=10)

            # Handle multiple expected status codes
            if isinstance(expected_status, list):
                success = response.status_code in expected_status
            else:
                success = response.status_code == expected_status
                
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return True, response.json() if response.content else {}
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}")
                self.failed_tests.append({
                    "test": name,
                    "expected": expected_status,
                    "actual": response.status_code,
                    "response": response.text[:200]
                })
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.failed_tests.append({
                "test": name,
                "error": str(e)
            })
            return False, {}

    def authenticate_admin(self):
        """Authenticate as admin user"""
        # First try to register a new admin user
        register_data = {
            "name": "Admin Delete Test",
            "email": "admin.delete@cliniflow.com",
            "password": "admin123",
            "is_admin": True,
            "user_type": "admin"
        }
        
        # Try registration (might fail if user exists, that's ok)
        success, response = self.run_test(
            "Admin Registration for DELETE Tests",
            "POST",
            "auth/register",
            [200, 400],  # 400 if user already exists
            data=register_data
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_id = response.get('user', {}).get('id')
            print(f"   Admin token obtained from registration: {self.token[:20]}...")
            return True
        
        # If registration failed (user exists), try login
        success, response = self.run_test(
            "Admin Login for DELETE Tests",
            "POST",
            "auth/login",
            200,
            data={"email": "admin.delete@cliniflow.com", "password": "admin123"}
        )
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_id = response.get('user', {}).get('id')
            print(f"   Admin token obtained from login: {self.token[:20]}...")
            return True
        return False

    def test_delete_professional(self):
        """Test DELETE /api/professionals/{id}"""
        print("\n🔥 TESTING DELETE PROFESSIONAL ENDPOINT")
        
        # 1. Create a professional
        prof_data = {
            "name": "Dr. Maria Silva",
            "specialty": "Cardiologia",
            "email": "maria.silva@cliniflow.com",
            "phone": "(11) 98765-4321"
        }
        success, created_prof = self.run_test(
            "Create Professional for DELETE test", 
            "POST", 
            "professionals", 
            200, 
            prof_data
        )
        
        if not success or 'id' not in created_prof:
            print("❌ Cannot test DELETE - Professional creation failed")
            return False
        
        prof_id = created_prof['id']
        print(f"   Created professional with ID: {prof_id}")
        
        # 2. Confirm professional was created
        success, _ = self.run_test(
            "Confirm Professional exists before DELETE",
            "GET",
            "professionals",
            200
        )
        
        # 3. Delete the professional
        success, _ = self.run_test(
            "DELETE Professional",
            "DELETE",
            f"professionals/{prof_id}",
            200
        )
        
        if not success:
            return False
        
        # 4. Confirm professional was deleted (should not appear in list)
        success, professionals = self.run_test(
            "Confirm Professional deleted",
            "GET",
            "professionals",
            200
        )
        
        if success:
            # Check if the deleted professional is no longer in the list
            deleted_prof_exists = any(p.get('id') == prof_id for p in professionals)
            if deleted_prof_exists:
                print(f"❌ Professional {prof_id} still exists after DELETE")
                self.failed_tests.append({
                    "test": "Professional DELETE verification",
                    "error": "Professional still exists after deletion"
                })
                return False
            else:
                print(f"✅ Professional {prof_id} successfully removed from database")
        
        # 5. Test DELETE with non-existent ID
        success, _ = self.run_test(
            "DELETE Professional with invalid ID",
            "DELETE",
            "professionals/invalid-id-12345",
            404
        )
        
        return True

    def test_delete_service(self):
        """Test DELETE /api/services/{id}"""
        print("\n🔥 TESTING DELETE SERVICE ENDPOINT")
        
        # 1. Create a service
        service_data = {
            "name": "Consulta Cardiológica",
            "description": "Consulta especializada em cardiologia",
            "duration_minutes": 45,
            "price": 250.0
        }
        success, created_service = self.run_test(
            "Create Service for DELETE test",
            "POST",
            "services",
            200,
            service_data
        )
        
        if not success or 'id' not in created_service:
            print("❌ Cannot test DELETE - Service creation failed")
            return False
        
        service_id = created_service['id']
        print(f"   Created service with ID: {service_id}")
        
        # 2. Confirm service was created
        success, _ = self.run_test(
            "Confirm Service exists before DELETE",
            "GET",
            "services",
            200
        )
        
        # 3. Delete the service
        success, _ = self.run_test(
            "DELETE Service",
            "DELETE",
            f"services/{service_id}",
            200
        )
        
        if not success:
            return False
        
        # 4. Confirm service was deleted
        success, services = self.run_test(
            "Confirm Service deleted",
            "GET",
            "services",
            200
        )
        
        if success:
            deleted_service_exists = any(s.get('id') == service_id for s in services)
            if deleted_service_exists:
                print(f"❌ Service {service_id} still exists after DELETE")
                self.failed_tests.append({
                    "test": "Service DELETE verification",
                    "error": "Service still exists after deletion"
                })
                return False
            else:
                print(f"✅ Service {service_id} successfully removed from database")
        
        # 5. Test DELETE with non-existent ID
        success, _ = self.run_test(
            "DELETE Service with invalid ID",
            "DELETE",
            "services/invalid-id-12345",
            404
        )
        
        return True

    def test_delete_patient(self):
        """Test DELETE /api/patients/{id}"""
        print("\n🔥 TESTING DELETE PATIENT ENDPOINT")
        
        # 1. Create a patient
        patient_data = {
            "name": "João Santos",
            "email": "joao.santos@email.com",
            "phone": "(11) 91234-5678",
            "birthdate": "1985-03-15",
            "address": "Rua das Flores, 123, São Paulo"
        }
        success, created_patient = self.run_test(
            "Create Patient for DELETE test",
            "POST",
            "patients",
            200,
            patient_data
        )
        
        if not success or 'id' not in created_patient:
            print("❌ Cannot test DELETE - Patient creation failed")
            return False
        
        patient_id = created_patient['id']
        print(f"   Created patient with ID: {patient_id}")
        
        # 2. Confirm patient was created
        success, _ = self.run_test(
            "Confirm Patient exists before DELETE",
            "GET",
            f"patients/{patient_id}",
            200
        )
        
        # 3. Delete the patient
        success, _ = self.run_test(
            "DELETE Patient",
            "DELETE",
            f"patients/{patient_id}",
            200
        )
        
        if not success:
            return False
        
        # 4. Confirm patient was deleted (GET specific patient should return 404)
        success, _ = self.run_test(
            "Confirm Patient deleted (should return 404)",
            "GET",
            f"patients/{patient_id}",
            404
        )
        
        if not success:
            print(f"❌ Patient {patient_id} still accessible after DELETE")
            return False
        else:
            print(f"✅ Patient {patient_id} successfully removed from database")
        
        # 5. Test DELETE with non-existent ID
        success, _ = self.run_test(
            "DELETE Patient with invalid ID",
            "DELETE",
            "patients/invalid-id-12345",
            404
        )
        
        return True

    def test_delete_room(self):
        """Test DELETE /api/rooms/{id}"""
        print("\n🔥 TESTING DELETE ROOM ENDPOINT")
        
        # 1. Create a room
        room_data = {
            "name": "Sala de Consulta 5",
            "capacity": 3
        }
        success, created_room = self.run_test(
            "Create Room for DELETE test",
            "POST",
            "rooms",
            200,
            room_data
        )
        
        if not success or 'id' not in created_room:
            print("❌ Cannot test DELETE - Room creation failed")
            return False
        
        room_id = created_room['id']
        print(f"   Created room with ID: {room_id}")
        
        # 2. Confirm room was created
        success, _ = self.run_test(
            "Confirm Room exists before DELETE",
            "GET",
            "rooms",
            200
        )
        
        # 3. Delete the room
        success, _ = self.run_test(
            "DELETE Room",
            "DELETE",
            f"rooms/{room_id}",
            200
        )
        
        if not success:
            return False
        
        # 4. Confirm room was deleted
        success, rooms = self.run_test(
            "Confirm Room deleted",
            "GET",
            "rooms",
            200
        )
        
        if success:
            deleted_room_exists = any(r.get('id') == room_id for r in rooms)
            if deleted_room_exists:
                print(f"❌ Room {room_id} still exists after DELETE")
                self.failed_tests.append({
                    "test": "Room DELETE verification",
                    "error": "Room still exists after deletion"
                })
                return False
            else:
                print(f"✅ Room {room_id} successfully removed from database")
        
        # 5. Test DELETE with non-existent ID
        success, _ = self.run_test(
            "DELETE Room with invalid ID",
            "DELETE",
            "rooms/invalid-id-12345",
            404
        )
        
        return True

    def test_delete_appointment(self):
        """Test DELETE /api/appointments/{id}"""
        print("\n🔥 TESTING DELETE APPOINTMENT ENDPOINT")
        
        # First, we need to create dependencies: patient, professional, service, room
        # Create patient
        patient_data = {
            "name": "Ana Costa",
            "email": "ana.costa@email.com",
            "phone": "(11) 95555-5555",
            "birthdate": "1990-07-20",
            "address": "Av. Paulista, 1000"
        }
        success, patient = self.run_test("Create Patient for Appointment", "POST", "patients", 200, patient_data)
        if not success:
            print("❌ Cannot create appointment - Patient creation failed")
            return False
        
        # Create professional
        prof_data = {
            "name": "Dr. Carlos Mendes",
            "specialty": "Clínico Geral",
            "email": "carlos.mendes@cliniflow.com",
            "phone": "(11) 94444-4444"
        }
        success, professional = self.run_test("Create Professional for Appointment", "POST", "professionals", 200, prof_data)
        if not success:
            print("❌ Cannot create appointment - Professional creation failed")
            return False
        
        # Create service
        service_data = {
            "name": "Consulta Geral",
            "description": "Consulta clínica geral",
            "duration_minutes": 30,
            "price": 120.0
        }
        success, service = self.run_test("Create Service for Appointment", "POST", "services", 200, service_data)
        if not success:
            print("❌ Cannot create appointment - Service creation failed")
            return False
        
        # Create room
        room_data = {
            "name": "Consultório 1",
            "capacity": 2
        }
        success, room = self.run_test("Create Room for Appointment", "POST", "rooms", 200, room_data)
        if not success:
            print("❌ Cannot create appointment - Room creation failed")
            return False
        
        # 1. Create appointment
        appointment_data = {
            "patient_id": patient['id'],
            "professional_id": professional['id'],
            "service_id": service['id'],
            "room_id": room['id'],
            "appointment_date": "2024-12-30",
            "appointment_time": "14:00",
            "notes": "Consulta de rotina"
        }
        success, created_appointment = self.run_test(
            "Create Appointment for DELETE test",
            "POST",
            "appointments",
            200,
            appointment_data
        )
        
        if not success or 'id' not in created_appointment:
            print("❌ Cannot test DELETE - Appointment creation failed")
            return False
        
        appointment_id = created_appointment['id']
        print(f"   Created appointment with ID: {appointment_id}")
        
        # 2. Confirm appointment was created
        success, _ = self.run_test(
            "Confirm Appointment exists before DELETE",
            "GET",
            "appointments",
            200
        )
        
        # 3. Delete the appointment
        success, _ = self.run_test(
            "DELETE Appointment",
            "DELETE",
            f"appointments/{appointment_id}",
            200
        )
        
        if not success:
            return False
        
        # 4. Confirm appointment was deleted
        success, appointments = self.run_test(
            "Confirm Appointment deleted",
            "GET",
            "appointments",
            200
        )
        
        if success:
            deleted_appointment_exists = any(a.get('id') == appointment_id for a in appointments)
            if deleted_appointment_exists:
                print(f"❌ Appointment {appointment_id} still exists after DELETE")
                self.failed_tests.append({
                    "test": "Appointment DELETE verification",
                    "error": "Appointment still exists after deletion"
                })
                return False
            else:
                print(f"✅ Appointment {appointment_id} successfully removed from database")
        
        # 5. Test DELETE with non-existent ID
        success, _ = self.run_test(
            "DELETE Appointment with invalid ID",
            "DELETE",
            "appointments/invalid-id-12345",
            404
        )
        
        return True

    def test_delete_lead(self):
        """Test DELETE /api/leads/{id}"""
        print("\n🔥 TESTING DELETE LEAD ENDPOINT")
        
        # 1. Create a lead
        lead_data = {
            "name": "Pedro Oliveira",
            "phone": "(11) 96666-6666",
            "email": "pedro.oliveira@email.com",
            "source": "whatsapp",
            "status": "new",
            "notes": "Interessado em consulta cardiológica"
        }
        success, created_lead = self.run_test(
            "Create Lead for DELETE test",
            "POST",
            "leads",
            200,
            lead_data
        )
        
        if not success or 'id' not in created_lead:
            print("❌ Cannot test DELETE - Lead creation failed")
            return False
        
        lead_id = created_lead['id']
        print(f"   Created lead with ID: {lead_id}")
        
        # 2. Confirm lead was created
        success, _ = self.run_test(
            "Confirm Lead exists before DELETE",
            "GET",
            "leads",
            200
        )
        
        # 3. Delete the lead
        success, _ = self.run_test(
            "DELETE Lead",
            "DELETE",
            f"leads/{lead_id}",
            200
        )
        
        if not success:
            return False
        
        # 4. Confirm lead was deleted
        success, leads = self.run_test(
            "Confirm Lead deleted",
            "GET",
            "leads",
            200
        )
        
        if success:
            deleted_lead_exists = any(l.get('id') == lead_id for l in leads)
            if deleted_lead_exists:
                print(f"❌ Lead {lead_id} still exists after DELETE")
                self.failed_tests.append({
                    "test": "Lead DELETE verification",
                    "error": "Lead still exists after deletion"
                })
                return False
            else:
                print(f"✅ Lead {lead_id} successfully removed from database")
        
        # 5. Test DELETE with non-existent ID
        success, _ = self.run_test(
            "DELETE Lead with invalid ID",
            "DELETE",
            "leads/invalid-id-12345",
            404
        )
        
        return True

    def test_delete_user(self):
        """Test DELETE /api/users/{id} (admin only)"""
        print("\n🔥 TESTING DELETE USER ENDPOINT")
        
        # 1. Create a regular user
        user_data = {
            "name": "Usuário Teste",
            "email": "usuario.teste@cliniflow.com",
            "password": "senha123",
            "is_admin": False,
            "user_type": "consultor"
        }
        success, created_user = self.run_test(
            "Create User for DELETE test",
            "POST",
            "auth/register",
            200,
            user_data
        )
        
        if not success or 'user' not in created_user or 'id' not in created_user['user']:
            print("❌ Cannot test DELETE - User creation failed")
            return False
        
        user_id = created_user['user']['id']
        print(f"   Created user with ID: {user_id}")
        
        # 2. Confirm user was created (list users - admin only)
        success, _ = self.run_test(
            "Confirm User exists before DELETE",
            "GET",
            "users",
            200
        )
        
        # 3. Delete the user (admin only)
        success, _ = self.run_test(
            "DELETE User (admin only)",
            "DELETE",
            f"users/{user_id}",
            200
        )
        
        if not success:
            return False
        
        # 4. Confirm user was deleted
        success, users = self.run_test(
            "Confirm User deleted",
            "GET",
            "users",
            200
        )
        
        if success:
            deleted_user_exists = any(u.get('id') == user_id for u in users)
            if deleted_user_exists:
                print(f"❌ User {user_id} still exists after DELETE")
                self.failed_tests.append({
                    "test": "User DELETE verification",
                    "error": "User still exists after deletion"
                })
                return False
            else:
                print(f"✅ User {user_id} successfully removed from database")
        
        # 5. Test DELETE with non-existent ID
        success, _ = self.run_test(
            "DELETE User with invalid ID",
            "DELETE",
            "users/invalid-id-12345",
            404
        )
        
        return True

    def test_delete_medical_record(self):
        """Test DELETE /api/medical-records/{id}"""
        print("\n🔥 TESTING DELETE MEDICAL RECORD ENDPOINT")
        
        # First create dependencies: patient, professional, appointment
        # Create patient
        patient_data = {
            "name": "Lucia Ferreira",
            "email": "lucia.ferreira@email.com",
            "phone": "(11) 97777-7777",
            "birthdate": "1988-11-10",
            "address": "Rua da Saúde, 456"
        }
        success, patient = self.run_test("Create Patient for Medical Record", "POST", "patients", 200, patient_data)
        if not success:
            return False
        
        # Create professional
        prof_data = {
            "name": "Dra. Fernanda Lima",
            "specialty": "Dermatologia",
            "email": "fernanda.lima@cliniflow.com",
            "phone": "(11) 98888-8888"
        }
        success, professional = self.run_test("Create Professional for Medical Record", "POST", "professionals", 200, prof_data)
        if not success:
            return False
        
        # Create service and room for appointment
        service_data = {
            "name": "Consulta Dermatológica",
            "description": "Avaliação dermatológica",
            "duration_minutes": 40,
            "price": 180.0
        }
        success, service = self.run_test("Create Service for Medical Record", "POST", "services", 200, service_data)
        if not success:
            return False
        
        room_data = {
            "name": "Consultório Dermatologia",
            "capacity": 2
        }
        success, room = self.run_test("Create Room for Medical Record", "POST", "rooms", 200, room_data)
        if not success:
            return False
        
        # Create appointment
        appointment_data = {
            "patient_id": patient['id'],
            "professional_id": professional['id'],
            "service_id": service['id'],
            "room_id": room['id'],
            "appointment_date": "2024-12-29",
            "appointment_time": "10:00"
        }
        success, appointment = self.run_test("Create Appointment for Medical Record", "POST", "appointments", 200, appointment_data)
        if not success:
            return False
        
        # 1. Create medical record
        record_data = {
            "patient_id": patient['id'],
            "professional_id": professional['id'],
            "appointment_id": appointment['id'],
            "diagnosis": "Dermatite seborreica",
            "treatment": "Aplicação de pomada antifúngica",
            "prescription": "Cetoconazol creme 2% - aplicar 2x ao dia"
        }
        success, created_record = self.run_test(
            "Create Medical Record for DELETE test",
            "POST",
            "medical-records",
            200,
            record_data
        )
        
        if not success or 'id' not in created_record:
            print("❌ Cannot test DELETE - Medical Record creation failed")
            return False
        
        record_id = created_record['id']
        print(f"   Created medical record with ID: {record_id}")
        
        # 2. Confirm medical record was created
        success, _ = self.run_test(
            "Confirm Medical Record exists before DELETE",
            "GET",
            f"medical-records/patient/{patient['id']}",
            200
        )
        
        # 3. Delete the medical record
        success, _ = self.run_test(
            "DELETE Medical Record",
            "DELETE",
            f"medical-records/{record_id}",
            200
        )
        
        if not success:
            return False
        
        # 4. Confirm medical record was deleted
        success, records = self.run_test(
            "Confirm Medical Record deleted",
            "GET",
            f"medical-records/patient/{patient['id']}",
            200
        )
        
        if success:
            deleted_record_exists = any(r.get('id') == record_id for r in records)
            if deleted_record_exists:
                print(f"❌ Medical Record {record_id} still exists after DELETE")
                self.failed_tests.append({
                    "test": "Medical Record DELETE verification",
                    "error": "Medical Record still exists after deletion"
                })
                return False
            else:
                print(f"✅ Medical Record {record_id} successfully removed from database")
        
        # 5. Test DELETE with non-existent ID
        success, _ = self.run_test(
            "DELETE Medical Record with invalid ID",
            "DELETE",
            "medical-records/invalid-id-12345",
            404
        )
        
        return True

    def test_delete_followup(self):
        """Test DELETE /api/followups/{id}"""
        print("\n🔥 TESTING DELETE FOLLOWUP ENDPOINT")
        
        # First create a lead for the followup
        lead_data = {
            "name": "Roberto Silva",
            "phone": "(11) 99999-9999",
            "email": "roberto.silva@email.com",
            "source": "instagram",
            "status": "hot"
        }
        success, lead = self.run_test("Create Lead for FollowUp", "POST", "leads", 200, lead_data)
        if not success:
            return False
        
        # 1. Create followup
        followup_data = {
            "lead_id": lead['id'],
            "assigned_to": self.user_id,
            "scheduled_date": "2024-12-31",
            "notes": "Ligar para agendar consulta"
        }
        success, created_followup = self.run_test(
            "Create FollowUp for DELETE test",
            "POST",
            "followups",
            200,
            followup_data
        )
        
        if not success or 'id' not in created_followup:
            print("❌ Cannot test DELETE - FollowUp creation failed")
            return False
        
        followup_id = created_followup['id']
        print(f"   Created followup with ID: {followup_id}")
        
        # 2. Confirm followup was created
        success, _ = self.run_test(
            "Confirm FollowUp exists before DELETE",
            "GET",
            "followups",
            200
        )
        
        # 3. Delete the followup
        success, _ = self.run_test(
            "DELETE FollowUp",
            "DELETE",
            f"followups/{followup_id}",
            200
        )
        
        if not success:
            return False
        
        # 4. Confirm followup was deleted
        success, followups = self.run_test(
            "Confirm FollowUp deleted",
            "GET",
            "followups",
            200
        )
        
        if success:
            deleted_followup_exists = any(f.get('id') == followup_id for f in followups)
            if deleted_followup_exists:
                print(f"❌ FollowUp {followup_id} still exists after DELETE")
                self.failed_tests.append({
                    "test": "FollowUp DELETE verification",
                    "error": "FollowUp still exists after deletion"
                })
                return False
            else:
                print(f"✅ FollowUp {followup_id} successfully removed from database")
        
        # 5. Test DELETE with non-existent ID
        success, _ = self.run_test(
            "DELETE FollowUp with invalid ID",
            "DELETE",
            "followups/invalid-id-12345",
            404
        )
        
        return True

def main():
    print("🔥 CliniFlow DELETE Endpoints Testing Suite")
    print("=" * 60)
    
    tester = CliniFlowDeleteTester()
    
    # Test authentication first
    if not tester.authenticate_admin():
        print("❌ Admin authentication failed, stopping tests")
        return 1
    
    print(f"\n✅ Admin authentication successful! User ID: {tester.user_id}")
    
    # Run all DELETE tests
    delete_tests = [
        ("DELETE Professionals", tester.test_delete_professional),
        ("DELETE Services", tester.test_delete_service),
        ("DELETE Patients", tester.test_delete_patient),
        ("DELETE Rooms", tester.test_delete_room),
        ("DELETE Appointments", tester.test_delete_appointment),
        ("DELETE Leads", tester.test_delete_lead),
        ("DELETE Users", tester.test_delete_user),
        ("DELETE Medical Records", tester.test_delete_medical_record),
        ("DELETE FollowUps", tester.test_delete_followup),
    ]
    
    successful_deletes = 0
    
    for test_name, test_func in delete_tests:
        print(f"\n{'='*60}")
        print(f"🎯 {test_name}")
        print(f"{'='*60}")
        
        try:
            if test_func():
                successful_deletes += 1
                print(f"✅ {test_name} - ALL TESTS PASSED")
            else:
                print(f"❌ {test_name} - SOME TESTS FAILED")
        except Exception as e:
            print(f"❌ {test_name} - ERROR: {str(e)}")
    
    # Print final results
    print("\n" + "=" * 60)
    print(f"🔥 DELETE ENDPOINTS FINAL RESULTS")
    print("=" * 60)
    print(f"DELETE endpoints working: {successful_deletes}/{len(delete_tests)}")
    print(f"Individual tests passed: {tester.tests_passed}/{tester.tests_run}")
    print(f"Success rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    if tester.failed_tests:
        print(f"\n❌ Failed Tests ({len(tester.failed_tests)}):")
        for i, test in enumerate(tester.failed_tests, 1):
            print(f"{i}. {test.get('test', 'Unknown')}")
            if 'error' in test:
                print(f"   Error: {test['error']}")
            else:
                print(f"   Expected: {test.get('expected')}, Got: {test.get('actual')}")
    else:
        print("\n🎉 ALL DELETE ENDPOINTS ARE WORKING PERFECTLY!")
    
    return 0 if successful_deletes == len(delete_tests) else 1

if __name__ == "__main__":
    sys.exit(main())