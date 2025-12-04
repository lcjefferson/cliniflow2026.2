from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request
from fastapi.responses import StreamingResponse
import io
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from fastapi_socketio import SocketManager
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
try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler as AsyncScheduler
    from apscheduler.triggers.cron import CronTrigger
except Exception:
    AsyncScheduler = None
    CronTrigger = None
from contextlib import asynccontextmanager
try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
except Exception:
    LlmChat = None
    class UserMessage:
        def __init__(self, text: str):
            self.text = text
import httpx
import json
import base64

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', '').strip()
db_name = os.environ.get('DB_NAME', 'clinicflow').strip()
allowed_origins_env = os.environ.get('ALLOWED_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000')
ALLOWED_ORIGINS = [o.strip() for o in allowed_origins_env.split(',') if o.strip()]
client: Optional[AsyncIOMotorClient] = None
db = None
if mongo_url:
    client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
    try:
        db = client.get_database(db_name)
        # Force connection test
        client.admin.command('ping') 
        print("MongoDB connection successful")
    except Exception as e:
        print(f"Error connecting to MongoDB: {e}")
        client = None
        db = None

DEMO_MODE = db is None
mem = {
    "users": [],
    "professionals": [],
    "services": [],
    "rooms": [],
    "patients": [],
    "appointments": [],
    "transactions": [],
    "medical_records": [],
    "leads": [],
    "follow_ups": [],
    "settings": {}
}

def _match(doc, flt):
    for k, v in (flt or {}).items():
        parts = k.split('.')
        cur = doc
        for p in parts:
            if isinstance(cur, list):
                if not any(isinstance(it, dict) and it.get(p) == v for it in cur):
                    return False
                cur = v
                break
            cur = cur.get(p) if isinstance(cur, dict) else None
        if isinstance(cur, dict):
            if cur != v:
                return False
        else:
            if cur != v:
                return False
    return True

def _find(coll, flt=None):
    return [d.copy() for d in mem[coll] if _match(d, flt or {})]

def _find_one(coll, flt=None):
    for d in mem[coll]:
        if _match(d, flt or {}):
            return d.copy()
    return None

def _insert_one(coll, doc):
    mem[coll].append(doc.copy())
    return {"inserted_id": doc.get("id")}

def _update_one(coll, flt, update):
    for i, d in enumerate(mem[coll]):
        if _match(d, flt or {}):
            if "$set" in update:
                for k, v in update["$set"].items():
                    parts = k.split('.')
                    cur = d
                    for p in parts[:-1]:
                        if p not in cur or not isinstance(cur[p], dict):
                            cur[p] = {}
                        cur = cur[p]
                    cur[parts[-1]] = v
            if "$push" in update:
                for k, v in update["$push"].items():
                    d.setdefault(k, []).append(v)
            if "$pull" in update:
                for k, v in update["$pull"].items():
                    if isinstance(v, dict) and 'id' in v:
                        d[k] = [it for it in d.get(k, []) if it.get('id') != v['id']]
            if "$addToSet" in update:
                for k, v in update["$addToSet"].items():
                    arr = d.setdefault(k, [])
                    if v not in arr:
                        arr.append(v)
            mem[coll][i] = d
            return {"matched_count": 1, "modified_count": 1}
    return {"matched_count": 0, "modified_count": 0}

def _delete_one(coll, flt):
    for i, d in enumerate(mem[coll]):
        if _match(d, flt or {}):
            mem[coll].pop(i)
            return {"deleted_count": 1}
    return {"deleted_count": 0}

def _sum(coll, key):
    s = 0
    for d in mem[coll]:
        s += float(d.get(key) or 0)
    return s

# Password hashing
PWD_SCHEME = os.environ.get('PASSWORD_SCHEME', 'bcrypt')
if PWD_SCHEME == 'sha256_crypt':
    pwd_context = CryptContext(schemes=['sha256_crypt', 'bcrypt'], deprecated="auto")
else:
    pwd_context = CryptContext(schemes=['bcrypt', 'sha256_crypt'], deprecated="auto")

# JWT configuration
JWT_SECRET = os.environ.get('JWT_SECRET_KEY', 'your-secret-key')
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
JWT_EXPIRATION = int(os.environ.get('JWT_EXPIRATION_MINUTES', '10080'))

security = HTTPBearer()

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



scheduler = AsyncScheduler() if AsyncScheduler else None

# Automation: Follow-up rules and birthday greetings
def _is_birthday_with_offset(birthdate_str, days_offset):
    if not birthdate_str:
        return False
    try:
        birth_date = datetime.fromisoformat(birthdate_str).date()
        # The logic should be: today is birthday + offset. So, today - offset is birthday.
        check_date = datetime.now(timezone.utc).date() - timedelta(days=days_offset)
        return birth_date.month == check_date.month and birth_date.day == check_date.day
    except (ValueError, TypeError):
        return False

