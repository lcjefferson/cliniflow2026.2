
import requests
import json

url = "http://127.0.0.1:8000/api/auth/login"
data = {"email": "admin@clinicflow.com", "password": "admin@123"}
headers = {"Content-Type": "application/json"}

response = requests.post(url, data=json.dumps(data), headers=headers)

print(f"Status Code: {response.status_code}")
try:
    print(f"Response JSON: {response.json()}")
except json.JSONDecodeError:
    print(f"Response Text: {response.text}")
