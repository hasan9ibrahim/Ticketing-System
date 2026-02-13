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
from jose import JWTError, jwt
import re

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY environment variable must be set")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# ==================== MODELS ====================

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    name: str  # Full name - required
    email: str  # Email - required
    phone: str  # Phone - required
    password_hash: str
    role: str  # admin, am, noc
    am_type: Optional[str] = None  # "sms" or "voice" for AMs
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    username: str
    name: str  # Full name - required
    email: str  # Email - required
    phone: str  # Phone - required
    password: str
    role: str
    am_type: Optional[str] = None

class UserLogin(BaseModel):
    identifier: str  # username, email, or phone
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    username: str
    name: Optional[str] = None  # Optional for backward compatibility with existing users
    email: Optional[str] = None
    phone: Optional[str] = None
    role: str
    am_type: Optional[str] = None
    created_at: datetime

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class Client(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # Required
    contact_person: Optional[str] = None  # Optional
    contact_email: Optional[str] = None  # Required for new, optional for backward compat
    contact_phone: Optional[str] = None  # Optional
    assigned_am_id: Optional[str] = None
    tier: Optional[str] = None  # Required for new, optional for backward compat
    noc_emails: Optional[str] = None  # Required for new, optional for backward compat
    notes: Optional[str] = None  # Optional
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ClientCreate(BaseModel):
    name: str  # Required
    contact_person: Optional[str] = None  # Optional
    contact_email: str  # Required
    contact_phone: Optional[str] = None  # Optional
    assigned_am_id: Optional[str] = None
    tier: str  # Required
    noc_emails: str  # Required
    notes: Optional[str] = None  # Optional

class ClientUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    assigned_am_id: Optional[str] = None
    tier: Optional[str] = None
    noc_emails: Optional[str] = None
    notes: Optional[str] = None

class SMSTicket(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    ticket_number: str
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    priority: str
    volume: str = "0"
    customer: str
    customer_id: str
    client_or_vendor: str = "client"  # "client" or "vendor"
    customer_trunk: str = ""
    destination: Optional[str] = None
    issue_types: Optional[List[str]] = []  # Predefined issue types checklist
    issue_other: Optional[str] = None  # Custom "Other" issue text
    issue: Optional[str] = None  # Legacy field - computed from issue_types + issue_other
    opened_via: List[str] = []  # Multi-select: Monitoring, Teams, Email, AM
    assigned_to: Optional[str] = None
    status: str
    sid: Optional[str] = None
    content: Optional[str] = None
    rate: Optional[str] = None
    vendor_trunk: Optional[str] = None
    cost: Optional[str] = None
    is_lcr: Optional[str] = None
    root_cause: Optional[str] = None
    action_taken: Optional[str] = None
    internal_notes: Optional[str] = None
    created_by: str
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SMSTicketCreate(BaseModel):
    priority: str
    volume: str
    customer_id: str
    client_or_vendor: str = "client"
    customer_trunk: str
    destination: Optional[str] = None
    issue_types: Optional[List[str]] = []
    issue_other: Optional[str] = None
    issue: Optional[str] = None  # Legacy/computed
    opened_via: List[str] = []  # Multi-select checklist
    assigned_to: Optional[str] = None
    status: str = "Unassigned"
    sid: Optional[str] = None
    content: Optional[str] = None
    rate: Optional[str] = None
    vendor_trunk: Optional[str] = None
    cost: Optional[str] = None
    is_lcr: Optional[str] = None
    root_cause: Optional[str] = None
    action_taken: Optional[str] = None
    internal_notes: Optional[str] = None

class SMSTicketUpdate(BaseModel):
    priority: Optional[str] = None
    volume: Optional[str] = None
    customer_trunk: Optional[str] = None
    destination: Optional[str] = None
    issue_types: Optional[List[str]] = None
    issue_other: Optional[str] = None
    issue: Optional[str] = None
    opened_via: Optional[List[str]] = None  # Multi-select checklist
    assigned_to: Optional[str] = None
    status: Optional[str] = None
    sid: Optional[str] = None
    content: Optional[str] = None
    rate: Optional[str] = None
    vendor_trunk: Optional[str] = None
    cost: Optional[str] = None
    is_lcr: Optional[str] = None
    root_cause: Optional[str] = None
    action_taken: Optional[str] = None
    internal_notes: Optional[str] = None

class VoiceTicket(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    ticket_number: str
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    priority: str
    volume: str = "0"
    customer: str
    customer_id: str
    client_or_vendor: str = "client"
    customer_trunk: str = ""
    destination: Optional[str] = None
    issue_types: Optional[List[str]] = []  # Predefined issue types checklist
    issue_other: Optional[str] = None  # Custom "Other" issue text
    fas_type: Optional[str] = None  # FAS type specification for Voice tickets
    issue: Optional[str] = None  # Legacy field
    opened_via: List[str] = []  # Multi-select: Monitoring, Teams, Email, AM
    assigned_to: Optional[str] = None
    status: str
    rate: Optional[str] = None
    vendor_trunk: Optional[str] = None
    cost: Optional[str] = None
    is_lcr: Optional[str] = None
    root_cause: Optional[str] = None
    action_taken: Optional[str] = None
    internal_notes: Optional[str] = None
    created_by: str
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class VoiceTicketCreate(BaseModel):
    priority: str
    volume: str
    customer_id: str
    client_or_vendor: str = "client"
    customer_trunk: str
    destination: Optional[str] = None
    issue_types: Optional[List[str]] = []
    issue_other: Optional[str] = None
    fas_type: Optional[str] = None
    issue: Optional[str] = None
    opened_via: List[str] = []  # Multi-select checklist
    assigned_to: Optional[str] = None
    status: str = "Unassigned"
    rate: Optional[str] = None
    vendor_trunk: Optional[str] = None
    cost: Optional[str] = None
    is_lcr: Optional[str] = None
    root_cause: Optional[str] = None
    action_taken: Optional[str] = None
    internal_notes: Optional[str] = None

class VoiceTicketUpdate(BaseModel):
    priority: Optional[str] = None
    volume: Optional[str] = None
    customer_trunk: Optional[str] = None
    destination: Optional[str] = None
    issue_types: Optional[List[str]] = None
    issue_other: Optional[str] = None
    fas_type: Optional[str] = None
    issue: Optional[str] = None
    opened_via: Optional[List[str]] = None  # Multi-select checklist
    assigned_to: Optional[str] = None
    status: Optional[str] = None
    rate: Optional[str] = None
    vendor_trunk: Optional[str] = None
    cost: Optional[str] = None
    is_lcr: Optional[str] = None
    root_cause: Optional[str] = None
    action_taken: Optional[str] = None
    internal_notes: Optional[str] = None

class DashboardStats(BaseModel):
    total_sms_tickets: int
    total_voice_tickets: int
    sms_by_status: dict
    voice_by_status: dict
    sms_by_priority: dict
    voice_by_priority: dict
    recent_tickets: List[dict]

# ==================== AUTH HELPERS ====================

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def get_current_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

async def get_current_admin_or_noc(current_user: dict = Depends(get_current_user)):
    """Allow both admin and NOC users to perform ticket operations."""
    if current_user["role"] not in ["admin", "noc"]:
        raise HTTPException(status_code=403, detail="Admin or NOC access required")
    return current_user

def validate_ticket_status(status: str, assigned_to: Optional[str]):
    """Validate that 'Assigned' status requires a NOC member to be assigned."""
    if status == "Assigned" and not assigned_to:
        raise HTTPException(
            status_code=400, 
            detail="Status cannot be 'Assigned' unless a NOC member is assigned"
        )

def normalize_opened_via(opened_via):
    """Convert opened_via to list format for backward compatibility."""
    if opened_via is None:
        return []
    if isinstance(opened_via, str):
        # Convert old string format to list
        return [v.strip() for v in opened_via.split(",") if v.strip()]
    return opened_via

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=UserResponse)
async def register(user_data: UserCreate, current_admin: dict = Depends(get_current_admin)):
    # Check if username exists
    existing = await db.users.find_one({"username": user_data.username}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    user_dict = user_data.model_dump()
    password = user_dict.pop("password")
    user_dict["password_hash"] = get_password_hash(password)
    
    user_obj = User(**user_dict)
    doc = user_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.users.insert_one(doc)
    return UserResponse(**user_obj.model_dump())

@api_router.post("/auth/login", response_model=Token)
async def login(login_data: UserLogin):
    identifier = login_data.identifier
    
    # Search by username, email, or phone
    query = {"$or": [
        {"username": identifier},
        {"email": identifier},
        {"phone": identifier}
    ]}
    
    user = await db.users.find_one(query, {"_id": 0})
    if not user or not verify_password(login_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Convert ISO string timestamp back to datetime
    if isinstance(user['created_at'], str):
        user['created_at'] = datetime.fromisoformat(user['created_at'])
    
    access_token = create_access_token(data={"sub": user["id"]})
    user_response = UserResponse(**user)
    
    return Token(access_token=access_token, token_type="bearer", user=user_response)

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    if isinstance(current_user['created_at'], str):
        current_user['created_at'] = datetime.fromisoformat(current_user['created_at'])
    return UserResponse(**current_user)

# ==================== USER ROUTES ====================

@api_router.get("/users", response_model=List[UserResponse])
async def get_users(current_user: dict = Depends(get_current_user)):
    # Exclude password_hash at query level for efficiency
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    for user in users:
        if isinstance(user.get('created_at'), str):
            user['created_at'] = datetime.fromisoformat(user['created_at'])
    return [UserResponse(**user) for user in users]

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_admin: dict = Depends(get_current_admin)):
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted successfully"}

# ==================== CLIENT ROUTES ====================

@api_router.post("/clients", response_model=Client)
async def create_client(client_data: ClientCreate, current_admin: dict = Depends(get_current_admin)):
    client_obj = Client(**client_data.model_dump())
    doc = client_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.clients.insert_one(doc)
    return client_obj

@api_router.get("/clients", response_model=List[Client])
async def get_clients(current_user: dict = Depends(get_current_user)):
    query = {}
    if current_user["role"] == "am":
        query["assigned_am_id"] = current_user["id"]
    
    clients = await db.clients.find(query, {"_id": 0}).to_list(1000)
    for client in clients:
        if isinstance(client['created_at'], str):
            client['created_at'] = datetime.fromisoformat(client['created_at'])
    return [Client(**client) for client in clients]

@api_router.put("/clients/{client_id}", response_model=Client)
async def update_client(client_id: str, client_data: ClientUpdate, current_admin: dict = Depends(get_current_admin)):
    update_dict = {k: v for k, v in client_data.model_dump().items() if v is not None}
    
    result = await db.clients.find_one_and_update(
        {"id": client_id},
        {"$set": update_dict},
        return_document=True,
        projection={"_id": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if isinstance(result['created_at'], str):
        result['created_at'] = datetime.fromisoformat(result['created_at'])
    return Client(**result)

@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, current_admin: dict = Depends(get_current_admin)):
    result = await db.clients.delete_one({"id": client_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"message": "Client deleted successfully"}

# ==================== SMS TICKET ROUTES ====================

def generate_ticket_number(date: datetime, ticket_id: str) -> str:
    date_str = date.strftime("%Y%m%d")
    return f"#{date_str}{ticket_id[:8]}"

@api_router.post("/tickets/sms", response_model=SMSTicket)
async def create_sms_ticket(ticket_data: SMSTicketCreate, current_user: dict = Depends(get_current_user)):
    # AMs cannot create tickets
    if current_user["role"] == "am":
        raise HTTPException(status_code=403, detail="Account Managers cannot create tickets")
    
    # Validate status requirements
    validate_ticket_status(ticket_data.status, ticket_data.assigned_to)
    
    # Get customer name
    client = await db.clients.find_one({"id": ticket_data.customer_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    ticket_dict = ticket_data.model_dump()
    ticket_dict["created_by"] = current_user["id"]
    ticket_dict["customer"] = client["name"]
    
    # Generate ID and ticket number before creating object
    ticket_id = str(uuid.uuid4())
    ticket_date = datetime.now(timezone.utc)
    ticket_dict["id"] = ticket_id
    ticket_dict["date"] = ticket_date
    ticket_dict["ticket_number"] = generate_ticket_number(ticket_date, ticket_id)
    
    ticket_obj = SMSTicket(**ticket_dict)
    
    doc = ticket_obj.model_dump()
    doc['date'] = doc['date'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.sms_tickets.insert_one(doc)
    return ticket_obj

@api_router.get("/tickets/sms", response_model=List[SMSTicket])
async def get_sms_tickets(current_user: dict = Depends(get_current_user)):
    query = {}
    
    if current_user["role"] == "am":
        # Check if AM is assigned to SMS
        if current_user.get("am_type") != "sms":
            raise HTTPException(status_code=403, detail="You are not assigned to SMS tickets")
        
        clients = await db.clients.find({"assigned_am_id": current_user["id"]}, {"_id": 0}).to_list(1000)
        client_ids = [c["id"] for c in clients]
        query["customer_id"] = {"$in": client_ids}
    
    # Limit to 500 most recent tickets for performance
    tickets = await db.sms_tickets.find(query, {"_id": 0}).sort("date", -1).limit(500).to_list(500)
    for ticket in tickets:
        if isinstance(ticket.get('date'), str):
            ticket['date'] = datetime.fromisoformat(ticket['date'])
        if isinstance(ticket.get('updated_at'), str):
            ticket['updated_at'] = datetime.fromisoformat(ticket['updated_at'])
        # Normalize opened_via for backward compatibility
        ticket['opened_via'] = normalize_opened_via(ticket.get('opened_via'))
    return [SMSTicket(**ticket) for ticket in tickets]

@api_router.get("/tickets/sms/{ticket_id}", response_model=SMSTicket)
async def get_sms_ticket(ticket_id: str, current_user: dict = Depends(get_current_user)):
    ticket = await db.sms_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    if isinstance(ticket['date'], str):
        ticket['date'] = datetime.fromisoformat(ticket['date'])
    if isinstance(ticket['updated_at'], str):
        ticket['updated_at'] = datetime.fromisoformat(ticket['updated_at'])
    # Normalize opened_via for backward compatibility
    ticket['opened_via'] = normalize_opened_via(ticket.get('opened_via'))
    return SMSTicket(**ticket)

@api_router.put("/tickets/sms/{ticket_id}", response_model=SMSTicket)
async def update_sms_ticket(ticket_id: str, ticket_data: SMSTicketUpdate, current_user: dict = Depends(get_current_user)):
    # AMs cannot update tickets
    if current_user["role"] == "am":
        raise HTTPException(status_code=403, detail="Account Managers cannot modify tickets")
    
    # Get the existing ticket to check status validation
    existing_ticket = await db.sms_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not existing_ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    update_dict = {k: v for k, v in ticket_data.model_dump().items() if v is not None}
    
    # Validate status requirements
    new_status = update_dict.get("status", existing_ticket.get("status"))
    new_assigned_to = update_dict.get("assigned_to", existing_ticket.get("assigned_to"))
    validate_ticket_status(new_status, new_assigned_to)
    
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.sms_tickets.find_one_and_update(
        {"id": ticket_id},
        {"$set": update_dict},
        return_document=True,
        projection={"_id": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    if isinstance(result['date'], str):
        result['date'] = datetime.fromisoformat(result['date'])
    if isinstance(result['updated_at'], str):
        result['updated_at'] = datetime.fromisoformat(result['updated_at'])
    # Normalize opened_via for backward compatibility
    result['opened_via'] = normalize_opened_via(result.get('opened_via'))
    return SMSTicket(**result)

@api_router.delete("/tickets/sms/{ticket_id}")
async def delete_sms_ticket(ticket_id: str, current_user: dict = Depends(get_current_admin_or_noc)):
    result = await db.sms_tickets.delete_one({"id": ticket_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {"message": "Ticket deleted successfully"}

# ==================== VOICE TICKET ROUTES ====================

@api_router.post("/tickets/voice", response_model=VoiceTicket)
async def create_voice_ticket(ticket_data: VoiceTicketCreate, current_user: dict = Depends(get_current_user)):
    # AMs cannot create tickets
    if current_user["role"] == "am":
        raise HTTPException(status_code=403, detail="Account Managers cannot create tickets")
    
    # Validate status requirements
    validate_ticket_status(ticket_data.status, ticket_data.assigned_to)
    
    # Get customer name
    client = await db.clients.find_one({"id": ticket_data.customer_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    ticket_dict = ticket_data.model_dump()
    ticket_dict["created_by"] = current_user["id"]
    ticket_dict["customer"] = client["name"]
    
    # Generate ID and ticket number before creating object
    ticket_id = str(uuid.uuid4())
    ticket_date = datetime.now(timezone.utc)
    ticket_dict["id"] = ticket_id
    ticket_dict["date"] = ticket_date
    ticket_dict["ticket_number"] = generate_ticket_number(ticket_date, ticket_id)
    
    ticket_obj = VoiceTicket(**ticket_dict)
    
    doc = ticket_obj.model_dump()
    doc['date'] = doc['date'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.voice_tickets.insert_one(doc)
    return ticket_obj

@api_router.get("/tickets/voice", response_model=List[VoiceTicket])
async def get_voice_tickets(current_user: dict = Depends(get_current_user)):
    query = {}
    
    if current_user["role"] == "am":
        # Check if AM is assigned to Voice
        if current_user.get("am_type") != "voice":
            raise HTTPException(status_code=403, detail="You are not assigned to Voice tickets")
        
        clients = await db.clients.find({"assigned_am_id": current_user["id"]}, {"_id": 0}).to_list(1000)
        client_ids = [c["id"] for c in clients]
        query["customer_id"] = {"$in": client_ids}
    
    # Limit to 500 most recent tickets for performance
    tickets = await db.voice_tickets.find(query, {"_id": 0}).sort("date", -1).limit(500).to_list(500)
    for ticket in tickets:
        if isinstance(ticket.get('date'), str):
            ticket['date'] = datetime.fromisoformat(ticket['date'])
        if isinstance(ticket.get('updated_at'), str):
            ticket['updated_at'] = datetime.fromisoformat(ticket['updated_at'])
        # Normalize opened_via for backward compatibility
        ticket['opened_via'] = normalize_opened_via(ticket.get('opened_via'))
    return [VoiceTicket(**ticket) for ticket in tickets]

@api_router.get("/tickets/voice/{ticket_id}", response_model=VoiceTicket)
async def get_voice_ticket(ticket_id: str, current_user: dict = Depends(get_current_user)):
    ticket = await db.voice_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    if isinstance(ticket['date'], str):
        ticket['date'] = datetime.fromisoformat(ticket['date'])
    if isinstance(ticket['updated_at'], str):
        ticket['updated_at'] = datetime.fromisoformat(ticket['updated_at'])
    # Normalize opened_via for backward compatibility
    ticket['opened_via'] = normalize_opened_via(ticket.get('opened_via'))
    return VoiceTicket(**ticket)

@api_router.put("/tickets/voice/{ticket_id}", response_model=VoiceTicket)
async def update_voice_ticket(ticket_id: str, ticket_data: VoiceTicketUpdate, current_user: dict = Depends(get_current_user)):
    # AMs cannot update tickets
    if current_user["role"] == "am":
        raise HTTPException(status_code=403, detail="Account Managers cannot modify tickets")
    
    # Get the existing ticket to check status validation
    existing_ticket = await db.voice_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not existing_ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    update_dict = {k: v for k, v in ticket_data.model_dump().items() if v is not None}
    
    # Validate status requirements
    new_status = update_dict.get("status", existing_ticket.get("status"))
    new_assigned_to = update_dict.get("assigned_to", existing_ticket.get("assigned_to"))
    validate_ticket_status(new_status, new_assigned_to)
    
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.voice_tickets.find_one_and_update(
        {"id": ticket_id},
        {"$set": update_dict},
        return_document=True,
        projection={"_id": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    if isinstance(result['date'], str):
        result['date'] = datetime.fromisoformat(result['date'])
    if isinstance(result['updated_at'], str):
        result['updated_at'] = datetime.fromisoformat(result['updated_at'])
    # Normalize opened_via for backward compatibility
    result['opened_via'] = normalize_opened_via(result.get('opened_via'))
    return VoiceTicket(**result)

@api_router.delete("/tickets/voice/{ticket_id}")
async def delete_voice_ticket(ticket_id: str, current_user: dict = Depends(get_current_admin_or_noc)):
    result = await db.voice_tickets.delete_one({"id": ticket_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {"message": "Ticket deleted successfully"}

# ==================== DASHBOARD ROUTES ====================

@api_router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    current_user: dict = Depends(get_current_user),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
):
    query = {}
    
    if current_user["role"] == "am":
        clients = await db.clients.find({"assigned_am_id": current_user["id"]}, {"_id": 0, "id": 1}).to_list(1000)
        client_ids = [c["id"] for c in clients]
        query["customer_id"] = {"$in": client_ids}
    
    # Add date range filter if provided
    if date_from or date_to:
        date_query = {}
        if date_from:
            date_query["$gte"] = date_from
        if date_to:
            # Add a day to include the entire end date
            date_query["$lte"] = date_to + "T23:59:59.999999"
        query["date"] = date_query
    
    # Use field projections for efficiency - only fetch fields needed for stats
    stats_projection = {"_id": 0, "status": 1, "priority": 1}
    recent_projection = {"_id": 0, "id": 1, "ticket_number": 1, "customer": 1, "priority": 1, "status": 1, "date": 1}
    
    # Get SMS tickets for stats (only status and priority fields)
    sms_tickets = await db.sms_tickets.find(query, stats_projection).to_list(10000)
    voice_tickets = await db.voice_tickets.find(query, stats_projection).to_list(10000)
    
    # Count by status
    sms_by_status = {}
    sms_by_priority = {}
    for ticket in sms_tickets:
        status = ticket.get("status", "Unknown")
        priority = ticket.get("priority", "Unknown")
        sms_by_status[status] = sms_by_status.get(status, 0) + 1
        sms_by_priority[priority] = sms_by_priority.get(priority, 0) + 1
    
    voice_by_status = {}
    voice_by_priority = {}
    for ticket in voice_tickets:
        status = ticket.get("status", "Unknown")
        priority = ticket.get("priority", "Unknown")
        voice_by_status[status] = voice_by_status.get(status, 0) + 1
        voice_by_priority[priority] = voice_by_priority.get(priority, 0) + 1
    
    # Recent tickets - fetch only 10 most recent from each, sorted by date
    recent_sms = await db.sms_tickets.find(query, recent_projection).sort("date", -1).limit(10).to_list(10)
    recent_voice = await db.voice_tickets.find(query, recent_projection).sort("date", -1).limit(10).to_list(10)
    
    all_tickets = []
    for ticket in recent_sms:
        all_tickets.append({
            "id": ticket["id"],
            "type": "SMS",
            "ticket_number": ticket["ticket_number"],
            "customer": ticket["customer"],
            "priority": ticket["priority"],
            "status": ticket["status"],
            "date": ticket["date"]
        })
    for ticket in recent_voice:
        all_tickets.append({
            "id": ticket["id"],
            "type": "Voice",
            "ticket_number": ticket["ticket_number"],
            "customer": ticket["customer"],
            "priority": ticket["priority"],
            "status": ticket["status"],
            "date": ticket["date"]
        })
    
    # Sort by date descending
    all_tickets.sort(key=lambda x: x["date"] if isinstance(x["date"], str) else x["date"].isoformat(), reverse=True)
    recent_tickets = all_tickets[:10]
    
    return DashboardStats(
        total_sms_tickets=len(sms_tickets),
        total_voice_tickets=len(voice_tickets),
        sms_by_status=sms_by_status,
        voice_by_status=voice_by_status,
        sms_by_priority=sms_by_priority,
        voice_by_priority=voice_by_priority,
        recent_tickets=recent_tickets
    )

# Include router
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
