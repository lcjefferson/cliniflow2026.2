from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request
from fastapi.responses import StreamingResponse
import io
import asyncio
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from fastapi_socketio import SocketManager
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from bson import ObjectId
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
from PIL import Image

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', '').strip()
db_name = os.environ.get('DB_NAME', 'clinicflow').strip()
allowed_origins_env = os.environ.get('ALLOWED_ORIGINS') or os.environ.get('CORS_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000,https://cliniflow-frontend.onrender.com,https://clinicflow-lucj.onrender.com')
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

security = HTTPBearer(auto_error=False)

from fastapi import Request

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), request: Request = None):
    token = credentials.credentials if credentials else None
    if request and not token:
        token = request.query_params.get('token') or request.cookies.get('token')
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
                    
                    # Send via WhatsApp
                    logging.info(f"Sending birthday greeting to {patient['name']} (phone: {patient['phone']}): {message}")
                    if patient.get("phone"):
                        await send_whatsapp_message(patient['phone'], message)
                    
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

async def normalize_all_thumbnails():
    if db is None:
        return
    try:
        fs = AsyncIOMotorGridFSBucket(db)
        cursor = db.patients.find({}, {"_id": 0, "id": 1, "attachments": 1})
        async for patient in cursor:
            patient_id = patient.get("id")
            for attachment in patient.get("attachments", []):
                if not str(attachment.get("file_type", "")).startswith("image/"):
                    continue
                attachment_id = attachment.get("id")
                need_thumb = (not attachment.get("thumbnail_gridfs_id") and not attachment.get("thumbnail_webp_gridfs_id")) or ((attachment.get("thumbnail_size_bytes") or 0) > 40000) or ((attachment.get("thumbnail_webp_size_bytes") or 0) > 40000)
                need_modal = (not attachment.get("preview_modal_gridfs_id") and not attachment.get("preview_modal_webp_gridfs_id")) or ((attachment.get("preview_modal_size_bytes") or 0) > 350000) or ((attachment.get("preview_modal_webp_size_bytes") or 0) > 350000)
                if not (need_thumb or need_modal):
                    continue
                try:
                    buf = io.BytesIO()
                    if attachment.get("gridfs_id"):
                        grid_out = await fs.open_download_stream(ObjectId(attachment["gridfs_id"]))
                        while True:
                            chunk = await grid_out.readchunk()
                            if not chunk:
                                break
                            buf.write(chunk)
                    elif attachment.get("file_data"):
                        raw_bytes = base64.b64decode(attachment["file_data"]) if isinstance(attachment.get("file_data"), str) else attachment.get("file_data")
                        if isinstance(raw_bytes, bytes):
                            buf.write(raw_bytes)
                    else:
                        continue
                    buf.seek(0)
                    img = Image.open(buf)
                    update_fields = {}
                    if need_thumb:
                        timg = img.copy()
                        timg.thumbnail((128, 128))
                        out_jpg = io.BytesIO()
                        timg = timg.convert("RGB")
                        timg.save(out_jpg, format="JPEG", quality=60, optimize=True, progressive=True)
                        out_jpg.seek(0)
                        size_jpg = out_jpg.getbuffer().nbytes
                        out_webp = io.BytesIO()
                        size_webp = None
                        try:
                            timg.save(out_webp, format="WEBP", quality=60, method=6)
                            out_webp.seek(0)
                            size_webp = out_webp.getbuffer().nbytes
                        except Exception:
                            pass
                        new_thumb_id = await fs.upload_from_stream(f"thumb-{attachment.get('filename','file')}.jpg", out_jpg, metadata={"content_type": "image/jpeg", "kind": "thumbnail"})
                        update_fields.update({"attachments.$.thumbnail_gridfs_id": str(new_thumb_id), "attachments.$.thumbnail_size_bytes": size_jpg})
                        if size_webp is not None:
                            new_webp_id = await fs.upload_from_stream(f"thumb-{attachment.get('filename','file')}.webp", out_webp, metadata={"content_type": "image/webp", "kind": "thumbnail_webp"})
                            update_fields.update({"attachments.$.thumbnail_webp_gridfs_id": str(new_webp_id), "attachments.$.thumbnail_webp_size_bytes": size_webp})
                    if need_modal:
                        mimg = img.copy()
                        mimg.thumbnail((1280, 1280))
                        out_mjpg = io.BytesIO()
                        mimg = mimg.convert("RGB")
                        mimg.save(out_mjpg, format="JPEG", quality=78, optimize=True, progressive=True)
                        out_mjpg.seek(0)
                        msize_jpg = out_mjpg.getbuffer().nbytes
                        out_mwebp = io.BytesIO()
                        msize_webp = None
                        try:
                            mimg.save(out_mwebp, format="WEBP", quality=78, method=6)
                            out_mwebp.seek(0)
                            msize_webp = out_mwebp.getbuffer().nbytes
                        except Exception:
                            pass
                        new_modal_id = await fs.upload_from_stream(f"modal-{attachment.get('filename','file')}.jpg", out_mjpg, metadata={"content_type": "image/jpeg", "kind": "modal"})
                        update_fields.update({"attachments.$.preview_modal_gridfs_id": str(new_modal_id), "attachments.$.preview_modal_size_bytes": msize_jpg})
                        if msize_webp is not None:
                            new_mwebp_id = await fs.upload_from_stream(f"modal-{attachment.get('filename','file')}.webp", out_mwebp, metadata={"content_type": "image/webp", "kind": "modal_webp"})
                            update_fields.update({"attachments.$.preview_modal_webp_gridfs_id": str(new_mwebp_id), "attachments.$.preview_modal_webp_size_bytes": msize_webp})
                    if update_fields:
                        try:
                            await db.patients.update_one({"id": patient_id, "attachments.id": attachment_id}, {"$set": update_fields})
                        except Exception:
                            pass
                except Exception:
                    pass
                await asyncio.sleep(0)
    except Exception:
        pass

