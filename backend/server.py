from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request, File, UploadFile, Form, BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import io
import json
import shutil
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
import re
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr, field_validator
from typing import List, Optional, Union, Dict, Any
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
import bcrypt
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
from cryptography.hazmat.primitives import hashes, hmac
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ... (imports)

def decrypt_whatsapp_media(enc_data: bytes, media_key: str, media_type: str):
    try:
        media_key_bytes = base64.b64decode(media_key)
        
        if media_type == "image":
            info = b"WhatsApp Image Keys"
        elif media_type == "video":
            info = b"WhatsApp Video Keys"
        elif media_type == "audio":
            info = b"WhatsApp Audio Keys"
        elif media_type == "document":
            info = b"WhatsApp Document Keys"
        else:
            info = b"WhatsApp Image Keys" # Default fallback

        # HKDF Expansion
        hkdf = HKDF(
            algorithm=hashes.SHA256(),
            length=112,
            salt=None,
            info=info,
            backend=default_backend()
        )
        key_material = hkdf.derive(media_key_bytes)
        
        iv = key_material[0:16]
        cipher_key = key_material[16:48]
        mac_key = key_material[48:80]
        
        # Validate MAC (Optional, skipping for robustness in recovery)
        file_mac = enc_data[-10:]
        file_data = enc_data[:-10]
        
        cipher = Cipher(algorithms.AES(cipher_key), modes.CBC(iv), backend=default_backend())
        decryptor = cipher.decryptor()
        decrypted_data = decryptor.update(file_data) + decryptor.finalize()
        
        # Remove padding (PKCS7)
        pad = decrypted_data[-1]
        if pad < 1 or pad > 16:
             # Sometimes padding is weird or it's a stream, return as is if check fails
             return decrypted_data
        return decrypted_data[:-pad]
        
    except Exception as e:
        logging.error(f"Decryption failed: {e}")
        return None

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
    "expenses": [],
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
    global db, DEMO_MODE, client
    
    # Tentativa de reconexão se db for None mas mongo_url existir
    if db is None and mongo_url:
        try:
            print("Attempting to connect to MongoDB in lifespan...")
            client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
            await client.admin.command('ping')
            db = client.get_database(db_name)
            DEMO_MODE = False
            print("MongoDB connection successful in lifespan")
        except Exception as e:
            print(f"MongoDB connection failed in lifespan: {e}. Switching to DEMO MODE.")
            db = None
            DEMO_MODE = True
    elif db is not None:
        # Se já estava "conectado" globalmente, valida a conexão
        try:
            await client.admin.command('ping')
        except Exception:
            print("MongoDB connection check failed. Retrying...")
            try:
                # Retry once
                client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
                await client.admin.command('ping')
                db = client.get_database(db_name)
                print("MongoDB re-connected successfully.")
            except Exception as e:
                print(f"MongoDB connection failed finally: {e}. Switching to DEMO MODE.")
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
            # Ensure admin users exist (support both cliniflow.com and clinicflow.com)
            admin_emails = [
                (os.environ.get("ADMIN_EMAIL", "admin@cliniflow.com"), os.environ.get("ADMIN_PASSWORD", "admin@123")),
                ("admin@clinicflow.com", "admin@123")
            ]

            for adm_email, adm_pass in admin_emails:
                user = await db.users.find_one({"email": adm_email})
                if not user:
                    await db.users.insert_one({
                        "id": str(uuid.uuid4()),
                        "name": "Admin",
                        "email": adm_email,
                        "password_hash": hash_password(adm_pass),
                        "role": {"is_admin": True, "is_attendant": False},
                        "user_type": "admin",
                        "created_at": datetime.now(timezone.utc)
                    })
                    print(f"Admin user {adm_email} created.")
                else:
                    # Enforce admin password to ensure access (Self-healing)
                    await db.users.update_one(
                        {"email": adm_email},
                        {"$set": {"password_hash": hash_password(adm_pass), "role.is_admin": True}}
                    )
                    print(f"Admin user {adm_email} password/role updated.")

            # Ensure superadmin users exist
            super_emails = [
                ("superadmin@cliniflow.com", "qwe123"),
                ("superadmin@clinicflow.com", "qwe123")
            ]
            
            for sup_email, sup_pass in super_emails:
                super_user = await db.users.find_one({"email": sup_email})
                if not super_user:
                    await db.users.insert_one({
                        "id": str(uuid.uuid4()),
                        "name": "Super Admin",
                        "email": sup_email,
                        "password_hash": hash_password(sup_pass),
                        "role": {"is_admin": True, "is_attendant": False},
                        "user_type": "superuser",
                        "created_at": datetime.now(timezone.utc)
                    })
                    print(f"Superadmin user {sup_email} created.")
                else:
                    # Enforce superadmin password (Self-healing)
                    await db.users.update_one(
                        {"email": sup_email},
                        {"$set": {"password_hash": hash_password(sup_pass), "user_type": "superuser"}}
                    )
                    print(f"Superadmin user {sup_email} password/role updated.")

            await db.patients.create_index("id")
            await db.patients.create_index("phone")
            await db.patients.create_index("email")
            await db.patients.create_index("name")
            await db.patients.create_index([("created_at", -1)])
            await db.patients.create_index("attachments.id")
            await db.patients.create_index("treatments.id")
            await db.transactions.create_index("patient_id")
            await db.transactions.create_index("status")
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
            await db.leads.create_index("id")
            await db.leads.create_index("status")
            await db.leads.create_index("phone")
            await db.leads.create_index("email")
            await db.leads.create_index([("created_at", -1)])
            await db.conversations.create_index([("last_message_at", -1)])
            await db.conversations.create_index("lead_id")
            await db.messages.create_index([("conversation_id", 1), ("created_at", 1)])
        except Exception:
            pass
        except Exception:
            pass
    else:
        # DEMO MODE: Create default admin
        admin_email = os.environ.get("ADMIN_EMAIL", "admin@cliniflow.com")
        admin_password = os.environ.get("ADMIN_PASSWORD", "admin@123")
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
        
        # DEMO MODE: Create default superadmin
        super_email = "superadmin@cliniflow.com"
        super_password = "qwe123"
        if not any(u['email'] == super_email for u in mem['users']):
            mem['users'].append({
                "id": str(uuid.uuid4()),
                "name": "Super Admin",
                "email": super_email,
                "password_hash": hash_password(super_password),
                "role": {"is_admin": True, "is_attendant": False},
                "user_type": "superuser",
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            print(f"DEMO MODE: Superadmin user {super_email} created.")
    yield
    if scheduler:
        try:
            scheduler.shutdown(wait=False)
        except Exception:
            pass

app = FastAPI(lifespan=lifespan)
app.mount("/media", StaticFiles(directory="media"), name="media")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

sio = SocketManager(app=app, mount_location='/socket.io', cors_allowed_origins="*")
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
    service_id: Optional[str] = None
    selected_teeth: Optional[List[str]] = None
    face_regions: Optional[List[str]] = None

class TreatmentUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[str] = None
    description: Optional[str] = None
    prescribed_medications: Optional[str] = None
    frequency: Optional[str] = None
    estimated_duration: Optional[str] = None
    professional_id: Optional[str] = None
    status: Optional[str] = None
    service_id: Optional[str] = None
    selected_teeth: Optional[List[str]] = None
    face_regions: Optional[List[str]] = None

class Expense(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    description: str
    amount: float
    date: str  # YYYY-MM-DD
    category: str  # colaboradores, fornecedores, suprimentos, outros
    recipient: Optional[str] = None
    notes: Optional[str] = None
    attachments: List[Attachment] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ExpenseCreate(BaseModel):
    description: str
    amount: float
    date: str
    category: str
    recipient: Optional[str] = None
    notes: Optional[str] = None


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

class BudgetTreatment(BaseModel):
    name: str
    value: float = 0.0
    teeth: List[str] = []
    face_regions: List[str] = []

class Budget(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    description: str
    date: str
    treatments: List[Union[str, BudgetTreatment]] = []
    total_value: float = 0.0
    professional_id: Optional[str] = None
    observations: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BudgetCreate(BaseModel):
    patient_id: str
    description: str
    date: str
    treatments: List[Union[str, BudgetTreatment]] = []
    total_value: float = 0.0
    professional_id: Optional[str] = None
    observations: Optional[str] = None

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
    sender_id: Optional[str] = None
    sender_name: Optional[str] = None
    content: Union[str, Dict[str, Any], Any]
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
        {"$match": {"status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    
    result = await db.transactions.aggregate(pipeline).to_list(1)
    
    total_revenue = result[0]['total'] if result else 0
    
    return {"total_revenue": total_revenue}


@api_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    """Estatísticas leves para o dashboard. Todas as consultas em paralelo."""
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    today = datetime.now(timezone.utc).date().isoformat()
    query_prof = {}
    if current_user.get("user_type") in ["profissional", "profissional_admin"] and current_user.get("professional_id"):
        query_prof["professional_id"] = current_user.get("professional_id")

    async def _rev_agg(status: str):
        r = await db.transactions.aggregate([{"$match": {"status": status}}, {"$group": {"_id": None, "total": {"$sum": "$amount"}}}]).to_list(1)
        return r[0]["total"] if r else 0

    async def _expenses_total():
        if current_user.get("user_type") != "superuser":
            return 0
        r = await db.expenses.aggregate([{"$group": {"_id": None, "total": {"$sum": "$amount"}}}]).to_list(1)
        return r[0]["total"] if r else 0

    results = await asyncio.gather(
        db.patients.count_documents({}),
        db.leads.count_documents({}),
        db.appointments.count_documents(query_prof),
        db.appointments.count_documents({**query_prof, "appointment_date": today}),
        db.leads.count_documents({"status": "quente"}),
        _rev_agg("paid"),
        _rev_agg("pending"),
        _expenses_total(),
    )
    patients_count, leads_count, appointments_total, appointments_today, leads_hot, revenue_paid, revenue_pending, expenses_total = results

    return {
        "patientsTotal": patients_count,
        "leadsTotal": leads_count,
        "appointmentsTotal": appointments_total,
        "appointmentsToday": appointments_today,
        "leadsHot": leads_hot,
        "revenuePaid": revenue_paid,
        "revenuePending": revenue_pending,
        "expensesTotal": expenses_total,
        "netRevenue": revenue_paid - expenses_total,
    }


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
    try:
        # bcrypt limit 72 bytes
        if len(password.encode('utf-8')) > 72:
            password = password[:72]
        return pwd_context.hash(password)
    except Exception as e:
        print(f"Passlib hash failed (using fallback): {e}")
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        if not hashed_password:
            return False
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        # Fallback for bcrypt 4.0+ incompatibility with passlib 1.7.4
        if hashed_password and (hashed_password.startswith('$2b$') or hashed_password.startswith('$2a$')):
             try:
                 return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
             except Exception:
                 return False
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
    password: Optional[str] = None
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
    if not (current_user.get("role", {}).get("is_admin", False) or current_user.get("user_type") == "superuser"):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = {}
    if data.name:
        update_data["name"] = data.name
    if data.email:
        update_data["email"] = data.email
    if data.password:
        update_data["password_hash"] = hash_password(data.password)
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
    if not (current_user.get("role", {}).get("is_admin", False) or current_user.get("user_type") == "superuser"):
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
        if isinstance(p.get("created_at"), str):
            p["created_at"] = datetime.fromisoformat(p["created_at"])
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
    if not (is_admin or user_type == "consultor" or user_type == "superuser"):
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
    if not (is_admin or user_type == "consultor" or user_type == "superuser"):
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
        if isinstance(s.get("created_at"), str):
            s["created_at"] = datetime.fromisoformat(s["created_at"])
    return services

@api_router.put("/services/{service_id}")
async def update_service(service_id: str, data: ServiceCreate, current_user: dict = Depends(get_current_user)):
    user_type = current_user.get("user_type", "consultor")
    is_admin = current_user.get("role", {}).get("is_admin", False)
    if not (is_admin or user_type == "consultor" or user_type == "superuser"):
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
    if not (is_admin or user_type == "consultor" or user_type == "superuser"):
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
    if not (is_admin or user_type == "consultor" or user_type == "superuser"):
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
    if not (is_admin or user_type == "consultor" or user_type == "superuser"):
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
    page_size: int = 100,
    sort_by: Optional[str] = None,
    order: Optional[str] = "desc",
    has_debt: Optional[bool] = None,
    need_debt: Optional[bool] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    page_size = max(1, min(page_size, 500))
    skip = max(0, (page - 1) * page_size)
    sort_field = sort_by if sort_by in {"name", "created_at"} else "created_at"
    sort_order = 1 if order == "asc" else -1
    use_aggregation = has_debt is True or need_debt is True

    search_query = {}
    if search and search.strip():
        term = search.strip()
        re_option = "i"
        pattern = re.escape(term)
        phone_digits = "".join(c for c in term if c.isdigit())
        phone_pattern = re.escape(phone_digits) if phone_digits else pattern
        search_query = {
            "$or": [
                {"name": {"$regex": pattern, "$options": re_option}},
                {"email": {"$regex": pattern, "$options": re_option}},
                {"phone": {"$regex": phone_pattern, "$options": re_option}},
            ]
        }

    if not use_aggregation:
        cursor = db.patients.find(
            search_query,
            {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1, "birthdate": 1, "address": 1, "cpf": 1, "created_at": 1},
        ).sort(sort_field, sort_order).skip(skip).limit(page_size)
        patients = await cursor.to_list(page_size)
        for p in patients:
            p["total_debt"] = 0
    else:
        pipeline = []
        if search_query:
            pipeline.append({"$match": search_query})
        pipeline += [
            {"$lookup": {"from": "appointments", "let": {"pid": "$id"}, "pipeline": [
                {"$match": {"$expr": {"$and": [{"$eq": ["$patient_id", "$$pid"]}, {"$eq": ["$paid", False]}]}}},
                {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$amount", 0]}}}}
            ], "as": "unpaid_appts"}},
            {"$lookup": {"from": "transactions", "let": {"pid": "$id"}, "pipeline": [
                {"$match": {"$expr": {"$eq": ["$patient_id", "$$pid"]}, "status": "pending"}},
                {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$amount", 0]}}}}
            ], "as": "pending_trans"}},
            {"$addFields": {"total_debt": {"$add": [{"$sum": "$unpaid_appts.total"}, {"$sum": "$pending_trans.total"}]}}},
        ]
        if has_debt is True:
            pipeline.append({"$match": {"total_debt": {"$gt": 0}}})
        pipeline += [
            {"$project": {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1, "birthdate": 1, "address": 1, "cpf": 1, "created_at": 1, "total_debt": 1}},
            {"$sort": {sort_field: sort_order}},
            {"$skip": skip},
            {"$limit": page_size},
        ]
        patients = await db.patients.aggregate(pipeline).to_list(page_size)

    for p in patients:
        try:
            if isinstance(p.get("created_at"), datetime):
                p["created_at"] = p["created_at"].isoformat()
        except Exception as e:
            logging.error("Error converting created_at for patient %s: %s", p.get("id"), e)
            p["created_at"] = None
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
    if not (current_user.get("role", {}).get("is_admin", False) or current_user.get("user_type") in ["superuser", "consultor"]):
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
    limit: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if patient_id:
        query["patient_id"] = patient_id

    # Filter for professional users to only see their own appointments
    if current_user.get("user_type") in ["profissional", "profissional_admin"]:
        if current_user.get("professional_id"):
            query["professional_id"] = current_user.get("professional_id")
        else:
            return []

    sort_order = 1 if order == "asc" else -1
    cap = max(1, min(limit or 1000, 2000))

    cursor = db.appointments.find(query, {"_id": 0})

    if sort_by:
        cursor = cursor.sort(sort_by, sort_order)

    appointments = await cursor.to_list(cap)
    
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
    effective_limit = max(1, min(limit or 200, 1000))
    cursor = db.transactions.find(query, {"_id": 0}).sort(sort_field, sort_order).limit(effective_limit)
    transactions = await cursor.to_list(length=effective_limit)
    for t in transactions:
        if isinstance(t.get("created_at"), str):
            t["created_at"] = datetime.fromisoformat(t["created_at"])
    return transactions

# Budget Routes
@api_router.post("/budgets", response_model=Budget)
async def create_budget(data: BudgetCreate, current_user: dict = Depends(get_current_user)):
    budget = Budget(**data.model_dump())
    doc = budget.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.budgets.insert_one(doc)
    return budget

@api_router.put("/budgets/{budget_id}")
async def update_budget(budget_id: str, data: BudgetCreate, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    update_data = data.model_dump(exclude_unset=True)
    
    result = await db.budgets.update_one({"id": budget_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
        
    return {"message": "Budget updated successfully"}

@api_router.delete("/budgets/{budget_id}")
async def delete_budget(budget_id: str, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
        
    result = await db.budgets.delete_one({"id": budget_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
        
    return {"message": "Budget deleted successfully"}

@api_router.get("/patients/{patient_id}/budgets", response_model=List[dict])
async def get_patient_budgets(patient_id: str, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    budgets = await db.budgets.find({"patient_id": patient_id}, {"_id": 0}).sort("date", -1).to_list(1000)
    for b in budgets:
        if isinstance(b.get('created_at'), str):
            b['created_at'] = datetime.fromisoformat(b['created_at'])
    return budgets

@api_router.get("/budgets/{budget_id}/pdf")
async def generate_budget_pdf(budget_id: str, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    budget = await db.budgets.find_one({"id": budget_id}, {"_id": 0})
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
        
    patient = await db.patients.find_one({"id": budget['patient_id']}, {"_id": 0})
    professional_name = "Não informado"
    if budget.get('professional_id'):
        prof = await db.professionals.find_one({"id": budget['professional_id']}, {"_id": 0})
        if prof:
            professional_name = prof.get('name', 'Não informado')

    # Fetch clinic settings for Logo and Footer
    settings = await db.settings.find_one({"type": "clinic"}, {"_id": 0})
    if not settings:
        settings = {}

    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    # --- Header with Logo ---
    top_offset = 50
    logo_data = settings.get("logo")
    
    if logo_data and isinstance(logo_data, str):
        try:
            b64 = logo_data.split(",", 1)[1] if "," in logo_data else logo_data
            img_bytes = base64.b64decode(b64)
            img = ImageReader(io.BytesIO(img_bytes))
            iw, ih = img.getSize()
            target_w = 150 # Max width for logo
            ratio = target_w / float(iw)
            target_h = ih * ratio
            
            # Limit height if it's too tall
            if target_h > 100:
                target_h = 100
                ratio = target_h / float(ih)
                target_w = iw * ratio

            x = (width - target_w) / 2
            y_logo = height - 50 - target_h
            p.drawImage(img, x, y_logo, width=target_w, height=target_h, preserveAspectRatio=True, mask='auto')
            top_offset = 50 + target_h + 30
        except Exception as e:
            print(f"Error drawing logo: {e}")
            pass

    # Title
    p.setFont("Helvetica-Bold", 20)
    p.drawCentredString(width / 2, height - top_offset, "Orçamento")
    
    p.setFont("Helvetica", 12)
    p.drawCentredString(width / 2, height - top_offset - 25, f"Data: {format_date_br(budget.get('date'))}")
    
    current_y = height - top_offset - 70

    # --- Patient Info ---
    p.setFont("Helvetica-Bold", 14)
    p.drawString(50, current_y, "Dados do Paciente")
    current_y -= 25
    
    p.setFont("Helvetica", 12)
    p.drawString(50, current_y, f"Nome: {patient.get('name') if patient else 'N/A'}")
    current_y -= 20
    p.drawString(50, current_y, f"CPF: {patient.get('cpf') if patient else 'N/A'}")
    current_y -= 40
    
    # --- Budget Info ---
    p.setFont("Helvetica-Bold", 14)
    p.drawString(50, current_y, "Detalhes do Orçamento")
    current_y -= 25
    
    p.setFont("Helvetica", 12)
    p.drawString(50, current_y, f"Descrição: {budget.get('description')}")
    current_y -= 20
    p.drawString(50, current_y, f"Profissional Responsável: {professional_name}")
    current_y -= 40
    
    # --- Treatments ---
    p.setFont("Helvetica-Bold", 12)
    p.drawString(50, current_y, "Tratamentos/Serviços:")
    current_y -= 25
    
    p.setFont("Helvetica", 12)
    treatments = budget.get('treatments', [])
    if treatments:
        for treatment in treatments:
            if isinstance(treatment, dict):
                name = treatment.get('name', 'Tratamento')
                value = treatment.get('value', 0)
                display_text = f"• {name} - {format_currency_br(value)}"
            else:
                display_text = f"• {treatment}"
            
            p.drawString(70, current_y, display_text)
            current_y -= 20
    else:
        p.drawString(70, current_y, "Nenhum tratamento listado.")
        current_y -= 20
        
    # --- Total Value ---
    current_y -= 20
    p.setFont("Helvetica-Bold", 14)
    p.drawString(50, current_y, f"Valor Total: {format_currency_br(budget.get('total_value', 0))}")
    
    # --- Observations ---
    if budget.get('observations'):
        current_y -= 40
        p.setFont("Helvetica-Bold", 12)
        p.drawString(50, current_y, "Observações:")
        current_y -= 25
        p.setFont("Helvetica", 12)
        
        obs_text = budget.get('observations')
        # Simple word wrap logic could be here, but for now we split by lines
        lines = obs_text.split('\n')
        for line in lines:
            # Check for very long lines and truncate or wrap loosely
            if len(line) > 85: 
                 line = line[:85] + "..."
            p.drawString(50, current_y, line)
            current_y -= 20

    # --- Footer ---
    footer_y = 50
    p.setLineWidth(0.5)
    p.setStrokeColorRGB(0.7, 0.7, 0.7)
    p.line(50, footer_y + 20, width - 50, footer_y + 20)
    
    p.setFont("Helvetica", 9)
    p.setFillColorRGB(0.3, 0.3, 0.3)
    
    footer_lines = []
    # Line 1: Clinic Name + Address
    line1_parts = []
    if settings.get("clinic_name"): line1_parts.append(settings.get("clinic_name"))
    if settings.get("address"): line1_parts.append(settings.get("address"))
    if line1_parts: footer_lines.append(" | ".join(line1_parts))
    
    # Line 2: Contacts
    line2_parts = []
    if settings.get("phone"): line2_parts.append(f"Tel: {settings.get('phone')}")
    if settings.get("email"): line2_parts.append(settings.get("email"))
    if settings.get("website"): line2_parts.append(settings.get("website"))
    if line2_parts: footer_lines.append(" | ".join(line2_parts))
    
    current_footer_y = footer_y
    for line in reversed(footer_lines):
        p.drawCentredString(width / 2, current_footer_y, line)
        current_footer_y += 12

    p.showPage()
    p.save()
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type='application/pdf',
        headers={"Content-Disposition": f"attachment; filename=orcamento_{budget_id}.pdf"}
    )

def check_superuser(current_user: dict):
    if current_user.get("user_type") != "superuser":
        raise HTTPException(status_code=403, detail="Acesso restrito a Super Usuários")

@api_router.post("/expenses", response_model=Expense)
async def create_expense(
    description: str = Form(...),
    amount: float = Form(...),
    date: str = Form(...),
    category: str = Form(...),
    recipient: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    current_user: dict = Depends(get_current_user)
):
    check_superuser(current_user)
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    expense = Expense(
        description=description,
        amount=amount,
        date=date,
        category=category,
        recipient=recipient,
        notes=notes
    )

    if file:
        fs = AsyncIOMotorGridFSBucket(db)
        file_data = await file.read()
        gridfs_id = await fs.upload_from_stream(file.filename, file_data, metadata={"content_type": file.content_type})
        
        attachment = Attachment(
            filename=file.filename,
            file_type=file.content_type,
            size_bytes=len(file_data),
            gridfs_id=str(gridfs_id)
        )
        expense.attachments.append(attachment)
    
    doc = expense.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    # Ensure attachments are serialized correctly
    serialized_attachments = []
    for att in expense.attachments:
        att_dict = att.model_dump()
        att_dict['upload_date'] = att_dict['upload_date'].isoformat()
        serialized_attachments.append(att_dict)
    doc['attachments'] = serialized_attachments

    await db.expenses.insert_one(doc)
    return expense

@api_router.get("/expenses", response_model=List[dict])
async def get_expenses(current_user: dict = Depends(get_current_user)):
    check_superuser(current_user)
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    expenses = await db.expenses.find({}, {"_id": 0}).sort("date", -1).to_list(1000)
    for e in expenses:
        if isinstance(e.get('created_at'), str):
            e['created_at'] = datetime.fromisoformat(e['created_at'])
    return expenses

@api_router.put("/expenses/{expense_id}")
async def update_expense(expense_id: str, data: ExpenseCreate, current_user: dict = Depends(get_current_user)):
    check_superuser(current_user)
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    update_data = data.model_dump(exclude_unset=True)
    result = await db.expenses.update_one({"id": expense_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    return {"message": "Expense updated successfully"}

@api_router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, current_user: dict = Depends(get_current_user)):
    check_superuser(current_user)
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    result = await db.expenses.delete_one({"id": expense_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    return {"message": "Expense deleted successfully"}

@api_router.post("/expenses/{expense_id}/attachments")
async def upload_expense_attachment(expense_id: str, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    check_superuser(current_user)
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    expense = await db.expenses.find_one({"id": expense_id})
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    fs = AsyncIOMotorGridFSBucket(db)
    file_data = await file.read()
    gridfs_id = await fs.upload_from_stream(file.filename, file_data, metadata={"content_type": file.content_type})
    
    attachment = Attachment(
        filename=file.filename,
        file_type=file.content_type,
        size_bytes=len(file_data),
        gridfs_id=str(gridfs_id)
    )
    
    att_doc = attachment.model_dump()
    att_doc['upload_date'] = att_doc['upload_date'].isoformat()
    
    await db.expenses.update_one(
        {"id": expense_id},
        {"$push": {"attachments": att_doc}}
    )
    
    return attachment

@api_router.delete("/expenses/{expense_id}/attachments/{attachment_id}")
async def delete_expense_attachment(expense_id: str, attachment_id: str, current_user: dict = Depends(get_current_user)):
    check_superuser(current_user)
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    expense = await db.expenses.find_one({"id": expense_id})
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    attachments = expense.get("attachments", [])
    target_att = next((a for a in attachments if a.get("id") == attachment_id), None)
    
    if not target_att:
        raise HTTPException(status_code=404, detail="Attachment not found")
        
    if target_att.get("gridfs_id"):
        try:
            fs = AsyncIOMotorGridFSBucket(db)
            await fs.delete(ObjectId(target_att["gridfs_id"]))
        except Exception:
            pass

    await db.expenses.update_one(
        {"id": expense_id},
        {"$pull": {"attachments": {"id": attachment_id}}}
    )
    
    return {"message": "Attachment deleted"}

@api_router.get("/expenses/attachment/{attachment_id}")
async def get_expense_attachment(attachment_id: str, current_user: dict = Depends(get_current_user)):
    check_superuser(current_user)
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    expense = await db.expenses.find_one({"attachments.id": attachment_id})
    if not expense:
        raise HTTPException(status_code=404, detail="Attachment not found")

    attachments = expense.get("attachments", [])
    target_att = next((a for a in attachments if a.get("id") == attachment_id), None)
    
    if not target_att:
        raise HTTPException(status_code=404, detail="Attachment not found")

    if not target_att.get("gridfs_id"):
        raise HTTPException(status_code=404, detail="File content not found")

    fs = AsyncIOMotorGridFSBucket(db)
    try:
        grid_out = await fs.open_download_stream(ObjectId(target_att["gridfs_id"]))
        return StreamingResponse(
            grid_out,
            media_type=target_att.get("file_type", "application/octet-stream"),
            headers={"Content-Disposition": f"attachment; filename={target_att.get('filename', 'download')}"}
        )
    except Exception:
        raise HTTPException(status_code=404, detail="File not found in GridFS")

def format_date_br(date_str):
    if not date_str: return ""
    try:
        dt = datetime.fromisoformat(date_str) if 'T' in date_str else datetime.strptime(date_str, "%Y-%m-%d")
        return dt.strftime("%d/%m/%Y")
    except:
        return date_str

def format_currency_br(value):
    try:
        val = float(value)
        return f"R$ {val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except:
        return f"R$ {value}"

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

@api_router.get("/leads")
async def get_leads(
    status: Optional[str] = None,
    source: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    current_user: dict = Depends(get_current_user),
):
    """Lista leads com paginação. Retorna { items, total } para carregamento rápido."""
    query = {}
    if status:
        query["status"] = status
    if source:
        query["source"] = source
    if search and search.strip():
        term = re.escape(search.strip())
        re_opt = "i"
        query["$or"] = [
            {"name": {"$regex": term, "$options": re_opt}},
            {"email": {"$regex": term, "$options": re_opt}},
            {"phone": {"$regex": term, "$options": re_opt}},
            {"notes": {"$regex": term, "$options": re_opt}},
        ]
    total = await db.leads.count_documents(query)
    page_size = max(1, min(page_size, 500))
    skip = max(0, (page - 1) * page_size)
    cursor = db.leads.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(page_size)
    items = await cursor.to_list(length=page_size)
    for l in items:
        if isinstance(l.get("created_at"), str):
            l["created_at"] = datetime.fromisoformat(l["created_at"])
    return {"items": items, "total": total}

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
    # Aggregation: conversations + lead name/phone/email in one query (faster, avoids N+1)
    pipeline = [
        {"$sort": {"last_message_at": -1}},
        {"$limit": 500},
        {"$lookup": {
            "from": "leads",
            "localField": "lead_id",
            "foreignField": "id",
            "as": "_lead",
            "pipeline": [{"$project": {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1}}]
        }},
        {"$addFields": {
            "lead_name": {"$arrayElemAt": ["$_lead.name", 0]},
            "lead_phone": {"$arrayElemAt": ["$_lead.phone", 0]},
            "lead_email": {"$arrayElemAt": ["$_lead.email", 0]}
        }},
        {"$project": {"_id": 0, "_lead": 0}}
    ]
    cursor = db.conversations.aggregate(pipeline)
    conversations = await cursor.to_list(length=500)
    for c in conversations:
        try:
            if isinstance(c.get('created_at'), str):
                c['created_at'] = datetime.fromisoformat(c['created_at'])
            if isinstance(c.get('last_message_at'), str):
                c['last_message_at'] = datetime.fromisoformat(c['last_message_at'])
        except ValueError:
            pass
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

async def send_whatsapp_media(to_phone: str, media_type: str, media_data: str, caption: str = None, is_url: bool = False):
    """
    Sends a WhatsApp media message.
    media_data: Base64 string or URL.
    media_type: image, audio, document.
    """
    try:
        settings = await db.settings.find_one({"type": "omnichannel"}, {"_id": 0})
        whatsapp = settings.get("whatsapp") if settings else None
        
        if not whatsapp or not whatsapp.get('enabled'):
            return False

        # Clean phone number
        clean_phone = "".join(filter(str.isdigit, to_phone))
        if not clean_phone.startswith("55") and len(clean_phone) <= 11:
             clean_phone = "55" + clean_phone

        provider = whatsapp.get('provider', 'official')
        
        async with httpx.AsyncClient() as client:
            if provider == 'uazapi':
                base_url = whatsapp.get('uazapi_url', "").rstrip('/')
                token = whatsapp.get('uazapi_token')
                instance = whatsapp.get('uazapi_instance', 'default')
                
                if not base_url or not token:
                    return False
                
                if "fortalabs.uazapi.com" in base_url:
                    # FortaLabs Custom: /send/media
                    url = f"{base_url}/send/media?token={token}"
                    
                    payload = {
                        "number": clean_phone,
                        "type": media_type, # "image", "audio", "document", "video"
                        "file": media_data # URL or Base64 (data URI)
                    }
                    
                    if caption: 
                        payload["caption"] = caption
                        # Also support "text" as caption just in case
                        payload["text"] = caption
                    
                    # Try sending
                    response = await client.post(url, json=payload, timeout=60)
                    if response.status_code not in [200, 201]:
                        logging.error(f"FortaLabs Media Error: {response.text}")
                        return False
                    return True

                else:
                    # Standard Evolution
                    url = f"{base_url}/message/sendMedia/{instance}"
                    headers = {"apikey": token, "Content-Type": "application/json"}
                    payload = {
                        "number": clean_phone,
                        "options": {"delay": 1200},
                        "mediaMessage": {
                            "mediatype": media_type,
                            "caption": caption or "",
                            "media": media_data
                        }
                    }
                    response = await client.post(url, json=payload, headers=headers, timeout=30)
                    return response.status_code in [200, 201]

    except Exception as e:
        logging.error(f"Error sending media: {e}")
        return False
    return False

@api_router.post("/conversations/{conversation_id}/media", response_model=Message)
async def create_media_message(
    conversation_id: str,
    file: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user)
):
    conversation = await db.conversations.find_one({"id": conversation_id}, {"_id": 0})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # 1. Save file locally
    media_dir = ROOT_DIR / "media"
    media_dir.mkdir(exist_ok=True)
    
    # Simple extension extraction
    if '.' in file.filename:
        ext = file.filename.split('.')[-1]
    else:
        ext = "bin"
        
    filename = f"{uuid.uuid4()}.{ext}"
    file_path = media_dir / filename
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # 2. Determine type
    content_type = file.content_type
    media_type = "document"
    if "image" in content_type: media_type = "image"
    elif "audio" in content_type: media_type = "audio"
    
    # 3. Prepare content for DB
    file_url = f"/media/{filename}" # Relative to frontend proxy or base URL
    
    # Read file for Base64 (needed for WhatsApp API usually)
    with open(file_path, "rb") as f:
        file_content = f.read()
        base64_data = base64.b64encode(file_content).decode('utf-8')
        # Add prefix
        base64_full = f"data:{content_type};base64,{base64_data}"

    # 4. Create Message in DB
    # Ensure Message model fields match
    message = Message(
        conversation_id=conversation_id,
        sender_type="consultant",
        sender_id=current_user.get("id"),
        sender_name=current_user.get("name"),
        content={
            "mimetype": content_type,
            "url": file_url, 
            "fileName": file.filename,
            "caption": caption
        }
    )
    doc = message.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.messages.insert_one(doc)
    
    # Update conversation
    await db.conversations.update_one(
        {"id": conversation_id},
        {"$set": {"last_message_at": datetime.now(timezone.utc).isoformat()}}
    )

    # 5. Send to WhatsApp
    lead = await db.leads.find_one({"id": conversation["lead_id"]}, {"_id": 0})
    if lead and lead.get("phone"):
        asyncio.create_task(send_whatsapp_media(
            lead["phone"], 
            media_type, 
            base64_full, 
            caption, 
            is_url=False
        ))
    
    return message

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

@api_router.post("/conversations/{conversation_id}/media", response_model=Message)
async def create_media_message(
    conversation_id: str,
    file: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user)
):
    conversation = await db.conversations.find_one({"id": conversation_id}, {"_id": 0})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # 1. Save file locally
    media_dir = ROOT_DIR / "media"
    media_dir.mkdir(exist_ok=True)
    
    ext = file.filename.split('.')[-1]
    filename = f"{uuid.uuid4()}.{ext}"
    file_path = media_dir / filename
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # 2. Determine type
    content_type = file.content_type
    media_type = "document"
    if "image" in content_type: media_type = "image"
    elif "audio" in content_type: media_type = "audio"
    elif "video" in content_type: media_type = "video"
    
    # 3. Prepare content for DB
    file_url = f"/media/{filename}" # Relative to frontend proxy or base URL
    
    # Read file for Base64 (needed for WhatsApp API usually)
    with open(file_path, "rb") as f:
        file_content = f.read()
        base64_data = base64.b64encode(file_content).decode('utf-8')
        # Add prefix
        base64_full = f"data:{content_type};base64,{base64_data}"

    # 4. Create Message in DB
    message = Message(
        conversation_id=conversation_id,
        sender_type="consultant",
        sender_id=current_user.get("id"),
        sender_name=current_user.get("name"),
        content={
            "mimetype": content_type,
            "url": file_url, 
            "fileName": file.filename,
            "caption": caption
        }
    )
    doc = message.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.messages.insert_one(doc)
    
    # Update conversation
    await db.conversations.update_one(
        {"id": conversation_id},
        {"$set": {"last_message_at": datetime.now(timezone.utc).isoformat()}}
    )

    # 5. Send to WhatsApp
    lead = await db.leads.find_one({"id": conversation["lead_id"]}, {"_id": 0})
    if lead and lead.get("phone"):
        asyncio.create_task(send_whatsapp_media(
            lead["phone"], 
            media_type, 
            base64_full, 
            caption, 
            is_url=False
        ))
    
    return message

@api_router.get("/conversations/{conversation_id}", response_model=dict)
async def get_conversation(conversation_id: str, current_user: dict = Depends(get_current_user)):
    """
    Get a specific conversation by ID.
    """
    conversation = await db.conversations.find_one({"id": conversation_id}, {"_id": 0})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    if isinstance(conversation.get('created_at'), str):
        conversation['created_at'] = datetime.fromisoformat(conversation['created_at'])
    if isinstance(conversation.get('last_message_at'), str):
        conversation['last_message_at'] = datetime.fromisoformat(conversation['last_message_at'])
        
    return conversation

def _phone_digits(s):
    return re.sub(r"\D", "", str(s or ""))


@api_router.get("/conversations/{conversation_id}/messages", response_model=List[dict])
async def get_conversation_messages(conversation_id: str, current_user: dict = Depends(get_current_user)):
    """
    Returns all messages (lead + consultant/secretary) for this conversation.
    If there are other conversations for the same lead phone (duplicates), their messages
    are included so the user sees the full thread including all secretary messages.
    """
    conversation = await db.conversations.find_one({"id": conversation_id}, {"_id": 0})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conv_ids = [conversation_id]
    lead = await db.leads.find_one({"id": conversation.get("lead_id")}, {"_id": 0, "id": 1, "phone": 1})
    if lead and lead.get("phone"):
        phone_digits = _phone_digits(lead["phone"])
        if phone_digits:
            lead_ids_same_phone = [lead["id"]]
            async for other in db.leads.find({}, {"_id": 0, "id": 1, "phone": 1}).limit(3000):
                if other["id"] != lead["id"] and _phone_digits(other.get("phone")) == phone_digits:
                    lead_ids_same_phone.append(other["id"])
            if len(lead_ids_same_phone) > 1:
                extra = await db.conversations.find(
                    {"lead_id": {"$in": lead_ids_same_phone}, "id": {"$ne": conversation_id}},
                    {"_id": 0, "id": 1}
                ).to_list(50)
                conv_ids.extend(c["id"] for c in extra)

    messages = await db.messages.find(
        {"conversation_id": {"$in": conv_ids}}, {"_id": 0}
    ).sort("created_at", 1).to_list(2000)
    for m in messages:
        if isinstance(m.get("created_at"), str):
            m["created_at"] = datetime.fromisoformat(m["created_at"])
    return messages

@api_router.put("/conversations/{conversation_id}/assign")
async def assign_conversation(conversation_id: str, current_user: dict = Depends(get_current_user)):
    """
    Assign conversation to current user.
    """
    conversation = await db.conversations.find_one({"id": conversation_id}, {"_id": 0})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    await db.conversations.update_one(
        {"id": conversation_id},
        {"$set": {
            "assigned_to": current_user.get("id"),
            "assigned_to_name": current_user.get("name")
        }}
    )
    return {"message": "Conversation assigned"}

@api_router.get("/messages", response_model=List[dict])
async def get_messages(conversation_id: str, current_user: dict = Depends(get_current_user)):
    messages = await db.messages.find(
        {"conversation_id": conversation_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    for m in messages:
        if isinstance(m.get("created_at"), str):
            m["created_at"] = datetime.fromisoformat(m["created_at"])
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
    Diagnostic tool for UazApi connection and Webhook configuration.
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
        instance = whatsapp.get("uazapi_instance", "default")
        
        if not uazapi_url or not uazapi_token:
            return {"status": "error", "message": "Missing URL or Token"}
            
        # Ensure base URL format
        base_url = uazapi_url.rstrip('/')
        
        # Target Webhook URL (Your Backend)
        my_url = "https://clinicflow-lucj.onrender.com"
        webhook_target = f"{my_url}/api/webhook/uazapi"
        
        results = []
        
        async with httpx.AsyncClient() as client:
            headers = {
                "apikey": uazapi_token,
                "Content-Type": "application/json"
            }
            
            # 1. Connectivity Check (GET Instances)
            # Tries to see if we can reach the API at all
            try:
                url_check = f"{base_url}/instance/fetchInstances"
                resp = await client.get(url_check, headers=headers, timeout=5)
                results.append({
                    "step": "Connectivity Check",
                    "url": url_check,
                    "status": resp.status_code,
                    "success": resp.status_code == 200
                })
            except Exception as e:
                results.append({"step": "Connectivity Check", "error": str(e)})

            # 2. Check Current Webhook (GET /webhook/find)
            try:
                url_find = f"{base_url}/webhook/find/{instance}"
                resp = await client.get(url_find, headers=headers, timeout=5)
                results.append({
                    "step": "Get Current Webhook",
                    "url": url_find,
                    "status": resp.status_code,
                    "body": resp.text[:200]
                })
            except Exception as e:
                results.append({"step": "Get Current Webhook", "error": str(e)})

            # 2.1 Check Current Webhook (Attempt C GET)
            if "fortalabs" in base_url:
                try:
                    url_find_c = f"{base_url}/webhook?token={uazapi_token}"
                    resp = await client.get(url_find_c, headers=headers, timeout=5)
                    results.append({
                        "step": "Get Current Webhook (Attempt C)",
                        "url": url_find_c,
                        "status": resp.status_code,
                        "body": resp.text[:500]
                    })
                except Exception as e:
                    results.append({"step": "Get Current Webhook (Attempt C)", "error": str(e)})

            # 2.2 Connection State
            try:
                url_state = f"{base_url}/instance/connectionState/{instance}"
                if "fortalabs" in base_url:
                     url_state = f"{url_state}?token={uazapi_token}"
                
                resp = await client.get(url_state, headers=headers, timeout=5)
                results.append({
                    "step": "Connection State",
                    "url": url_state,
                    "status": resp.status_code,
                    "body": resp.text[:200]
                })
            except Exception as e:
                results.append({"step": "Connection State", "error": str(e)})

            # 3. Configure Webhook (POST /webhook/set)
            # NOTE: FortaLabs seems to use lowercase 'messages' based on previous config
            payload = {
                "enabled": True,
                "url": webhook_target,
                "webhookByEvents": False,
                "events": [
                    "messages", "messages_update", "send_message", 
                    "MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE"
                ]
            }
            
            # Attempt A: Standard /webhook/set/{instance}
            url_set = f"{base_url}/webhook/set/{instance}"
            try:
                # FortaLabs might need token in query param too
                if "fortalabs" in base_url:
                    url_set = f"{url_set}?token={uazapi_token}"
                
                resp = await client.post(url_set, json=payload, headers=headers, timeout=10)
                results.append({
                    "step": "Set Webhook (Attempt A: Standard)",
                    "url": url_set,
                    "status": resp.status_code,
                    "response": resp.text
                })
            except Exception as e:
                results.append({"step": "Set Webhook (Attempt A)", "error": str(e)})

            # Attempt B: FortaLabs Variation 1 (No instance in path)
            if "fortalabs" in base_url:
                 try:
                     url_set_b = f"{base_url}/webhook/set?token={uazapi_token}"
                     resp = await client.post(url_set_b, json=payload, headers=headers, timeout=10)
                     results.append({
                         "step": "Set Webhook (Attempt B: No Instance)",
                         "url": url_set_b,
                         "status": resp.status_code,
                         "response": resp.text
                     })
                 except Exception as e:
                     results.append({"step": "Set Webhook (Attempt B)", "error": str(e)})

                 # Attempt C: Just /webhook
                 try:
                     url_set_c = f"{base_url}/webhook?token={uazapi_token}"
                     resp = await client.post(url_set_c, json=payload, headers=headers, timeout=10)
                     results.append({
                         "step": "Set Webhook (Attempt C: /webhook)",
                         "url": url_set_c,
                         "status": resp.status_code,
                         "response": resp.text
                     })
                 except Exception as e:
                     results.append({"step": "Set Webhook (Attempt C)", "error": str(e)})
                
        return {
            "status": "completed",
            "webhook_target_url": webhook_target,
            "diagnostics": results,
            "manual_configuration": {
                "method": "POST",
                "url": f"{base_url}/webhook/set/{instance}",
                "headers": headers,
                "body": payload
            }
        }

    except Exception as e:
        return {"status": "critical_error", "detail": str(e)}

@api_router.delete("/debug/reset-conversations")
async def debug_reset_conversations():
    """
    DANGER: Deletes ALL conversations and messages.
    For testing purposes only.
    """
    try:
        if db is None:
             raise HTTPException(status_code=503, detail="Database unavailable")
             
        await db.conversations.delete_many({})
        await db.messages.delete_many({})
        
        global WEBHOOK_LOGS
        WEBHOOK_LOGS = []
        
        return {"status": "success", "message": "All conversations and messages deleted."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/debug/reset-phone/{phone}")
async def debug_reset_phone(phone: str):
    """
    DANGER: Deletes Lead, Conversation and Messages for a specific phone.
    """
    try:
        if db is None:
             raise HTTPException(status_code=503, detail="Database unavailable")
        
        # 1. Find Lead
        # Try exact, with 55, without 55
        lead = await db.leads.find_one({"phone": phone})
        if not lead and phone.startswith("55"):
             lead = await db.leads.find_one({"phone": phone[2:]})
        if not lead:
             lead = await db.leads.find_one({"phone": f"55{phone}"})
             
        if not lead:
             return {"status": "not_found", "message": "Lead not found"}
             
        lead_id = lead["id"]
        
        # 2. Delete Lead
        await db.leads.delete_one({"id": lead_id})
        
        # 3. Find Conversation
        conversation = await db.conversations.find_one({"lead_id": lead_id})
        if conversation:
            # 4. Delete Messages
            await db.messages.delete_many({"conversation_id": conversation["id"]})
            # 5. Delete Conversation
            await db.conversations.delete_one({"id": conversation["id"]})
            
        return {"status": "success", "message": f"Data for phone {phone} deleted."}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/messages/{message_id}/play-audio")
async def play_audio_proxy(message_id: str):
    """
    Proxy to fetch audio from UazApi/WhatsApp given a message ID.
    Handles encrypted (.enc) files by requesting download from provider.
    """
    try:
        # 1. Find message
        message = await db.messages.find_one({"id": message_id}, {"_id": 0})
        if not message:
            raise HTTPException(status_code=404, detail="Message not found")
            
        content = message.get("content")
        
        # If we already have a direct playable link or base64, redirect/return it?
        # But if the user is calling this, it's likely because the current link failed.
        
        # 2. Check for external ID
        external_id = message.get("external_id")
        
        # 2.1 BACKFILL ATTEMPT: If no external_id, try to find it in content if structured strangely
        if not external_id and content:
            # Sometimes 'id' is in content directly?
            if isinstance(content, dict):
                 external_id = content.get("id") or content.get("key", {}).get("id")
        
        if not external_id:
             # Try to find it in content if we missed it during save (for old messages)
             # Sometimes it might be hidden in deep structure?
             # But likely we just don't have it for old messages.
             logging.warning(f"External Message ID not found for message {message_id}")
             
             # FALLBACK: Try Manual Decryption if we have URL and MediaKey
             media_key = content.get("mediaKey") if isinstance(content, dict) else None
             url = content.get("url") or content.get("URL") if isinstance(content, dict) else None
             
             if media_key and url and "mmg.whatsapp.net" in url:
                  logging.info(f"Attempting manual decryption for audio {message_id}")
                  try:
                      async with httpx.AsyncClient(follow_redirects=True) as client:
                           resp = await client.get(url, timeout=30)
                           if resp.status_code == 200:
                               # Pass "audio" to use "WhatsApp Audio Keys" info string
                               decrypted = decrypt_whatsapp_media(resp.content, media_key, "audio")
                               if decrypted:
                                   base64_data = base64.b64encode(decrypted).decode('utf-8')
                                   mimetype = content.get("mimetype") or "audio/ogg; codecs=opus"
                                   
                                   # Update DB
                                   update_fields = {
                                      "content.file_data": base64_data,
                                      "content.mimetype": mimetype
                                   }
                                   await db.messages.update_one(
                                      {"id": message_id},
                                      {"$set": update_fields}
                                   )
                                   return {
                                      "src": f"data:{mimetype};base64,{base64_data}",
                                      "type": "base64"
                                   }
                           elif resp.status_code in [404, 410, 403]:
                               logging.warning(f"Media URL expired ({resp.status_code}) for {message_id}")
                               raise HTTPException(status_code=410, detail="Media URL expired and no external ID to refresh")
                           else:
                               logging.warning(f"Media URL returned {resp.status_code} for {message_id}")
                               raise HTTPException(status_code=422, detail=f"Media URL returned {resp.status_code}")
                  except HTTPException:
                      raise
                  except Exception as e:
                      logging.error(f"Manual decryption failed: {e}")
                      raise HTTPException(status_code=422, detail=f"Manual decryption failed: {str(e)}")

             raise HTTPException(status_code=400, detail="External Message ID not found and manual decryption failed")

        # 3. Get Provider Settings
        settings = await db.settings.find_one({"type": "omnichannel"}, {"_id": 0})
        whatsapp = settings.get("whatsapp") if settings else None
        
        if not whatsapp or not whatsapp.get('enabled'):
             raise HTTPException(status_code=503, detail="WhatsApp provider not configured")
             
        provider = whatsapp.get('provider', 'official')
        
        if provider == 'uazapi':
             uazapi_url = whatsapp.get('uazapi_url')
             uazapi_token = whatsapp.get('uazapi_token')
             # uazapi_instance = whatsapp.get('uazapi_instance') 
             
             if not uazapi_url or not uazapi_token:
                  raise HTTPException(status_code=503, detail="UazApi credentials missing")
             
             # Clean URL
             if uazapi_url.endswith('/'):
                 uazapi_url = uazapi_url[:-1]
                 
             # 4. Call Download Endpoint
             # User doc: POST https://fortalabs.uazapi.com/message/download
             # We should use the configured uazapi_url
             
             target_url = f"{uazapi_url}/message/download"
             
             # Prepare headers and auth based on provider implementation
             headers = {
                 "Content-Type": "application/json",
                 "Accept": "application/json"
             }
             
             # Special handling for FortaLabs (Token in Header)
             if "fortalabs.uazapi.com" in uazapi_url:
                 headers["token"] = uazapi_token
             else:
                 headers["apikey"] = uazapi_token

             payload = {
                 "id": external_id,
                 "messageId": external_id, # Alias often used
                 "key": {"id": external_id}, # Standard Evolution format
                 "return_base64": True, 
                 "return_link": True,
                 "generate_mp3": True
             }
             
             logging.info(f"Proxying audio download for {external_id} to {target_url}")
             
             async with httpx.AsyncClient() as client:
                 resp = await client.post(target_url, json=payload, headers=headers, timeout=30)
                 
                 if resp.status_code != 200:
                      logging.error(f"UazApi Download Failed: {resp.status_code} - {resp.text}")
                      raise HTTPException(status_code=502, detail=f"Provider failed to download media: {resp.text}")
                 
                 try:
                     data = resp.json()
                     new_url = data.get("fileURL") or data.get("url")
                     base64_data = data.get("base64Data") or data.get("base64")
                     mimetype = data.get("mimetype") or "audio/mp3"
                 except ValueError:
                    # Fallback: Provider returned raw binary content
                    logging.warning("Provider returned non-JSON response. Treating as raw binary.")
                    # import base64 (already imported globally)
                    base64_data = base64.b64encode(resp.content).decode('utf-8')
                    new_url = None
                    mimetype = resp.headers.get("Content-Type") or "audio/mpeg"
                 
                 if base64_data:
                      # Return as a stream or direct base64 text?
                      # Let's return a JSON with the source usable by <audio>
                      
                      # Update DB
                      update_fields = {
                          "content.file_data": base64_data,
                          "content.mimetype": mimetype
                      }
                      if new_url:
                          update_fields["content.url"] = new_url
                          
                      await db.messages.update_one(
                          {"id": message_id},
                          {"$set": update_fields}
                      )
                      
                      return {
                          "src": f"data:{mimetype};base64,{base64_data}",
                          "type": "base64"
                      }
                 elif new_url:
                      # Update DB
                      await db.messages.update_one(
                          {"id": message_id},
                          {"$set": {"content.url": new_url}}
                      )
                      return {
                          "src": new_url,
                          "type": "url"
                      }
                 else:
                      raise HTTPException(status_code=502, detail="Provider returned no media data")

        else:
             raise HTTPException(status_code=501, detail="Provider not supported for media proxy")

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Play Audio Proxy Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Campaign Routes ---

class CampaignRequest(BaseModel):
    title: str
    target_type: str  # 'patients' or 'leads'
    service_id: Optional[str] = None
    lead_status: Optional[str] = None
    message: str
    channel: str = "whatsapp"

async def process_campaign_task(campaign_id: str, targets: List[dict], target_type: str, message_template: str, user: dict):
    if db is None:
        return
        
    for target in targets:
        # Personalize message
        msg = message_template.replace("{name}", target.get("name", "Cliente"))
        
        # Send Message
        phone = target.get("phone")
        sent = False
        if phone:
            try:
                sent = await send_whatsapp_message(phone, msg)
            except Exception as e:
                logging.error(f"Error sending campaign message to {phone}: {e}")
                sent = False
            
        # Create FollowUp
        followup_id = str(uuid.uuid4())
        followup = {
            "id": followup_id,
            "campaign_id": campaign_id,
            "lead_id": target.get("id") if target_type == "leads" else None,
            "patient_id": target.get("id") if target_type == "patients" else None,
            "assigned_to": user.get("id"),
            "status": "completed" if sent else "failed",
            "scheduled_date": datetime.now().strftime("%Y-%m-%d"),
            "notes": f"Campanha disparada: {msg}",
            "contact_type": "whatsapp",
            "contact_reason": "campaign",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        try:
            await db.followups.insert_one(followup)
        except Exception as e:
            logging.error(f"Error creating campaign followup: {e}")
    
    # Update Campaign Status to Completed
    await db.campaigns.update_one(
        {"id": campaign_id},
        {"$set": {"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat()}}
    )

@api_router.get("/services", response_model=List[dict])
async def get_services():
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    services = await db.services.find({}, {"_id": 0}).to_list(1000)
    return services

@api_router.get("/patients/by-treatment", response_model=List[dict])
async def get_patients_by_treatment(service_id: str, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    # Find appointments for this service
    cursor = db.appointments.find({"service_id": service_id}, {"patient_id": 1})
    patient_ids = set()
    async for doc in cursor:
        patient_ids.add(doc["patient_id"])
    
    query = {
        "$or": [
            {"id": {"$in": list(patient_ids)}},
            {"treatments": {"$elemMatch": {"service_id": service_id}}}
        ]
    }
    patients = await db.patients.find(query, {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1}).to_list(1000)
    return patients

@api_router.get("/campaigns", response_model=List[dict])
async def get_campaigns(current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    # Fetch campaigns sorted by date desc
    campaigns = await db.campaigns.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Enrich with delivery stats from followups
    results = []
    for camp in campaigns:
        camp_id = camp.get("id")
        
        # Count stats from followups
        total_sent = await db.followups.count_documents({"campaign_id": camp_id, "status": "completed"})
        total_failed = await db.followups.count_documents({"campaign_id": camp_id, "status": "failed"})
        
        camp["stats"] = {
            "delivered": total_sent,
            "failed": total_failed,
            "total": camp.get("total_targets", 0)
        }
        results.append(camp)
        
    return results

@api_router.post("/campaigns/send")
async def send_campaign(request: CampaignRequest, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
        
    targets = []
    if request.target_type == "patients":
        if request.service_id:
             # Find appointments for this service
             cursor = db.appointments.find({"service_id": request.service_id}, {"patient_id": 1})
             patient_ids = set()
             async for doc in cursor:
                 patient_ids.add(doc["patient_id"])
             
             # Match patients who have appointments OR have the treatment registered in their profile
             query = {
                 "$or": [
                     {"id": {"$in": list(patient_ids)}},
                     {"treatments": {"$elemMatch": {"service_id": request.service_id}}}
                 ]
             }
        else:
             query = {}
        
        # Only get patients with phone numbers
        query["phone"] = {"$exists": True, "$ne": ""}
        targets = await db.patients.find(query, {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(1000)
        
    elif request.target_type == "leads":
        query = {"phone": {"$exists": True, "$ne": ""}}
        if request.lead_status:
            query["status"] = request.lead_status
        targets = await db.leads.find(query, {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(1000)
    
    if not targets:
        return {"message": "Nenhum destinatário encontrado para esta campanha", "count": 0}

    # Create Campaign Record
    campaign_id = str(uuid.uuid4())
    campaign = {
        "id": campaign_id,
        "title": request.title,
        "message": request.message,
        "target_type": request.target_type,
        "service_id": request.service_id,
        "lead_status": request.lead_status,
        "created_by": current_user.get("id"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "processing",
        "total_targets": len(targets)
    }
    
    await db.campaigns.insert_one(campaign)

    # Add background task to process
    background_tasks.add_task(process_campaign_task, campaign_id, targets, request.target_type, request.message, current_user)
    
    return {"message": "Campanha iniciada com sucesso", "count": len(targets), "campaign_id": campaign_id}

@api_router.get("/messages/{message_id}/view-image")
async def view_image_proxy(message_id: str):
    """
    Proxy to fetch image from UazApi/WhatsApp given a message ID.
    Handles encrypted (.enc) files by requesting download from provider.
    """
    try:
        # 1. Find message
        message = await db.messages.find_one({"id": message_id}, {"_id": 0})
        if not message:
            raise HTTPException(status_code=404, detail="Message not found")
            
        content = message.get("content")
        
        # 2. Check for external ID
        external_id = message.get("external_id")
        
        # 2.1 BACKFILL ATTEMPT
        if not external_id and content:
            if isinstance(content, dict):
                 external_id = content.get("id") or content.get("key", {}).get("id")
        
        if not external_id:
             logging.warning(f"External Message ID not found for message {message_id}")
             # FALLBACK: Try Manual Decryption if we have URL and MediaKey
             media_key = content.get("mediaKey") if isinstance(content, dict) else None
             url = content.get("url") or content.get("URL") if isinstance(content, dict) else None
             
             if media_key and url and "mmg.whatsapp.net" in url:
                  logging.info(f"Attempting manual decryption for {message_id}")
                  try:
                      async with httpx.AsyncClient(follow_redirects=True) as client:
                           resp = await client.get(url, timeout=30)
                           if resp.status_code == 200:
                               decrypted = decrypt_whatsapp_media(resp.content, media_key, "image")
                               if decrypted:
                                   base64_data = base64.b64encode(decrypted).decode('utf-8')
                                   mimetype = content.get("mimetype") or "image/jpeg"
                                   
                                   # Update DB
                                   update_fields = {
                                      "content.file_data": base64_data,
                                      "content.mimetype": mimetype
                                   }
                                   await db.messages.update_one(
                                      {"id": message_id},
                                      {"$set": update_fields}
                                   )
                                   return {
                                      "src": f"data:{mimetype};base64,{base64_data}",
                                      "type": "base64"
                                   }
                           elif resp.status_code in [404, 410, 403]:
                               logging.warning(f"Media URL expired ({resp.status_code}) for {message_id}")
                               raise HTTPException(status_code=410, detail="Media URL expired and no external ID to refresh")
                           else:
                               logging.warning(f"Media URL returned {resp.status_code} for {message_id}")
                               raise HTTPException(status_code=422, detail=f"Media URL returned {resp.status_code}")
                  except HTTPException:
                      raise
                  except Exception as e:
                      logging.error(f"Manual decryption failed: {e}")
                      raise HTTPException(status_code=422, detail=f"Manual decryption failed: {str(e)}")
             
             raise HTTPException(status_code=400, detail="External Message ID not found and manual decryption failed")

        # 3. Get Provider Settings
        settings = await db.settings.find_one({"type": "omnichannel"}, {"_id": 0})
        whatsapp = settings.get("whatsapp") if settings else None
        
        if not whatsapp or not whatsapp.get('enabled'):
             raise HTTPException(status_code=503, detail="WhatsApp provider not configured")
             
        provider = whatsapp.get('provider', 'official')
        
        if provider == 'uazapi':
             uazapi_url = whatsapp.get('uazapi_url')
             uazapi_token = whatsapp.get('uazapi_token')
             
             if not uazapi_url or not uazapi_token:
                  raise HTTPException(status_code=503, detail="UazApi credentials missing")
             
             if uazapi_url.endswith('/'):
                 uazapi_url = uazapi_url[:-1]
                 
             # 4. Call Download Endpoint
             target_url = f"{uazapi_url}/message/download"
             
             headers = {
                 "Content-Type": "application/json",
                 "Accept": "application/json"
             }
             
             if "fortalabs.uazapi.com" in uazapi_url:
                 headers["token"] = uazapi_token
             else:
                 headers["apikey"] = uazapi_token

             payload = {
                 "id": external_id,
                 "messageId": external_id,
                 "key": {"id": external_id},
                 "return_base64": True, 
                 "return_link": True
             }
             
             logging.info(f"Proxying image download for {external_id} to {target_url}")
             
             async with httpx.AsyncClient() as client:
                 resp = await client.post(target_url, json=payload, headers=headers, timeout=30)
                 
                 if resp.status_code != 200:
                      logging.error(f"UazApi Download Failed: {resp.status_code} - {resp.text}")
                      raise HTTPException(status_code=502, detail=f"Provider failed to download media: {resp.text}")
                 
                 try:
                     data = resp.json()
                     new_url = data.get("fileURL") or data.get("url")
                     base64_data = data.get("base64Data") or data.get("base64")
                     mimetype = data.get("mimetype") or "image/jpeg"
                 except ValueError:
                     logging.warning("Provider returned non-JSON response.")
                     # import base64 (already imported globally)
                     base64_data = base64.b64encode(resp.content).decode('utf-8')
                     new_url = None
                     mimetype = resp.headers.get("Content-Type") or "image/jpeg"
                 
                 if base64_data:
                      update_fields = {
                          "content.file_data": base64_data,
                          "content.mimetype": mimetype
                      }
                      if new_url:
                          update_fields["content.url"] = new_url
                          
                      await db.messages.update_one(
                          {"id": message_id},
                          {"$set": update_fields}
                      )
                      
                      return {
                          "src": f"data:{mimetype};base64,{base64_data}",
                          "type": "base64"
                      }
                 elif new_url:
                      await db.messages.update_one(
                          {"id": message_id},
                          {"$set": {"content.url": new_url}}
                      )
                      return {
                          "src": new_url,
                          "type": "url"
                      }
                 else:
                      raise HTTPException(status_code=502, detail="Provider returned no media data")

        else:
             raise HTTPException(status_code=501, detail="Provider not supported for media proxy")

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"View Image Proxy Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/messages/{message_id}/download-document")
async def download_document_proxy(message_id: str):
    """
    Proxy to fetch document from UazApi/WhatsApp given a message ID.
    Handles encrypted (.enc) files by requesting download from provider or manual decryption.
    """
    try:
        # 1. Find message
        message = await db.messages.find_one({"id": message_id}, {"_id": 0})
        if not message:
            raise HTTPException(status_code=404, detail="Message not found")
            
        content = message.get("content")
        
        # 2. Check for external ID
        external_id = message.get("external_id")
        
        # 2.1 BACKFILL ATTEMPT
        if not external_id and content:
            if isinstance(content, dict):
                 external_id = content.get("id") or content.get("key", {}).get("id")
        
        if not external_id:
             logging.warning(f"External Message ID not found for message {message_id}")
             # FALLBACK: Try Manual Decryption if we have URL and MediaKey
             media_key = content.get("mediaKey") if isinstance(content, dict) else None
             url = content.get("url") or content.get("URL") if isinstance(content, dict) else None
             
             if media_key and url and "mmg.whatsapp.net" in url:
                  logging.info(f"Attempting manual decryption for document {message_id}")
                  try:
                      async with httpx.AsyncClient(follow_redirects=True) as client:
                           resp = await client.get(url, timeout=30)
                           if resp.status_code == 200:
                               decrypted = decrypt_whatsapp_media(resp.content, media_key, "document")
                               if decrypted:
                                   base64_data = base64.b64encode(decrypted).decode('utf-8')
                                   mimetype = content.get("mimetype") or "application/pdf"
                                   filename = content.get("fileName") or f"document_{message_id}.pdf"
                                   
                                   # Update DB
                                   update_fields = {
                                      "content.file_data": base64_data,
                                      "content.mimetype": mimetype
                                   }
                                   await db.messages.update_one(
                                      {"id": message_id},
                                      {"$set": update_fields}
                                   )
                                   return {
                                      "src": f"data:{mimetype};base64,{base64_data}",
                                      "type": "base64",
                                      "filename": filename
                                   }
                           elif resp.status_code in [404, 410, 403]:
                               logging.warning(f"Media URL expired ({resp.status_code}) for {message_id}")
                               raise HTTPException(status_code=410, detail="Media URL expired and no external ID to refresh")
                           else:
                               logging.warning(f"Media URL returned {resp.status_code} for {message_id}")
                               raise HTTPException(status_code=422, detail=f"Media URL returned {resp.status_code}")
                  except HTTPException:
                      raise
                  except Exception as e:
                      logging.error(f"Manual decryption failed: {e}")
                      raise HTTPException(status_code=422, detail=f"Manual decryption failed: {str(e)}")
             
             raise HTTPException(status_code=400, detail="External Message ID not found and manual decryption failed")

        # 3. Get Provider Settings
        settings = await db.settings.find_one({"type": "omnichannel"}, {"_id": 0})
        whatsapp = settings.get("whatsapp") if settings else None
        
        if not whatsapp or not whatsapp.get('enabled'):
             raise HTTPException(status_code=503, detail="WhatsApp provider not configured")
             
        provider = whatsapp.get('provider', 'official')
        
        if provider == 'uazapi':
             uazapi_url = whatsapp.get('uazapi_url')
             uazapi_token = whatsapp.get('uazapi_token')
             
             if not uazapi_url or not uazapi_token:
                  raise HTTPException(status_code=503, detail="UazApi credentials missing")
             
             if uazapi_url.endswith('/'):
                 uazapi_url = uazapi_url[:-1]
                 
             # 4. Call Download Endpoint
             target_url = f"{uazapi_url}/message/download"
             
             headers = {
                 "Content-Type": "application/json",
                 "Accept": "application/json"
             }
             
             if "fortalabs.uazapi.com" in uazapi_url:
                 headers["token"] = uazapi_token
             else:
                 headers["apikey"] = uazapi_token

             payload = {
                 "id": external_id,
                 "messageId": external_id,
                 "key": {"id": external_id},
                 "return_base64": True, 
                 "return_link": True
             }
             
             logging.info(f"Proxying document download for {external_id} to {target_url}")
             
             async with httpx.AsyncClient() as client:
                 resp = await client.post(target_url, json=payload, headers=headers, timeout=30)
                 
                 if resp.status_code != 200:
                      logging.error(f"UazApi Download Failed: {resp.status_code} - {resp.text}")
                      raise HTTPException(status_code=502, detail=f"Provider failed to download media: {resp.text}")
                 
                 try:
                     data = resp.json()
                     new_url = data.get("fileURL") or data.get("url")
                     base64_data = data.get("base64Data") or data.get("base64")
                     mimetype = data.get("mimetype") or "application/pdf"
                 except ValueError:
                     logging.warning("Provider returned non-JSON response.")
                     # import base64 (already imported globally)
                     base64_data = base64.b64encode(resp.content).decode('utf-8')
                     new_url = None
                     mimetype = resp.headers.get("Content-Type") or "application/pdf"
                 
                 filename = content.get("fileName") or f"document_{message_id}.{mimetype.split('/')[-1]}"

                 if base64_data:
                      update_fields = {
                          "content.file_data": base64_data,
                          "content.mimetype": mimetype
                      }
                      if new_url:
                          update_fields["content.url"] = new_url
                          
                      await db.messages.update_one(
                          {"id": message_id},
                          {"$set": update_fields}
                      )
                      
                      return {
                          "src": f"data:{mimetype};base64,{base64_data}",
                          "type": "base64",
                          "filename": filename
                      }
                 elif new_url:
                      await db.messages.update_one(
                          {"id": message_id},
                          {"$set": {"content.url": new_url}}
                      )
                      return {
                          "src": new_url,
                          "type": "url",
                          "filename": filename
                      }
                 else:
                      raise HTTPException(status_code=502, detail="Provider returned no media data")

        else:
             raise HTTPException(status_code=501, detail="Provider not supported for media proxy")

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Download Document Proxy Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))



# Webhook for UazApi (Evolution/WPPConnect)
@api_router.post("/webhook/uazapi")
async def uazapi_webhook(request: Request):
    """
    Receives webhooks from UazApi/Evolution/WPPConnect.
    Handles incoming messages and updates conversations.
    """
    try:
        body_bytes = await request.body()
        try:
            payload = json.loads(body_bytes)
            print(f"\n\n[WEBHOOK] RECEIVED PAYLOAD: {json.dumps(payload, default=str)[:200]}...\n\n")
        except:
            payload = {"raw_body": body_bytes.decode('utf-8', errors='ignore')}
            print(f"\n\n[WEBHOOK] RECEIVED RAW BODY (not json): {payload['raw_body'][:200]}...\n\n")

        # Log payload to file for persistent debugging
        try:
            with open("webhook_log.txt", "a") as f:
                f.write(f"\n--- {datetime.now(timezone.utc).isoformat()} ---\n")
                f.write(json.dumps(payload, default=str))
                f.write("\n------------------------------------------------\n")
        except Exception as e:
            print(f"[WEBHOOK] Failed to write webhook log: {e}")

        # DEBUG: Save full payload to a debug collection
        try:
            if db is not None:
                await db.debug_payloads.insert_one({
                    "payload": payload,
                    "received_at": datetime.now(timezone.utc).isoformat()
                })
                print("[WEBHOOK] Saved to debug_payloads")
            else:
                 print("[WEBHOOK] DB is None, cannot save debug payload")
        except Exception as e:
            print(f"[WEBHOOK] Failed to save debug payload: {e}")

        # Log payload for debugging
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": payload
        }
        WEBHOOK_LOGS.append(log_entry)
        if len(WEBHOOK_LOGS) > 50:
            WEBHOOK_LOGS.pop(0)
            
        logging.info(f"UazApi Webhook Payload: {payload}")
        
        if "raw_body" in payload:
             return {"status": "error", "reason": "invalid_json"}
        
        # HANDLE FORTALABS FILE DOWNLOADED EVENT
        # This event comes with the actual downloadable URL for media
        if payload.get("type") == "FileDownloadedMessage" or \
           (payload.get("EventType") == "messages_update" and payload.get("event", {}).get("Type") == "FileDownloaded"):
            
            event_data = payload.get("event", {})
            file_url = event_data.get("FileURL")
            mime_type = event_data.get("MimeType")
            message_ids = event_data.get("MessageIDs", [])
            
            if file_url and message_ids:
                logging.info(f"Received FileDownloaded event for IDs {message_ids}: {file_url}")
                
                # Update messages with this external_id
                # We might have multiple IDs, usually just one
                for ext_id in message_ids:
                    # Update the message content with the new URL
                    # We need to find the message first.
                    # The message might have been saved with a different URL (mmg.whatsapp.net) or no URL.
                    
                    # Note: The original message might be saved with 'external_id' = ext_id
                    result = await db.messages.update_one(
                        {"external_id": ext_id},
                        {"$set": {
                            "content.url": file_url,
                            "content.mimetype": mime_type, # Update mimetype just in case (e.g. audio/mpeg vs ogg)
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }}
                    )
                    if result.modified_count > 0:
                        logging.info(f"Updated message {ext_id} with new FileURL")
                    else:
                        logging.warning(f"Could not find message {ext_id} to update with FileURL")
                        
                return {"status": "processed", "type": "FileDownloaded"}

        # Check if it's a message (incoming or outgoing/sent by secretary from cell)
        # Evolution: data.message. FortaLabs: payload.message (with optional payload.chat)
        message_data = payload.get("data", {}).get("message") or \
                       payload.get("data") or \
                       payload.get("message") or \
                       payload.get("event", {})
        if not message_data and "content" in payload:
            message_data = payload
        # Some providers send "sent" events with message at root or inside event
        if not message_data and payload.get("event"):
            message_data = payload["event"] if isinstance(payload["event"], dict) else message_data

        if not message_data:
            return {"status": "ignored", "reason": "no_message_data"}

        # Log when we might be processing an outgoing (secretary) message — helps confirm if provider sends these
        _from_me_raw = message_data.get("fromMe") or message_data.get("IsFromMe") or (message_data.get("key") or {}).get("fromMe")
        if _from_me_raw:
            logging.info(f"[WEBHOOK] Processing possible OUTGOING/sent message (fromMe=true). Chat/contact should be used as lead.")

        # Extract the CONTACT number (lead) — the other party in the chat (1:1 = the lead)
        # For INCOMING: sender_pn/chatid = lead. For OUTGOING (fromMe): chatid/wa_chatid = lead, sender = us.
        chat_obj = payload.get("chat", {})
        from_number = (message_data.get("remoteJid") or message_data.get("Chat") or message_data.get("chatid") or message_data.get("sender_pn") or "").split("@")[0]
        if not from_number:
            from_number = message_data.get("from", "").split("@")[0]
        if not from_number:
            from_number = (chat_obj.get("wa_chatid") or chat_obj.get("phone") or "").split("@")[0]
        if from_number:
            from_number = re.sub(r"\D", "", from_number) or from_number
             
        # Check for Media Message first
        msg_type = message_data.get("messageType") or message_data.get("type")
        # Normalize msg_type to handle "ImageMessage", "AudioMessage" etc.
        if msg_type and isinstance(msg_type, str):
            msg_type = msg_type.lower().replace("message", "")
        
        body = None
        
        if msg_type in ["image", "video", "audio", "voice", "ptt", "document", "sticker"]:
             # Try to extract media info (Evolution: url/URL at root; FortaLabs: inside content)
             content_obj = message_data.get("content") if isinstance(message_data.get("content"), dict) else {}
             media_url = (
                 message_data.get("mediaUrl") or message_data.get("url") or message_data.get("URL")
                 or content_obj.get("url") or content_obj.get("URL")
             )
             base64_data = message_data.get("base64") or message_data.get("file", {}).get("base64")
             body = {
                 "mimetype": (
                     message_data.get("mimetype") or message_data.get("mediaType")
                     or content_obj.get("mimetype") or content_obj.get("Mimetype")
                     or "application/octet-stream"
                 ),
                 "url": media_url,
                 "file_data": base64_data,
                 "caption": message_data.get("caption") or content_obj.get("caption"),
                 "fileName": message_data.get("fileName") or content_obj.get("fileName"),
                 "seconds": message_data.get("duration") or message_data.get("seconds") or content_obj.get("seconds"),
                 "PTT": msg_type in ["ptt", "voice"] or content_obj.get("PTT"),
             }
             if not body["url"] and not body["file_data"] and content_obj:
                 body.update(content_obj)

        if not body:
            # Text message: Evolution uses conversation/text; FortaLabs may use text or Text
            body = (
                message_data.get("conversation") or message_data.get("text") or message_data.get("Text")
                or message_data.get("body") or message_data.get("Body")
                or (message_data.get("extendedTextMessage") or {}).get("text")
            )
            if isinstance(body, dict) and not body.get("url") and not body.get("URL"):
                body = body.get("text") or body.get("Text") or body

        def _digits(s):
            return re.sub(r"\D", "", str(s or ""))

        def _is_truthy(val):
            if isinstance(val, bool): return val
            if isinstance(val, str): return val.lower() in ("true", "1", "yes")
            if isinstance(val, int): return val == 1
            return False

        # Detect if message was SENT by us (secretary from cell) — must be before lead lookup
        is_from_me = (
            _is_truthy(message_data.get("key", {}).get("fromMe")) or _is_truthy(message_data.get("fromMe"))
            or _is_truthy(message_data.get("IsFromMe"))
            or _is_truthy(payload.get("key", {}).get("fromMe"))
            or _is_truthy(payload.get("data", {}).get("key", {}).get("fromMe"))
            or _is_truthy(payload.get("event", {}).get("IsFromMe"))
        )
        if not is_from_me and chat_obj.get("owner") and chat_obj.get("wa_lastMessageSender"):
            if isinstance(chat_obj.get("wa_lastMessageSender"), str) and chat_obj["wa_lastMessageSender"].startswith(str(chat_obj.get("owner", ""))):
                is_from_me = True
        if is_from_me and chat_obj:
            contact_jid = (chat_obj.get("wa_chatid") or chat_obj.get("phone") or message_data.get("chatid") or "").split("@")[0]
            if contact_jid:
                from_number = _digits(contact_jid) or from_number

        # When secretary sends from cell, some providers don't send body in webhook — keep message anyway
        if not body and is_from_me:
            body = "[mensagem enviada pelo celular]"
        if not from_number or not body:
            return {"status": "ignored", "reason": "incomplete_data"}

        lead = await db.leads.find_one({"phone": from_number}, {"_id": 0})
        if not lead and from_number.startswith("55"):
            lead = await db.leads.find_one({"phone": from_number[2:]}, {"_id": 0})
        if not lead:
            lead = await db.leads.find_one({"phone": f"55{from_number}"}, {"_id": 0})
        if not lead and from_number.startswith("55"):
            if len(from_number) == 13 and from_number[4] == "9":
                lead = await db.leads.find_one({"phone": from_number[:4] + from_number[5:]}, {"_id": 0})
            elif len(from_number) == 12:
                lead = await db.leads.find_one({"phone": from_number[:4] + "9" + from_number[4:]}, {"_id": 0})
        # FortaLabs/UI: lead can be stored as "+55 85 8940-9758" etc. Match by digits only.
        if not lead:
            incoming_digits = _digits(from_number)
            cursor = db.leads.find({}, {"_id": 0}).limit(3000)
            async for doc in cursor:
                if _digits(doc.get("phone")) == incoming_digits:
                    lead = doc
                    break
                if incoming_digits.startswith("55") and _digits(doc.get("phone")) == incoming_digits[2:]:
                    lead = doc
                    break
                if _digits(doc.get("phone")) == incoming_digits[-11:] and len(incoming_digits) >= 11:
                    lead = doc
                    break

        # Get name from payload (Evolution pushName; FortaLabs chat.lead_fullName / chat.name)
        contact_name = (
            message_data.get("pushName") or
            message_data.get("notifyName") or
            payload.get("sender", {}).get("name") or
            payload.get("data", {}).get("pushName") or
            payload.get("chat", {}).get("lead_fullName") or
            payload.get("chat", {}).get("name") or
            payload.get("chat", {}).get("wa_name") or
            payload.get("chat", {}).get("contactName") or
            payload.get("event", {}).get("MessageSender")
        )

        # Try to fetch name from API if missing (FortaLabs/UazApi)
        if not contact_name:
             try:
                 settings = await db.settings.find_one({"type": "omnichannel"}, {"_id": 0})
                 if settings and settings.get("whatsapp", {}).get("provider") == "uazapi":
                     whatsapp = settings["whatsapp"]
                     uazapi_url = whatsapp.get("uazapi_url", "").rstrip('/')
                     uazapi_token = whatsapp.get("uazapi_token")
                     
                     if uazapi_url and uazapi_token and "fortalabs.uazapi.com" in uazapi_url:
                          api_url = f"{uazapi_url}/chat/details"
                          headers = {"token": uazapi_token, "Content-Type": "application/json"}
                          api_payload = {"number": from_number, "preview": False}
                          async with httpx.AsyncClient() as client:
                              resp = await client.post(api_url, json=api_payload, headers=headers, timeout=5)
                              if resp.status_code == 200:
                                  data = resp.json()
                                  contact_name = data.get("name") or data.get("wa_name") or data.get("wa_contactName")
                                  if contact_name:
                                      logging.info(f"Fetched name from API for {from_number}: {contact_name}")
             except Exception as e:
                 logging.error(f"Failed to fetch name from API: {e}")

        if not lead:
            # Create new lead from unknown number
            lead_id = str(uuid.uuid4())
            # User requested to avoid "WhatsApp {number}" prefix if possible, but we need a name.
            # If name is present, use it. If not, use just the number or "WhatsApp {number}" based on preference.
            # User said: "ao invés dele trazer o label whatsapp+numero... Eu preciso que ele traga apenas o nome da pessoa no whatsapp."
            # This implies if the name is NOT found, we might just want to show the number or a cleaner fallback.
            # But mostly, we want to ensure we catch the name.
            
            final_name = contact_name if contact_name else f"WhatsApp {from_number}"
            
            lead = {
                "id": lead_id,
                "name": final_name,
                "phone": from_number,
                "status": "new",
                "source": "whatsapp_inbound",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.leads.insert_one(lead)
        else:
            # Update lead name if we have a better name now and the current one is generic
            current_name = lead.get("name", "")
            if contact_name and (current_name.startswith("WhatsApp ") or current_name == from_number):
                await db.leads.update_one(
                    {"id": lead["id"]},
                    {"$set": {"name": contact_name}}
                )
                lead["name"] = contact_name # Update local var for message saving if needed
            
        # 2. Find conversation
        conversation = await db.conversations.find_one({"lead_id": lead["id"]}, {"_id": 0})
        if not conversation:
            conversation_id = str(uuid.uuid4())
            conversation = {
                "id": conversation_id,
                "lead_id": lead["id"],
                "channel": "whatsapp",
                "status": "active",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "last_message_at": datetime.now(timezone.utc).isoformat()
            }
            await db.conversations.insert_one(conversation)
            
        # 3. Save Message
        # Extract external message ID if available
        external_id = None
        
        # Helper to find ID recursively if needed
        def find_id_recursive(obj, depth=0):
            if depth > 20: return None
            if isinstance(obj, dict):
                # Check priority keys
                if "key" in obj and isinstance(obj["key"], dict) and "id" in obj["key"]:
                    return obj["key"]["id"]
                # Common ID keys
                for id_key in ["id", "messageId", "wamid", "_id", "message_id", "messageid"]:
                    if id_key in obj and isinstance(obj[id_key], str) and len(obj[id_key]) > 4:
                        return obj[id_key]
                
                # Dig deeper
                for v in obj.values():
                    found = find_id_recursive(v, depth+1)
                    if found: return found
            elif isinstance(obj, list):
                for item in obj:
                    found = find_id_recursive(item, depth+1)
                    if found: return found
            return None

        # 1. Try finding key/id in message_data
        key = message_data.get("key", {})
        if key and isinstance(key, dict):
             external_id = key.get("id")
        
        # Check for 'messageid' (lowercase) which often contains the clean ID in FortaLabs/UazApi
        if not external_id:
             external_id = message_data.get("messageid")

        if not external_id:
             external_id = message_data.get("id") or message_data.get("messageId") or message_data.get("_id") or message_data.get("wamid")
             
        # 2. Try finding key/id in payload.data (common in Baileys/Evolution if message_data extracted inner message)
        if not external_id:
             data_obj = payload.get("data", {})
             if isinstance(data_obj, dict):
                 key_obj = data_obj.get("key", {})
                 if isinstance(key_obj, dict):
                     external_id = key_obj.get("id")
                 if not external_id:
                     external_id = data_obj.get("id") or data_obj.get("messageId")

        # 3. Try finding key/id in root payload
        if not external_id:
             key_obj = payload.get("key", {})
             if isinstance(key_obj, dict):
                 external_id = key_obj.get("id")
             if not external_id:
                 external_id = payload.get("id") or payload.get("messageId") or payload.get("wamid")
        
        # 4. Recursive Fallback (Last Resort)
        if not external_id:
            logging.info("External ID not found in standard locations. Starting recursive search...")
            external_id = find_id_recursive(payload)
            if external_id:
                logging.info(f"Found external_id via recursive search: {external_id}")
            else:
                logging.error(f"FAILED TO FIND EXTERNAL ID.")

        # Log for debugging
        logging.info(f"Processing message. External ID: {external_id}.")

        # Check for duplicates before inserting
        if external_id:
            existing = await db.messages.find_one({"external_id": external_id})
            if existing:
                 logging.info(f"Duplicate message {external_id} ignored.")
                 return {"status": "ignored", "reason": "duplicate"}

        # Determine sender info (is_from_me was already detected above to fix from_number)
        sender_type = "lead"
        sender_id = lead["id"]
        sender_name = lead["name"]
        if is_from_me:
            sender_type = "consultant"
            sender_id = None
            sender_name = message_data.get("pushName") or "Via WhatsApp"

        message = {
            "id": str(uuid.uuid4()),
            "conversation_id": conversation["id"],
            "sender_type": sender_type,
            "sender_id": sender_id,
            "sender_name": sender_name,
            "content": body,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "external_id": external_id
        }
        await db.messages.insert_one(message)
        if is_from_me:
            logging.info(f"[WEBHOOK] Saved OUTGOING message to conversation {conversation['id']} (lead {lead.get('name', lead.get('phone'))})")

        # Update conversation timestamp
        await db.conversations.update_one(
            {"id": conversation["id"]},
            {"$set": {"last_message_at": datetime.now(timezone.utc).isoformat()}}
        )

        # Emit socket event for frontend real-time update
        if sio:
            # Convert _id to string just in case, though message dict usually has 'id'
            msg_to_emit = message.copy()
            if "_id" in msg_to_emit:
                msg_to_emit["_id"] = str(msg_to_emit["_id"])
            await sio.emit('new_message', msg_to_emit)

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
    if not (current_user.get("role", {}).get("is_admin", False) or current_user.get("user_type") == "superuser"):
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
    if not (current_user.get("role", {}).get("is_admin", False) or current_user.get("user_type") == "superuser"):
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
    if not (current_user.get("role", {}).get("is_admin", False) or current_user.get("user_type") == "superuser"):
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
    if not (current_user.get("role", {}).get("is_admin", False) or current_user.get("user_type") == "superuser"):
        raise HTTPException(status_code=403, detail="Not authorized")
    settings = await db.settings.find_one({"type": "omnichannel"}, {"_id": 0})
    return settings or {}

@api_router.post("/settings/omnichannel")
async def save_omnichannel_settings(data: OmnichannelSettings, current_user: dict = Depends(get_current_user)):
    if not (current_user.get("role", {}).get("is_admin", False) or current_user.get("user_type") == "superuser"):
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
    if not (current_user.get("role", {}).get("is_admin", False) or current_user.get("user_type") == "superuser"):
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
    if not (current_user.get("role", {}).get("is_admin", False) or current_user.get("user_type") == "superuser"):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.settings.update_one(
        {"type": "omnichannel"},
        {"$set": {"instagram": data.model_dump()}},
        upsert=True
    )
    return {"message": "Instagram settings saved"}

@api_router.post("/settings/omnichannel/messenger")
async def save_messenger_settings(data: MessengerSettings, current_user: dict = Depends(get_current_user)):
    if not (current_user.get("role", {}).get("is_admin", False) or current_user.get("user_type") == "superuser"):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.settings.update_one(
        {"type": "omnichannel"},
        {"$set": {"messenger": data.model_dump()}},
        upsert=True
    )
    return {"message": "Messenger settings saved"}

@api_router.post("/settings/omnichannel/whatsapp/test")
async def test_whatsapp_connection(settings: WhatsAppSettings, current_user: dict = Depends(get_current_user)):
    if not (current_user.get("role", {}).get("is_admin", False) or current_user.get("user_type") == "superuser"):
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
    if not (current_user.get("role", {}).get("is_admin", False) or current_user.get("user_type") == "superuser"):
        raise HTTPException(status_code=403, detail="Not authorized")
    settings = await db.settings.find_one({"type": "clinic"}, {"_id": 0})
    return settings or {}

@api_router.post("/settings/clinic")
async def save_clinic_settings(data: ClinicSettings, current_user: dict = Depends(get_current_user)):
    if not (current_user.get("role", {}).get("is_admin", False) or current_user.get("user_type") == "superuser"):
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
