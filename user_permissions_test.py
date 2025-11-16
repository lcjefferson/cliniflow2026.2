import requests
import sys
import json
from datetime import datetime

class UserPermissionsAPITester:
    def __init__(self, base_url="https://clinic-restore.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.admin_token = None
        self.consultor_token = None
        self.profissional_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.created_users = []

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None, token=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        # Use specific token if provided, otherwise use admin token
        if token:
            test_headers['Authorization'] = f'Bearer {token}'
        elif self.admin_token:
            test_headers['Authorization'] = f'Bearer {self.admin_token}'
        
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
                print(f"   Response: {response.text[:300]}")
                self.failed_tests.append({
                    "test": name,
                    "expected": expected_status,
                    "actual": response.status_code,
                    "response": response.text[:300]
                })
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.failed_tests.append({
                "test": name,
                "error": str(e)
            })
            return False, {}

    def test_register_admin_user(self):
        """Test admin user registration with new fields"""
        register_data = {
            "name": "Admin CliniFlow",
            "email": "admin.cliniflow@test.com",
            "password": "admin123456",
            "is_admin": True,
            "user_type": "admin",
            "professional_id": None
        }
        
        success, response = self.run_test(
            "Register Admin User",
            "POST",
            "auth/register",
            [200, 400],  # 400 if user already exists
            data=register_data,
            token=""  # No token for registration
        )
        
        if success and response.get('access_token'):
            self.admin_token = response['access_token']
            user_data = response.get('user', {})
            
            # Validate response contains new fields
            if user_data.get('user_type') == 'admin' and user_data.get('professional_id') is None:
                print(f"   ✅ Admin user created with correct user_type: {user_data.get('user_type')}")
                self.created_users.append(user_data.get('id'))
                return True
            else:
                print(f"   ❌ Admin user missing correct fields: user_type={user_data.get('user_type')}, professional_id={user_data.get('professional_id')}")
                return False
        
        # If registration failed, try login
        success, response = self.run_test(
            "Login Admin User",
            "POST",
            "auth/login",
            200,
            data={"email": "admin.cliniflow@test.com", "password": "admin123456"},
            token=""
        )
        
        if success and response.get('access_token'):
            self.admin_token = response['access_token']
            user_data = response.get('user', {})
            print(f"   ✅ Admin login successful with user_type: {user_data.get('user_type')}")
            return True
        
        return False

    def test_register_consultor_user(self):
        """Test consultor user registration"""
        register_data = {
            "name": "Consultor CliniFlow",
            "email": "consultor.cliniflow@test.com",
            "password": "consultor123",
            "is_admin": False,
            "user_type": "consultor",
            "professional_id": None
        }
        
        success, response = self.run_test(
            "Register Consultor User",
            "POST",
            "auth/register",
            [200, 400],
            data=register_data,
            token=""
        )
        
        if success and response.get('access_token'):
            self.consultor_token = response['access_token']
            user_data = response.get('user', {})
            
            # Validate response
            if user_data.get('user_type') == 'consultor':
                print(f"   ✅ Consultor user created with correct user_type: {user_data.get('user_type')}")
                self.created_users.append(user_data.get('id'))
                return True
            else:
                print(f"   ❌ Consultor user has incorrect user_type: {user_data.get('user_type')}")
                return False
        
        # Try login if registration failed
        success, response = self.run_test(
            "Login Consultor User",
            "POST",
            "auth/login",
            200,
            data={"email": "consultor.cliniflow@test.com", "password": "consultor123"},
            token=""
        )
        
        if success and response.get('access_token'):
            self.consultor_token = response['access_token']
            return True
        
        return False

    def test_register_profissional_user(self):
        """Test profissional user registration with professional_id"""
        # First create a professional to link to
        prof_data = {
            "name": "Dr. João Silva",
            "specialty": "Cardiologia",
            "email": "joao.silva@test.com",
            "phone": "(11) 99999-9999"
        }
        
        success, prof_response = self.run_test(
            "Create Professional for User Link",
            "POST",
            "professionals",
            200,
            data=prof_data
        )
        
        if not success:
            print("   ❌ Failed to create professional for linking")
            return False
        
        professional_id = prof_response.get('id')
        
        register_data = {
            "name": "Dr. João Silva User",
            "email": "profissional.cliniflow@test.com",
            "password": "profissional123",
            "is_admin": False,
            "user_type": "profissional",
            "professional_id": professional_id
        }
        
        success, response = self.run_test(
            "Register Profissional User",
            "POST",
            "auth/register",
            [200, 400],
            data=register_data,
            token=""
        )
        
        if success and response.get('access_token'):
            self.profissional_token = response['access_token']
            user_data = response.get('user', {})
            
            # Validate response
            if (user_data.get('user_type') == 'profissional' and 
                user_data.get('professional_id') == professional_id):
                print(f"   ✅ Profissional user created with correct fields: user_type={user_data.get('user_type')}, professional_id={user_data.get('professional_id')}")
                self.created_users.append(user_data.get('id'))
                return True
            else:
                print(f"   ❌ Profissional user has incorrect fields: user_type={user_data.get('user_type')}, professional_id={user_data.get('professional_id')}")
                return False
        
        # Try login if registration failed
        success, response = self.run_test(
            "Login Profissional User",
            "POST",
            "auth/login",
            200,
            data={"email": "profissional.cliniflow@test.com", "password": "profissional123"},
            token=""
        )
        
        if success and response.get('access_token'):
            self.profissional_token = response['access_token']
            return True
        
        return False

    def test_admin_list_users(self):
        """Test admin can list all users"""
        success, response = self.run_test(
            "Admin List All Users",
            "GET",
            "users",
            200,
            token=self.admin_token
        )
        
        if success and isinstance(response, list):
            print(f"   ✅ Admin retrieved {len(response)} users")
            
            # Check if our created users are in the list
            user_types_found = []
            for user in response:
                if user.get('id') in self.created_users:
                    user_types_found.append(user.get('user_type'))
            
            print(f"   ✅ Found user types: {user_types_found}")
            return True
        
        return False

    def test_non_admin_access_denied(self):
        """Test non-admin users get 403 when accessing user management"""
        # Test with consultor token
        success, response = self.run_test(
            "Consultor Access Users (Should Fail)",
            "GET",
            "users",
            403,
            token=self.consultor_token
        )
        
        if success:
            print("   ✅ Consultor correctly denied access to user management")
        
        # Test with profissional token
        success, response = self.run_test(
            "Profissional Access Users (Should Fail)",
            "GET",
            "users",
            403,
            token=self.profissional_token
        )
        
        if success:
            print("   ✅ Profissional correctly denied access to user management")
        
        return True

    def test_admin_update_user(self):
        """Test admin can update user information"""
        if not self.created_users:
            print("   ❌ No users to update")
            return False
        
        # Update the first created user
        user_id = self.created_users[0]
        update_data = {
            "name": "Updated User Name",
            "user_type": "consultor",
            "professional_id": None
        }
        
        success, response = self.run_test(
            "Admin Update User",
            "PUT",
            f"users/{user_id}",
            200,
            data=update_data,
            token=self.admin_token
        )
        
        if success:
            print("   ✅ Admin successfully updated user")
            return True
        
        return False

    def test_admin_delete_user(self):
        """Test admin can delete users"""
        if len(self.created_users) < 2:
            print("   ❌ Not enough users to test deletion")
            return False
        
        # Delete the last created user
        user_id = self.created_users[-1]
        
        success, response = self.run_test(
            "Admin Delete User",
            "DELETE",
            f"users/{user_id}",
            200,
            token=self.admin_token
        )
        
        if success:
            print("   ✅ Admin successfully deleted user")
            self.created_users.remove(user_id)
            return True
        
        return False

    def test_non_admin_update_denied(self):
        """Test non-admin users cannot update users"""
        if not self.created_users:
            print("   ❌ No users to test update denial")
            return False
        
        user_id = self.created_users[0]
        update_data = {
            "name": "Hacker Attempt",
            "user_type": "admin"
        }
        
        success, response = self.run_test(
            "Consultor Update User (Should Fail)",
            "PUT",
            f"users/{user_id}",
            403,
            data=update_data,
            token=self.consultor_token
        )
        
        if success:
            print("   ✅ Consultor correctly denied user update access")
            return True
        
        return False

    def test_login_response_fields(self):
        """Test that login responses contain all required fields"""
        # Test admin login response
        success, response = self.run_test(
            "Validate Admin Login Response Fields",
            "POST",
            "auth/login",
            200,
            data={"email": "admin.cliniflow@test.com", "password": "admin123456"},
            token=""
        )
        
        if success:
            user_data = response.get('user', {})
            required_fields = ['id', 'name', 'email', 'role', 'user_type', 'professional_id']
            missing_fields = [field for field in required_fields if field not in user_data]
            
            if not missing_fields:
                print(f"   ✅ Admin login response contains all required fields")
                print(f"   ✅ user_type: {user_data.get('user_type')}, professional_id: {user_data.get('professional_id')}")
            else:
                print(f"   ❌ Admin login response missing fields: {missing_fields}")
                return False
        
        # Test consultor login response
        success, response = self.run_test(
            "Validate Consultor Login Response Fields",
            "POST",
            "auth/login",
            200,
            data={"email": "consultor.cliniflow@test.com", "password": "consultor123"},
            token=""
        )
        
        if success:
            user_data = response.get('user', {})
            if user_data.get('user_type') == 'consultor':
                print(f"   ✅ Consultor login response has correct user_type: {user_data.get('user_type')}")
            else:
                print(f"   ❌ Consultor login response has incorrect user_type: {user_data.get('user_type')}")
                return False
        
        return True

def main():
    print("🏥 CliniFlow User Permissions API Testing Suite")
    print("=" * 60)
    
    tester = UserPermissionsAPITester()
    
    # Test 1: Register different user types
    print("\n👤 Testing User Registration with New Permission Fields...")
    if not tester.test_register_admin_user():
        print("❌ Admin registration failed, stopping tests")
        return 1
    
    if not tester.test_register_consultor_user():
        print("❌ Consultor registration failed")
    
    if not tester.test_register_profissional_user():
        print("❌ Profissional registration failed")
    
    # Test 2: Admin user management
    print("\n🔐 Testing Admin User Management...")
    tester.test_admin_list_users()
    tester.test_admin_update_user()
    tester.test_admin_delete_user()
    
    # Test 3: Permission validation
    print("\n🚫 Testing Permission Restrictions...")
    tester.test_non_admin_access_denied()
    tester.test_non_admin_update_denied()
    
    # Test 4: Login response validation
    print("\n✅ Testing Login Response Fields...")
    tester.test_login_response_fields()
    
    # Print final results
    print("\n" + "=" * 60)
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
                if test.get('response'):
                    print(f"   Response: {test.get('response')}")
    else:
        print("\n🎉 All tests passed! User permission system is working correctly.")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())