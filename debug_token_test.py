import requests
import json

def test_token_validation():
    base_url = "https://clinic-portal-9.preview.emergentagent.com/api"
    
    # First, register a profissional user
    print("🔍 Registering profissional user...")
    
    # Create professional first
    prof_data = {
        "name": "Dr. Debug Test",
        "specialty": "Cardiologia",
        "email": "debug.test@test.com",
        "phone": "(11) 99999-9999"
    }
    
    # Get admin token first
    admin_login = {
        "email": "admin.cliniflow@test.com",
        "password": "admin123456"
    }
    
    response = requests.post(f"{base_url}/auth/login", json=admin_login)
    if response.status_code != 200:
        print(f"❌ Admin login failed: {response.status_code}")
        return
    
    admin_token = response.json()['access_token']
    headers = {'Authorization': f'Bearer {admin_token}', 'Content-Type': 'application/json'}
    
    # Create professional
    response = requests.post(f"{base_url}/professionals", json=prof_data, headers=headers)
    if response.status_code != 200:
        print(f"❌ Professional creation failed: {response.status_code}")
        return
    
    professional_id = response.json()['id']
    print(f"✅ Professional created with ID: {professional_id}")
    
    # Register profissional user
    register_data = {
        "name": "Dr. Debug User",
        "email": "debug.profissional@test.com",
        "password": "debug123",
        "is_admin": False,
        "user_type": "profissional",
        "professional_id": professional_id
    }
    
    response = requests.post(f"{base_url}/auth/register", json=register_data)
    if response.status_code != 200:
        print(f"❌ Profissional registration failed: {response.status_code} - {response.text}")
        return
    
    profissional_token = response.json()['access_token']
    user_data = response.json()['user']
    print(f"✅ Profissional registered: {user_data['name']}, user_type: {user_data['user_type']}")
    print(f"✅ Token: {profissional_token[:30]}...")
    
    # Test immediate token usage
    prof_headers = {'Authorization': f'Bearer {profissional_token}', 'Content-Type': 'application/json'}
    
    print("\n🔍 Testing profissional token immediately after registration...")
    response = requests.get(f"{base_url}/professionals", headers=prof_headers)
    print(f"GET /professionals: {response.status_code}")
    
    print("\n🔍 Testing profissional access to /users (should be 403)...")
    response = requests.get(f"{base_url}/users", headers=prof_headers)
    print(f"GET /users: {response.status_code} - {response.text[:100]}")
    
    # Test login again to get fresh token
    print("\n🔍 Testing fresh login...")
    login_data = {
        "email": "debug.profissional@test.com",
        "password": "debug123"
    }
    
    response = requests.post(f"{base_url}/auth/login", json=login_data)
    if response.status_code != 200:
        print(f"❌ Login failed: {response.status_code} - {response.text}")
        return
    
    fresh_token = response.json()['access_token']
    user_data = response.json()['user']
    print(f"✅ Fresh login successful: {user_data['name']}, user_type: {user_data['user_type']}")
    print(f"✅ Fresh token: {fresh_token[:30]}...")
    
    # Test fresh token
    fresh_headers = {'Authorization': f'Bearer {fresh_token}', 'Content-Type': 'application/json'}
    
    print("\n🔍 Testing fresh token access to /users (should be 403)...")
    response = requests.get(f"{base_url}/users", headers=fresh_headers)
    print(f"GET /users with fresh token: {response.status_code} - {response.text[:100]}")

if __name__ == "__main__":
    test_token_validation()