import requests
import sys
import json
from datetime import datetime

class CliniFlowAPITester:
    def __init__(self, base_url="https://cliniflow-1.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.user_id = None

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

    def test_register_and_login(self):
        """Test user registration and login"""
        # First try to register a new admin user
        register_data = {
            "name": "Admin Test",
            "email": "admin@cliniflow.com",
            "password": "admin123",
            "is_admin": True
        }
        
        # Try registration (might fail if user exists, that's ok)
        success, response = self.run_test(
            "Admin Registration",
            "POST",
            "auth/register",
            [200, 400],  # 400 if user already exists
            data=register_data
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_id = response.get('user', {}).get('id')
            print(f"   Token obtained from registration: {self.token[:20]}...")
            return True
        
        # If registration failed (user exists), try login
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={"email": "admin@cliniflow.com", "password": "admin123"}
        )
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_id = response.get('user', {}).get('id')
            print(f"   Token obtained from login: {self.token[:20]}...")
            return True
        return False

    def test_dashboard_stats(self):
        """Test dashboard statistics endpoints"""
        self.run_test("Dashboard Appointments Stats", "GET", "dashboard/appointments", 200)
        self.run_test("Dashboard Leads Stats", "GET", "dashboard/leads", 200)
        self.run_test("Dashboard Revenue Stats", "GET", "dashboard/revenue", 200)

    def test_professionals_crud(self):
        """Test professionals CRUD operations"""
        # Get professionals
        success, professionals = self.run_test("Get Professionals", "GET", "professionals", 200)
        
        # Create professional
        prof_data = {
            "name": "Dr. Test Professional",
            "specialty": "Cardiologia",
            "email": "test.prof@test.com",
            "phone": "(11) 99999-9999"
        }
        success, created_prof = self.run_test("Create Professional", "POST", "professionals", 200, prof_data)
        
        if success and 'id' in created_prof:
            prof_id = created_prof['id']
            # Update professional
            updated_data = prof_data.copy()
            updated_data['specialty'] = "Neurologia"
            self.run_test("Update Professional", "PUT", f"professionals/{prof_id}", 200, updated_data)
            
            # Delete professional
            self.run_test("Delete Professional", "DELETE", f"professionals/{prof_id}", 200)

    def test_services_crud(self):
        """Test services CRUD operations"""
        # Get services
        self.run_test("Get Services", "GET", "services", 200)
        
        # Create service
        service_data = {
            "name": "Consulta Test",
            "description": "Consulta de teste",
            "duration_minutes": 30,
            "price": 150.0
        }
        success, created_service = self.run_test("Create Service", "POST", "services", 200, service_data)
        
        if success and 'id' in created_service:
            service_id = created_service['id']
            # Update service
            updated_data = service_data.copy()
            updated_data['price'] = 200.0
            self.run_test("Update Service", "PUT", f"services/{service_id}", 200, updated_data)
            
            # Delete service
            self.run_test("Delete Service", "DELETE", f"services/{service_id}", 200)

    def test_rooms_crud(self):
        """Test rooms CRUD operations"""
        # Get rooms
        self.run_test("Get Rooms", "GET", "rooms", 200)
        
        # Create room
        room_data = {
            "name": "Sala Test",
            "capacity": 2
        }
        success, created_room = self.run_test("Create Room", "POST", "rooms", 200, room_data)

    def test_patients_crud(self):
        """Test patients CRUD operations"""
        # Get patients
        success, patients = self.run_test("Get Patients", "GET", "patients", 200)
        
        # Create patient
        patient_data = {
            "name": "Paciente Test",
            "email": "patient.test@test.com",
            "phone": "(11) 88888-8888",
            "birthdate": "1990-01-01",
            "address": "Rua Test, 123"
        }
        success, created_patient = self.run_test("Create Patient", "POST", "patients", 200, patient_data)
        
        if success and 'id' in created_patient:
            patient_id = created_patient['id']
            # Get specific patient
            self.run_test("Get Specific Patient", "GET", f"patients/{patient_id}", 200)

    def test_appointments_crud(self):
        """Test appointments CRUD operations"""
        # Get appointments
        self.run_test("Get Appointments", "GET", "appointments", 200)
        
        # Get appointments with filters
        today = datetime.now().strftime('%Y-%m-%d')
        self.run_test("Get Appointments by Date", "GET", f"appointments?date={today}", 200)

    def test_leads_crud(self):
        """Test leads CRUD operations"""
        # Get leads
        self.run_test("Get Leads", "GET", "leads", 200)
        
        # Get leads with filter
        self.run_test("Get New Leads", "GET", "leads?status=new", 200)
        
        # Create lead
        lead_data = {
            "name": "Lead Test",
            "phone": "(11) 77777-7777",
            "email": "lead.test@test.com",
            "source": "whatsapp",
            "status": "new",
            "notes": "Lead de teste"
        }
        success, created_lead = self.run_test("Create Lead", "POST", "leads", 200, lead_data)
        
        if success and 'id' in created_lead:
            lead_id = created_lead['id']
            # Update lead
            updated_data = lead_data.copy()
            updated_data['status'] = 'hot'
            self.run_test("Update Lead", "PUT", f"leads/{lead_id}", 200, updated_data)

    def test_followups_crud(self):
        """Test follow-ups CRUD operations"""
        # Get followups
        self.run_test("Get FollowUps", "GET", "followups", 200)
        
        # Create followup (need a lead first)
        lead_data = {
            "name": "Lead for FollowUp",
            "phone": "(11) 66666-6666",
            "source": "whatsapp"
        }
        success, created_lead = self.run_test("Create Lead for FollowUp", "POST", "leads", 200, lead_data)
        
        if success and 'id' in created_lead:
            followup_data = {
                "lead_id": created_lead['id'],
                "assigned_to": self.user_id,
                "scheduled_date": "2024-12-31",
                "notes": "Follow-up de teste"
            }
            success, created_followup = self.run_test("Create FollowUp", "POST", "followups", 200, followup_data)
            
            if success and 'id' in created_followup:
                followup_id = created_followup['id']
                # Update followup status
                self.run_test("Update FollowUp Status", "PUT", f"followups/{followup_id}?status=completed", 200)

    def test_medical_records(self):
        """Test medical records operations"""
        # Get medical records for a patient (will be empty but should not error)
        self.run_test("Get Patient Medical Records", "GET", "medical-records/patient/test-patient-id", 200)

    def test_conversations(self):
        """Test conversation endpoints (mocked)"""
        self.run_test("Get Conversations", "GET", "conversations", 200)

    def test_auto_messages(self):
        """Test auto message generation"""
        # This will likely fail if no patient exists, but we test the endpoint
        auto_msg_data = {
            "patient_id": "test-patient-id",
            "message_type": "birthday"
        }
        # This might return 404 but we test the endpoint structure
        self.run_test("Generate Auto Message", "POST", "auto-messages/send", [200, 404], auto_msg_data)

def main():
    print("🏥 CliniFlow API Testing Suite")
    print("=" * 50)
    
    tester = CliniFlowAPITester()
    
    # Test authentication first
    if not tester.test_register_and_login():
        print("❌ Authentication failed, stopping tests")
        return 1
    
    print(f"\n✅ Authentication successful! User ID: {tester.user_id}")
    
    # Run all tests
    print("\n📊 Testing Dashboard Stats...")
    tester.test_dashboard_stats()
    
    print("\n👨‍⚕️ Testing Professionals CRUD...")
    tester.test_professionals_crud()
    
    print("\n🏥 Testing Services CRUD...")
    tester.test_services_crud()
    
    print("\n🏢 Testing Rooms CRUD...")
    tester.test_rooms_crud()
    
    print("\n👤 Testing Patients CRUD...")
    tester.test_patients_crud()
    
    print("\n📅 Testing Appointments...")
    tester.test_appointments_crud()
    
    print("\n🎯 Testing Leads CRUD...")
    tester.test_leads_crud()
    
    print("\n📋 Testing Follow-ups CRUD...")
    tester.test_followups_crud()
    
    print("\n📄 Testing Medical Records...")
    tester.test_medical_records()
    
    print("\n💬 Testing Conversations...")
    tester.test_conversations()
    
    print("\n🤖 Testing Auto Messages...")
    tester.test_auto_messages()
    
    # Print final results
    print("\n" + "=" * 50)
    print(f"📊 FINAL RESULTS")
    print(f"Tests passed: {tester.tests_passed}/{tester.tests_run}")
    print(f"Success rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    if tester.failed_tests:
        print(f"\n❌ Failed Tests ({len(tester.failed_tests)}):")
        for i, test in enumerate(tester.failed_tests, 1):
            print(f"{i}. {test.get('test', 'Unknown')}")
            if 'error' in test:
                print(f"   Error: {test['error']}")
            else:
                print(f"   Expected: {test.get('expected')}, Got: {test.get('actual')}")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())