async def check_and_send_birthday_greetings():
    if db is None:
        logging.warning("Database unavailable, skipping birthday check.")
        return
    
    logging.info("Checking for birthday greetings...")
    
    try:
        rules = await db.follow_up_rules.find({"trigger": "patient_birthday", "active": True}).to_list(100)
        if not rules:
            logging.info("No active birthday follow-up rules found.")
            return

        patients_cursor = db.patients.find({}, {"_id": 0, "id": 1, "name": 1, "birthdate": 1, "phone": 1})
        
        async for patient in patients_cursor:
            for rule in rules:
                days_offset = rule.get('days_after', 0)
                
                if _is_birthday_with_offset(patient.get('birthdate'), days_offset):
                    message = rule['message_template'].format(patient_name=patient['name'])
                    
                    # Here, you would integrate with a messaging service (e.g., WhatsApp)
                    # to send the message to patient['phone']
                    logging.info(f"Sending birthday greeting to {patient['name']} (phone: {patient['phone']}): {message}")
                    
                    # Optional: Create a follow-up record for tracking
                    follow_up = FollowUp(
                        patient_id=patient['id'],
                        scheduled_date=datetime.now(timezone.utc).isoformat(),
                        notes=f"Mensagem de aniversário enviada: {message}",
                        status="completed",
                        contact_type="whatsapp", # Assuming WhatsApp
                        contact_reason="informativo"
                    )
                    doc = follow_up.model_dump()
                    doc['created_at'] = doc['created_at'].isoformat()
                    await db.follow_ups.insert_one(doc)

    except Exception as e:
        logging.error(f"Error during birthday check: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    if scheduler and CronTrigger:
        try:
            scheduler.start()
            scheduler.add_job(check_and_send_birthday_greetings, CronTrigger(hour=9, minute=0), id="birthday_check")
        except Exception:
            pass
    if db is not None:
        try:
            await db.patients.create_index("id")
            await db.patients.create_index("phone")
            await db.patients.create_index("email")
            await db.patients.create_index([("created_at", -1)])
            await db.transactions.create_index("patient_id")
            await db.transactions.create_index([("patient_id", 1), ("status", 1)])
            await db.transactions.create_index([("created_at", -1)])
            await db.appointments.create_index([("patient_id", 1), ("paid", 1)])
            await db.appointments.create_index("appointment_date")
            await db.professionals.create_index("id")
            await db.professionals.create_index("name")
            await db.professionals.create_index([("created_at", -1)])
            await db.leads.create_index("status")
            await db.leads.create_index("phone")
            await db.leads.create_index("email")
            await db.leads.create_index([("created_at", -1)])
        except Exception:
            pass
    yield
    if scheduler:
        try:
            scheduler.shutdown(wait=False)
        except Exception:
            pass

app = FastAPI(lifespan=lifespan)

@app.middleware("http")
async def add_no_cache_header(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

sio = SocketManager(app=app)
api_router = APIRouter(prefix="/api")

@api_router.get("/health")
async def health_check():
    return {"status": "ok"}

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
    name: str
    start_date: str
    description: Optional[str] = None
    prescribed_medications: Optional[str] = None
    frequency: Optional[str] = None
    estimated_duration: Optional[str] = None
    professional_id: Optional[str] = None
    status: str = "ongoing"  # ongoing, completed

class TreatmentUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[str] = None
    description: Optional[str] = None
    prescribed_medications: Optional[str] = None
    frequency: Optional[str] = None
    estimated_duration: Optional[str] = None
    professional_id: Optional[str] = None
    status: Optional[str] = None

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

def validate_date(date_string: str):
    try:
        datetime.strptime(date_string, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de data inválido. Por favor, use AAAA-MM-DD.")

@api_router.post("/patients/{patient_id}/treatments", response_model=Treatment)
async def add_treatment(patient_id: str, treatment_data: Treatment, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    validate_date(treatment_data.start_date)

    new_treatment = treatment_data.model_dump()
    
    result = await db.patients.update_one(
        {"id": patient_id},
        {"$push": {"treatments": new_treatment}}
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")

    return new_treatment

@api_router.delete("/patients/{patient_id}/treatments/{treatment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_treatment(patient_id: str, treatment_id: str, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    result = await db.patients.update_one(
        {"id": patient_id},
        {"$pull": {"treatments": {"id": treatment_id}}}
    )

    if result.modified_count == 0:
        # This can happen if the patient or the treatment does not exist.
        # We check if the patient exists to give a more specific error.
        patient = await db.patients.find_one({"id": patient_id})
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        # If patient exists, then the treatment was not found.
        # In a DELETE operation, this is often considered a success (idempotency),
        # so we might not need to raise an error here.
        # However, if feedback is desired, a 404 is appropriate.
        raise HTTPException(status_code=404, detail="Treatment not found")

    return

@api_router.put("/patients/{patient_id}/treatments/{treatment_id}", response_model=Treatment)
async def update_treatment(patient_id: str, treatment_id: str, treatment_update: TreatmentUpdate, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    # Validate date if it's being updated
    if treatment_update.start_date:
        validate_date(treatment_update.start_date)

    update_data = treatment_update.model_dump(exclude_unset=True)
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")

    # Build the update query
    update_fields = {f"treatments.$.{key}": value for key, value in update_data.items()}

    result = await db.patients.update_one(
        {"id": patient_id, "treatments.id": treatment_id},
        {"$set": update_fields}
    )

    if result.modified_count == 0:
        # Check if the patient exists to give a more specific error
        patient = await db.patients.find_one({"id": patient_id})
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        # Check if the treatment exists
        treatment_exists = any(t['id'] == treatment_id for t in patient.get('treatments', []))
        if not treatment_exists:
            raise HTTPException(status_code=404, detail="Treatment not found")
        
        # If both exist but nothing was modified, it might be that the data is the same
        # or another issue. For simplicity, we'll return the current data.

    # Retrieve the updated treatment to return it
    updated_patient = await db.patients.find_one({"id": patient_id})
    if updated_patient:
        for treatment in updated_patient.get("treatments", []):
            if treatment["id"] == treatment_id:
                return treatment

    raise HTTPException(status_code=404, detail="Could not retrieve updated treatment")

class Patient(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    birthdate: Optional[str] = None
    address: Optional[str] = None
    attachments: List[Attachment] = []
    treatments: List[Treatment] = []
    professionals: List[str] = []
    anamnese: Optional[Anamnese] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PatientCreate(BaseModel):
    name: str  # Obrigatório
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    birthdate: Optional[str] = None
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
    status: Optional[str] = None
    amount: Optional[float] = None
    paid: bool = False
    notes: Optional[str] = None

class AppointmentUpdate(BaseModel):
    patient_id: Optional[str] = None
    professional_id: Optional[str] = None
    service_id: Optional[str] = None
    room_id: Optional[str] = None
    appointment_date: Optional[str] = None
    appointment_time: Optional[str] = None
    appointment_time_end: Optional[str] = None
    status: Optional[str] = None
    amount: Optional[float] = None
    paid: Optional[bool] = None
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

class TransactionUpdate(BaseModel):
    patient_id: Optional[str] = None
    appointment_id: Optional[str] = None
    amount: Optional[float] = None
    payment_method: Optional[str] = None
    description: Optional[str] = None
    transaction_date: Optional[str] = None
    status: Optional[str] = None

class MedicalRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    record_type: Optional[str] = "prontuario"
    professional_id: Optional[str] = None
    appointment_id: Optional[str] = None
    diagnosis: Optional[str] = None
    symptoms: Optional[str] = None
    treatment: Optional[str] = None
    medications: Optional[str] = None
    observations: Optional[str] = None
    doctor_name: Optional[str] = None
    professional_council_type: Optional[str] = None
    crm: Optional[str] = None
    professional_registration: Optional[str] = None
    prescription: Optional[str] = None
    medical_certificate: Optional[str] = None
    template_used: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_updated: Optional[datetime] = None

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
    professional_council_type: Optional[str] = None  # CRM, CRO, COREN, CREFITO, CRP, etc
    crm: Optional[str] = None  # Mantido para compatibilidade (deprecated - usar professional_registration)
    professional_registration: Optional[str] = None  # Número do registro profissional
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
    lead_id: Optional[str] = None
    patient_id: Optional[str] = None
    assigned_to: Optional[str] = None
    scheduled_date: str
    notes: Optional[str] = None
    status: str = "pending"  # pending, completed, cancelled
    contact_type: Optional[str] = None  # whatsapp, phone, email
    contact_reason: Optional[str] = None  # comercial, informativo
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FollowUpCreate(BaseModel):
    lead_id: Optional[str] = None
    patient_id: Optional[str] = None
    assigned_to: Optional[str] = None
    scheduled_date: str
    notes: Optional[str] = None
    contact_type: Optional[str] = None
    contact_reason: Optional[str] = None

class FollowUpUpdate(BaseModel):
    lead_id: Optional[str] = None
    patient_id: Optional[str] = None
    assigned_to: Optional[str] = None
    scheduled_date: Optional[str] = None
    notes: Optional[str] = None
    contact_type: Optional[str] = None
    contact_reason: Optional[str] = None
    status: Optional[str] = None

class FollowUpRule(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: str  # comercial, informativo
    trigger: str  # lead_created, appointment_created, appointment_completed, patient_birthday
    days_after: int
    message_template: str
    active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FollowUpRuleCreate(BaseModel):
    name: str
    type: str
    trigger: str
    days_after: int
    message_template: str
    active: bool = True

class AutoMessageRequest(BaseModel):
    patient_id: str
    message_type: str  # birthday, appointment_reminder
    appointment_id: Optional[str] = None

class GenerateDocumentRequest(BaseModel):
    record_id: str
    document_type: str  # prescription, certificate



# Transaction Routes
@api_router.get("/transactions", response_model=List[Transaction])
async def get_transactions(current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    transactions = await db.transactions.find({}, {"_id": 0}).to_list(1000)
    for trans in transactions:
        try:
            if isinstance(trans.get('created_at'), datetime):
                trans['created_at'] = trans['created_at'].isoformat()
        except Exception as e:
            logging.error(f"Error converting created_at for transaction {trans.get('id')}: {e}")
            trans['created_at'] = None
    return transactions

@api_router.put("/transactions/{transaction_id}", response_model=Transaction)
async def update_transaction(transaction_id: str, transaction: TransactionUpdate, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    update_data = transaction.model_dump(exclude_unset=True)

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    await db.transactions.update_one(
        {"id": transaction_id},
        {"$set": update_data}
    )

    updated_transaction = await db.transactions.find_one({"id": transaction_id}, {"_id": 0})

    if updated_transaction is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if isinstance(updated_transaction.get('created_at'), datetime):
        updated_transaction['created_at'] = updated_transaction['created_at'].isoformat()

    # If linked to an appointment and status is paid, mark appointment as paid
    try:
        if updated_transaction.get('appointment_id') and updated_transaction.get('status') == 'paid':
            await db.appointments.update_one({"id": updated_transaction['appointment_id']}, {"$set": {"paid": True}})
    except Exception:
        pass

    return updated_transaction
@api_router.delete("/transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(transaction_id: str, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    delete_result = await db.transactions.delete_one({"id": transaction_id})
    
    if delete_result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")

@api_router.get("/revenue/total")
async def get_total_revenue(current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    pipeline = [
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    
    result = await db.transactions.aggregate(pipeline).to_list(1)
    
    total_revenue = result[0]['total'] if result else 0
    
    return {"total_revenue": total_revenue}

@api_router.get("/patients/{patient_id}/debts")
async def get_patient_debts(patient_id: str, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    # Unpaid appointments
    cursor = db.appointments.find({"patient_id": patient_id, "paid": False}, {"_id": 0, "id": 1, "appointment_date": 1, "appointment_time": 1, "amount": 1})
    unpaid = await cursor.to_list(1000)
    unpaid_total = sum([(a.get('amount') or 0) for a in unpaid])

    # Pending transactions (if you register debts via transactions)
    trans_cursor = db.transactions.find({"patient_id": patient_id, "status": "pending"}, {"_id": 0, "id": 1, "amount": 1, "description": 1, "transaction_date": 1})
    pending_trans = await trans_cursor.to_list(1000)
    pending_total = sum([(t.get('amount') or 0) for t in pending_trans])

    return {
        "total_debt": (unpaid_total + pending_total),
        "debt_count": len(unpaid),
        "unpaid_appointments": unpaid,
        "pending_transactions": pending_trans
    }

# Helper functions
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        if not hashed_password:
            return False
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRATION)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt

# Authentication Routes
@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserRegister):
    if DEMO_MODE:
        existing_user = next((u for u in mem["users"] if u["email"] == user_data.email), None)
        if existing_user:
            raise HTTPException(status_code=400, detail="Email already registered")
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
        _insert_one("users", doc)
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
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
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
    if DEMO_MODE:
        user = next((u for u in mem["users"] if u["email"] == credentials.email), None)
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
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
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
    user_type = current_user.get("user_type", "consultor")
    if user_type == "profissional":
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
    if DEMO_MODE:
        _insert_one("professionals", doc)
        return professional
    await db.professionals.insert_one(doc)
    return professional

@api_router.get("/professionals", response_model=List[dict])
async def get_professionals(current_user: dict = Depends(get_current_user)):
    if DEMO_MODE:
        professionals = _find("professionals", {})
        for p in professionals:
            if isinstance(p.get('created_at'), str):
                p['created_at'] = datetime.fromisoformat(p['created_at'])
        return professionals
    professionals = await db.professionals.find({}, {"_id": 0}).to_list(1000)
    for p in professionals:
        if isinstance(p.get('created_at'), str):
            p['created_at'] = datetime.fromisoformat(p['created_at'])
    return professionals

@api_router.get("/professionals/{professional_id}", response_model=dict)
async def get_professional(professional_id: str, current_user: dict = Depends(get_current_user)):
    if DEMO_MODE:
        professional = _find_one("professionals", {"id": professional_id})
    else:
        professional = await db.professionals.find_one({"id": professional_id}, {"_id": 0})
    if not professional:
        raise HTTPException(status_code=404, detail="Professional not found")
    if isinstance(professional.get('created_at'), str):
        professional['created_at'] = datetime.fromisoformat(professional['created_at'])
    return professional

@api_router.put("/professionals/{professional_id}")
async def update_professional(professional_id: str, data: ProfessionalCreate, current_user: dict = Depends(get_current_user)):
    if not current_user.get("role", {}).get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    if DEMO_MODE:
        result = _update_one("professionals", {"id": professional_id}, {"$set": update_data})
        if result["matched_count"] == 0:
            raise HTTPException(status_code=404, detail="Professional not found")
        return {"message": "Professional updated successfully"}
    result = await db.professionals.update_one({"id": professional_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Professional not found")
    return {"message": "Professional updated successfully"}

@api_router.delete("/professionals/{professional_id}")
async def delete_professional(professional_id: str, current_user: dict = Depends(get_current_user)):
    if not current_user.get("role", {}).get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    if DEMO_MODE:
        result = _delete_one("professionals", {"id": professional_id})
        if result["deleted_count"] == 0:
            raise HTTPException(status_code=404, detail="Professional not found")
        return {"message": "Professional deleted successfully"}
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
    if DEMO_MODE:
        _insert_one("services", doc)
        return service
    await db.services.insert_one(doc)
    return service

@api_router.get("/services", response_model=List[dict])
async def get_services(current_user: dict = Depends(get_current_user)):
    if DEMO_MODE:
        services = _find("services", {})
        for s in services:
            if isinstance(s.get('created_at'), str):
                s['created_at'] = datetime.fromisoformat(s['created_at'])
        return services
    services = await db.services.find({}, {"_id": 0}).to_list(1000)
    for s in services:
        if isinstance(s.get('created_at'), str):
            s['created_at'] = datetime.fromisoformat(s['created_at'])
    return services

@api_router.put("/services/{service_id}")
async def update_service(service_id: str, data: ServiceCreate, current_user: dict = Depends(get_current_user)):
    if not current_user.get("role", {}).get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await db.services.update_one({"id": service_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Service not found")
    return {"message": "Service updated successfully"}

@api_router.delete("/services/{service_id}")
async def delete_service(service_id: str, current_user: dict = Depends(get_current_user)):
    if not current_user.get("role", {}).get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
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

@api_router.get("/rooms", response_model=List[dict])
async def get_rooms(current_user: dict = Depends(get_current_user)):
    rooms = await db.rooms.find({}, {"_id": 0}).to_list(1000)
    for r in rooms:
        if isinstance(r.get('created_at'), str):
            r['created_at'] = datetime.fromisoformat(r['created_at'])
    return rooms

@api_router.put("/rooms/{room_id}")
async def update_room(room_id: str, data: RoomCreate, current_user: dict = Depends(get_current_user)):
    if not current_user.get("role", {}).get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await db.rooms.update_one({"id": room_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"message": "Room updated successfully"}

@api_router.delete("/rooms/{room_id}")
async def delete_room(room_id: str, current_user: dict = Depends(get_current_user)):
    if not current_user.get("role", {}).get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
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

@api_router.post("/patients/{patient_id}/attachments", response_model=Attachment)
async def add_patient_attachment(patient_id: str, attachment_data: Attachment, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    # Garante que a data de upload está no formato correto
    attachment_data.upload_date = datetime.now(timezone.utc)
    
    attachment_doc = attachment_data.model_dump()
    attachment_doc['upload_date'] = attachment_data.upload_date.isoformat()

    result = await db.patients.update_one(
        {"id": patient_id},
        {"$push": {"attachments": attachment_doc}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    return attachment_data

@api_router.delete("/patients/{patient_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_patient_attachment(patient_id: str, attachment_id: str, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    result = await db.patients.update_one(
        {"id": patient_id},
        {"$pull": {"attachments": {"id": attachment_id}}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    if result.modified_count == 0:
        # Opcional: se quiser ter certeza que o anexo existia
        pass

@api_router.get("/patients/{patient_id}/attachments/{attachment_id}", response_model=Attachment)
async def get_attachment(patient_id: str, attachment_id: str, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    patient = await db.patients.find_one(
        {"id": patient_id, "attachments.id": attachment_id},
        {"_id": 0, "attachments.$": 1}
    )
    
    if not patient or not patient.get('attachments'):
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    attachment = patient['attachments'][0]
    
    # Convertendo a data de string para datetime se necessário
    if isinstance(attachment.get('upload_date'), str):
        attachment['upload_date'] = datetime.fromisoformat(attachment['upload_date'])
    
    return attachment

@api_router.get("/patients", response_model=List[dict])
async def get_patients(
    page: int = 1,
    page_size: int = 10000,
    sort_by: Optional[str] = None,
    order: Optional[str] = "desc",
    has_debt: Optional[bool] = None,
    current_user: dict = Depends(get_current_user)
):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    pipeline = [
        {
            "$lookup": {
                "from": "appointments",
                "let": {"pid": "$id"},
                "pipeline": [
                    {"$match": {"$expr": {"$and": [
                        {"$eq": ["$patient_id", "$$pid"]},
                        {"$eq": ["$paid", False]}
                    ]}}},
                    {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$amount", 0]}}}}
                ],
                "as": "unpaid_appts"
            }
        },
        {
            "$lookup": {
                "from": "transactions",
                "let": {"pid": "$id"},
                "pipeline": [
                    {"$match": {"$expr": {"$eq": ["$patient_id", "$$pid"]}, "status": "pending"}},
                    {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$amount", 0]}}}}
                ],
                "as": "pending_trans"
            }
        },
        {
            "$addFields": {
                "total_debt": {"$add": [{"$sum": "$unpaid_appts.total"}, {"$sum": "$pending_trans.total"}]}
            }
        },
    ]

    if has_debt is True:
        pipeline += [{"$match": {"total_debt": {"$gt": 0}}}]

    pipeline += [
        {
            "$project": {
                "_id": 0,
                "id": 1,
                "name": 1,
                "email": 1,
                "phone": 1,
                "birthdate": 1,
                "address": 1,
                "created_at": 1,
                "total_debt": 1
            }
        }
    ]

    skip = max(0, (page - 1) * page_size)
    sort_field = sort_by if sort_by in {"name", "created_at"} else "created_at"
    sort_order = 1 if order == "asc" else -1
    pipeline += [
        {"$sort": {sort_field: sort_order}},
        {"$skip": skip},
        {"$limit": page_size}
    ]
    patients = await db.patients.aggregate(pipeline).to_list(page_size)

    for p in patients:
        try:
            if isinstance(p.get('created_at'), datetime):
                p['created_at'] = p['created_at'].isoformat()
        except Exception as e:
            logging.error(f"Error converting created_at for patient {p.get('id')}: {e}")
            p['created_at'] = None

    return patients

@api_router.get("/patients/{patient_id}/medical-records", response_model=List[dict])
async def get_patient_medical_records(patient_id: str, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    records = await db.medical_records.find({"patient_id": patient_id}, {"_id": 0}).to_list(1000)
    for r in records:
        if isinstance(r.get('created_at'), str):
            r['created_at'] = datetime.fromisoformat(r['created_at'])
        if isinstance(r.get('last_updated'), str):
            r['last_updated'] = datetime.fromisoformat(r['last_updated'])
    return records

 

@api_router.get("/patients/{patient_id}", response_model=dict)
async def get_patient(patient_id: str, current_user: dict = Depends(get_current_user)):
    patient = await db.patients.find_one({"id": patient_id}, {"_id": 0})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    if isinstance(patient.get('created_at'), str):
        patient['created_at'] = datetime.fromisoformat(patient['created_at'])
    return patient

@api_router.post("/patients/{patient_id}/professionals")
async def add_patient_professional(patient_id: str, payload: dict, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    professional_id = payload.get("professional_id")
    if not professional_id:
        raise HTTPException(status_code=400, detail="professional_id is required")
    professional = await db.professionals.find_one({"id": professional_id}, {"_id": 0})
    if not professional:
        raise HTTPException(status_code=404, detail="Professional not found")
    result = await db.patients.update_one(
        {"id": patient_id},
        {"$addToSet": {"professionals": professional_id}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {"message": "Professional linked"}

@api_router.get("/patients/{patient_id}/professionals", response_model=List[str])
async def get_patient_professionals(patient_id: str, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    patient = await db.patients.find_one({"id": patient_id}, {"_id": 0, "professionals": 1})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient.get("professionals", [])


@api_router.put("/patients/{patient_id}")
async def update_patient(patient_id: str, data: PatientCreate, current_user: dict = Depends(get_current_user)):
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await db.patients.update_one({"id": patient_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {"message": "Patient updated successfully"}

@api_router.delete("/patients/{patient_id}")
async def delete_patient(patient_id: str, current_user: dict = Depends(get_current_user)):
    if not current_user.get("role", {}).get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.patients.delete_one({"id": patient_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {"message": "Patient deleted successfully"}

# Anamnese Routes
@api_router.put("/patients/{patient_id}/anamnese")
async def update_anamnese(patient_id: str, anamnese_data: Anamnese, current_user: dict = Depends(get_current_user)):
    anamnese_data.last_updated = datetime.now(timezone.utc)
    update_data = {"anamnese": anamnese_data.model_dump()}
    
    result = await db.patients.update_one({"id": patient_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {"message": "Anamnese updated successfully"}

# Appointment Routes
@api_router.post("/appointments", response_model=Appointment)
async def create_appointment(data: AppointmentCreate, current_user: dict = Depends(get_current_user)):
    payload = data.model_dump(exclude_none=True)
    if "status" not in payload:
        payload["status"] = "scheduled"
    appointment = Appointment(**payload)
    doc = appointment.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.appointments.insert_one(doc)
    return appointment

@api_router.get("/appointments", response_model=List[dict])
async def get_appointments(
    sort_by: Optional[str] = None,
    order: Optional[str] = "asc",
    current_user: dict = Depends(get_current_user)
):
    query = {}
    sort_order = 1 if order == "asc" else -1

    cursor = db.appointments.find(query, {"_id": 0})

    if sort_by:
        cursor = cursor.sort(sort_by, sort_order)

    appointments = await cursor.to_list(1000)
    
    for a in appointments:
        if isinstance(a.get('created_at'), str):
            a['created_at'] = datetime.fromisoformat(a['created_at'])
            
    return appointments

@api_router.put("/appointments/{appointment_id}")
async def update_appointment(appointment_id: str, data: AppointmentUpdate, current_user: dict = Depends(get_current_user)):
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await db.appointments.update_one({"id": appointment_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return {"message": "Appointment updated successfully"}

@api_router.delete("/appointments/{appointment_id}")
async def delete_appointment(appointment_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.appointments.delete_one({"id": appointment_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return {"message": "Appointment deleted successfully"}

# Transaction Routes
@api_router.post("/transactions", response_model=Transaction)
async def create_transaction(data: TransactionCreate, current_user: dict = Depends(get_current_user)):
    transaction = Transaction(**data.model_dump())
    doc = transaction.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.transactions.insert_one(doc)
    # If linked to an appointment and status is paid, mark appointment as paid
    try:
        if transaction.appointment_id and transaction.status == "paid":
            await db.appointments.update_one({"id": transaction.appointment_id}, {"$set": {"paid": True}})
        
        # If appointment exists and amount was previously unpaid, ensure consistency
    except Exception:
        pass
    return transaction

@api_router.get("/transactions", response_model=List[dict])
async def get_transactions(current_user: dict = Depends(get_current_user)):
    transactions = await db.transactions.find({}, {"_id": 0}).to_list(1000)
    for t in transactions:
        if isinstance(t.get('created_at'), str):
            t['created_at'] = datetime.fromisoformat(t['created_at'])
    return transactions

# Medical Record Routes
@api_router.post("/medical-records", response_model=MedicalRecord)
async def create_medical_record(data: MedicalRecordCreate, current_user: dict = Depends(get_current_user)):
    record = MedicalRecord(**data.model_dump())
    doc = record.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.medical_records.insert_one(doc)
    return record

@api_router.get("/medical-records", response_model=List[dict])
async def get_medical_records(patient_id: str, current_user: dict = Depends(get_current_user)):
    records = await db.medical_records.find({"patient_id": patient_id}, {"_id": 0}).to_list(1000)
    for r in records:
        if isinstance(r.get('created_at'), str):
            r['created_at'] = datetime.fromisoformat(r['created_at'])
    return records

@api_router.put("/medical-records/{record_id}")
async def update_medical_record(record_id: str, data: MedicalRecordCreate, current_user: dict = Depends(get_current_user)):
    update_data = data.model_dump(exclude_unset=True)
    update_data["last_updated"] = datetime.now(timezone.utc)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await db.medical_records.update_one({"id": record_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Medical record not found")
    return {"message": "Medical record updated successfully"}

# Lead Routes
@api_router.post("/leads", response_model=Lead)
async def create_lead(data: LeadCreate, current_user: dict = Depends(get_current_user)):
    lead = Lead(**data.model_dump())
    doc = lead.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.leads.insert_one(doc)
    return lead

@api_router.get("/leads", response_model=List[dict])
async def get_leads(status: Optional[str] = None, page: int = 1, page_size: int = 1000, current_user: dict = Depends(get_current_user)):
    query = {}
    if status:
        query["status"] = status
    skip = max(0, (page - 1) * page_size)
    cursor = db.leads.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(page_size)
    leads = await cursor.to_list(length=page_size)
    for l in leads:
        if isinstance(l.get('created_at'), str):
            l['created_at'] = datetime.fromisoformat(l['created_at'])
    return leads

@api_router.put("/leads/{lead_id}")
async def update_lead(lead_id: str, data: LeadCreate, current_user: dict = Depends(get_current_user)):
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await db.leads.update_one({"id": lead_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"message": "Lead updated successfully"}

@api_router.delete("/leads/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    result = await db.leads.delete_one({"id": lead_id})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")

    return

@api_router.post("/leads/{lead_id}/convert-to-patient")
async def convert_lead_to_patient(lead_id: str, birthdate: str, address: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    existing_patient = None
    if lead.get("phone"):
        existing_patient = await db.patients.find_one({"phone": lead["phone"]}, {"_id": 0})
    if not existing_patient and lead.get("email"):
        existing_patient = await db.patients.find_one({"email": lead["email"]}, {"_id": 0})

    if existing_patient:
        update_fields = {}
        if birthdate:
            update_fields["birthdate"] = birthdate
        if address:
            update_fields["address"] = address
        if update_fields:
            await db.patients.update_one({"id": existing_patient["id"]}, {"$set": update_fields})
        patient_doc = await db.patients.find_one({"id": existing_patient["id"]}, {"_id": 0})
    else:
        new_patient = Patient(
            name=lead.get("name"),
            email=lead.get("email"),
            phone=lead.get("phone"),
            birthdate=birthdate,
            address=address or None
        )
        patient_doc = new_patient.model_dump()
        patient_doc["created_at"] = patient_doc["created_at"].isoformat()
        await db.patients.insert_one(patient_doc)

    await db.leads.update_one({"id": lead_id}, {"$set": {"status": "converted"}})

    return {"message": "Lead convertido", "patient": patient_doc}

# Conversation Routes
@api_router.post("/conversations", response_model=Conversation)
async def create_conversation(lead_id: str, current_user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    conversation = Conversation(
        lead_id=lead_id,
        channel=lead.get("source", "whatsapp"),
        assigned_to=current_user.get("id"),
        assigned_to_name=current_user.get("name")
    )
    doc = conversation.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['last_message_at'] = doc['last_message_at'].isoformat()
    await db.conversations.insert_one(doc)
    return conversation

@api_router.get("/conversations", response_model=List[dict])
async def get_conversations(current_user: dict = Depends(get_current_user)):
    conversations = await db.conversations.find({}, {"_id": 0}).to_list(1000)
    for c in conversations:
        if isinstance(c.get('created_at'), str):
            c['created_at'] = datetime.fromisoformat(c['created_at'])
        if isinstance(c.get('last_message_at'), str):
            c['last_message_at'] = datetime.fromisoformat(c['last_message_at'])
    return conversations

# Message Routes
@api_router.post("/messages", response_model=Message)
async def create_message(data: MessageCreate, current_user: dict = Depends(get_current_user)):
    conversation = await db.conversations.find_one({"id": data.conversation_id}, {"_id": 0})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    message = Message(
        conversation_id=data.conversation_id,
        sender_type="consultant",
        sender_id=current_user.get("id"),
        sender_name=current_user.get("name"),
        content=data.content
    )
    doc = message.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.messages.insert_one(doc)
    
    # Update conversation last message time
    await db.conversations.update_one(
        {"id": data.conversation_id},
        {"$set": {"last_message_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return message

@api_router.get("/messages", response_model=List[dict])
async def get_messages(conversation_id: str, current_user: dict = Depends(get_current_user)):
    messages = await db.messages.find({"conversation_id": conversation_id}, {"_id": 0}).to_list(1000)
    for m in messages:
        if isinstance(m.get('created_at'), str):
            m['created_at'] = datetime.fromisoformat(m['created_at'])
    return messages

# Follow-up Routes
@api_router.post("/follow-ups", response_model=FollowUp)
async def create_follow_up(data: FollowUpCreate, current_user: dict = Depends(get_current_user)):
    follow_up = FollowUp(**data.model_dump())
    doc = follow_up.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.follow_ups.insert_one(doc)
    return follow_up

@api_router.get("/follow-ups", response_model=List[dict])
async def get_follow_ups(current_user: dict = Depends(get_current_user)):
    follow_ups = await db.follow_ups.find({}, {"_id": 0}).to_list(1000)
    for f in follow_ups:
        if isinstance(f.get('created_at'), str):
            f['created_at'] = datetime.fromisoformat(f['created_at'])
    return follow_ups

@api_router.put("/follow-ups/{follow_up_id}")
async def update_follow_up(follow_up_id: str, data: FollowUpUpdate, current_user: dict = Depends(get_current_user)):
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.follow_ups.update_one({"id": follow_up_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    return {"message": "Follow-up updated successfully"}

@api_router.delete("/follow-ups/{follow_up_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_follow_up(follow_up_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.follow_ups.delete_one({"id": follow_up_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    return

# Follow-up Rule Routes
@api_router.post("/follow-up-rules", response_model=FollowUpRule)
async def create_follow_up_rule(data: FollowUpRuleCreate, current_user: dict = Depends(get_current_user)):
    if not current_user.get("role", {}).get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    rule = FollowUpRule(**data.model_dump())
    doc = rule.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.follow_up_rules.insert_one(doc)
    return rule

@api_router.get("/follow-up-rules", response_model=List[dict])
async def get_follow_up_rules(current_user: dict = Depends(get_current_user)):
    rules = await db.follow_up_rules.find({}, {"_id": 0}).to_list(1000)
    for r in rules:
        if isinstance(r.get('created_at'), str):
            r['created_at'] = datetime.fromisoformat(r['created_at'])
    return rules

@api_router.put("/follow-up-rules/{rule_id}")
async def update_follow_up_rule(rule_id: str, data: FollowUpRuleCreate, current_user: dict = Depends(get_current_user)):
    if not current_user.get("role", {}).get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await db.follow_up_rules.update_one({"id": rule_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"message": "Rule updated successfully"}

@api_router.delete("/follow-up-rules/{rule_id}")
async def delete_follow_up_rule(rule_id: str, current_user: dict = Depends(get_current_user)):
    if not current_user.get("role", {}).get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.follow_up_rules.delete_one({"id": rule_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"message": "Rule deleted successfully"}

# Automation Helpers
def _is_birthday_with_offset(birthdate_str, days_offset):
    if not birthdate_str:
        return False
    try:
        birth_date = datetime.fromisoformat(birthdate_str).date()
        # The logic should be: today is birthday + offset. So, today - offset is birthday.
        check_date = datetime.now(timezone.utc).date() - timedelta(days=days_offset)
        return birth_date.month == check_date.month and birth_date.day == check_date.day
    except (ValueError, TypeError):
        return False

# Automation Routes
@api_router.post("/automations/birthday-followup")
async def run_birthday_followup_automation(current_user: dict = Depends(get_current_user)):
    created = 0
    sent = 0
    settings = await db.settings.find_one({"type": "omnichannel"}, {"_id": 0})
    whatsapp = settings.get("whatsapp") if settings else None
    rule = await db.follow_up_rules.find_one({"trigger": "patient_birthday", "active": True}, {"_id": 0})
    if not rule:
        return {"created": 0, "sent": 0}
    
    days_offset = rule.get("days_after", 0)
    msg = rule.get("message_template")
    
    patients = await db.patients.find({}, {"_id": 0}).to_list(10000)
    for p in patients:
        if _is_birthday_with_offset(p.get("birthdate"), days_offset):
            name = p.get("name")
            # Create Follow-up
            follow_up = FollowUp(
                patient_id=p.get("id"),
                scheduled_date=datetime.now(timezone.utc).isoformat(),
                notes=f"Aniversário de {name}",
                status="completed",
                contact_type="whatsapp",
                contact_reason="informativo"
            )
            doc = follow_up.model_dump()
            doc['created_at'] = doc['created_at'].isoformat()
            await db.follow_ups.insert_one(doc)
            created += 1
            
            # Send whatsapp
            if whatsapp and whatsapp.get('phone_number_id') and whatsapp.get('access_token'):
                try:
                    clean = "".join(filter(str.isdigit, p.get("phone")))
                    if not clean.startswith("55"):
                        clean = "55" + clean
                    send_url = f"https://graph.facebook.com/v21.0/{whatsapp['phone_number_id']}/messages"
                    headers = {"Authorization": f"Bearer {whatsapp['access_token']}", "Content-Type": "application/json"}
                    payload = {"messaging_product": "whatsapp", "to": clean, "type": "text", "text": {"body": msg or f"Parabéns {name}!"}}
                    async with httpx.AsyncClient() as client:
                        r = await client.post(send_url, json=payload, headers=headers, timeout=10)
                        if r.status_code == 200:
                            sent += 1
                except Exception:
                    pass
    return {"created": created, "sent": sent}

@api_router.post("/automations/auto-message")
async def send_auto_message(req: AutoMessageRequest, current_user: dict = Depends(get_current_user)):
    patient = await db.patients.find_one({"id": req.patient_id}, {"_id": 0})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    settings = await db.settings.find_one({"type": "omnichannel"}, {"_id": 0})
    whatsapp = settings.get("whatsapp") if settings else None
    if not whatsapp or not whatsapp.get('phone_number_id') or not whatsapp.get('access_token'):
        raise HTTPException(status_code=400, detail="WhatsApp not configured")

    message_body = ""
    if req.message_type == "birthday":
        message_body = f"Olá {patient['name']}, feliz aniversário!"
    elif req.message_type == "appointment_reminder":
        if not req.appointment_id:
            raise HTTPException(status_code=400, detail="Appointment ID is required for reminders")
        appt = await db.appointments.find_one({"id": req.appointment_id}, {"_id": 0})
        if not appt:
            raise HTTPException(status_code=404, detail="Appointment not found")
        message_body = f"Olá {patient['name']}, lembrete de consulta para {appt['appointment_date']} às {appt['appointment_time']}."
    else:
        raise HTTPException(status_code=400, detail="Invalid message type")

    clean_phone = "".join(filter(str.isdigit, patient.get("phone")))
    if not clean_phone.startswith("55"):
        clean_phone = "55" + clean_phone

    send_url = f"https://graph.facebook.com/v21.0/{whatsapp['phone_number_id']}/messages"
    headers = {"Authorization": f"Bearer {whatsapp['access_token']}", "Content-Type": "application/json"}
    payload = {"messaging_product": "whatsapp", "to": clean_phone, "type": "text", "text": {"body": message_body}}

    async with httpx.AsyncClient() as client:
        r = await client.post(send_url, json=payload, headers=headers, timeout=10)
        if r.status_code != 200:
            raise HTTPException(status_code=500, detail=f"Failed to send message: {r.text}")

    return {"message": "Message sent successfully"}

# Document Generation
@api_router.post("/generate-document")
async def generate_document(req: GenerateDocumentRequest, current_user: dict = Depends(get_current_user)):
    if LlmChat is None:
        raise HTTPException(status_code=501, detail="Document generation not implemented")

    record = await db.medical_records.find_one({"id": req.record_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Medical record not found")

    prompt_text = f"Baseado no seguinte registro médico, gere um(a) {req.document_type}:\n\n"
    prompt_text += f"Diagnóstico: {record.get('diagnosis', 'N/A')}\n"
    prompt_text += f"Sintomas: {record.get('symptoms', 'N/A')}\n"
    prompt_text += f"Tratamento: {record.get('treatment', 'N/A')}\n"
    prompt_text += f"Medicamentos: {record.get('medications', 'N/A')}\n"
    prompt_text += f"Observações: {record.get('observations', 'N/A')}\n"
    prompt_text += f"Nome do Médico: {record.get('doctor_name', 'N/A')}\n"
    prompt_text += f"CRM/CRO: {record.get('crm', 'N/A')}\n\n"
    prompt_text += f"Por favor, gere o documento solicitado."

    try:
        chat = LlmChat()
        response = await chat.ask_async(messages=[UserMessage(text=prompt_text)])
        generated_text = response.text
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate document: {e}")

    # Update the record with the generated document
    update_field = "prescription" if req.document_type == "prescription" else "medical_certificate"
    await db.medical_records.update_one(
        {"id": req.record_id},
        {"$set": {update_field: generated_text, "last_updated": datetime.now(timezone.utc)}}
    )

    return {f"generated_{req.document_type}": generated_text}

# Settings Routes
class WhatsAppSettings(BaseModel):
    phone_number_id: str
    access_token: str

class OmnichannelSettings(BaseModel):
    whatsapp: Optional[WhatsAppSettings] = None

class ClinicSettings(BaseModel):
    clinic_name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    logo: Optional[str] = None

@api_router.get("/settings/omnichannel")
async def get_omnichannel_settings(current_user: dict = Depends(get_current_user)):
    if not current_user.get("role", {}).get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    settings = await db.settings.find_one({"type": "omnichannel"}, {"_id": 0})
    return settings or {}

@api_router.post("/settings/omnichannel")
async def save_omnichannel_settings(data: OmnichannelSettings, current_user: dict = Depends(get_current_user)):
    if not current_user.get("role", {}).get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.settings.update_one(
        {"type": "omnichannel"},
        {"$set": {"whatsapp": data.whatsapp.model_dump() if data.whatsapp else {}}},
        upsert=True
    )
    return {"message": "Settings saved"}

@api_router.get("/settings/clinic")
async def get_clinic_settings(current_user: dict = Depends(get_current_user)):
    if not current_user.get("role", {}).get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    settings = await db.settings.find_one({"type": "clinic"}, {"_id": 0})
    return settings or {}

@api_router.post("/settings/clinic")
async def save_clinic_settings(data: ClinicSettings, current_user: dict = Depends(get_current_user)):
    if not current_user.get("role", {}).get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.settings.update_one(
        {"type": "clinic"},
        {"$set": data.model_dump()},
        upsert=True
    )
    return {"message": "Settings saved"}

# Medical Records PDF Generation
class GeneratePdfRequest(BaseModel):
    record_id: str
    patient_name: str

@api_router.post("/medical-records/generate-pdf")
async def generate_pdf(request: GeneratePdfRequest):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    record = await db.medical_records.find_one({"id": request.record_id})
    if not record:
        raise HTTPException(status_code=404, detail="Medical record not found")

    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    left_margin = 72
    right_margin = width - 72
    top_margin = 72
    bottom_margin = 72
    settings = await db.settings.find_one({"type": "clinic"}, {"_id": 0})
    logo_data = settings.get("logo") if settings else None
    if logo_data and isinstance(logo_data, str):
        try:
            b64 = logo_data.split(",", 1)[1] if "," in logo_data else logo_data
            img_bytes = base64.b64decode(b64)
            img = ImageReader(io.BytesIO(img_bytes))
            iw, ih = img.getSize()
            target_w = 140
            ratio = target_w / float(iw)
            target_h = ih * ratio
            x = (width - target_w) / 2
            y_logo = height - top_margin - target_h
            p.drawImage(img, x, y_logo, width=target_w, height=target_h, preserveAspectRatio=True, mask='auto')
        except Exception:
            pass
    p.setFont("Helvetica-Bold", 18)
    title = f"Prontuário de {request.patient_name}"
    title_w = p.stringWidth(title, "Helvetica-Bold", 18)
    p.drawString((width - title_w) / 2, height - top_margin - 60, title)
    p.setFont("Helvetica", 12)
    y = height - top_margin - 100
    fields = [
        ("Data de Criação", record.get("created_at", "N/A")),
        ("Tipo de Registro", record.get("record_type", "N/A")),
        ("Nome do Médico", record.get("doctor_name", "N/A")),
        ("CRM", record.get("crm", "N/A")),
        ("Diagnóstico", record.get("diagnosis", "N/A")),
        ("Sintomas", record.get("symptoms", "N/A")),
        ("Tratamento", record.get("treatment", "N/A")),
        ("Medicamentos", record.get("medications", "N/A")),
        ("Observações", record.get("observations", "N/A")),
        ("Template Utilizado", record.get("template_used", "N/A")),
    ]
    def wrap_text(text: str, max_width: float):
        if text is None:
            s = ""
        elif isinstance(text, (list, tuple)):
            s = ", ".join(map(str, text))
        else:
            s = str(text)
        s = s.replace("\r\n", "\n").replace("\r", "\n")
        lines = []
        for para in s.split("\n"):
            if para.strip() == "":
                lines.append("")
                continue
            words = para.split()
            cur = ""
            for w in words:
                test = w if cur == "" else cur + " " + w
                if p.stringWidth(test, "Helvetica", 12) <= max_width:
                    cur = test
                else:
                    if cur:
                        lines.append(cur)
                    cur = w
            if cur:
                lines.append(cur)
        return lines
    max_text_width = right_margin - left_margin
    for label, value in fields:
        value_lines = wrap_text(value, max_text_width)
        needed = 18 + 16 * max(1, len(value_lines))
        if y - needed < bottom_margin + 40:
            p.setStrokeColorRGB(0.2, 0.5, 0.9)
            p.setLineWidth(0.8)
            p.line(left_margin, bottom_margin + 15, right_margin, bottom_margin + 15)
            footer_parts = []
            if settings and settings.get("clinic_name"):
                footer_parts.append(settings.get("clinic_name"))
            if settings and settings.get("address"):
                footer_parts.append(settings.get("address"))
            if settings and settings.get("phone"):
                footer_parts.append(settings.get("phone"))
            if settings and settings.get("email"):
                footer_parts.append(settings.get("email"))
            if settings and settings.get("website"):
                footer_parts.append(settings.get("website"))
            footer_text = " • ".join(footer_parts) if footer_parts else ""
            p.setFont("Helvetica-Oblique", 9)
            sig_text = "Documento assinado digitalmente"
            sig_w = p.stringWidth(sig_text, "Helvetica-Oblique", 9)
            p.drawString((width - sig_w) / 2, bottom_margin - 20, sig_text)
            if footer_text:
                p.setFont("Helvetica", 9)
                fw = p.stringWidth(footer_text, "Helvetica", 9)
                p.drawString((width - fw) / 2, bottom_margin - 5, footer_text)
            p.setFont("Helvetica", 12)
            p.showPage()
            if logo_data and isinstance(logo_data, str):
                try:
                    b64 = logo_data.split(",", 1)[1] if "," in logo_data else logo_data
                    img_bytes = base64.b64decode(b64)
                    img = ImageReader(io.BytesIO(img_bytes))
                    iw, ih = img.getSize()
                    target_w = 140
                    ratio = target_w / float(iw)
                    target_h = ih * ratio
                    x = (width - target_w) / 2
                    y_logo = height - top_margin - target_h
                    p.drawImage(img, x, y_logo, width=target_w, height=target_h, preserveAspectRatio=True, mask='auto')
                except Exception:
                    pass
            p.setFont("Helvetica-Bold", 18)
            title_w = p.stringWidth(title, "Helvetica-Bold", 18)
            p.drawString((width - title_w) / 2, height - top_margin - 60, title)
            p.setFont("Helvetica", 12)
            y = height - top_margin - 100
        p.setFont("Helvetica-Bold", 12)
        p.drawString(left_margin, y, f"{label}:")
        y -= 18
        p.setFont("Helvetica", 12)
        for line in value_lines if value_lines else [""]:
            p.drawString(left_margin, y, line)
            y -= 16
    p.setStrokeColorRGB(0.2, 0.5, 0.9)
    p.setLineWidth(0.8)
    p.line(left_margin, bottom_margin + 15, right_margin, bottom_margin + 15)
    footer_parts = []
    if settings and settings.get("clinic_name"):
        footer_parts.append(settings.get("clinic_name"))
    if settings and settings.get("address"):
        footer_parts.append(settings.get("address"))
    if settings and settings.get("phone"):
        footer_parts.append(settings.get("phone"))
    if settings and settings.get("email"):
        footer_parts.append(settings.get("email"))
    if settings and settings.get("website"):
        footer_parts.append(settings.get("website"))
    footer_text = " • ".join(footer_parts) if footer_parts else ""
    p.setFont("Helvetica-Oblique", 9)
    sig_text = "Documento assinado digitalmente"
    sig_w = p.stringWidth(sig_text, "Helvetica-Oblique", 9)
    p.drawString((width - sig_w) / 2, bottom_margin - 20, sig_text)
    if footer_text:
        p.setFont("Helvetica", 9)
        fw = p.stringWidth(footer_text, "Helvetica", 9)
        p.drawString((width - fw) / 2, bottom_margin - 5, footer_text)
    p.save()
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="application/pdf", headers={
        "Content-Disposition": f"attachment; filename=prontuario_{request.patient_name}.pdf"
    })

@api_router.delete("/medical-records/{record_id}")
async def delete_medical_record(record_id: str, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    delete_result = await db.medical_records.delete_one({"id": record_id})

    if delete_result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Medical record not found")

    return {"message": "Medical record deleted successfully"}

# Socket.IO Events
@sio.on('connect')
async def connect(sid, environ):
    print('connect ', sid)

@sio.on('disconnect')
async def disconnect(sid):
    print('disconnect ', sid)

# Include API router
app.include_router(api_router)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)
