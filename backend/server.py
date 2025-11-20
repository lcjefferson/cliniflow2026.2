from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr, field_validator
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
import jwt
from emergentintegrations.llm.chat import LlmChat, UserMessage
import httpx

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
    name: str  # Obrigatório
    email: Optional[EmailStr] = None
    password: str  # Obrigatório
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
    specialty: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProfessionalCreate(BaseModel):
    name: str  # Obrigatório
    specialty: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: str  # Obrigatório
    
    @field_validator('email', mode='before')
    @classmethod
    def empty_str_to_none(cls, v):
        if v == '' or v is None:
            return None
        return v

class Service(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    duration_minutes: Optional[int] = None
    price: Optional[float] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ServiceCreate(BaseModel):
    name: str  # Obrigatório
    description: Optional[str] = None
    duration_minutes: Optional[int] = None
    price: Optional[float] = None

class Room(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    capacity: int
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RoomCreate(BaseModel):
    name: str  # Obrigatório
    capacity: Optional[int] = None

class Attachment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    file_data: str  # base64 encoded
    file_type: str
    upload_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    size_bytes: int

class Treatment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
    service_id: str
    service_name: str
    description: Optional[str] = None
    professional_id: Optional[str] = None
    professional_name: Optional[str] = None
    status: str = "completed"  # completed, in_progress

class Anamnese(BaseModel):
    # Histórico Médico
    chronic_diseases: Optional[str] = None
    allergies_medical: Optional[str] = None
    current_medications: Optional[str] = None
    surgery_history: Optional[str] = None
    mental_health: Optional[str] = None
    
    # Histórico Odontológico
    previous_treatments: Optional[str] = None
    prosthetics: Optional[str] = None
    implants: Optional[str] = None
    pain_history: Optional[str] = None
    periodontal_issues: Optional[str] = None
    facial_surgeries: Optional[str] = None
    oral_hygiene_products: Optional[str] = None
    
    # Alergias Específicas
    medication_allergies: Optional[str] = None
    material_allergies: Optional[str] = None
    substance_allergies: Optional[str] = None
    
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Patient(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: Optional[EmailStr] = None
    phone: str
    birthdate: str
    address: Optional[str] = None
    attachments: List[Attachment] = []
    treatments: List[Treatment] = []
    anamnese: Optional[Anamnese] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PatientCreate(BaseModel):
    name: str  # Obrigatório
    email: Optional[EmailStr] = None
    phone: str  # Obrigatório
    birthdate: str  # Obrigatório
    address: Optional[str] = None
    
    @field_validator('email', mode='before')
    @classmethod
    def empty_str_to_none(cls, v):
        if v == '' or v is None:
            return None
        return v

class Appointment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    professional_id: str
    service_id: Optional[str] = None
    room_id: str
    appointment_date: str
    appointment_time: str  # Hora de início
    appointment_time_end: Optional[str] = None  # Hora de fim
    status: str = "scheduled"  # scheduled, confirmed, completed, cancelled
    amount: Optional[float] = None  # Valor específico do agendamento
    paid: bool = False  # Se foi pago
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AppointmentCreate(BaseModel):
    patient_id: str  # Obrigatório (nome do paciente)
    professional_id: str  # Obrigatório
    service_id: Optional[str] = None
    room_id: str  # Obrigatório
    appointment_date: Optional[str] = None
    appointment_time: Optional[str] = None  # Hora de início
    appointment_time_end: Optional[str] = None  # Hora de fim
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
    status: str = "paid"  # paid, pending
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TransactionCreate(BaseModel):
    patient_id: Optional[str] = None
    appointment_id: Optional[str] = None
    amount: float
    payment_method: Optional[str] = None
    description: Optional[str] = None
    transaction_date: Optional[str] = None
    status: str = "paid"

class MedicalRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    record_type: Optional[str] = "prontuario"  # prontuario, receita, atestado
    professional_id: Optional[str] = None
    appointment_id: Optional[str] = None
    diagnosis: Optional[str] = None
    symptoms: Optional[str] = None
    treatment: Optional[str] = None
    medications: Optional[str] = None
    observations: Optional[str] = None
    doctor_name: Optional[str] = None
    crm: Optional[str] = None
    prescription: Optional[str] = None
    medical_certificate: Optional[str] = None
    template_used: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MedicalRecordCreate(BaseModel):
    patient_id: Optional[str] = None
    record_type: Optional[str] = "prontuario"
    professional_id: Optional[str] = None
    appointment_id: Optional[str] = None
    diagnosis: Optional[str] = None
    symptoms: Optional[str] = None
    treatment: Optional[str] = None
    medications: Optional[str] = None
    observations: Optional[str] = None
    doctor_name: Optional[str] = None
    crm: Optional[str] = None
    prescription: Optional[str] = None
    medical_certificate: Optional[str] = None
    template_used: Optional[str] = None

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
    
    @field_validator('email', mode='before')
    @classmethod
    def empty_str_to_none(cls, v):
        if v == '' or v is None:
            return None
        return v

class Conversation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    channel: str  # whatsapp, instagram, messenger
    assigned_to: Optional[str] = None  # user_id do consultor
    assigned_to_name: Optional[str] = None  # nome do consultor
    status: str = "active"  # active, closed
    last_message_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Message(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    conversation_id: str
    sender_type: str  # consultant, lead
    sender_id: str
    sender_name: str
    content: str
    read: bool = False
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
    lead_id: Optional[str] = None
    assigned_to: Optional[str] = None
    scheduled_date: Optional[str] = None
    notes: Optional[str] = None

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

# Patient Attachments
@api_router.post("/patients/{patient_id}/attachments")
async def add_attachment(patient_id: str, attachment: Attachment, current_user: dict = Depends(get_current_user)):
    patient = await db.patients.find_one({"id": patient_id}, {"_id": 0})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    attachment_dict = attachment.model_dump()
    attachment_dict['upload_date'] = attachment_dict['upload_date'].isoformat()
    
    await db.patients.update_one(
        {"id": patient_id},
        {"$push": {"attachments": attachment_dict}}
    )
    return {"message": "Attachment added successfully", "attachment": attachment}

@api_router.delete("/patients/{patient_id}/attachments/{attachment_id}")
async def delete_attachment(patient_id: str, attachment_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.patients.update_one(
        {"id": patient_id},
        {"$pull": {"attachments": {"id": attachment_id}}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {"message": "Attachment deleted successfully"}

# Patient Treatments
@api_router.post("/patients/{patient_id}/treatments")
async def add_treatment(patient_id: str, treatment: Treatment, current_user: dict = Depends(get_current_user)):
    patient = await db.patients.find_one({"id": patient_id}, {"_id": 0})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    await db.patients.update_one(
        {"id": patient_id},
        {"$push": {"treatments": treatment.model_dump()}}
    )
    return {"message": "Treatment added successfully", "treatment": treatment}

@api_router.put("/patients/{patient_id}/treatments/{treatment_id}")
async def update_treatment(patient_id: str, treatment_id: str, treatment: Treatment, current_user: dict = Depends(get_current_user)):
    result = await db.patients.update_one(
        {"id": patient_id, "treatments.id": treatment_id},
        {"$set": {
            "treatments.$.date": treatment.date,
            "treatments.$.service_id": treatment.service_id,
            "treatments.$.service_name": treatment.service_name,
            "treatments.$.description": treatment.description,
            "treatments.$.professional_id": treatment.professional_id,
            "treatments.$.professional_name": treatment.professional_name,
            "treatments.$.status": treatment.status
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Patient or treatment not found")
    return {"message": "Treatment updated successfully"}

@api_router.delete("/patients/{patient_id}/treatments/{treatment_id}")
async def delete_treatment(patient_id: str, treatment_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.patients.update_one(
        {"id": patient_id},
        {"$pull": {"treatments": {"id": treatment_id}}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {"message": "Treatment deleted successfully"}

# Patient Anamnese
@api_router.put("/patients/{patient_id}/anamnese")
async def update_anamnese(patient_id: str, anamnese: Anamnese, current_user: dict = Depends(get_current_user)):
    patient = await db.patients.find_one({"id": patient_id}, {"_id": 0})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    anamnese_dict = anamnese.model_dump()
    anamnese_dict['last_updated'] = anamnese_dict['last_updated'].isoformat()
    
    await db.patients.update_one(
        {"id": patient_id},
        {"$set": {"anamnese": anamnese_dict}}
    )
    return {"message": "Anamnese updated successfully", "anamnese": anamnese}

# Patient Debts
@api_router.get("/patients/{patient_id}/debts")
async def get_patient_debts(patient_id: str, current_user: dict = Depends(get_current_user)):
    # Get unpaid appointments
    unpaid_appointments = await db.appointments.find(
        {"patient_id": patient_id, "paid": False},
        {"_id": 0}
    ).to_list(1000)
    
    total_debt = sum(app.get('amount', 0) for app in unpaid_appointments)
    
    return {
        "patient_id": patient_id,
        "total_debt": total_debt,
        "unpaid_appointments": unpaid_appointments,
        "debt_count": len(unpaid_appointments)
    }

# Get professionals who attended a patient
@api_router.get("/patients/{patient_id}/professionals")
async def get_patient_professionals(patient_id: str, current_user: dict = Depends(get_current_user)):
    # Get all appointments for this patient
    appointments = await db.appointments.find(
        {"patient_id": patient_id},
        {"_id": 0, "professional_id": 1}
    ).to_list(1000)
    
    # Get unique professional IDs
    professional_ids = list(set(app['professional_id'] for app in appointments if app.get('professional_id')))
    
    # Get professional details
    professionals = []
    for prof_id in professional_ids:
        prof = await db.professionals.find_one({"id": prof_id}, {"_id": 0})
        if prof:
            # Count appointments with this professional
            appointment_count = sum(1 for app in appointments if app.get('professional_id') == prof_id)
            prof['appointment_count'] = appointment_count
            professionals.append(prof)
    
    return professionals

# Appointment Routes
@api_router.get("/appointments/check-conflicts")
async def check_appointment_conflicts(
    professional_id: str,
    room_id: str,
    appointment_date: str,
    appointment_time: str,
    appointment_time_end: Optional[str] = None,
    exclude_appointment_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Verifica conflitos de horário para profissional e sala"""
    conflicts = {"professional_conflicts": [], "room_conflicts": []}
    
    # Buscar agendamentos do mesmo dia
    query = {
        "appointment_date": appointment_date,
        "status": {"$ne": "cancelled"}
    }
    if exclude_appointment_id:
        query["id"] = {"$ne": exclude_appointment_id}
    
    appointments = await db.appointments.find(query, {"_id": 0}).to_list(1000)
    
    def times_overlap(start1, end1, start2, end2):
        """Verifica se dois intervalos de tempo se sobrepõem"""
        if not end1 or not end2:
            # Se não tem hora final, considera conflito se a hora inicial é igual
            return start1 == start2
        return start1 < end2 and end1 > start2
    
    for apt in appointments:
        apt_start = apt.get("appointment_time")
        apt_end = apt.get("appointment_time_end")
        
        if not apt_start:
            continue
        
        # Verificar conflito de profissional
        if apt.get("professional_id") == professional_id:
            if times_overlap(appointment_time, appointment_time_end, apt_start, apt_end):
                # Buscar nome do paciente
                patient = await db.patients.find_one({"id": apt["patient_id"]}, {"_id": 0})
                conflicts["professional_conflicts"].append({
                    "time": apt_start,
                    "time_end": apt_end,
                    "patient_name": patient["name"] if patient else "Desconhecido"
                })
        
        # Verificar conflito de sala
        if apt.get("room_id") == room_id:
            if times_overlap(appointment_time, appointment_time_end, apt_start, apt_end):
                # Buscar nome do paciente
                patient = await db.patients.find_one({"id": apt["patient_id"]}, {"_id": 0})
                conflicts["room_conflicts"].append({
                    "time": apt_start,
                    "time_end": apt_end,
                    "patient_name": patient["name"] if patient else "Desconhecido"
                })
    
    return {
        "has_conflicts": len(conflicts["professional_conflicts"]) > 0 or len(conflicts["room_conflicts"]) > 0,
        "conflicts": conflicts
    }

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

@api_router.put("/transactions/{transaction_id}", response_model=Transaction)
async def update_transaction(transaction_id: str, data: TransactionCreate, current_user: dict = Depends(get_current_user)):
    result = await db.transactions.update_one(
        {"id": transaction_id},
        {"$set": data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    updated = await db.transactions.find_one({"id": transaction_id}, {"_id": 0})
    if isinstance(updated['created_at'], str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    return Transaction(**updated)

@api_router.delete("/transactions/{transaction_id}")
async def delete_transaction(transaction_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.transactions.delete_one({"id": transaction_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"message": "Transaction deleted successfully"}

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

@api_router.post("/medical-records/generate-pdf")
async def generate_medical_record_pdf(data: dict, current_user: dict = Depends(get_current_user)):
    """Gera PDF do prontuário para visualização/download"""
    from io import BytesIO
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from fastapi.responses import StreamingResponse
    import base64
    
    try:
        record_id = data.get("record_id")
        patient_name = data.get("patient_name")
        
        # Buscar prontuário
        record = await db.medical_records.find_one({"id": record_id}, {"_id": 0})
        if not record:
            raise HTTPException(status_code=404, detail="Prontuário não encontrado")
        
        # Buscar configurações da clínica
        clinic_settings = await db.settings.find_one({"type": "clinic"}, {"_id": 0})
        clinic_config = clinic_settings.get("config", {}) if clinic_settings else {}
        
        # Gerar PDF
        from reportlab.lib.colors import HexColor
        from reportlab.platypus import Table, TableStyle
        from reportlab.lib import colors
        
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer, 
            pagesize=A4, 
            topMargin=1.5*cm, 
            bottomMargin=3*cm,
            leftMargin=2*cm,
            rightMargin=2*cm
        )
        story = []
        styles = getSampleStyleSheet()
        
        # Estilos customizados
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=18,
            textColor=HexColor('#1e40af'),
            spaceAfter=20,
            spaceBefore=10,
            alignment=TA_LEFT,
            fontName='Helvetica-Bold'
        )
        
        footer_style = ParagraphStyle(
            'FooterStyle',
            parent=styles['Normal'],
            fontSize=9,
            alignment=TA_CENTER,
            textColor=HexColor('#4b5563')
        )
        
        content_style = ParagraphStyle(
            'CustomContent',
            parent=styles['Normal'],
            fontSize=11,
            spaceAfter=15,
            spaceBefore=5,
            alignment=TA_LEFT,
            leading=16
        )
        
        label_style = ParagraphStyle(
            'LabelStyle',
            parent=styles['Normal'],
            fontSize=11,
            textColor=HexColor('#1e40af'),
            fontName='Helvetica-Bold',
            spaceAfter=8
        )
        
        # Logo (se existir) - Wide e alinhada à esquerda
        if clinic_config.get("logo"):
            try:
                logo_data = clinic_config["logo"]
                if logo_data.startswith('data:image'):
                    logo_data = logo_data.split(',')[1]
                logo_bytes = base64.b64decode(logo_data)
                logo_buffer = BytesIO(logo_bytes)
                # Logo wide com proporção 4:1 (largura:altura)
                logo = RLImage(logo_buffer, width=8*cm, height=2*cm)
                logo.hAlign = 'LEFT'
                story.append(logo)
                story.append(Spacer(1, 0.3*cm))
            except:
                # Se falhar, adiciona nome da clínica
                clinic_name_header = Paragraph(
                    f"<b>{clinic_config.get('clinic_name', 'Clínica')}</b>",
                    ParagraphStyle('ClinicName', fontSize=16, textColor=HexColor('#1e40af'), alignment=TA_LEFT)
                )
                story.append(clinic_name_header)
                story.append(Spacer(1, 0.3*cm))
        else:
            # Se não tem logo, adiciona nome da clínica
            clinic_name_header = Paragraph(
                f"<b>{clinic_config.get('clinic_name', 'Clínica')}</b>",
                ParagraphStyle('ClinicName', fontSize=16, textColor=HexColor('#1e40af'), alignment=TA_LEFT)
            )
            story.append(clinic_name_header)
            story.append(Spacer(1, 0.3*cm))
        
        # Linha azul suave abaixo da logo
        from reportlab.platypus import Table, TableStyle
        line_table = Table([['']], colWidths=[16*cm])
        line_table.setStyle(TableStyle([
            ('LINEABOVE', (0, 0), (-1, 0), 1.5, HexColor('#93c5fd')),
        ]))
        story.append(line_table)
        story.append(Spacer(1, 0.8*cm))
        
        # Tipo de documento
        record_type_label = {
            "prontuario": "PRONTUÁRIO MÉDICO",
            "receita": "RECEITA MÉDICA", 
            "atestado": "ATESTADO MÉDICO"
        }.get(record.get("record_type", "prontuario"), "DOCUMENTO MÉDICO")
        
        story.append(Paragraph(record_type_label, title_style))
        story.append(Spacer(1, 0.6*cm))
        
        # Informações do paciente
        story.append(Paragraph("<b>Paciente:</b>", label_style))
        story.append(Paragraph(patient_name, content_style))
        
        story.append(Paragraph("<b>Data:</b>", label_style))
        story.append(Paragraph(datetime.now(timezone.utc).strftime('%d/%m/%Y'), content_style))
        
        # Diagnóstico
        if record.get("diagnosis"):
            story.append(Spacer(1, 0.3*cm))
            story.append(Paragraph("<b>Diagnóstico:</b>", label_style))
            story.append(Paragraph(record['diagnosis'], content_style))
        
        # Conteúdo/Observações
        if record.get("observations"):
            story.append(Spacer(1, 0.3*cm))
            story.append(Paragraph("<b>Descrição:</b>", label_style))
            for para in record["observations"].split('\n'):
                if para.strip():
                    story.append(Paragraph(para, content_style))
        
        # Dados do médico (alinhado à esquerda, antes do rodapé)
        story.append(Spacer(1, 1*cm))
        if record.get("doctor_name") or record.get("crm"):
            story.append(Paragraph("<b>Profissional Responsável:</b>", label_style))
            if record.get("doctor_name"):
                story.append(Paragraph(f"Dr(a). {record['doctor_name']}", content_style))
            if record.get("crm"):
                story.append(Paragraph(f"CRM: {record['crm']}", content_style))
        
        # Função para criar rodapé em cada página
        def add_footer(canvas, doc):
            canvas.saveState()
            
            # Linha azul suave acima do rodapé
            canvas.setStrokeColor(HexColor('#93c5fd'))
            canvas.setLineWidth(1.5)
            canvas.line(2*cm, 2.5*cm, A4[0] - 2*cm, 2.5*cm)
            
            # Texto do rodapé centralizado
            canvas.setFont('Helvetica', 9)
            canvas.setFillColor(HexColor('#4b5563'))
            
            footer_lines = []
            if clinic_config.get("clinic_name"):
                footer_lines.append(clinic_config["clinic_name"])
            if clinic_config.get("address"):
                footer_lines.append(clinic_config["address"])
            
            contact_parts = []
            if clinic_config.get("phone"):
                contact_parts.append(f"Tel: {clinic_config['phone']}")
            if clinic_config.get("email"):
                contact_parts.append(f"Email: {clinic_config['email']}")
            if contact_parts:
                footer_lines.append(" | ".join(contact_parts))
            
            y_position = 2*cm
            for line in footer_lines:
                text_width = canvas.stringWidth(line, 'Helvetica', 9)
                x_position = (A4[0] - text_width) / 2
                canvas.drawString(x_position, y_position, line)
                y_position -= 0.4*cm
            
            canvas.restoreState()
        
        # Gerar PDF com rodapé
        doc.build(story, onFirstPage=add_footer, onLaterPages=add_footer)
        buffer.seek(0)
        
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"inline; filename=prontuario_{patient_name.replace(' ', '_')}.pdf"
            }
        )
            
    except Exception as e:
        print(f"Erro ao gerar PDF: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/medical-records/send-whatsapp")
async def send_medical_record_whatsapp(data: dict, current_user: dict = Depends(get_current_user)):
    """Envia prontuário em PDF via WhatsApp para o paciente"""
    import requests
    import base64
    from io import BytesIO
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    
    try:
        record_id = data.get("record_id")
        patient_phone = data.get("patient_phone")
        patient_name = data.get("patient_name")
        
        # Buscar prontuário
        record = await db.medical_records.find_one({"id": record_id}, {"_id": 0})
        if not record:
            raise HTTPException(status_code=404, detail="Prontuário não encontrado")
        
        # Buscar configurações da clínica
        clinic_settings = await db.settings.find_one({"type": "clinic"}, {"_id": 0})
        clinic_config = clinic_settings.get("config", {}) if clinic_settings else {}
        
        # Buscar configurações do WhatsApp
        whatsapp_settings = await db.settings.find_one({"type": "omnichannel"}, {"_id": 0})
        if not whatsapp_settings or not whatsapp_settings.get("whatsapp"):
            raise HTTPException(status_code=400, detail="WhatsApp não configurado")
        
        whatsapp_config = whatsapp_settings["whatsapp"]
        access_token = whatsapp_config.get("access_token")
        phone_number_id = whatsapp_config.get("phone_number_id")
        
        if not access_token or not phone_number_id:
            raise HTTPException(status_code=400, detail="Credenciais do WhatsApp incompletas")
        
        # Formatar telefone
        clean_phone = ''.join(filter(str.isdigit, patient_phone))
        if not clean_phone.startswith('55'):
            clean_phone = '55' + clean_phone
        
        # Gerar PDF
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=2*cm, bottomMargin=2*cm)
        story = []
        styles = getSampleStyleSheet()
        
        # Estilo customizado
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=16,
            textColor='#1e40af',
            spaceAfter=12,
            alignment=TA_CENTER
        )
        
        header_style = ParagraphStyle(
            'CustomHeader',
            parent=styles['Normal'],
            fontSize=10,
            alignment=TA_CENTER,
            spaceAfter=6
        )
        
        content_style = ParagraphStyle(
            'CustomContent',
            parent=styles['Normal'],
            fontSize=11,
            spaceAfter=12,
            alignment=TA_LEFT
        )
        
        # Logo (se existir)
        if clinic_config.get("logo"):
            try:
                logo_data = clinic_config["logo"]
                if logo_data.startswith('data:image'):
                    logo_data = logo_data.split(',')[1]
                logo_bytes = base64.b64decode(logo_data)
                logo_buffer = BytesIO(logo_bytes)
                logo = RLImage(logo_buffer, width=3*cm, height=3*cm)
                story.append(logo)
                story.append(Spacer(1, 0.5*cm))
            except:
                pass
        
        # Cabeçalho da clínica
        clinic_name = clinic_config.get("clinic_name", "Clínica")
        story.append(Paragraph(clinic_name, header_style))
        
        if clinic_config.get("address"):
            story.append(Paragraph(clinic_config["address"], header_style))
        
        contact_info = []
        if clinic_config.get("phone"):
            contact_info.append(f"Tel: {clinic_config['phone']}")
        if clinic_config.get("email"):
            contact_info.append(f"Email: {clinic_config['email']}")
        if contact_info:
            story.append(Paragraph(" | ".join(contact_info), header_style))
        
        story.append(Spacer(1, 1*cm))
        
        # Tipo de documento
        record_type_label = {
            "prontuario": "PRONTUÁRIO MÉDICO",
            "receita": "RECEITA MÉDICA", 
            "atestado": "ATESTADO MÉDICO"
        }.get(record.get("record_type", "prontuario"), "DOCUMENTO MÉDICO")
        
        story.append(Paragraph(record_type_label, title_style))
        story.append(Spacer(1, 0.5*cm))
        
        # Informações do paciente
        story.append(Paragraph(f"<b>Paciente:</b> {patient_name}", content_style))
        story.append(Paragraph(f"<b>Data:</b> {datetime.now(timezone.utc).strftime('%d/%m/%Y')}", content_style))
        story.append(Spacer(1, 0.5*cm))
        
        # Diagnóstico
        if record.get("diagnosis"):
            story.append(Paragraph(f"<b>Diagnóstico:</b> {record['diagnosis']}", content_style))
            story.append(Spacer(1, 0.3*cm))
        
        # Conteúdo/Observações
        if record.get("observations"):
            story.append(Paragraph("<b>Conteúdo:</b>", content_style))
            # Dividir em parágrafos
            for para in record["observations"].split('\n'):
                if para.strip():
                    story.append(Paragraph(para, content_style))
            story.append(Spacer(1, 0.5*cm))
        
        # Rodapé com dados do médico
        story.append(Spacer(1, 1*cm))
        if record.get("doctor_name"):
            story.append(Paragraph(f"<b>Dr(a). {record['doctor_name']}</b>", content_style))
        if record.get("crm"):
            story.append(Paragraph(f"CRM: {record['crm']}", content_style))
        
        # Gerar PDF
        doc.build(story)
        pdf_bytes = buffer.getvalue()
        buffer.close()
        
        # Upload do PDF para WhatsApp (via URL ou diretamente)
        # Primeiro: fazer upload do media
        media_url = f"https://graph.facebook.com/v21.0/{phone_number_id}/media"
        
        files = {
            'file': ('prontuario.pdf', pdf_bytes, 'application/pdf'),
            'messaging_product': (None, 'whatsapp')
        }
        headers_upload = {
            "Authorization": f"Bearer {access_token}"
        }
        
        upload_response = requests.post(media_url, headers=headers_upload, files=files)
        
        if upload_response.status_code != 200:
            print(f"Erro ao fazer upload: {upload_response.text}")
            raise HTTPException(status_code=400, detail=f"Erro ao fazer upload do PDF: {upload_response.text}")
        
        media_id = upload_response.json().get('id')
        
        # Enviar documento via WhatsApp
        send_url = f"https://graph.facebook.com/v21.0/{phone_number_id}/messages"
        headers_send = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean_phone,
            "type": "document",
            "document": {
                "id": media_id,
                "caption": f"📄 {record_type_label}\n\nOlá {patient_name}, segue seu documento médico.",
                "filename": f"{record_type_label.lower().replace(' ', '_')}.pdf"
            }
        }
        
        send_response = requests.post(send_url, headers=headers_send, json=payload)
        
        if send_response.status_code == 200:
            return {"success": True, "message": "PDF enviado via WhatsApp com sucesso!"}
        else:
            print(f"Erro ao enviar WhatsApp: {send_response.text}")
            raise HTTPException(status_code=400, detail=f"Erro ao enviar: {send_response.text}")
            
    except Exception as e:
        print(f"Erro ao enviar prontuário via WhatsApp: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/medical-records", response_model=List[MedicalRecord])
async def get_all_medical_records(current_user: dict = Depends(get_current_user)):
    records = await db.medical_records.find({}, {"_id": 0}).to_list(1000)
    for record in records:
        if isinstance(record['created_at'], str):
            record['created_at'] = datetime.fromisoformat(record['created_at'])
    return records

@api_router.put("/medical-records/{record_id}", response_model=MedicalRecord)
async def update_medical_record(record_id: str, data: MedicalRecordCreate, current_user: dict = Depends(get_current_user)):
    result = await db.medical_records.update_one(
        {"id": record_id},
        {"$set": data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Medical record not found")
    
    updated = await db.medical_records.find_one({"id": record_id}, {"_id": 0})
    if isinstance(updated['created_at'], str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    return MedicalRecord(**updated)

@api_router.delete("/medical-records/{record_id}")
async def delete_medical_record(record_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.medical_records.delete_one({"id": record_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Medical record not found")
    return {"message": "Medical record deleted successfully"}

# Lead Routes
@api_router.post("/leads", response_model=Lead)
async def create_lead(data: LeadCreate, current_user: dict = Depends(get_current_user)):
    # Verificar se já existe paciente com mesmo telefone ou email
    or_conditions = [{"phone": data.phone}]
    if data.email:
        or_conditions.append({"email": data.email})
    
    existing_patient = await db.patients.find_one({
        "$or": or_conditions
    }, {"_id": 0})
    
    if existing_patient:
        raise HTTPException(
            status_code=400, 
            detail="Este contato já é um paciente cadastrado. Não é possível criar um lead."
        )
    
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
    
    # Verificar se já existe paciente com mesmo email ou telefone
    or_conditions = [{"phone": lead["phone"]}]
    if lead.get("email"):
        or_conditions.append({"email": lead["email"]})
    
    existing_patient = await db.patients.find_one({
        "$or": or_conditions
    }, {"_id": 0})
    
    if existing_patient:
        raise HTTPException(status_code=400, detail="Paciente com este email ou telefone já existe")
    
    # Criar paciente
    patient = Patient(
        name=lead["name"],
        email=lead.get("email") or None,
        phone=lead["phone"],
        birthdate=birthdate,
        address=address or None
    )
    
    doc = patient.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.patients.insert_one(doc)
    
    # DELETAR o lead da lista (não apenas marcar como convertido)
    await db.leads.delete_one({"id": lead_id})
    
    return patient

@api_router.post("/leads/cleanup-duplicates")
async def cleanup_duplicate_leads(current_user: dict = Depends(get_current_user)):
    """Remove leads que já são pacientes (mesmo telefone ou email)"""
    # Buscar todos os pacientes
    patients = await db.patients.find({}, {"_id": 0, "email": 1, "phone": 1}).to_list(10000)
    patient_emails = [p.get("email") for p in patients if p.get("email")]
    patient_phones = [p.get("phone") for p in patients if p.get("phone")]
    
    # Buscar leads duplicados
    duplicate_leads = await db.leads.find({
        "$or": [
            {"email": {"$in": patient_emails}},
            {"phone": {"$in": patient_phones}}
        ]
    }, {"_id": 0, "id": 1}).to_list(10000)
    
    # Deletar leads duplicados
    deleted_count = 0
    for lead in duplicate_leads:
        await db.leads.delete_one({"id": lead["id"]})
        deleted_count += 1
    
    return {
        "message": f"{deleted_count} leads duplicados foram removidos",
        "deleted_count": deleted_count
    }

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
    # Buscar conversa e lead
    conversation = await db.conversations.find_one({"id": conversation_id}, {"_id": 0})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    lead = await db.leads.find_one({"id": conversation["lead_id"]}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Criar mensagem no banco
    message = Message(
        conversation_id=conversation_id,
        sender_type="consultant",
        sender_id=current_user["id"],
        sender_name=current_user["name"],
        content=data.content,
        read=False
    )
    doc = message.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.messages.insert_one(doc)
    
    # Atualizar last_message_at da conversa
    await db.conversations.update_one(
        {"id": conversation_id},
        {"$set": {"last_message_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Enviar mensagem via WhatsApp API se for canal whatsapp
    if conversation.get("channel") == "whatsapp":
        try:
            # Buscar configurações do WhatsApp
            settings = await db.settings.find_one({"type": "omnichannel"}, {"_id": 0})
            if settings and settings.get("config", {}).get("whatsapp", {}).get("enabled"):
                whatsapp_config = settings["config"]["whatsapp"]
                phone_number_id = whatsapp_config.get("phone_number_id")
                access_token = whatsapp_config.get("access_token")
                
                if phone_number_id and access_token:
                    # Enviar mensagem via WhatsApp Graph API
                    whatsapp_url = f"https://graph.facebook.com/v21.0/{phone_number_id}/messages"
                    headers = {
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json"
                    }
                    payload = {
                        "messaging_product": "whatsapp",
                        "to": lead["phone"],
                        "type": "text",
                        "text": {
                            "body": data.content
                        }
                    }
                    
                    async with httpx.AsyncClient() as client:
                        response = await client.post(whatsapp_url, json=payload, headers=headers, timeout=10)
                        
                        if response.status_code == 200:
                            print(f"[WhatsApp] Message sent successfully to {lead['phone']}")
                        else:
                            print(f"[WhatsApp] Failed to send message: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"[WhatsApp] Error sending message: {str(e)}")
            # Não falhar a requisição se o envio do WhatsApp falhar
    
    return message

@api_router.put("/conversations/{conversation_id}/assign")
async def assign_conversation(conversation_id: str, current_user: dict = Depends(get_current_user)):
    """Atribui a conversa ao consultor atual"""
    result = await db.conversations.update_one(
        {"id": conversation_id},
        {"$set": {
            "assigned_to": current_user["id"],
            "assigned_to_name": current_user["name"]
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"message": "Conversation assigned successfully"}

@api_router.put("/conversations/{conversation_id}/close")
async def close_conversation(conversation_id: str, current_user: dict = Depends(get_current_user)):
    """Fecha a conversa"""
    result = await db.conversations.update_one(
        {"id": conversation_id},
        {"$set": {"status": "closed"}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"message": "Conversation closed successfully"}

@api_router.put("/conversations/{conversation_id}/reopen")
async def reopen_conversation(conversation_id: str, current_user: dict = Depends(get_current_user)):
    """Reabre a conversa"""
    result = await db.conversations.update_one(
        {"id": conversation_id},
        {"$set": {"status": "active"}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"message": "Conversation reopened successfully"}

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
async def update_followup(followup_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    result = await db.followups.update_one(
        {"id": followup_id},
        {"$set": data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="FollowUp not found")
    return {"message": "FollowUp updated successfully"}

@api_router.delete("/followups/{followup_id}")
async def delete_followup(followup_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.followups.delete_one({"id": followup_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="FollowUp not found")
    return {"message": "FollowUp deleted successfully"}

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

# Settings Routes
@api_router.get("/settings/omnichannel")
async def get_omnichannel_settings(current_user: dict = Depends(get_current_user)):
    """Retorna as configurações do omnichannel"""
    settings = await db.settings.find_one({"type": "omnichannel"}, {"_id": 0})
    if not settings:
        return {"whatsapp": {}, "instagram": {}, "messenger": {}}
    return settings.get("config", {"whatsapp": {}, "instagram": {}, "messenger": {}})

@api_router.post("/settings/omnichannel/whatsapp")
async def save_whatsapp_settings(config: dict, current_user: dict = Depends(get_current_user)):
    """Salva configurações do WhatsApp"""
    await db.settings.update_one(
        {"type": "omnichannel"},
        {"$set": {"config.whatsapp": config, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    return {"message": "WhatsApp settings saved successfully"}

@api_router.post("/settings/omnichannel/instagram")
async def save_instagram_settings(config: dict, current_user: dict = Depends(get_current_user)):
    """Salva configurações do Instagram"""
    await db.settings.update_one(
        {"type": "omnichannel"},
        {"$set": {"config.instagram": config, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    return {"message": "Instagram settings saved successfully"}

@api_router.post("/settings/omnichannel/messenger")
async def save_messenger_settings(config: dict, current_user: dict = Depends(get_current_user)):
    """Salva configurações do Messenger"""
    await db.settings.update_one(
        {"type": "omnichannel"},
        {"$set": {"config.messenger": config, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    return {"message": "Messenger settings saved successfully"}

@api_router.post("/settings/omnichannel/{channel}/test")
async def test_connection(channel: str, current_user: dict = Depends(get_current_user)):
    """Testa a conexão com o canal"""
    # Aqui você implementaria a lógica real de teste com as APIs
    # Por enquanto, retornamos sucesso simulado
    return {"success": True, "message": f"Connection to {channel} tested successfully"}

# Clinic Settings Routes
@api_router.get("/settings/clinic")
async def get_clinic_settings(current_user: dict = Depends(get_current_user)):
    """Busca configurações da clínica"""
    settings = await db.settings.find_one({"type": "clinic"}, {"_id": 0})
    if settings:
        return settings.get("config", {})
    return {}

@api_router.post("/settings/clinic")
async def save_clinic_settings(config: dict, current_user: dict = Depends(get_current_user)):
    """Salva configurações da clínica"""
    await db.settings.update_one(
        {"type": "clinic"},
        {"$set": {"config": config, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    return {"message": "Clinic settings saved successfully"}

# Webhook Routes (para Meta/Facebook)
@api_router.get("/webhooks/whatsapp")
async def verify_whatsapp_webhook(request: Request):
    """Verificação do webhook do WhatsApp pelo Meta"""
    from fastapi.responses import PlainTextResponse
    
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")
    
    print(f"\n========== WhatsApp Webhook Verification ==========")
    print(f"[RECEIVED] Mode: {mode}")
    print(f"[RECEIVED] Verify Token: {token}")
    print(f"[RECEIVED] Challenge: {challenge}")
    print(f"[INFO] Request URL: {request.url}")
    print(f"[INFO] Request Method: {request.method}")
    
    # Buscar o verify_token configurado
    settings = await db.settings.find_one({"type": "omnichannel"}, {"_id": 0})
    if not settings:
        print("[ERROR] ❌ Settings not found in database")
        print("===================================================\n")
        raise HTTPException(status_code=403, detail="Settings not configured")
    
    stored_token = settings.get("config", {}).get("whatsapp", {}).get("verify_token")
    print(f"[DATABASE] Stored Verify Token: {stored_token}")
    
    # Validação detalhada
    if not mode:
        print("[ERROR] ❌ Mode parameter is missing")
        print("===================================================\n")
        raise HTTPException(status_code=400, detail="Mode parameter is required")
    
    if not token:
        print("[ERROR] ❌ Verify token parameter is missing")
        print("===================================================\n")
        raise HTTPException(status_code=400, detail="Verify token parameter is required")
    
    if not challenge:
        print("[ERROR] ❌ Challenge parameter is missing")
        print("===================================================\n")
        raise HTTPException(status_code=400, detail="Challenge parameter is required")
    
    if mode != "subscribe":
        print(f"[ERROR] ❌ Invalid mode: {mode} (expected 'subscribe')")
        print("===================================================\n")
        raise HTTPException(status_code=403, detail="Invalid mode")
    
    if token != stored_token:
        print(f"[ERROR] ❌ Token mismatch!")
        print(f"  Received: '{token}'")
        print(f"  Expected: '{stored_token}'")
        print("===================================================\n")
        raise HTTPException(status_code=403, detail="Verification token mismatch")
    
    # Sucesso!
    print(f"[SUCCESS] ✅ Verification successful!")
    print(f"[RESPONSE] Returning challenge: {challenge}")
    print("===================================================\n")
    
    # Retornar o challenge como texto simples (não JSON)
    return PlainTextResponse(content=challenge, status_code=200)

@api_router.post("/webhooks/whatsapp")
async def whatsapp_webhook(request: Request):
    """Recebe mensagens do WhatsApp"""
    try:
        body = await request.json()
        
        # LOG DETALHADO para debug
        print("\n" + "="*80)
        print("🔔 WEBHOOK WHATSAPP RECEBIDO")
        print(f"📅 Timestamp: {datetime.now(timezone.utc).isoformat()}")
        print(f"📦 Body completo: {json.dumps(body, indent=2)}")
        print("="*80 + "\n")
        
        # Processar mensagens recebidas
        if body.get("object") == "whatsapp_business_account":
            for entry in body.get("entry", []):
                for change in entry.get("changes", []):
                    if change.get("field") == "messages":
                        messages = change.get("value", {}).get("messages", [])
                        
                        for message in messages:
                            # Extrair dados da mensagem
                            from_number = message.get("from")
                            message_id = message.get("id")
                            message_text = message.get("text", {}).get("body", "")
                            timestamp = message.get("timestamp")
                            
                            # Buscar ou criar lead
                            lead = await db.leads.find_one({"phone": from_number}, {"_id": 0})
                            if not lead:
                                # Criar novo lead
                                lead = {
                                    "id": str(uuid.uuid4()),
                                    "name": f"Lead WhatsApp {from_number[-4:]}",
                                    "phone": from_number,
                                    "email": None,
                                    "status": "novo",
                                    "source": "whatsapp",
                                    "created_at": datetime.now(timezone.utc).isoformat()
                                }
                                await db.leads.insert_one(lead)
                            
                            # Buscar ou criar conversa
                            conversation = await db.conversations.find_one(
                                {"lead_id": lead["id"], "channel": "whatsapp", "status": "active"},
                                {"_id": 0}
                            )
                            if not conversation:
                                conversation = {
                                    "id": str(uuid.uuid4()),
                                    "lead_id": lead["id"],
                                    "channel": "whatsapp",
                                    "assigned_to": None,
                                    "assigned_to_name": None,
                                    "status": "active",
                                    "last_message_at": datetime.now(timezone.utc).isoformat(),
                                    "created_at": datetime.now(timezone.utc).isoformat()
                                }
                                await db.conversations.insert_one(conversation)
                            
                            # Criar mensagem
                            msg = {
                                "id": str(uuid.uuid4()),
                                "conversation_id": conversation["id"],
                                "sender_type": "lead",
                                "sender_id": lead["id"],
                                "sender_name": lead["name"],
                                "content": message_text,
                                "read": False,
                                "created_at": datetime.now(timezone.utc).isoformat()
                            }
                            await db.messages.insert_one(msg)
                            
                            # Atualizar última mensagem da conversa
                            await db.conversations.update_one(
                                {"id": conversation["id"]},
                                {"$set": {"last_message_at": datetime.now(timezone.utc).isoformat()}}
                            )
        
        return {"status": "ok"}
    except Exception as e:
        print(f"Erro no webhook WhatsApp: {e}")
        return {"status": "ok"}  # Sempre retornar 200 para o Meta

@api_router.get("/webhooks/instagram")
async def verify_instagram_webhook(request: Request):
    """Verificação do webhook do Instagram pelo Meta"""
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")
    
    settings = await db.settings.find_one({"type": "omnichannel"}, {"_id": 0})
    if not settings:
        raise HTTPException(status_code=403, detail="Settings not configured")
    
    stored_token = settings.get("config", {}).get("instagram", {}).get("verify_token")
    
    if mode == "subscribe" and token == stored_token:
        return int(challenge)
    else:
        raise HTTPException(status_code=403, detail="Verification token mismatch")

@api_router.post("/webhooks/instagram")
async def instagram_webhook(request: Request):
    """Recebe mensagens do Instagram"""
    try:
        body = await request.json()
        
        if body.get("object") == "instagram":
            for entry in body.get("entry", []):
                for messaging in entry.get("messaging", []):
                    sender_id = messaging.get("sender", {}).get("id")
                    message = messaging.get("message", {})
                    message_text = message.get("text", "")
                    
                    if sender_id and message_text:
                        # Buscar ou criar lead
                        lead = await db.leads.find_one({"source_id": sender_id, "source": "instagram"}, {"_id": 0})
                        if not lead:
                            lead = {
                                "id": str(uuid.uuid4()),
                                "name": f"Lead Instagram {sender_id[-4:]}",
                                "phone": "",
                                "email": "",
                                "status": "novo",
                                "source": "instagram",
                                "source_id": sender_id,
                                "created_at": datetime.now(timezone.utc).isoformat()
                            }
                            await db.leads.insert_one(lead)
                        
                        # Buscar ou criar conversa
                        conversation = await db.conversations.find_one(
                            {"lead_id": lead["id"], "channel": "instagram", "status": "active"},
                            {"_id": 0}
                        )
                        if not conversation:
                            conversation = {
                                "id": str(uuid.uuid4()),
                                "lead_id": lead["id"],
                                "channel": "instagram",
                                "assigned_to": None,
                                "assigned_to_name": None,
                                "status": "active",
                                "last_message_at": datetime.now(timezone.utc).isoformat(),
                                "created_at": datetime.now(timezone.utc).isoformat()
                            }
                            await db.conversations.insert_one(conversation)
                        
                        # Criar mensagem
                        msg = {
                            "id": str(uuid.uuid4()),
                            "conversation_id": conversation["id"],
                            "sender_type": "lead",
                            "sender_id": lead["id"],
                            "sender_name": lead["name"],
                            "content": message_text,
                            "read": False,
                            "created_at": datetime.now(timezone.utc).isoformat()
                        }
                        await db.messages.insert_one(msg)
                        
                        await db.conversations.update_one(
                            {"id": conversation["id"]},
                            {"$set": {"last_message_at": datetime.now(timezone.utc).isoformat()}}
                        )
        
        return {"status": "ok"}
    except Exception as e:
        print(f"Erro no webhook Instagram: {e}")
        return {"status": "ok"}

@api_router.get("/webhooks/messenger")
async def verify_messenger_webhook(request: Request):
    """Verificação do webhook do Messenger pelo Meta"""
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")
    
    settings = await db.settings.find_one({"type": "omnichannel"}, {"_id": 0})
    if not settings:
        raise HTTPException(status_code=403, detail="Settings not configured")
    
    stored_token = settings.get("config", {}).get("messenger", {}).get("verify_token")
    
    if mode == "subscribe" and token == stored_token:
        return int(challenge)
    else:
        raise HTTPException(status_code=403, detail="Verification token mismatch")

@api_router.post("/webhooks/messenger")
async def messenger_webhook(request: Request):
    """Recebe mensagens do Messenger"""
    try:
        body = await request.json()
        
        if body.get("object") == "page":
            for entry in body.get("entry", []):
                for messaging in entry.get("messaging", []):
                    sender_id = messaging.get("sender", {}).get("id")
                    message = messaging.get("message", {})
                    message_text = message.get("text", "")
                    
                    if sender_id and message_text:
                        lead = await db.leads.find_one({"source_id": sender_id, "source": "messenger"}, {"_id": 0})
                        if not lead:
                            lead = {
                                "id": str(uuid.uuid4()),
                                "name": f"Lead Messenger {sender_id[-4:]}",
                                "phone": "",
                                "email": "",
                                "status": "novo",
                                "source": "messenger",
                                "source_id": sender_id,
                                "created_at": datetime.now(timezone.utc).isoformat()
                            }
                            await db.leads.insert_one(lead)
                        
                        conversation = await db.conversations.find_one(
                            {"lead_id": lead["id"], "channel": "messenger", "status": "active"},
                            {"_id": 0}
                        )
                        if not conversation:
                            conversation = {
                                "id": str(uuid.uuid4()),
                                "lead_id": lead["id"],
                                "channel": "messenger",
                                "assigned_to": None,
                                "assigned_to_name": None,
                                "status": "active",
                                "last_message_at": datetime.now(timezone.utc).isoformat(),
                                "created_at": datetime.now(timezone.utc).isoformat()
                            }
                            await db.conversations.insert_one(conversation)
                        
                        msg = {
                            "id": str(uuid.uuid4()),
                            "conversation_id": conversation["id"],
                            "sender_type": "lead",
                            "sender_id": lead["id"],
                            "sender_name": lead["name"],
                            "content": message_text,
                            "read": False,
                            "created_at": datetime.now(timezone.utc).isoformat()
                        }
                        await db.messages.insert_one(msg)
                        
                        await db.conversations.update_one(
                            {"id": conversation["id"]},
                            {"$set": {"last_message_at": datetime.now(timezone.utc).isoformat()}}
                        )
        
        return {"status": "ok"}
    except Exception as e:
        print(f"Erro no webhook Messenger: {e}")
        return {"status": "ok"}

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