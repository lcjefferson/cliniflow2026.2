from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
import jwt
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT configuration
JWT_SECRET = os.environ.get('JWT_SECRET_KEY', 'your-secret-key')
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
JWT_EXPIRATION = int(os.environ.get('JWT_EXPIRATION_MINUTES', '10080'))

security = HTTPBearer()

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Pydantic Models
class UserRole(BaseModel):
    is_admin: bool = False
    is_attendant: bool = False

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: EmailStr
    password_hash: str
    role: UserRole
    user_type: str = "consultor"  # admin, consultor, profissional
    professional_id: Optional[str] = None  # ID do profissional vinculado (se user_type == profissional)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str
    is_admin: bool = False
    user_type: str = "consultor"  # admin, consultor, profissional
    professional_id: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class Professional(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    specialty: str
    email: EmailStr
    phone: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProfessionalCreate(BaseModel):
    name: str
    specialty: str
    email: EmailStr
    phone: str

class Service(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    duration_minutes: int
    price: float
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ServiceCreate(BaseModel):
    name: str
    description: str
    duration_minutes: int
    price: float

class Room(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    capacity: int
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RoomCreate(BaseModel):
    name: str
    capacity: int

class Patient(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: EmailStr
    phone: str
    birthdate: str
    address: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PatientCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str
    birthdate: str
    address: Optional[str] = None

class Appointment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    professional_id: str
    service_id: str
    room_id: str
    appointment_date: str
    appointment_time: str
    status: str = "scheduled"  # scheduled, confirmed, completed, cancelled
    amount: Optional[float] = None  # Valor específico do agendamento
    paid: bool = False  # Se foi pago
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AppointmentCreate(BaseModel):
    patient_id: str
    professional_id: str
    service_id: str
    room_id: str
    appointment_date: str
    appointment_time: str
    amount: Optional[float] = None
    paid: bool = False
    notes: Optional[str] = None

class Transaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    appointment_id: Optional[str] = None
    amount: float
    payment_method: str  # cash, card, pix, etc
    description: str
    transaction_date: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TransactionCreate(BaseModel):
    patient_id: str
    appointment_id: Optional[str] = None
    amount: float
    payment_method: str
    description: str
    transaction_date: str

class MedicalRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    professional_id: str
    appointment_id: str
    diagnosis: str
    treatment: str
    prescription: Optional[str] = None
    medical_certificate: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MedicalRecordCreate(BaseModel):
    patient_id: str
    professional_id: str
    appointment_id: str
    diagnosis: str
    treatment: str
    prescription: Optional[str] = None
    medical_certificate: Optional[str] = None

class Lead(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: str
    email: Optional[EmailStr] = None
    source: str  # whatsapp, instagram, messenger
    status: str = "new"  # new, contacted, hot, cold, converted
    notes: Optional[str] = None
    assigned_to: Optional[str] = None  # user_id
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LeadCreate(BaseModel):
    name: str
    phone: str
    email: Optional[EmailStr] = None
    source: str
    status: str = "new"
    notes: Optional[str] = None
    assigned_to: Optional[str] = None

class Conversation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    channel: str  # whatsapp, instagram, messenger
    assigned_to: Optional[str] = None
    status: str = "active"  # active, closed
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Message(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    conversation_id: str
    sender_type: str  # user, lead
    sender_id: str
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MessageCreate(BaseModel):
    conversation_id: str
    content: str

class FollowUp(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    assigned_to: str
    scheduled_date: str
    notes: str
    status: str = "pending"  # pending, completed, cancelled
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FollowUpCreate(BaseModel):
    lead_id: str
    assigned_to: str
    scheduled_date: str
    notes: str

class AutoMessageRequest(BaseModel):
    patient_id: str
    message_type: str  # birthday, appointment_reminder
    appointment_id: Optional[str] = None

class GenerateDocumentRequest(BaseModel):
    record_id: str
    document_type: str  # prescription, certificate

# Helper functions
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRATION)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user

# Authentication Routes
@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserRegister):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user = User(
        name=user_data.name,
        email=user_data.email,
        password_hash=hash_password(user_data.password),
        role=UserRole(is_admin=user_data.is_admin, is_attendant=not user_data.is_admin),
        user_type=user_data.user_type,
        professional_id=user_data.professional_id
    )
    
    doc = user.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.users.insert_one(doc)
    
    # Create token
    access_token = create_access_token({"sub": user.id, "email": user.email})
    
    return TokenResponse(
        access_token=access_token,
        user={
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role.model_dump(),
            "user_type": user.user_type,
            "professional_id": user.professional_id
        }
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    access_token = create_access_token({"sub": user["id"], "email": user["email"]})
    
    return TokenResponse(
        access_token=access_token,
        user={
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
            "user_type": user.get("user_type", "consultor"),
            "professional_id": user.get("professional_id")
        }
    )

# User Management Routes
class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    user_type: Optional[str] = None
    professional_id: Optional[str] = None
    is_admin: Optional[bool] = None

@api_router.get("/users", response_model=List[dict])
async def get_users(current_user: dict = Depends(get_current_user)):
    # Only admins can list users
    if not current_user.get("role", {}).get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    for user in users:
        if isinstance(user.get('created_at'), str):
            user['created_at'] = datetime.fromisoformat(user['created_at'])
    return users

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, data: UserUpdate, current_user: dict = Depends(get_current_user)):
    # Only admins can update users
    if not current_user.get("role", {}).get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = {}
    if data.name:
        update_data["name"] = data.name
    if data.email:
        update_data["email"] = data.email
    if data.user_type:
        update_data["user_type"] = data.user_type
    if data.professional_id is not None:
        update_data["professional_id"] = data.professional_id
    if data.is_admin is not None:
        update_data["role.is_admin"] = data.is_admin
        update_data["role.is_attendant"] = not data.is_admin
    
    if update_data:
        await db.users.update_one({"id": user_id}, {"$set": update_data})
    
    return {"message": "User updated successfully"}

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    # Only admins can delete users
    if not current_user.get("role", {}).get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted successfully"}

# Professional Routes
@api_router.post("/professionals", response_model=Professional)
async def create_professional(data: ProfessionalCreate, current_user: dict = Depends(get_current_user)):
    professional = Professional(**data.model_dump())
    doc = professional.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.professionals.insert_one(doc)
    return professional

@api_router.get("/professionals", response_model=List[Professional])
async def get_professionals(current_user: dict = Depends(get_current_user)):
    professionals = await db.professionals.find({}, {"_id": 0}).to_list(1000)
    for prof in professionals:
        if isinstance(prof['created_at'], str):
            prof['created_at'] = datetime.fromisoformat(prof['created_at'])
    return professionals

@api_router.put("/professionals/{professional_id}", response_model=Professional)
async def update_professional(professional_id: str, data: ProfessionalCreate, current_user: dict = Depends(get_current_user)):
    result = await db.professionals.update_one(
        {"id": professional_id},
        {"$set": data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Professional not found")
    
    updated = await db.professionals.find_one({"id": professional_id}, {"_id": 0})
    if isinstance(updated['created_at'], str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    return Professional(**updated)

@api_router.delete("/professionals/{professional_id}")
async def delete_professional(professional_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.professionals.delete_one({"id": professional_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Professional not found")
    return {"message": "Professional deleted successfully"}

# Service Routes
@api_router.post("/services", response_model=Service)
async def create_service(data: ServiceCreate, current_user: dict = Depends(get_current_user)):
    service = Service(**data.model_dump())
    doc = service.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.services.insert_one(doc)
    return service

@api_router.get("/services", response_model=List[Service])
async def get_services(current_user: dict = Depends(get_current_user)):
    services = await db.services.find({}, {"_id": 0}).to_list(1000)
    for service in services:
        if isinstance(service['created_at'], str):
            service['created_at'] = datetime.fromisoformat(service['created_at'])
    return services

@api_router.put("/services/{service_id}", response_model=Service)
async def update_service(service_id: str, data: ServiceCreate, current_user: dict = Depends(get_current_user)):
    result = await db.services.update_one(
        {"id": service_id},
        {"$set": data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Service not found")
    
    updated = await db.services.find_one({"id": service_id}, {"_id": 0})
    if isinstance(updated['created_at'], str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    return Service(**updated)

@api_router.delete("/services/{service_id}")
async def delete_service(service_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.services.delete_one({"id": service_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Service not found")
    return {"message": "Service deleted successfully"}

# Room Routes
@api_router.post("/rooms", response_model=Room)
async def create_room(data: RoomCreate, current_user: dict = Depends(get_current_user)):
    room = Room(**data.model_dump())
    doc = room.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.rooms.insert_one(doc)
    return room

@api_router.get("/rooms", response_model=List[Room])
async def get_rooms(current_user: dict = Depends(get_current_user)):
    rooms = await db.rooms.find({}, {"_id": 0}).to_list(1000)
    for room in rooms:
        if isinstance(room['created_at'], str):
            room['created_at'] = datetime.fromisoformat(room['created_at'])
    return rooms

@api_router.put("/rooms/{room_id}", response_model=Room)
async def update_room(room_id: str, data: RoomCreate, current_user: dict = Depends(get_current_user)):
    result = await db.rooms.update_one(
        {"id": room_id},
        {"$set": data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Room not found")
    
    updated = await db.rooms.find_one({"id": room_id}, {"_id": 0})
    if isinstance(updated['created_at'], str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    return Room(**updated)

@api_router.delete("/rooms/{room_id}")
async def delete_room(room_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.rooms.delete_one({"id": room_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"message": "Room deleted successfully"}

# Patient Routes
@api_router.post("/patients", response_model=Patient)
async def create_patient(data: PatientCreate, current_user: dict = Depends(get_current_user)):
    patient = Patient(**data.model_dump())
    doc = patient.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.patients.insert_one(doc)
    return patient

@api_router.get("/patients", response_model=List[Patient])
async def get_patients(current_user: dict = Depends(get_current_user)):
    patients = await db.patients.find({}, {"_id": 0}).to_list(1000)
    for patient in patients:
        if isinstance(patient['created_at'], str):
            patient['created_at'] = datetime.fromisoformat(patient['created_at'])
    return patients

@api_router.get("/patients/{patient_id}", response_model=Patient)
async def get_patient(patient_id: str, current_user: dict = Depends(get_current_user)):
    patient = await db.patients.find_one({"id": patient_id}, {"_id": 0})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    if isinstance(patient['created_at'], str):
        patient['created_at'] = datetime.fromisoformat(patient['created_at'])
    return Patient(**patient)

@api_router.put("/patients/{patient_id}", response_model=Patient)
async def update_patient(patient_id: str, data: PatientCreate, current_user: dict = Depends(get_current_user)):
    result = await db.patients.update_one(
        {"id": patient_id},
        {"$set": data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    updated = await db.patients.find_one({"id": patient_id}, {"_id": 0})
    if isinstance(updated['created_at'], str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    return Patient(**updated)

@api_router.delete("/patients/{patient_id}")
async def delete_patient(patient_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.patients.delete_one({"id": patient_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {"message": "Patient deleted successfully"}

# Appointment Routes
@api_router.post("/appointments", response_model=Appointment)
async def create_appointment(data: AppointmentCreate, current_user: dict = Depends(get_current_user)):
    appointment = Appointment(**data.model_dump())
    doc = appointment.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.appointments.insert_one(doc)
    return appointment

@api_router.get("/appointments", response_model=List[Appointment])
async def get_appointments(
    professional_id: Optional[str] = None,
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if professional_id:
        query["professional_id"] = professional_id
    if date:
        query["appointment_date"] = date
    
    appointments = await db.appointments.find(query, {"_id": 0}).to_list(1000)
    for apt in appointments:
        if isinstance(apt['created_at'], str):
            apt['created_at'] = datetime.fromisoformat(apt['created_at'])
    return appointments

@api_router.put("/appointments/{appointment_id}", response_model=Appointment)
async def update_appointment(appointment_id: str, data: AppointmentCreate, current_user: dict = Depends(get_current_user)):
    update_data = data.model_dump()
    
    result = await db.appointments.update_one(
        {"id": appointment_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Appointment not found")
    
    updated = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if isinstance(updated['created_at'], str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    return Appointment(**updated)

@api_router.delete("/appointments/{appointment_id}")
async def delete_appointment(appointment_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.appointments.delete_one({"id": appointment_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return {"message": "Appointment deleted successfully"}

# Transaction/Payment Routes
@api_router.post("/transactions", response_model=Transaction)
async def create_transaction(data: TransactionCreate, current_user: dict = Depends(get_current_user)):
    transaction = Transaction(**data.model_dump())
    doc = transaction.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.transactions.insert_one(doc)
    
    # Se vinculado a um agendamento, marcar como pago
    if data.appointment_id:
        await db.appointments.update_one(
            {"id": data.appointment_id},
            {"$set": {"paid": True, "amount": data.amount}}
        )
    
    return transaction

@api_router.get("/transactions", response_model=List[Transaction])
async def get_transactions(patient_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if patient_id:
        query["patient_id"] = patient_id
    
    transactions = await db.transactions.find(query, {"_id": 0}).to_list(1000)
    for trans in transactions:
        if isinstance(trans['created_at'], str):
            trans['created_at'] = datetime.fromisoformat(trans['created_at'])
    return transactions

@api_router.get("/revenue/total")
async def get_total_revenue(current_user: dict = Depends(get_current_user)):
    # Only admins can see revenue
    if not current_user["role"]["is_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    transactions = await db.transactions.find({}, {"_id": 0}).to_list(10000)
    total = sum(t.get('amount', 0) for t in transactions)
    
    return {
        "total_revenue": total,
        "transaction_count": len(transactions)
    }

# Medical Record Routes
@api_router.post("/medical-records", response_model=MedicalRecord)
async def create_medical_record(data: MedicalRecordCreate, current_user: dict = Depends(get_current_user)):
    record = MedicalRecord(**data.model_dump())
    doc = record.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.medical_records.insert_one(doc)
    return record

@api_router.get("/medical-records/patient/{patient_id}", response_model=List[MedicalRecord])
async def get_patient_records(patient_id: str, current_user: dict = Depends(get_current_user)):
    records = await db.medical_records.find({"patient_id": patient_id}, {"_id": 0}).to_list(1000)
    for record in records:
        if isinstance(record['created_at'], str):
            record['created_at'] = datetime.fromisoformat(record['created_at'])
    return records

@api_router.post("/medical-records/generate-document")
async def generate_document(data: GenerateDocumentRequest, current_user: dict = Depends(get_current_user)):
    record = await db.medical_records.find_one({"id": data.record_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Medical record not found")
    
    patient = await db.patients.find_one({"id": record["patient_id"]}, {"_id": 0})
    professional = await db.professionals.find_one({"id": record["professional_id"]}, {"_id": 0})
    
    # Use AI to generate document
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    chat = LlmChat(
        api_key=api_key,
        session_id=str(uuid.uuid4()),
        system_message="You are a medical document assistant. Generate professional medical documents."
    ).with_model("openai", "gpt-4o-mini")
    
    if data.document_type == "prescription":
        prompt = f"Generate a medical prescription for patient {patient['name']} based on: Diagnosis: {record['diagnosis']}, Treatment: {record['treatment']}"
    else:
        prompt = f"Generate a medical certificate for patient {patient['name']} based on: Diagnosis: {record['diagnosis']}"
    
    message = UserMessage(text=prompt)
    response = await chat.send_message(message)
    
    # Update record with generated document
    field = "prescription" if data.document_type == "prescription" else "medical_certificate"
    await db.medical_records.update_one(
        {"id": data.record_id},
        {"$set": {field: response}}
    )
    
    return {"document": response, "type": data.document_type}

# Lead Routes
@api_router.post("/leads", response_model=Lead)
async def create_lead(data: LeadCreate, current_user: dict = Depends(get_current_user)):
    lead = Lead(**data.model_dump())
    doc = lead.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.leads.insert_one(doc)
    return lead

@api_router.get("/leads", response_model=List[Lead])
async def get_leads(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    
    # If not admin, only show assigned leads
    if not current_user["role"]["is_admin"]:
        query["assigned_to"] = current_user["id"]
    
    if status:
        query["status"] = status
    
    leads = await db.leads.find(query, {"_id": 0}).to_list(1000)
    for lead in leads:
        if isinstance(lead['created_at'], str):
            lead['created_at'] = datetime.fromisoformat(lead['created_at'])
    return leads

@api_router.put("/leads/{lead_id}", response_model=Lead)
async def update_lead(lead_id: str, data: LeadCreate, current_user: dict = Depends(get_current_user)):
    result = await db.leads.update_one(
        {"id": lead_id},
        {"$set": data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    updated = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if isinstance(updated['created_at'], str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    return Lead(**updated)

@api_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.leads.delete_one({"id": lead_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"message": "Lead deleted successfully"}

@api_router.post("/leads/{lead_id}/convert-to-patient", response_model=Patient)
async def convert_lead_to_patient(lead_id: str, birthdate: str, address: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    # Buscar lead
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Verificar se já existe paciente com mesmo email
    existing_patient = await db.patients.find_one({"email": lead["email"]}, {"_id": 0})
    if existing_patient:
        raise HTTPException(status_code=400, detail="Patient with this email already exists")
    
    # Criar paciente
    patient = Patient(
        name=lead["name"],
        email=lead["email"],
        phone=lead["phone"],
        birthdate=birthdate,
        address=address or ""
    )
    
    doc = patient.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.patients.insert_one(doc)
    
    # Atualizar status do lead para convertido
    await db.leads.update_one(
        {"id": lead_id},
        {"$set": {"status": "converted"}}
    )
    
    return patient

# Conversation Routes (Mocked)
@api_router.get("/conversations", response_model=List[Conversation])
async def get_conversations(current_user: dict = Depends(get_current_user)):
    query = {}
    
    # If not admin, only show assigned conversations
    if not current_user["role"]["is_admin"]:
        query["assigned_to"] = current_user["id"]
    
    conversations = await db.conversations.find(query, {"_id": 0}).to_list(1000)
    for conv in conversations:
        if isinstance(conv['created_at'], str):
            conv['created_at'] = datetime.fromisoformat(conv['created_at'])
    return conversations

@api_router.get("/conversations/{conversation_id}/messages", response_model=List[Message])
async def get_conversation_messages(conversation_id: str, current_user: dict = Depends(get_current_user)):
    messages = await db.messages.find({"conversation_id": conversation_id}, {"_id": 0}).to_list(1000)
    for msg in messages:
        if isinstance(msg['created_at'], str):
            msg['created_at'] = datetime.fromisoformat(msg['created_at'])
    return messages

@api_router.post("/conversations/{conversation_id}/messages", response_model=Message)
async def send_message(conversation_id: str, data: MessageCreate, current_user: dict = Depends(get_current_user)):
    message = Message(
        conversation_id=conversation_id,
        sender_type="user",
        sender_id=current_user["id"],
        content=data.content
    )
    doc = message.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.messages.insert_one(doc)
    return message

# FollowUp Routes
@api_router.post("/followups", response_model=FollowUp)
async def create_followup(data: FollowUpCreate, current_user: dict = Depends(get_current_user)):
    followup = FollowUp(**data.model_dump())
    doc = followup.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.followups.insert_one(doc)
    return followup

@api_router.get("/followups", response_model=List[FollowUp])
async def get_followups(current_user: dict = Depends(get_current_user)):
    query = {}
    
    # If not admin, only show assigned followups
    if not current_user["role"]["is_admin"]:
        query["assigned_to"] = current_user["id"]
    
    followups = await db.followups.find(query, {"_id": 0}).to_list(1000)
    for followup in followups:
        if isinstance(followup['created_at'], str):
            followup['created_at'] = datetime.fromisoformat(followup['created_at'])
    return followups

@api_router.put("/followups/{followup_id}")
async def update_followup_status(followup_id: str, status: str, current_user: dict = Depends(get_current_user)):
    result = await db.followups.update_one(
        {"id": followup_id},
        {"$set": {"status": status}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="FollowUp not found")
    return {"message": "FollowUp updated successfully"}

# Auto Messages with AI
@api_router.post("/auto-messages/send")
async def send_auto_message(data: AutoMessageRequest, current_user: dict = Depends(get_current_user)):
    patient = await db.patients.find_one({"id": data.patient_id}, {"_id": 0})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    chat = LlmChat(
        api_key=api_key,
        session_id=str(uuid.uuid4()),
        system_message="You are a friendly clinic assistant. Generate warm, professional messages."
    ).with_model("openai", "gpt-4o-mini")
    
    if data.message_type == "birthday":
        prompt = f"Generate a warm birthday message for patient {patient['name']}"
    elif data.message_type == "appointment_reminder":
        appointment = await db.appointments.find_one({"id": data.appointment_id}, {"_id": 0})
        if appointment:
            prompt = f"Generate an appointment reminder message for patient {patient['name']} on {appointment['appointment_date']} at {appointment['appointment_time']}"
        else:
            raise HTTPException(status_code=404, detail="Appointment not found")
    else:
        raise HTTPException(status_code=400, detail="Invalid message type")
    
    message = UserMessage(text=prompt)
    response = await chat.send_message(message)
    
    return {
        "message": response,
        "patient": patient["name"],
        "phone": patient["phone"],
        "status": "sent (mocked)"
    }

# Dashboard Stats
@api_router.get("/dashboard/revenue")
async def get_revenue_stats(current_user: dict = Depends(get_current_user)):
    if not current_user["role"]["is_admin"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Calculate revenue from completed appointments
    completed_appointments = await db.appointments.find({"status": "completed"}, {"_id": 0}).to_list(10000)
    
    total_revenue = 0
    for apt in completed_appointments:
        service = await db.services.find_one({"id": apt["service_id"]}, {"_id": 0})
        if service:
            total_revenue += service["price"]
    
    return {
        "total_revenue": total_revenue,
        "total_appointments": len(completed_appointments)
    }

@api_router.get("/dashboard/leads")
async def get_leads_stats(current_user: dict = Depends(get_current_user)):
    total_leads = await db.leads.count_documents({})
    new_leads = await db.leads.count_documents({"status": "new"})
    hot_leads = await db.leads.count_documents({"status": "hot"})
    converted_leads = await db.leads.count_documents({"status": "converted"})
    
    return {
        "total": total_leads,
        "new": new_leads,
        "hot": hot_leads,
        "converted": converted_leads
    }

@api_router.get("/dashboard/appointments")
async def get_appointments_stats(current_user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date().isoformat()
    
    total_today = await db.appointments.count_documents({"appointment_date": today})
    scheduled = await db.appointments.count_documents({"status": "scheduled"})
    completed = await db.appointments.count_documents({"status": "completed"})
    
    return {
        "today": total_today,
        "scheduled": scheduled,
        "completed": completed
    }

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()