@asynccontextmanager
async def lifespan(app: FastAPI):
    global db, DEMO_MODE
    if db is not None:
        try:
            await client.admin.command('ping')
        except Exception:
            print("MongoDB connection failed in lifespan. Switching to DEMO MODE.")
            db = None
            DEMO_MODE = True

    if scheduler and CronTrigger:
        try:
            scheduler.start()
            scheduler.add_job(check_and_send_birthday_greetings, CronTrigger(hour=9, minute=0), id="birthday_check")
        except Exception:
            pass
    if db is not None:
        try:
            # Create admin user if it doesn't exist
            admin_email = os.environ.get("ADMIN_EMAIL")
            admin_password = os.environ.get("ADMIN_PASSWORD")
            if admin_email and admin_password:
                user = await db.users.find_one({"email": admin_email})
                if not user:
                    await db.users.insert_one({
                        "id": str(uuid.uuid4()),
                        "name": "Admin",
                        "email": admin_email,
                        "password_hash": hash_password(admin_password),
                        "role": {"is_admin": True, "is_attendant": False},
                        "user_type": "admin",
                        "created_at": datetime.now(timezone.utc)
                    })
                    print(f"Admin user {admin_email} created.")

            await db.patients.create_index("id")
            await db.patients.create_index("phone")
            await db.patients.create_index("email")
            await db.patients.create_index("name")
            await db.patients.create_index([("created_at", -1)])
            await db.patients.create_index("attachments.id")
            await db.patients.create_index("treatments.id")
            await db.transactions.create_index("patient_id")
            await db.transactions.create_index([("patient_id", 1), ("status", 1)])
            await db.transactions.create_index([("created_at", -1)])
            await db.medical_records.create_index("patient_id")
            await db.medical_records.create_index([("created_at", -1)])
            await db.appointments.create_index([("patient_id", 1), ("paid", 1)])
            await db.appointments.create_index("appointment_date")
            try:
                await db.appointments.create_index([("appointment_date", 1), ("appointment_time", 1), ("room_id", 1)], unique=True, name="uniq_date_time_room")
            except Exception:
                pass
            try:
                await db.appointments.create_index([("appointment_date", 1), ("appointment_time", 1), ("professional_id", 1)], unique=True, name="uniq_date_time_prof")
            except Exception:
                pass
            await db.professionals.create_index("id")
            await db.professionals.create_index("name")
            await db.professionals.create_index([("created_at", -1)])
            await db.leads.create_index("status")
            await db.leads.create_index("phone")
            await db.leads.create_index("email")
            await db.leads.create_index([("created_at", -1)])
        except Exception:
            pass
        except Exception:
            pass
    else:
        # DEMO MODE: Create default admin
        admin_email = os.environ.get("ADMIN_EMAIL", "admin@cliniflow.com")
        admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@2024")
        if not any(u['email'] == admin_email for u in mem['users']):
            mem['users'].append({
                "id": str(uuid.uuid4()),
                "name": "Administrador",
                "email": admin_email,
                "password_hash": hash_password(admin_password),
                "role": {"is_admin": True, "is_attendant": False},
                "user_type": "admin",
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            print(f"DEMO MODE: Admin user {admin_email} created.")
    yield
    if scheduler:
        try:
            scheduler.shutdown(wait=False)
        except Exception:
            pass

app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https?://.*:3001",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    db_connected = False
    try:
        if client is not None:
            await client.admin.command('ping')
            db_connected = True
    except Exception:
        db_connected = False
    return {"status": "ok", "db_connected": db_connected}

@api_router.get("/version")
async def get_version():
    try:
        p = ROOT_DIR / "version.json"
        if not p.exists():
            return {
                "version": "dev",
                "commit": "",
                "date": datetime.now(timezone.utc).isoformat()
            }
        with open(p, "r") as f:
            data = json.load(f)
        # Garantir tipos
        v = {
            "version": str(data.get("version", "dev")),
            "commit": str(data.get("commit", "")),
            "date": str(data.get("date", datetime.now(timezone.utc).isoformat()))
        }
        return v
    except Exception:
        return {
            "version": "dev",
            "commit": "",
            "date": datetime.now(timezone.utc).isoformat()
        }

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
    color: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProfessionalCreate(BaseModel):
    name: str  # Obrigatório
    specialty: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: str  # Obrigatório
    color: Optional[str] = None
    
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
    file_data: Optional[str] = None
    gridfs_id: Optional[str] = None
    file_type: str
    upload_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    size_bytes: int
    thumbnail_gridfs_id: Optional[str] = None
    thumbnail_size_bytes: Optional[int] = None
    thumbnail_webp_gridfs_id: Optional[str] = None
    thumbnail_webp_size_bytes: Optional[int] = None
    preview_modal_gridfs_id: Optional[str] = None
    preview_modal_size_bytes: Optional[int] = None
    preview_modal_webp_gridfs_id: Optional[str] = None
    preview_modal_webp_size_bytes: Optional[int] = None
    folder_id: Optional[str] = None

class AttachmentFolder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    parent_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

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

    updated_doc = await db.patients.find_one(
        {"id": patient_id, "treatments.id": treatment_id},
        {"_id": 0, "treatments.$": 1}
    )
    if updated_doc and updated_doc.get("treatments"):
        return updated_doc["treatments"][0]
    raise HTTPException(status_code=404, detail="Could not retrieve updated treatment")

class Patient(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    birthdate: Optional[str] = None
    address: Optional[str] = None
    cpf: Optional[str] = None
    attachments: List[Attachment] = []
    attachment_folders: List[AttachmentFolder] = []
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
    cpf: Optional[str] = None
    
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
async def get_professionals(ids: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if DEMO_MODE:
        professionals = _find("professionals", {})
        for p in professionals:
            if isinstance(p.get('created_at'), str):
                p['created_at'] = datetime.fromisoformat(p['created_at'])
        return professionals
    query = {}
    if ids:
        id_list = [i.strip() for i in ids.split(',') if i.strip()]
        if id_list:
            query = {"id": {"$in": id_list}}
    professionals = await db.professionals.find(query, {"_id": 0}).to_list(1000)
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
    user_type = current_user.get("user_type", "consultor")
    is_admin = current_user.get("role", {}).get("is_admin", False)
    if not (is_admin or user_type == "consultor"):
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
    user_type = current_user.get("user_type", "consultor")
    is_admin = current_user.get("role", {}).get("is_admin", False)
    if not (is_admin or user_type == "consultor"):
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
async def get_services(ids: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if DEMO_MODE:
        services = _find("services", {})
        for s in services:
            if isinstance(s.get('created_at'), str):
                s['created_at'] = datetime.fromisoformat(s['created_at'])
        return services
    query = {}
    if ids:
        id_list = [i.strip() for i in ids.split(',') if i.strip()]
        if id_list:
            query = {"id": {"$in": id_list}}
    services = await db.services.find(query, {"_id": 0}).to_list(1000)
    for s in services:
        if isinstance(s.get('created_at'), str):
            s['created_at'] = datetime.fromisoformat(s['created_at'])
    return services

@api_router.put("/services/{service_id}")
async def update_service(service_id: str, data: ServiceCreate, current_user: dict = Depends(get_current_user)):
    user_type = current_user.get("user_type", "consultor")
    is_admin = current_user.get("role", {}).get("is_admin", False)
    if not (is_admin or user_type == "consultor"):
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
    user_type = current_user.get("user_type", "consultor")
    is_admin = current_user.get("role", {}).get("is_admin", False)
    if not (is_admin or user_type == "consultor"):
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
    user_type = current_user.get("user_type", "consultor")
    is_admin = current_user.get("role", {}).get("is_admin", False)
    if not (is_admin or user_type == "consultor"):
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
    user_type = current_user.get("user_type", "consultor")
    is_admin = current_user.get("role", {}).get("is_admin", False)
    if not (is_admin or user_type == "consultor"):
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
    if attachment_data.file_data:
        try:
            fs = AsyncIOMotorGridFSBucket(db)
            raw_bytes = base64.b64decode(attachment_data.file_data)
            file_id = await fs.upload_from_stream(
                attachment_data.filename,
                io.BytesIO(raw_bytes),
                metadata={"content_type": attachment_data.file_type}
            )
            attachment_data.gridfs_id = str(file_id)
            attachment_data.size_bytes = attachment_data.size_bytes or len(raw_bytes)
            attachment_data.file_data = None
            if str(attachment_data.file_type or '').startswith('image/'):
                try:
                    img = Image.open(io.BytesIO(raw_bytes))
                    img.thumbnail((128, 128))
                    out = io.BytesIO()
                    img = img.convert('RGB')
                    img.save(out, format='JPEG', quality=60, optimize=True, progressive=True)
                    out.seek(0)
                    thumb_id = await fs.upload_from_stream(
                        f"thumb-{attachment_data.filename}.jpg",
                        out,
                        metadata={"content_type": "image/jpeg", "kind": "thumbnail"}
                    )
                    attachment_data.thumbnail_gridfs_id = str(thumb_id)
                    attachment_data.thumbnail_size_bytes = out.getbuffer().nbytes
                    out_webp = io.BytesIO()
                    try:
                        img.save(out_webp, format='WEBP', quality=60, method=6)
                        out_webp.seek(0)
                        webp_id = await fs.upload_from_stream(
                            f"thumb-{attachment_data.filename}.webp",
                            out_webp,
                            metadata={"content_type": "image/webp", "kind": "thumbnail_webp"}
                        )
                        attachment_data.thumbnail_webp_gridfs_id = str(webp_id)
                        attachment_data.thumbnail_webp_size_bytes = out_webp.getbuffer().nbytes
                    except Exception:
                        pass
                except Exception:
                    pass
        except Exception:
            pass

    attachment_doc = attachment_data.model_dump()
    attachment_doc['upload_date'] = attachment_data.upload_date.isoformat()

    result = await db.patients.update_one(
        {"id": patient_id},
        {"$push": {"attachments": attachment_doc}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    return attachment_data

@api_router.post("/patients/{patient_id}/attachment-folders", response_model=dict)
async def create_attachment_folder(patient_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    name = str(data.get("name", "")).strip()
    parent_id = data.get("parent_id")
    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")
    folder = AttachmentFolder(name=name, parent_id=parent_id)
    doc = folder.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    result = await db.patients.update_one({"id": patient_id}, {"$push": {"attachment_folders": doc}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    return doc

@api_router.get("/patients/{patient_id}/attachment-folders", response_model=List[dict])
async def get_attachment_folders(patient_id: str, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    patient = await db.patients.find_one({"id": patient_id}, {"_id": 0, "attachment_folders": 1})
    return (patient.get("attachment_folders") or []) if patient else []

class MoveAttachmentRequest(BaseModel):
    folder_id: Optional[str] = None

@api_router.put("/patients/{patient_id}/attachments/{attachment_id}/move")
async def move_attachment(patient_id: str, attachment_id: str, req: MoveAttachmentRequest, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    folder_id = req.folder_id
    if folder_id:
        p = await db.patients.find_one({"id": patient_id, "attachment_folders.id": folder_id}, {"_id": 0, "attachment_folders.$": 1})
        if not p or not p.get('attachment_folders'):
            raise HTTPException(status_code=404, detail="Folder not found")
    result = await db.patients.update_one(
        {"id": patient_id, "attachments.id": attachment_id},
        {"$set": {"attachments.$.folder_id": folder_id}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Attachment not found")
    updated = await db.patients.find_one({"id": patient_id, "attachments.id": attachment_id}, {"_id": 0, "attachments.$": 1})
    att = updated['attachments'][0] if updated and updated.get('attachments') else None
    if att and isinstance(att.get('upload_date'), str):
        att['upload_date'] = datetime.fromisoformat(att['upload_date'])
    return att or {"message": "moved"}

@api_router.delete("/patients/{patient_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_patient_attachment(patient_id: str, attachment_id: str, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    patient = await db.patients.find_one(
        {"id": patient_id, "attachments.id": attachment_id},
        {"_id": 0, "attachments.$": 1}
    )
    gridfs_id = None
    if patient and patient.get('attachments'):
        att = patient['attachments'][0]
        gridfs_id = att.get('gridfs_id')

    result = await db.patients.update_one(
        {"id": patient_id},
        {"$pull": {"attachments": {"id": attachment_id}}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    if gridfs_id:
        try:
            fs = AsyncIOMotorGridFSBucket(db)
            await fs.delete(ObjectId(gridfs_id))
        except Exception:
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

@api_router.get("/patients/{patient_id}/attachments/{attachment_id}/download")
async def download_attachment(
    patient_id: str,
    attachment_id: str,
    preview: bool = False,
    modal: bool = False,
    format: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    patient = await db.patients.find_one(
        {"id": patient_id, "attachments.id": attachment_id},
        {"_id": 0, "attachments.$": 1}
    )
    if not patient or not patient.get('attachments'):
        raise HTTPException(status_code=404, detail="Attachment not found")
    attachment = patient['attachments'][0]
    if attachment.get('gridfs_id'):
        fs = AsyncIOMotorGridFSBucket(db)
        if modal and str(attachment.get('file_type', '')).startswith('image/') and attachment.get('preview_modal_gridfs_id'):
            try:
                use_webp_modal = (format == 'webp') and bool(attachment.get('preview_modal_webp_gridfs_id'))
                modal_id = attachment['preview_modal_webp_gridfs_id'] if use_webp_modal else attachment['preview_modal_gridfs_id']
                modal_out = await fs.open_download_stream(ObjectId(modal_id))
                async def modal_iter():
                    while True:
                        chunk = await modal_out.readchunk()
                        if not chunk:
                            break
                        yield chunk
                size = (attachment.get('preview_modal_webp_size_bytes') if use_webp_modal else attachment.get('preview_modal_size_bytes')) or getattr(modal_out, 'length', 0)
                headers = {
                    "Content-Disposition": f"inline; filename=modal-{attachment.get('filename','file')}.{ 'webp' if use_webp_modal else 'jpg'}",
                    **({"Content-Length": str(size)} if size else {}),
                    "ETag": f"modal-{attachment.get('id','')}-{size}-{ 'webp' if use_webp_modal else 'jpg'}",
                    "Cache-Control": "private, max-age=86400"
                }
                return StreamingResponse(modal_iter(), media_type=('image/webp' if use_webp_modal else 'image/jpeg'), headers=headers)
            except Exception:
                pass
        if preview and (attachment.get('thumbnail_gridfs_id') or attachment.get('thumbnail_webp_gridfs_id')):
            try:
                use_webp = (format == 'webp') and bool(attachment.get('thumbnail_webp_gridfs_id'))
                thumb_id = attachment['thumbnail_webp_gridfs_id'] if use_webp else attachment['thumbnail_gridfs_id']
                thumb_out = await fs.open_download_stream(ObjectId(thumb_id))
                size = (attachment.get('thumbnail_webp_size_bytes') if use_webp else attachment.get('thumbnail_size_bytes')) or getattr(thumb_out, 'length', 0)
                if size and size > 30000:
                    async def _regen_thumb():
                        try:
                            orig_out = await fs.open_download_stream(ObjectId(attachment['gridfs_id']))
                            buf = io.BytesIO()
                            while True:
                                chunk = await orig_out.readchunk()
                                if not chunk:
                                    break
                                buf.write(chunk)
                            buf.seek(0)
                            img = Image.open(buf)
                            img.thumbnail((128, 128))
                            out_jpg = io.BytesIO()
                            img = img.convert('RGB')
                            img.save(out_jpg, format='JPEG', quality=60, optimize=True, progressive=True)
                            out_jpg.seek(0)
                            size_jpg = out_jpg.getbuffer().nbytes
                            out_webp = io.BytesIO()
                            size_webp = None
                            try:
                                img.save(out_webp, format='WEBP', quality=60, method=6)
                                out_webp.seek(0)
                                size_webp = out_webp.getbuffer().nbytes
                            except Exception:
                                pass
                            try:
                                new_thumb_id = await fs.upload_from_stream(
                                    f"thumb-{attachment.get('filename','file')}.jpg",
                                    out_jpg,
                                    metadata={"content_type": "image/jpeg", "kind": "thumbnail"}
                                )
                                update_fields = {"attachments.$.thumbnail_gridfs_id": str(new_thumb_id), "attachments.$.thumbnail_size_bytes": size_jpg}
                                if size_webp is not None:
                                    new_webp_id = await fs.upload_from_stream(
                                        f"thumb-{attachment.get('filename','file')}.webp",
                                        out_webp,
                                        metadata={"content_type": "image/webp", "kind": "thumbnail_webp"}
                                    )
                                    update_fields.update({
                                        "attachments.$.thumbnail_webp_gridfs_id": str(new_webp_id),
                                        "attachments.$.thumbnail_webp_size_bytes": size_webp
                                    })
                                await db.patients.update_one(
                                    {"id": patient_id, "attachments.id": attachment_id},
                                    {"$set": update_fields}
                                )
                            except Exception:
                                pass
                        except Exception:
                            pass
                    try:
                        asyncio.create_task(_regen_thumb())
                    except Exception:
                        pass
                async def thumb_iter():
                    while True:
                        chunk = await thumb_out.readchunk()
                        if not chunk:
                            break
                        yield chunk
                headers = {
                    "Content-Disposition": f"inline; filename=preview-{attachment.get('filename','file')}.{ 'webp' if use_webp else 'jpg'}",
                    **({"Content-Length": str(size)} if size else {}),
                    "ETag": f"preview-{attachment.get('id','')}-{size}",
                    "Cache-Control": "private, max-age=86400"
                }
                return StreamingResponse(thumb_iter(), media_type=('image/webp' if use_webp else 'image/jpeg'), headers=headers)
            except Exception:
                pass
        grid_out = await fs.open_download_stream(ObjectId(attachment['gridfs_id']))
        if preview and str(attachment.get('file_type', '')).startswith('image/'):
            try:
                buf = io.BytesIO()
                while True:
                    chunk = await grid_out.readchunk()
                    if not chunk:
                        break
                    buf.write(chunk)
                buf.seek(0)
                img = Image.open(buf)
                img.thumbnail((128, 128))
                out = io.BytesIO()
                img = img.convert('RGB')
                img.save(out, format='JPEG', quality=60, optimize=True, progressive=True)
                out.seek(0)
                size = out.getbuffer().nbytes
                try:
                    thumb_id = await fs.upload_from_stream(
                        f"thumb-{attachment.get('filename','file')}.jpg",
                        out,
                        metadata={"content_type": "image/jpeg", "kind": "thumbnail"}
                    )
                    await db.patients.update_one(
                        {"id": patient_id, "attachments.id": attachment_id},
                        {"$set": {"attachments.$.thumbnail_gridfs_id": str(thumb_id), "attachments.$.thumbnail_size_bytes": size}}
                    )
                    out.seek(0)
                except Exception:
                    out.seek(0)
                headers = {
                    "Content-Disposition": f"inline; filename=preview-{attachment.get('filename','file')}.jpg",
                    **({"Content-Length": str(size)} if size else {}),
                    "ETag": f"preview-{attachment.get('id','')}-{size}",
                    "Cache-Control": "private, max-age=86400"
                }
                return StreamingResponse(out, media_type='image/jpeg', headers=headers)
            except Exception:
                pass
        if modal and str(attachment.get('file_type', '')).startswith('image/'):
            try:
                buf = io.BytesIO()
                while True:
                    chunk = await grid_out.readchunk()
                    if not chunk:
                        break
                    buf.write(chunk)
                buf.seek(0)
                img = Image.open(buf)
                img.thumbnail((1280, 1280))
                out_jpg = io.BytesIO()
                img = img.convert('RGB')
                img.save(out_jpg, format='JPEG', quality=78, optimize=True, progressive=True)
                out_jpg.seek(0)
                size_jpg = out_jpg.getbuffer().nbytes
                out_webp = io.BytesIO()
                try:
                    img.save(out_webp, format='WEBP', quality=78, method=6)
                    out_webp.seek(0)
                    size_webp = out_webp.getbuffer().nbytes
                except Exception:
                    size_webp = None
                try:
                    modal_id = await fs.upload_from_stream(
                        f"modal-{attachment.get('filename','file')}.jpg",
                        out_jpg,
                        metadata={"content_type": "image/jpeg", "kind": "modal"}
                    )
                    update_fields = {"attachments.$.preview_modal_gridfs_id": str(modal_id), "attachments.$.preview_modal_size_bytes": size_jpg}
                    if size_webp is not None:
                        modal_webp_id = await fs.upload_from_stream(
                            f"modal-{attachment.get('filename','file')}.webp",
                            out_webp,
                            metadata={"content_type": "image/webp", "kind": "modal_webp"}
                        )
                        update_fields.update({
                            "attachments.$.preview_modal_webp_gridfs_id": str(modal_webp_id),
                            "attachments.$.preview_modal_webp_size_bytes": size_webp
                        })
                    await db.patients.update_one(
                        {"id": patient_id, "attachments.id": attachment_id},
                        {"$set": update_fields}
                    )
                    out_jpg.seek(0)
                except Exception:
                    out_jpg.seek(0)
                use_webp_modal = (format == 'webp' and size_webp)
                chosen_out = out_webp if use_webp_modal else out_jpg
                chosen_size = size_webp if use_webp_modal else size_jpg
                headers = {
                    "Content-Disposition": f"inline; filename=modal-{attachment.get('filename','file')}.{ 'webp' if use_webp_modal else 'jpg'}",
                    **({"Content-Length": str(chosen_size)} if chosen_size else {}),
                    "ETag": f"modal-{attachment.get('id','')}-{chosen_size}-{ 'webp' if use_webp_modal else 'jpg'}",
                    "Cache-Control": "private, max-age=86400"
                }
                return StreamingResponse(chosen_out, media_type=('image/webp' if use_webp_modal else 'image/jpeg'), headers=headers)
            except Exception:
                pass

        async def gridfs_iter():
            while True:
                chunk = await grid_out.readchunk()
                if not chunk:
                    break
                yield chunk

        size = attachment.get('size_bytes') or getattr(grid_out, 'length', 0)
        headers = {
            "Content-Disposition": f"attachment; filename={attachment.get('filename','file')}",
            **({"Content-Length": str(size)} if size else {}),
            "ETag": f"{attachment.get('id','')}-{size}",
            "Cache-Control": "private, max-age=300"
        }
        return StreamingResponse(
            gridfs_iter(),
            media_type=attachment.get('file_type', 'application/octet-stream'),
            headers=headers
        )

    def b64_bytes_iter(b64_str: str, chunk_chars: int = 4 * 32768):
        for i in range(0, len(b64_str), chunk_chars):
            chunk = b64_str[i:i + chunk_chars]
            yield base64.b64decode(chunk)

    # Base64 storage fallback
    if preview and str(attachment.get('file_type', '')).startswith('image/'):
        if attachment.get('thumbnail_gridfs_id') or attachment.get('thumbnail_webp_gridfs_id'):
            try:
                fs = AsyncIOMotorGridFSBucket(db)
                prefer_webp = (format == 'webp') and bool(attachment.get('thumbnail_webp_gridfs_id'))
                try:
                    from fastapi import Request
                except Exception:
                    Request = None
                grid_out = await fs.open_download_stream(ObjectId(attachment.get('thumbnail_webp_gridfs_id') if prefer_webp else attachment['thumbnail_gridfs_id']))
                async def thumb_iter():
                    while True:
                        chunk = await grid_out.readchunk()
                        if not chunk:
                            break
                        yield chunk
                size = (attachment.get('thumbnail_webp_size_bytes') if prefer_webp else attachment.get('thumbnail_size_bytes')) or getattr(grid_out, 'length', 0)
                headers = {
                    "Content-Disposition": f"inline; filename=preview-{attachment.get('filename','file')}.{ 'webp' if prefer_webp else 'jpg'}",
                    **({"Content-Length": str(size)} if size else {}),
                    "ETag": f"preview-{attachment.get('id','')}-{size}-{ 'webp' if prefer_webp else 'jpg'}",
                    "Cache-Control": "private, max-age=86400"
                }
                return StreamingResponse(thumb_iter(), media_type=('image/webp' if prefer_webp else 'image/jpeg'), headers=headers)
            except Exception:
                pass
        try:
            raw_bytes = base64.b64decode(attachment.get('file_data', ''))
            img = Image.open(io.BytesIO(raw_bytes))
            img.thumbnail((128, 128))
            out = io.BytesIO()
            img = img.convert('RGB')
            img.save(out, format='JPEG', quality=60, optimize=True, progressive=True)
            out.seek(0)
            size = out.getbuffer().nbytes
            out_webp = io.BytesIO()
            webp_size = None
            try:
                img.save(out_webp, format='WEBP', quality=60, method=6)
                out_webp.seek(0)
                webp_size = out_webp.getbuffer().nbytes
            except Exception:
                pass
            try:
                fs = AsyncIOMotorGridFSBucket(db)
                thumb_id = await fs.upload_from_stream(
                    f"thumb-{attachment.get('filename','file')}.jpg",
                    out,
                    metadata={"content_type": "image/jpeg", "kind": "thumbnail"}
                )
                await db.patients.update_one(
                    {"id": patient_id, "attachments.id": attachment_id},
                    {"$set": {"attachments.$.thumbnail_gridfs_id": str(thumb_id), "attachments.$.thumbnail_size_bytes": size}}
                )
                out.seek(0)
                if webp_size is not None:
                    webp_id = await fs.upload_from_stream(
                        f"thumb-{attachment.get('filename','file')}.webp",
                        out_webp,
                        metadata={"content_type": "image/webp", "kind": "thumbnail_webp"}
                    )
                    await db.patients.update_one(
                        {"id": patient_id, "attachments.id": attachment_id},
                        {"$set": {"attachments.$.thumbnail_webp_gridfs_id": str(webp_id), "attachments.$.thumbnail_webp_size_bytes": webp_size}}
                    )
                    out_webp.seek(0)
            except Exception:
                out.seek(0)
            headers = {
                "Content-Disposition": f"inline; filename=preview-{attachment.get('filename','file')}.jpg",
                **({"Content-Length": str(size)} if size else {}),
                "ETag": f"preview-{attachment.get('id','')}-{size}",
                "Cache-Control": "private, max-age=86400"
            }
            return StreamingResponse(out, media_type='image/jpeg', headers=headers)
        except Exception:
            pass
    if modal and str(attachment.get('file_type', '')).startswith('image/'):
        if attachment.get('preview_modal_gridfs_id'):
            try:
                fs = AsyncIOMotorGridFSBucket(db)
                use_webp_modal = (format == 'webp') and bool(attachment.get('preview_modal_webp_gridfs_id'))
                grid_out = await fs.open_download_stream(ObjectId(attachment.get('preview_modal_webp_gridfs_id') if use_webp_modal else attachment['preview_modal_gridfs_id']))
                async def modal_iter():
                    while True:
                        chunk = await grid_out.readchunk()
                        if not chunk:
                            break
                        yield chunk
                size = (attachment.get('preview_modal_webp_size_bytes') if use_webp_modal else attachment.get('preview_modal_size_bytes')) or getattr(grid_out, 'length', 0)
                headers = {
                    "Content-Disposition": f"inline; filename=modal-{attachment.get('filename','file')}.{ 'webp' if use_webp_modal else 'jpg'}",
                    **({"Content-Length": str(size)} if size else {}),
                    "ETag": f"modal-{attachment.get('id','')}-{size}-{ 'webp' if use_webp_modal else 'jpg'}",
                    "Cache-Control": "private, max-age=300"
                }
                return StreamingResponse(modal_iter(), media_type=('image/webp' if use_webp_modal else 'image/jpeg'), headers=headers)
            except Exception:
                pass
        try:
            raw_bytes = base64.b64decode(attachment.get('file_data', ''))
            img = Image.open(io.BytesIO(raw_bytes))
            img.thumbnail((1280, 1280))
            out = io.BytesIO()
            img = img.convert('RGB')
            img.save(out, format='JPEG', quality=82)
            out.seek(0)
            size = out.getbuffer().nbytes
            try:
                fs = AsyncIOMotorGridFSBucket(db)
                modal_id = await fs.upload_from_stream(
                    f"modal-{attachment.get('filename','file')}.jpg",
                    out,
                    metadata={"content_type": "image/jpeg", "kind": "modal"}
                )
                await db.patients.update_one(
                    {"id": patient_id, "attachments.id": attachment_id},
                    {"$set": {"attachments.$.preview_modal_gridfs_id": str(modal_id), "attachments.$.preview_modal_size_bytes": size}}
                )
                out.seek(0)
            except Exception:
                out.seek(0)
            headers = {
                "Content-Disposition": f"inline; filename=modal-{attachment.get('filename','file')}.jpg",
                **({"Content-Length": str(size)} if size else {}),
                "ETag": f"modal-{attachment.get('id','')}-{size}",
                "Cache-Control": "private, max-age=86400"
            }
            return StreamingResponse(out, media_type='image/jpeg', headers=headers)
        except Exception:
            pass

    size = attachment.get('size_bytes') or 0
    headers = {
        "Content-Disposition": f"attachment; filename={attachment.get('filename','file')}",
        **({"Content-Length": str(size)} if size else {}),
        "ETag": f"{attachment.get('id','')}-{size}",
        "Cache-Control": "private, max-age=300"
    }
    async def _migrate_to_gridfs():
        try:
            fs = AsyncIOMotorGridFSBucket(db)
            raw_bytes = base64.b64decode(attachment.get('file_data', ''))
            file_id = await fs.upload_from_stream(
                attachment.get('filename', 'file'),
                io.BytesIO(raw_bytes),
                metadata={"content_type": attachment.get('file_type', 'application/octet-stream')}
            )
            await db.patients.update_one(
                {"id": patient_id, "attachments.id": attachment_id},
                {"$set": {"attachments.$.gridfs_id": str(file_id), "attachments.$.size_bytes": len(raw_bytes), "attachments.$.file_data": None}}
            )
        except Exception:
            pass
    try:
        asyncio.create_task(_migrate_to_gridfs())
    except Exception:
        pass
    return StreamingResponse(
        b64_bytes_iter(attachment.get('file_data', '')),
        media_type=attachment.get('file_type', 'application/octet-stream'),
        headers=headers
    )

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
                "cpf": 1,
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
    patient = await db.patients.find_one({"id": patient_id}, {"_id": 0, "attachments.file_data": 0})
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
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    try:
        duplicate_exists = False
        duplicate_q_room = {
            "appointment_date": payload.get("appointment_date"),
            "appointment_time": payload.get("appointment_time"),
            "room_id": payload.get("room_id"),
        }
        if all(duplicate_q_room.values()):
            duplicate_exists = await db.appointments.find_one(duplicate_q_room, {"_id": 0}) is not None
        if not duplicate_exists:
            duplicate_q_prof = {
                "appointment_date": payload.get("appointment_date"),
                "appointment_time": payload.get("appointment_time"),
                "professional_id": payload.get("professional_id"),
            }
            if all(duplicate_q_prof.values()):
                duplicate_exists = await db.appointments.find_one(duplicate_q_prof, {"_id": 0}) is not None
        if not duplicate_exists and payload.get("service_id"):
            duplicate_q_service = {
                "appointment_date": payload.get("appointment_date"),
                "appointment_time": payload.get("appointment_time"),
                "service_id": payload.get("service_id"),
            }
            duplicate_exists = await db.appointments.find_one(duplicate_q_service, {"_id": 0}) is not None
        if duplicate_exists:
            try:
                await db.audit_logs.insert_one({
                    "id": str(uuid.uuid4()),
                    "type": "duplicate_appointment_attempt",
                    "user_id": current_user.get("id"),
                    "payload": payload,
                    "occurred_at": datetime.now(timezone.utc).isoformat()
                })
            except Exception:
                pass
            raise HTTPException(status_code=409, detail="Já existe um agendamento para esta data e horário")
    except HTTPException:
        raise
    except Exception:
        pass
    appointment = Appointment(**payload)
    doc = appointment.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    try:
        await db.appointments.insert_one(doc)
    except Exception:
        try:
            await db.audit_logs.insert_one({
                "id": str(uuid.uuid4()),
                "type": "duplicate_appointment_attempt",
                "user_id": current_user.get("id"),
                "payload": payload,
                "occurred_at": datetime.now(timezone.utc).isoformat()
            })
        except Exception:
            pass
        raise HTTPException(status_code=409, detail="Já existe um agendamento para esta data e horário")
    return appointment

@api_router.get("/appointments", response_model=List[dict])
async def get_appointments(
    sort_by: Optional[str] = None,
    order: Optional[str] = "asc",
    patient_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if patient_id:
        query["patient_id"] = patient_id
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
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    try:
        current = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
        if not current:
            raise HTTPException(status_code=404, detail="Appointment not found")
        target_date = update_data.get("appointment_date", current.get("appointment_date"))
        target_time = update_data.get("appointment_time", current.get("appointment_time"))
        target_room = update_data.get("room_id", current.get("room_id"))
        target_service = update_data.get("service_id", current.get("service_id"))
        target_professional = update_data.get("professional_id", current.get("professional_id"))
        duplicate_q_room = {
            "appointment_date": target_date,
            "appointment_time": target_time,
            "room_id": target_room,
            "id": {"$ne": appointment_id}
        }
        duplicate_exists = False
        if target_date and target_time and target_room:
            duplicate_exists = await db.appointments.find_one(duplicate_q_room, {"_id": 0}) is not None
        if not duplicate_exists and target_professional:
            duplicate_q_prof = {
                "appointment_date": target_date,
                "appointment_time": target_time,
                "professional_id": target_professional,
                "id": {"$ne": appointment_id}
            }
            duplicate_exists = await db.appointments.find_one(duplicate_q_prof, {"_id": 0}) is not None
        if not duplicate_exists and target_service:
            duplicate_q_service = {
                "appointment_date": target_date,
                "appointment_time": target_time,
                "service_id": target_service,
                "id": {"$ne": appointment_id}
            }
            duplicate_exists = await db.appointments.find_one(duplicate_q_service, {"_id": 0}) is not None
        if duplicate_exists:
            try:
                await db.audit_logs.insert_one({
                    "id": str(uuid.uuid4()),
                    "type": "duplicate_appointment_attempt",
                    "user_id": current_user.get("id"),
                    "payload": {
                        "appointment_id": appointment_id,
                        "appointment_date": target_date,
                        "appointment_time": target_time,
                        "room_id": target_room,
                        "service_id": target_service
                    },
                    "occurred_at": datetime.now(timezone.utc).isoformat()
                })
            except Exception:
                pass
            raise HTTPException(status_code=409, detail="Já existe um agendamento para esta data e horário")
    except HTTPException:
        raise
    except Exception:
        pass

    result = await db.appointments.update_one({"id": appointment_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return {"message": "Appointment updated successfully"}

@api_router.get("/appointments/check-conflicts")
async def check_appointments_conflicts(
    appointment_date: str,
    appointment_time: str,
    room_id: str,
    professional_id: Optional[str] = None,
    appointment_time_end: Optional[str] = None,
    exclude_appointment_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    duplicate = False
    conflicts = {
        "professional_conflicts": [],
        "room_conflicts": []
    }
    dup_q_room = {
        "appointment_date": appointment_date,
        "appointment_time": appointment_time,
        "room_id": room_id
    }
    if exclude_appointment_id:
        dup_q_room["id"] = {"$ne": exclude_appointment_id}
    room_doc = await db.rooms.find_one({"id": room_id}, {"_id": 0, "name": 1})
    room_name = (room_doc or {}).get("name", "")
    existing_room_apt = await db.appointments.find_one(dup_q_room, {"_id": 0})
    if existing_room_apt:
        duplicate = True
        conflicts["room_conflicts"].append({
            "time": existing_room_apt.get("appointment_time"),
            "time_end": existing_room_apt.get("appointment_time_end"),
            "patient_name": (await db.patients.find_one({"id": existing_room_apt.get("patient_id")}, {"_id": 0, "name": 1}) or {}).get("name", ""),
            "room_name": room_name
        })
    if professional_id:
        dup_q_prof = {
            "appointment_date": appointment_date,
            "appointment_time": appointment_time,
            "professional_id": professional_id
        }
        if exclude_appointment_id:
            dup_q_prof["id"] = {"$ne": exclude_appointment_id}
        existing_prof_apt = await db.appointments.find_one(dup_q_prof, {"_id": 0})
        if existing_prof_apt:
            duplicate = True
            conflicts["professional_conflicts"].append({
                "time": existing_prof_apt.get("appointment_time"),
                "time_end": existing_prof_apt.get("appointment_time_end"),
                "patient_name": (await db.patients.find_one({"id": existing_prof_apt.get("patient_id")}, {"_id": 0, "name": 1}) or {}).get("name", "")
            })
    day_q = {"appointment_date": appointment_date}
    room_day = await db.appointments.find({"$and": [day_q, {"room_id": room_id}]}, {"_id": 0}).to_list(500)
    prof_day = []
    if professional_id:
        prof_day = await db.appointments.find({"$and": [day_q, {"professional_id": professional_id}]}, {"_id": 0}).to_list(500)
    def overlaps(a_start: str, a_end: Optional[str], b_start: str, b_end: Optional[str]) -> bool:
        a_e = a_end or a_start
        b_e = b_end or b_start
        return (a_start < b_e) and (b_start < a_e)
    patient_cache = {}
    for r in room_day:
        if exclude_appointment_id and r.get("id") == exclude_appointment_id:
            continue
        if overlaps(appointment_time, appointment_time_end, r.get("appointment_time"), r.get("appointment_time_end")):
            pid = r.get("patient_id")
            pn = patient_cache.get(pid)
            if pn is None:
                pn = (await db.patients.find_one({"id": pid}, {"_id": 0, "name": 1}) or {}).get("name", "")
                patient_cache[pid] = pn
            conflicts["room_conflicts"].append({
                "time": r.get("appointment_time"),
                "time_end": r.get("appointment_time_end"),
                "patient_name": pn,
                "room_name": room_name
            })
    for p in prof_day:
        if exclude_appointment_id and p.get("id") == exclude_appointment_id:
            continue
        if overlaps(appointment_time, appointment_time_end, p.get("appointment_time"), p.get("appointment_time_end")):
            pid = p.get("patient_id")
            pn = patient_cache.get(pid)
            if pn is None:
                pn = (await db.patients.find_one({"id": pid}, {"_id": 0, "name": 1}) or {}).get("name", "")
                patient_cache[pid] = pn
            conflicts["professional_conflicts"].append({
                "time": p.get("appointment_time"),
                "time_end": p.get("appointment_time_end"),
                "patient_name": pn
            })
    has_conflicts = duplicate or len(conflicts["room_conflicts"]) > 0 or len(conflicts["professional_conflicts"]) > 0
    return {
        "has_conflicts": has_conflicts,
        "duplicate": duplicate,
        "conflicts": conflicts
    }

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
async def get_transactions(
    patient_id: Optional[str] = None,
    sort_by: Optional[str] = "created_at",
    order: Optional[str] = "desc",
    limit: Optional[int] = 200,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if patient_id:
        query["patient_id"] = patient_id
    sort_field = sort_by if sort_by in {"created_at", "transaction_date", "amount", "status"} else "created_at"
    sort_order = -1 if order == "desc" else 1
    cursor = db.transactions.find(query, {"_id": 0}).sort(sort_field, sort_order)
    if limit and isinstance(limit, int):
        cursor = cursor.limit(max(1, min(limit, 1000)))
    transactions = await cursor.to_list(length=1000)
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
async def get_medical_records(
    patient_id: str,
    sort_by: Optional[str] = "created_at",
    order: Optional[str] = "desc",
    limit: Optional[int] = 200,
    current_user: dict = Depends(get_current_user)
):
    sort_field = sort_by if sort_by in {"created_at"} else "created_at"
    sort_order = -1 if order == "desc" else 1
    cursor = db.medical_records.find({"patient_id": patient_id}, {"_id": 0}).sort(sort_field, sort_order)
    if limit and isinstance(limit, int):
        cursor = cursor.limit(max(1, min(limit, 1000)))
    records = await cursor.to_list(length=1000)
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

async def send_whatsapp_message(to_phone: str, message_body: str):
    """
    Sends a WhatsApp message using the configured provider (Official Meta or UazApi).
    Returns True if successful, False otherwise.
    """
    try:
        settings = await db.settings.find_one({"type": "omnichannel"}, {"_id": 0})
        whatsapp = settings.get("whatsapp") if settings else None
        
        if not whatsapp or not whatsapp.get('enabled'):
            logging.warning("WhatsApp not configured or disabled.")
            return False

        # Clean phone number
        clean_phone = "".join(filter(str.isdigit, to_phone))
        if not clean_phone.startswith("55") and len(clean_phone) <= 11:
             clean_phone = "55" + clean_phone

        provider = whatsapp.get('provider', 'official')
        
        async with httpx.AsyncClient() as client:
            if provider == 'official':
                # Meta API
                if not whatsapp.get('phone_number_id') or not whatsapp.get('access_token'):
                    logging.error("Meta credentials missing.")
                    return False
                    
                url = f"https://graph.facebook.com/v21.0/{whatsapp['phone_number_id']}/messages"
                headers = {
                    "Authorization": f"Bearer {whatsapp['access_token']}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "messaging_product": "whatsapp",
                    "to": clean_phone,
                    "type": "text",
                    "text": {"body": message_body}
                }
                
                response = await client.post(url, json=payload, headers=headers, timeout=10)
                if response.status_code == 200:
                    return True
                else:
                    logging.error(f"Meta API Error: {response.text}")
                    return False

            elif provider == 'uazapi':
                # UazApi (Evolution/WPPConnect)
                base_url = whatsapp.get('uazapi_url')
                token = whatsapp.get('uazapi_token')
                instance = whatsapp.get('uazapi_instance', 'default')
                
                if not base_url or not token:
                    logging.error("UazApi credentials missing.")
                    return False
                
                base_url = base_url.rstrip('/')
                
                # Special logic for FortaLabs (User specific request)
                if "fortalabs.uazapi.com" in base_url:
                    url = f"{base_url}/send/text"
                    # Query param authentication + simple payload
                    url_with_token = f"{url}?token={token}"
                    headers = {"Content-Type": "application/json"}
                    payload = {
                        "number": clean_phone,
                        "text": message_body
                    }
                    
                    response = await client.post(url_with_token, json=payload, headers=headers, timeout=10)
                else:
                    # Standard Evolution API style: /message/sendText/{instance}
                    url = f"{base_url}/message/sendText/{instance}"
                    headers = {
                        "apikey": token,
                        "Content-Type": "application/json"
                    }
                    payload = {
                        "number": clean_phone,
                        "options": {
                            "delay": 1200,
                            "presence": "composing",
                            "linkPreview": False
                        },
                        "textMessage": {
                            "text": message_body
                        }
                    }
                    response = await client.post(url, json=payload, headers=headers, timeout=10)
                
                if response.status_code in [200, 201]:
                    return True
                else:
                    logging.error(f"UazApi Error: {response.text}")
                    return False
                    
    except Exception as e:
        logging.error(f"Error sending WhatsApp message: {e}")
        return False

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

    # Send via WhatsApp
    lead = await db.leads.find_one({"id": conversation["lead_id"]}, {"_id": 0})
    if lead and lead.get("phone"):
        asyncio.create_task(send_whatsapp_message(lead["phone"], data.content))
    
    return message

@api_router.get("/messages", response_model=List[dict])
async def get_messages(conversation_id: str, current_user: dict = Depends(get_current_user)):
    messages = await db.messages.find({"conversation_id": conversation_id}, {"_id": 0}).to_list(1000)
    for m in messages:
        if isinstance(m.get('created_at'), str):
            m['created_at'] = datetime.fromisoformat(m['created_at'])
    return messages

# Nested Routes for Conversations (Frontend Compatibility)
@api_router.get("/conversations/{conversation_id}/messages", response_model=List[dict])
async def get_conversation_messages(conversation_id: str, current_user: dict = Depends(get_current_user)):
    return await get_messages(conversation_id, current_user)

@api_router.post("/conversations/{conversation_id}/messages", response_model=Message)
async def create_conversation_message(conversation_id: str, data: MessageCreate, current_user: dict = Depends(get_current_user)):
    data.conversation_id = conversation_id
    return await create_message(data, current_user)

@api_router.put("/conversations/{conversation_id}/assign", response_model=Conversation)
async def assign_conversation(conversation_id: str, current_user: dict = Depends(get_current_user)):
    conversation = await db.conversations.find_one({"id": conversation_id}, {"_id": 0})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    update_data = {
        "assigned_to": current_user.get("id"),
        "assigned_to_name": current_user.get("name")
    }
    
    await db.conversations.update_one(
        {"id": conversation_id},
        {"$set": update_data}
    )
    
    updated_conv = await db.conversations.find_one({"id": conversation_id}, {"_id": 0})
    if isinstance(updated_conv.get('created_at'), str):
        updated_conv['created_at'] = datetime.fromisoformat(updated_conv['created_at'])
    if isinstance(updated_conv.get('last_message_at'), str):
        updated_conv['last_message_at'] = datetime.fromisoformat(updated_conv['last_message_at'])
        
    return updated_conv

# Webhook Logs (In-Memory for debugging)
WEBHOOK_LOGS = []

@api_router.get("/webhook/logs")
async def get_webhook_logs(limit: int = 10):
    return WEBHOOK_LOGS[-limit:]

@api_router.get("/debug/configure-uazapi")
async def debug_configure_uazapi():
    """
    Force configuration of UazApi webhook using stored settings.
    """
    try:
        settings = await db.settings.find_one({"type": "omnichannel"}, {"_id": 0})
        if not settings:
            return {"status": "error", "message": "No omnichannel settings found"}
            
        whatsapp = settings.get("whatsapp")
        if not whatsapp or whatsapp.get("provider") != "uazapi":
            return {"status": "error", "message": "UazApi not configured or not selected provider"}
            
        uazapi_url = whatsapp.get("uazapi_url")
        uazapi_token = whatsapp.get("uazapi_token")
        
        if not uazapi_url or not uazapi_token:
            return {"status": "error", "message": "Missing URL or Token"}
            
        # Hardcoded for reliability in this specific fix
        my_url = "https://clinicflow-lucj.onrender.com"
        webhook_url = f"{my_url}/api/webhook/uazapi"
        
        results = []
        instance = whatsapp.get("uazapi_instance", "default")
        base_url = uazapi_url.rstrip('/')
        
        async with httpx.AsyncClient() as client:
            
            # Common Payloads
            payload_std = {
                "enabled": True,
                "url": webhook_url,
                "webhookByEvents": False,
                "events": ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE"]
            }
            
            headers_std = {
                "apikey": uazapi_token,
                "Content-Type": "application/json"
            }
            
            # --- Attempt Strategy ---
            
            # 1. POST /webhook/set/{instance} (Standard Evolution)
            url_1 = f"{base_url}/webhook/set/{instance}"
            try:
                resp = await client.post(url_1, json=payload_std, headers=headers_std, timeout=10)
                results.append({"method": "POST /webhook/set/{instance}", "url": url_1, "status": resp.status_code, "response": resp.text})
            except Exception as e:
                results.append({"method": "POST /webhook/set/{instance}", "error": str(e)})

            # 2. PUT /webhook/set/{instance} (Alternative Method)
            try:
                resp = await client.put(url_1, json=payload_std, headers=headers_std, timeout=10)
                results.append({"method": "PUT /webhook/set/{instance}", "url": url_1, "status": resp.status_code, "response": resp.text})
            except Exception as e:
                results.append({"method": "PUT /webhook/set/{instance}", "error": str(e)})

            # 3. POST /webhook/instance/{instance} (Variant)
            url_3 = f"{base_url}/webhook/instance/{instance}"
            try:
                resp = await client.post(url_3, json=payload_std, headers=headers_std, timeout=10)
                results.append({"method": "POST /webhook/instance/{instance}", "url": url_3, "status": resp.status_code, "response": resp.text})
            except Exception as e:
                results.append({"method": "POST /webhook/instance/{instance}", "error": str(e)})
            
            # 4. POST /webhook/set?token={token} (FortaLabs Query Param Style)
            url_4 = f"{base_url}/webhook/set"
            params_4 = {"token": uazapi_token}
            try:
                resp = await client.post(url_4, params=params_4, json=payload_std, timeout=10)
                results.append({"method": "POST /webhook/set?token=...", "url": url_4, "status": resp.status_code, "response": resp.text})
            except Exception as e:
                results.append({"method": "POST /webhook/set?token=...", "error": str(e)})

        return {
            "status": "completed",
            "webhook_target": webhook_url,
            "attempts": results
        }

    except Exception as e:
        return {"status": "critical_error", "detail": str(e)}

# Webhook for UazApi (Evolution/WPPConnect)
@api_router.post("/webhook/uazapi")
async def uazapi_webhook(request: Request):
    """
    Receives webhooks from UazApi/Evolution/WPPConnect.
    Handles incoming messages and updates conversations.
    """
    try:
        payload = await request.json()
        
        # Log payload for debugging
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": payload
        }
        WEBHOOK_LOGS.append(log_entry)
        if len(WEBHOOK_LOGS) > 50:
            WEBHOOK_LOGS.pop(0)
            
        logging.info(f"UazApi Webhook Payload: {payload}")
        
        # Check if it's a message
        # Evolution structure usually: data.message or data.data.message
        message_data = payload.get("data", {}).get("message") or payload.get("data")
        
        # Adjust for FortaLabs custom payload if needed
        if not message_data and "content" in payload:
             message_data = payload # Maybe it's flat
             
        if not message_data:
            return {"status": "ignored", "reason": "no_message_data"}

        # Extract info
        from_number = message_data.get("remoteJid", "").split("@")[0]
        if not from_number:
             from_number = message_data.get("from", "").split("@")[0]
             
        body = message_data.get("conversation") or \
               message_data.get("text") or \
               message_data.get("body") or \
               (message_data.get("extendedTextMessage", {}).get("text"))
               
        if not from_number or not body:
             return {"status": "ignored", "reason": "incomplete_data"}

        # Normalize phone for search
        # Try exact match first, then without 55 if present
        lead = await db.leads.find_one({"phone": from_number}, {"_id": 0})
        
        if not lead and from_number.startswith("55"):
            # Try without 55
            short_number = from_number[2:]
            lead = await db.leads.find_one({"phone": short_number}, {"_id": 0})
            
        if not lead:
            # Try searching as if DB has 55 but incoming doesn't (unlikely for UazApi but possible)
            lead = await db.leads.find_one({"phone": f"55{from_number}"}, {"_id": 0})

        if not lead:
            # Create new lead from unknown number
            lead_id = str(uuid.uuid4())
            lead = {
                "id": lead_id,
                "name": message_data.get("pushName") or f"WhatsApp {from_number}",
                "phone": from_number,
                "status": "new",
                "source": "whatsapp_inbound",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.leads.insert_one(lead)
            
        # 2. Find conversation
        conversation = await db.conversations.find_one({"lead_id": lead["id"]}, {"_id": 0})
        if not conversation:
            conversation_id = str(uuid.uuid4())
            conversation = {
                "id": conversation_id,
                "lead_id": lead["id"],
                "channel": "whatsapp",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "last_message_at": datetime.now(timezone.utc).isoformat()
            }
            await db.conversations.insert_one(conversation)
            
        # 3. Save Message
        message = {
            "id": str(uuid.uuid4()),
            "conversation_id": conversation["id"],
            "sender_type": "lead",
            "sender_id": lead["id"],
            "sender_name": lead["name"],
            "content": body,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.messages.insert_one(message)
        
        # Update conversation timestamp
        await db.conversations.update_one(
            {"id": conversation["id"]},
            {"$set": {"last_message_at": datetime.now(timezone.utc).isoformat()}}
        )

        return {"status": "processed"}

    except Exception as e:
        logging.error(f"Error processing UazApi webhook: {e}")
        return {"status": "error", "detail": str(e)}

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
            if p.get("phone"):
                if await send_whatsapp_message(p.get("phone"), msg or f"Parabéns {name}!"):
                    sent += 1
                    
    return {"created": created, "sent": sent}

@api_router.post("/automations/auto-message")
async def send_auto_message(req: AutoMessageRequest, current_user: dict = Depends(get_current_user)):
    patient = await db.patients.find_one({"id": req.patient_id}, {"_id": 0})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

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

    if not patient.get("phone"):
        raise HTTPException(status_code=400, detail="Patient has no phone number")

    success = await send_whatsapp_message(patient["phone"], message_body)
    if not success:
         raise HTTPException(status_code=500, detail="Failed to send message via WhatsApp")

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
    provider: str = "official"  # official, uazapi
    enabled: bool = False
    # Official Meta
    phone_number_id: Optional[str] = None
    business_account_id: Optional[str] = None
    access_token: Optional[str] = None
    verify_token: Optional[str] = None
    # UazApi (Evolution/WPPConnect)
    uazapi_url: Optional[str] = None
    uazapi_token: Optional[str] = None
    uazapi_instance: Optional[str] = None

class InstagramSettings(BaseModel):
    enabled: bool = False
    page_id: Optional[str] = None
    access_token: Optional[str] = None
    verify_token: Optional[str] = None
    webhook_url: Optional[str] = None

class MessengerSettings(BaseModel):
    enabled: bool = False
    page_id: Optional[str] = None
    access_token: Optional[str] = None
    verify_token: Optional[str] = None
    webhook_url: Optional[str] = None

class OmnichannelSettings(BaseModel):
    whatsapp: Optional[WhatsAppSettings] = None
    instagram: Optional[InstagramSettings] = None
    messenger: Optional[MessengerSettings] = None

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
    
    update_data = {}
    if data.whatsapp:
        update_data["whatsapp"] = data.whatsapp.model_dump()
    if data.instagram:
        update_data["instagram"] = data.instagram.model_dump()
    if data.messenger:
        update_data["messenger"] = data.messenger.model_dump()
        
    if update_data:
        await db.settings.update_one(
            {"type": "omnichannel"},
            {"$set": update_data},
            upsert=True
        )
    return {"message": "Settings saved"}

@api_router.post("/settings/omnichannel/whatsapp")
async def save_whatsapp_settings(data: WhatsAppSettings, current_user: dict = Depends(get_current_user)):
    if not current_user.get("role", {}).get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.settings.update_one(
        {"type": "omnichannel"},
        {"$set": {"whatsapp": data.model_dump()}},
        upsert=True
    )
    
    # Attempt to configure Webhook if UazApi/FortaLabs
    if data.provider == 'uazapi' and data.uazapi_url and data.uazapi_token:
        try:
             # Determine current backend URL (for webhook callback)
             # In production (Render), this should be the public URL.
             # We can try to infer or use an ENV var.
             public_url = os.environ.get("RENDER_EXTERNAL_URL") or os.environ.get("BACKEND_URL")
             
             if public_url:
                 webhook_url = f"{public_url}/api/webhook/uazapi"
                 
                 async with httpx.AsyncClient() as client:
                     if "fortalabs.uazapi.com" in data.uazapi_url:
                         # FortaLabs specific webhook config
                         # Assuming endpoint /webhook/set or similar based on Evolution API
                         # We'll try standard Evolution endpoint first
                         api_url = f"{data.uazapi_url.rstrip('/')}/webhook/set/{data.uazapi_instance or 'default'}"
                         payload = {
                             "enabled": True,
                             "url": webhook_url,
                             "webhookByEvents": False,
                             "events": ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE"]
                         }
                         headers = {"apikey": data.uazapi_token, "Content-Type": "application/json"}
                         
                         # Note: FortaLabs might use query param for token as seen before
                         if "fortalabs" in data.uazapi_url:
                              api_url = f"{data.uazapi_url.rstrip('/')}/webhook/set?token={data.uazapi_token}"
                              headers = {"Content-Type": "application/json"}
                              
                         logging.info(f"Attempting to set UazApi webhook to {webhook_url}")
                         await client.post(api_url, json=payload, headers=headers, timeout=5)
                         
        except Exception as e:
            logging.error(f"Failed to auto-configure UazApi webhook: {e}")

    return {"message": "WhatsApp settings saved"}

@api_router.post("/settings/omnichannel/instagram")
async def save_instagram_settings(data: InstagramSettings, current_user: dict = Depends(get_current_user)):
    if not current_user.get("role", {}).get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.settings.update_one(
        {"type": "omnichannel"},
        {"$set": {"instagram": data.model_dump()}},
        upsert=True
    )
    return {"message": "Instagram settings saved"}

@api_router.post("/settings/omnichannel/messenger")
async def save_messenger_settings(data: MessengerSettings, current_user: dict = Depends(get_current_user)):
    if not current_user.get("role", {}).get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.settings.update_one(
        {"type": "omnichannel"},
        {"$set": {"messenger": data.model_dump()}},
        upsert=True
    )
    return {"message": "Messenger settings saved"}

@api_router.post("/settings/omnichannel/whatsapp/test")
async def test_whatsapp_connection(settings: WhatsAppSettings, current_user: dict = Depends(get_current_user)):
    if not current_user.get("role", {}).get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
        
    provider = settings.provider
    
    async with httpx.AsyncClient() as client:
        try:
            if provider == 'official':
                if not settings.phone_number_id or not settings.access_token:
                    raise HTTPException(status_code=400, detail="Meta credentials missing")
                
                url = f"https://graph.facebook.com/v21.0/{settings.phone_number_id}"
                headers = {"Authorization": f"Bearer {settings.access_token}"}
                
                response = await client.get(url, headers=headers, timeout=10)
                
                if response.status_code == 200:
                    data = response.json()
                    return {"success": True, "message": f"Connected to Meta API. ID: {data.get('id')}"}
                else:
                    return {"success": False, "detail": f"Meta API Error: {response.text}"}
                    
            elif provider == 'uazapi':
                if not settings.uazapi_url or not settings.uazapi_token:
                    raise HTTPException(status_code=400, detail="UazApi credentials missing")
                
                base_url = settings.uazapi_url.rstrip('/')
                instance = settings.uazapi_instance or 'default'
                
                # Special logic for FortaLabs
                if "fortalabs.uazapi.com" in base_url:
                    url = f"{base_url}/status"
                    # Try to call status endpoint
                    response = await client.get(url, timeout=10)
                    if response.status_code == 200:
                        data = response.json()
                        # Extract status info if available
                        status_info = data.get('status', {}).get('checked_instance', {}).get('connection_status', 'connected')
                        return {"success": True, "message": f"Connected to UazApi (FortaLabs). Status: {status_info}"}
                    else:
                         return {"success": False, "detail": f"UazApi Error: {response.status_code}"}

                else:
                    # Check connection state (Evolution API style)
                    url = f"{base_url}/instance/connectionState/{instance}"
                    headers = {"apikey": settings.uazapi_token}
                    
                    response = await client.get(url, headers=headers, timeout=10)
                    
                    if response.status_code == 200:
                        data = response.json()
                        # Evolution returns { "instance": ..., "state": "open" }
                        state = data.get('instance', {}).get('state') or data.get('state')
                        return {"success": True, "message": f"Connected to UazApi. State: {state}"}
                    elif response.status_code == 404:
                         # Instance might not exist or endpoint is different
                         return {"success": False, "detail": "Instance not found or invalid URL"}
                    else:
                        return {"success": False, "detail": f"UazApi Error: {response.status_code} - {response.text}"}
            
            else:
                raise HTTPException(status_code=400, detail="Invalid provider")
                
        except httpx.RequestError as e:
            return {"success": False, "detail": f"Connection error: {str(e)}"}
        except Exception as e:
            return {"success": False, "detail": f"Unexpected error: {str(e)}"}

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
