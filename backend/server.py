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
    role: Optional[str] = None  # Deprecated: use department instead
    department_id: Optional[str] = None  # Link to department
    am_type: Optional[str] = None  # Deprecated: use department.department_type instead
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_active: Optional[datetime] = None  # Track when user was last active
    # Notification preferences for AMs
    notify_on_ticket_created: bool = True  # Notify when ticket created for assigned enterprise
    notify_on_ticket_assigned: bool = True  # Notify when ticket assigned to NOC
    notify_on_ticket_awaiting_vendor: bool = True  # Notify when ticket awaiting vendor
    notify_on_ticket_awaiting_client: bool = True  # Notify when ticket awaiting client
    notify_on_ticket_awaiting_am: bool = True  # Notify when ticket awaiting AM
    notify_on_ticket_resolved: bool = True  # Notify when ticket resolved
    notify_on_ticket_unresolved: bool = True  # Notify when ticket unresolved

class Department(BaseModel):
    """Department model with configurable permissions"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # Department name (e.g., "Admin", "SMS Sales", "Voice Sales", "NOC")
    description: Optional[str] = None
    department_type: str = "all"  # "sms", "voice", or "all" - limits access to ticket types
    # Permissions
    can_view_enterprises: bool = True
    can_edit_enterprises: bool = False
    can_create_enterprises: bool = False
    can_delete_enterprises: bool = False
    can_view_tickets: bool = True
    can_create_tickets: bool = False
    can_edit_tickets: bool = False
    can_delete_tickets: bool = False
    can_view_users: bool = False
    can_edit_users: bool = False
    can_view_all_tickets: bool = True  # See all tickets or only assigned
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DepartmentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    department_type: str = "all"  # "sms", "voice", or "all"
    can_view_enterprises: bool = True
    can_edit_enterprises: bool = False
    can_create_enterprises: bool = False
    can_delete_enterprises: bool = False
    can_view_tickets: bool = True
    can_create_tickets: bool = False
    can_edit_tickets: bool = False
    can_delete_tickets: bool = False
    can_view_users: bool = False
    can_edit_users: bool = False
    can_view_all_tickets: bool = True

class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    department_type: Optional[str] = None
    can_view_enterprises: Optional[bool] = None
    can_edit_enterprises: Optional[bool] = None
    can_create_enterprises: Optional[bool] = None
    can_delete_enterprises: Optional[bool] = None
    can_view_tickets: Optional[bool] = None
    can_create_tickets: Optional[bool] = None
    can_edit_tickets: Optional[bool] = None
    can_delete_tickets: Optional[bool] = None
    can_view_users: Optional[bool] = None
    can_edit_users: Optional[bool] = None
    can_view_all_tickets: Optional[bool] = None

class UserCreate(BaseModel):
    username: str
    name: str  # Full name - required
    email: str  # Email - required
    phone: str  # Phone - required
    password: str
    department_id: Optional[str] = None  # Link to department (preferred)
    role: Optional[str] = None  # Deprecated: use department_id instead
    am_type: Optional[str] = None  # Deprecated: use department.department_type instead

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
    department_id: Optional[str] = None
    role: Optional[str] = None  # Deprecated
    am_type: Optional[str] = None  # Deprecated
    created_at: datetime
    last_active: Optional[datetime] = None

class UserUpdate(BaseModel):
    """Model for updating user - only allows updating certain fields"""
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    department_id: Optional[str] = None
    role: Optional[str] = None  # Deprecated
    am_type: Optional[str] = None  # Deprecated

class TicketModificationNotification(BaseModel):
    """Model for ticket modification notifications"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    ticket_id: str
    ticket_number: str
    ticket_type: str  # "sms" or "voice"
    assigned_to: str  # User ID who was assigned
    modified_by: str  # User ID who modified the ticket
    modified_by_username: str  # Username who modified
    message: str  # Notification message
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    read: bool = False


class AMNotification(BaseModel):
    """Model for AM (Account Manager) notifications about their enterprises"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    am_id: str  # Account Manager user ID
    ticket_id: str
    ticket_number: str
    ticket_type: str  # "sms" or "voice"
    enterprise_id: str  # Enterprise ID
    enterprise_name: str  # Enterprise name
    destination: Optional[str] = None
    issue: Optional[str] = None
    notification_type: str  # "created", "assigned", "awaiting_vendor", "resolved", "unresolved", "other"
    message: str  # Notification message
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    read: bool = False


async def create_am_notification(
    am_id: str,
    ticket_id: str,
    ticket_number: str,
    ticket_type: str,
    enterprise_id: str,
    enterprise_name: str,
    destination: Optional[str],
    issue: Optional[str],
    notification_type: str
):
    """Create a notification for an AM about their enterprise's ticket"""
    # Build message based on notification type
    messages = {
        "created": f"New ticket {ticket_number} created for {enterprise_name}",
        "assigned": f"Ticket {ticket_number} assigned to NOC for {enterprise_name}",
        "awaiting_vendor": f"Ticket {ticket_number} awaiting vendor for {enterprise_name}",
        "awaiting_client": f"Ticket {ticket_number} awaiting client for {enterprise_name}",
        "awaiting_am": f"Ticket {ticket_number} awaiting your response for {enterprise_name}",
        "resolved": f"Ticket {ticket_number} resolved for {enterprise_name}",
        "unresolved": f"Ticket {ticket_number} unresolved for {enterprise_name}",
        "other": f"Ticket {ticket_number} status updated for {enterprise_name}"
    }
    
    notification = AMNotification(
        am_id=am_id,
        ticket_id=ticket_id,
        ticket_number=ticket_number,
        ticket_type=ticket_type,
        enterprise_id=enterprise_id,
        enterprise_name=enterprise_name,
        destination=destination,
        issue=issue,
        notification_type=notification_type,
        message=messages.get(notification_type, f"Ticket {ticket_number} updated for {enterprise_name}")
    )
    doc = notification.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.am_notifications.insert_one(doc)


async def notify_ams_for_ticket(
    customer_id: str,
    ticket_id: str,
    ticket_number: str,
    ticket_type: str,
    enterprise_name: str,
    destination: Optional[str],
    issue: Optional[str],
    notification_type: str
):
    """Notify AMs based on their notification preferences"""
    # Find AMs assigned to this enterprise
    ams = await db.users.find({
        "assigned_am_id": customer_id  # This won't work - need to find by enterprise
    }).to_list(10)
    
    # Actually, we need to find the enterprise to get the assigned AM
    enterprise = await db.clients.find_one({"id": customer_id}, {"_id": 0, "assigned_am_id": 1})
    if not enterprise or not enterprise.get("assigned_am_id"):
        return  # No AM assigned to this enterprise
    
    am_id = enterprise["assigned_am_id"]
    
    # Get AM's notification preferences
    am = await db.users.find_one({"id": am_id}, {"_id": 0, 
        "notify_on_ticket_created": 1,
        "notify_on_ticket_assigned": 1,
        "notify_on_ticket_awaiting_vendor": 1,
        "notify_on_ticket_awaiting_client": 1,
        "notify_on_ticket_awaiting_am": 1,
        "notify_on_ticket_resolved": 1,
        "notify_on_ticket_unresolved": 1
    })
    
    if not am:
        return
    
    # Check if AM wants this type of notification
    pref_map = {
        "created": "notify_on_ticket_created",
        "assigned": "notify_on_ticket_assigned",
        "awaiting_vendor": "notify_on_ticket_awaiting_vendor",
        "awaiting_client": "notify_on_ticket_awaiting_client",
        "awaiting_am": "notify_on_ticket_awaiting_am",
        "resolved": "notify_on_ticket_resolved",
        "unresolved": "notify_on_ticket_unresolved"
    }
    
    pref_key = pref_map.get(notification_type)
    if not pref_key:
        return
    
    # Check preference (default to True if not set)
    if am.get(pref_key, True) is False:
        return
    
    # Create the notification
    await create_am_notification(
        am_id=am_id,
        ticket_id=ticket_id,
        ticket_number=ticket_number,
        ticket_type=ticket_type,
        enterprise_id=customer_id,
        enterprise_name=enterprise_name,
        destination=destination,
        issue=issue,
        notification_type=notification_type
    )


async def create_ticket_modification_notification(
    ticket_id: str,
    ticket_number: str,
    ticket_type: str,
    assigned_to: str,
    modified_by: str,
    modified_by_username: str
):
    """Create a notification when a ticket is modified by someone other than the assignee"""
    notification = TicketModificationNotification(
        ticket_id=ticket_id,
        ticket_number=ticket_number,
        ticket_type=ticket_type,
        assigned_to=assigned_to,
        modified_by=modified_by,
        modified_by_username=modified_by_username,
        message=f"Ticket {ticket_number} was modified by {modified_by_username}"
    )
    doc = notification.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.ticket_notifications.insert_one(doc)

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
    enterprise_type: Optional[str] = Field(default=None, description="sms or voice - required for new enterprises")  # Required for new
    customer_trunks: Optional[List[str]] = Field(default_factory=list)  # List of customer trunk names
    vendor_trunks: Optional[List[str]] = Field(default_factory=list)  # List of vendor trunk names
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
    enterprise_type: str  # Required - "sms" or "voice"
    customer_trunks: Optional[List[str]] = Field(default_factory=list)  # List of customer trunk names
    vendor_trunks: Optional[List[str]] = Field(default_factory=list)  # List of vendor trunk names

class ClientUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    assigned_am_id: Optional[str] = None
    tier: Optional[str] = None
    noc_emails: Optional[str] = None
    notes: Optional[str] = None
    enterprise_type: Optional[str] = None  # "sms" or "voice"
    customer_trunks: Optional[List[str]] = None  # List of customer trunk names
    vendor_trunks: Optional[List[str]] = None  # List of vendor trunk names

class SMSTicket(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    ticket_number: str
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    assigned_at: Optional[datetime] = None  # When ticket was assigned
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
    # Legacy single SID/Content fields (kept for backward compatibility)
    sid: Optional[str] = None
    content: Optional[str] = None
    # New multiple SID/Content pairs
    sms_details: Optional[List[dict]] = []  # List of {sid, content} objects
    rate: Optional[str] = None
    vendor_trunk: Optional[str] = None  # Legacy field
    vendor_trunks: Optional[List[dict]] = Field(default_factory=list)  # List of {trunk, percentage, position, cost, cost_type, min_cost, max_cost} objects
    cost: Optional[str] = None
    is_lcr: Optional[str] = None
    root_cause: Optional[str] = None
    action_taken: Optional[str] = None
    internal_notes: Optional[str] = None
    created_by: str
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    actions: List[dict] = Field(default_factory=list)


class TicketAction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str
    created_by: str
    created_by_username: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    edited: bool = False  # Whether this action has been edited
    edited_at: Optional[datetime] = None  # When it was last edited


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
    # Legacy single SID/Content fields (kept for backward compatibility)
    sid: Optional[str] = None
    content: Optional[str] = None
    # New multiple SID/Content pairs
    sms_details: Optional[List[dict]] = []
    rate: Optional[str] = None
    vendor_trunk: Optional[str] = None  # Legacy field
    vendor_trunks: Optional[List[dict]] = Field(default_factory=list)  # List of {trunk, percentage, position, cost, cost_type, min_cost, max_cost} objects
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
    # Legacy single SID/Content fields (kept for backward compatibility)
    sid: Optional[str] = None
    content: Optional[str] = None
    # New multiple SID/Content pairs
    sms_details: Optional[List[dict]] = None
    rate: Optional[str] = None
    vendor_trunk: Optional[str] = None  # Legacy field
    vendor_trunks: Optional[List[dict]] = None  # List of {trunk, percentage, position, cost, cost_type, min_cost, max_cost} objects
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
    assigned_at: Optional[datetime] = None  # When ticket was assigned
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
    vendor_trunk: Optional[str] = None  # Legacy field
    vendor_trunks: Optional[List[dict]] = Field(default_factory=list)  # List of {trunk, percentage, position, cost, cost_type, min_cost, max_cost} objects
    cost: Optional[str] = None
    is_lcr: Optional[str] = None
    root_cause: Optional[str] = None
    action_taken: Optional[str] = None
    internal_notes: Optional[str] = None
    created_by: str
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    actions: List[dict] = Field(default_factory=list)  # Array of action objects

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
    vendor_trunk: Optional[str] = None  # Legacy field
    vendor_trunks: Optional[List[dict]] = Field(default_factory=list)  # List of {trunk, percentage, position, cost, cost_type, min_cost, max_cost} objects
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
    vendor_trunk: Optional[str] = None  # Legacy field
    vendor_trunks: Optional[List[dict]] = None  # List of {trunk, percentage, position, cost, cost_type, min_cost, max_cost} objects
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
    sms_pending: int = 0  # Tickets that are not resolved or unresolved
    voice_pending: int = 0  # Tickets that are not resolved or unresolved

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
    
    # Update last_active timestamp
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"last_active": datetime.now(timezone.utc)}}
    )
    
    # Attach department info to user for easy access
    if user.get("department_id"):
        dept = await db.departments.find_one({"id": user["department_id"]}, {"_id": 0})
        if dept:
            user["department"] = dept
    
    return user

async def get_user_department(current_user: dict) -> Optional[dict]:
    """Get the user's department with all its permissions"""
    if current_user.get("department"):
        return current_user["department"]
    
    if current_user.get("department_id"):
        return await db.departments.find_one({"id": current_user["department_id"]}, {"_id": 0})
    
    return None

def get_user_role_from_department(dept: Optional[dict]) -> str:
    """Get the effective role based on department permissions"""
    if not dept:
        return "unknown"
    
    # If user can edit users, they're admin
    if dept.get("can_edit_users"):
        return "admin"
    
    # If user can create tickets but not edit enterprises, they're AM
    if dept.get("can_create_tickets") and not dept.get("can_edit_enterprises"):
        return "am"
    
    # If user can edit tickets, they're NOC
    if dept.get("can_edit_tickets"):
        return "noc"
    
    return "unknown"

def get_user_ticket_type(dept: Optional[dict]) -> str:
    """Get the ticket type the user has access to based on department"""
    if not dept:
        return "all"
    return dept.get("department_type", "all")

async def get_current_admin(current_user: dict = Depends(get_current_user)):
    """Check if user is admin based on department permissions"""
    dept = await get_user_department(current_user)
    role = get_user_role_from_department(dept)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

async def get_current_admin_or_noc(current_user: dict = Depends(get_current_user)):
    """Allow both admin and NOC users to perform ticket operations based on department"""
    dept = await get_user_department(current_user)
    role = get_user_role_from_department(dept)
    if role not in ["admin", "noc"]:
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
    
    # Create audit log for user creation
    await create_audit_log(
        user_id=current_admin["id"],
        username=current_admin.get("username", "admin"),
        action="create",
        entity_type="user",
        entity_id=user_obj.id,
        entity_name=user_obj.username,
        changes={"username": user_obj.username, "email": user_obj.email, "name": user_obj.name}
    )
    
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
    
    # Update last_active on login
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"last_active": datetime.now(timezone.utc)}}
    )
    
    # Create a session record to track online time
    session_id = str(uuid.uuid4())
    await db.user_sessions.insert_one({
        "id": session_id,
        "user_id": user["id"],
        "username": user["username"],
        "login_time": datetime.now(timezone.utc),
        "logout_time": None,
        "created_at": datetime.now(timezone.utc)
    })
    
    # Store session_id in user document for reference
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"current_session_id": session_id}}
    )
    
    # Convert ISO string timestamp back to datetime
    if isinstance(user['created_at'], str):
        user['created_at'] = datetime.fromisoformat(user['created_at'])
    
    access_token = create_access_token(data={"sub": user["id"]})
    user_response = UserResponse(**user)
    
    return Token(access_token=access_token, token_type="bearer", user=user_response)

@api_router.post("/auth/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """Logout - marks user as offline by setting last_active to a very old timestamp and closes session"""
    # Set last_active to a time far in the past so user immediately shows as offline
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"last_active": datetime(1970, 1, 1, tzinfo=timezone.utc)}}
    )
    
    # Close the current session record
    current_session_id = current_user.get("current_session_id")
    if current_session_id:
        await db.user_sessions.find_one_and_update(
            {"id": current_session_id},
            {"$set": {"logout_time": datetime.now(timezone.utc)}}
        )
        # Clear the current_session_id from user document
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$unset": {"current_session_id": ""}}
        )
    
    return {"message": "Logged out successfully"}

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    if isinstance(current_user['created_at'], str):
        current_user['created_at'] = datetime.fromisoformat(current_user['created_at'])
    return UserResponse(**current_user)


class NotificationPreferencesUpdate(BaseModel):
    """Model for updating notification preferences"""
    notify_on_ticket_created: Optional[bool] = None
    notify_on_ticket_assigned: Optional[bool] = None
    notify_on_ticket_awaiting_vendor: Optional[bool] = None
    notify_on_ticket_awaiting_client: Optional[bool] = None
    notify_on_ticket_awaiting_am: Optional[bool] = None
    notify_on_ticket_resolved: Optional[bool] = None
    notify_on_ticket_unresolved: Optional[bool] = None


@api_router.get("/users/me/notification-preferences")
async def get_notification_preferences(current_user: dict = Depends(get_current_user)):
    """Get current user's notification preferences"""
    return {
        "notify_on_ticket_created": current_user.get("notify_on_ticket_created", True),
        "notify_on_ticket_assigned": current_user.get("notify_on_ticket_assigned", True),
        "notify_on_ticket_awaiting_vendor": current_user.get("notify_on_ticket_awaiting_vendor", True),
        "notify_on_ticket_awaiting_client": current_user.get("notify_on_ticket_awaiting_client", True),
        "notify_on_ticket_awaiting_am": current_user.get("notify_on_ticket_awaiting_am", True),
        "notify_on_ticket_resolved": current_user.get("notify_on_ticket_resolved", True),
        "notify_on_ticket_unresolved": current_user.get("notify_on_ticket_unresolved", True),
    }


@api_router.put("/users/me/notification-preferences")
async def update_notification_preferences(prefs: NotificationPreferencesUpdate, current_user: dict = Depends(get_current_user)):
    """Update current user's notification preferences"""
    update_dict = {k: v for k, v in prefs.model_dump().items() if v is not None}
    
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": update_dict}
    )
    
    return {"message": "Notification preferences updated successfully"}


@api_router.get("/users/me/am-notifications")
async def get_am_notifications(current_user: dict = Depends(get_current_user)):
    """Get notifications for AM about their enterprises"""
    current_user_id = current_user.get("id")
    
    # Get unread notifications for the current user
    notifications = await db.am_notifications.find({
        "am_id": current_user_id,
        "read": False
    }).sort("created_at", -1).limit(50).to_list(50)
    
    # Convert datetime fields to ISO format strings for JSON serialization
    for notification in notifications:
        if "created_at" in notification and hasattr(notification["created_at"], "isoformat"):
            notification["created_at"] = notification["created_at"].isoformat()
    
    return notifications


@api_router.post("/users/me/am-notifications/{notification_id}/read")
async def mark_am_notification_as_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    """Mark an AM notification as read"""
    current_user_id = current_user.get("id")
    
    result = await db.am_notifications.find_one_and_update(
        {"id": notification_id, "am_id": current_user_id},
        {"$set": {"read": True}},
        return_document=True
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    return {"message": "Notification marked as read"}

# ==================== USER ROUTES ====================

@api_router.get("/users", response_model=List[UserResponse])
async def get_users(current_user: dict = Depends(get_current_user)):
    # Exclude password_hash at query level for efficiency
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    for user in users:
        if isinstance(user.get('created_at'), str):
            user['created_at'] = datetime.fromisoformat(user['created_at'])
    return [UserResponse(**user) for user in users]

@api_router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, user_data: UserUpdate, current_admin: dict = Depends(get_current_admin)):
    """Update user - admin only"""
    # Build update dict with only provided fields
    update_dict = {k: v for k, v in user_data.model_dump().items() if v is not None}
    
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    # Get the user before update for audit
    user_before = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    
    result = await db.users.find_one_and_update(
        {"id": user_id},
        {"$set": update_dict},
        return_document=True,
        projection={"_id": 0, "password_hash": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    
    if isinstance(result.get('created_at'), str):
        result['created_at'] = datetime.fromisoformat(result['created_at'])
    
    # Create audit log for user update
    await create_audit_log(
        user_id=current_admin["id"],
        username=current_admin.get("username", "admin"),
        action="update",
        entity_type="user",
        entity_id=user_id,
        entity_name=user_before.get("username", user_id),
        changes={"before": user_before, "after": result}
    )
    
    return UserResponse(**result)

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_admin: dict = Depends(get_current_admin)):
    # Get user before delete for audit
    user_before = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Create audit log for user deletion
    await create_audit_log(
        user_id=current_admin["id"],
        username=current_admin.get("username", "admin"),
        action="delete",
        entity_type="user",
        entity_id=user_id,
        entity_name=user_before.get("username", user_id) if user_before else user_id,
        changes={"deleted_user": user_before}
    )
    
    return {"message": "User deleted successfully"}

# ==================== DEPARTMENT ROUTES ====================

async def init_default_departments():
    """Initialize default departments if they don't exist"""
    default_departments = [
        {
            "id": "dept_admin",
            "name": "Admin",
            "description": "Administrator Department with full access",
            "department_type": "all",
            "can_view_enterprises": True,
            "can_edit_enterprises": True,
            "can_create_enterprises": True,
            "can_delete_enterprises": True,
            "can_view_tickets": True,
            "can_create_tickets": True,
            "can_edit_tickets": True,
            "can_delete_tickets": True,
            "can_view_users": True,
            "can_edit_users": True,
            "can_view_all_tickets": True
        },
        {
            "id": "dept_sms_sales",
            "name": "SMS Sales",
            "description": "SMS Account Managers Department",
            "department_type": "sms",
            "can_view_enterprises": True,
            "can_edit_enterprises": False,
            "can_create_enterprises": False,
            "can_delete_enterprises": False,
            "can_view_tickets": True,
            "can_create_tickets": False,
            "can_edit_tickets": False,
            "can_delete_tickets": False,
            "can_view_users": False,
            "can_edit_users": False,
            "can_view_all_tickets": False
        },
        {
            "id": "dept_voice_sales",
            "name": "Voice Sales",
            "description": "Voice Account Managers Department",
            "department_type": "voice",
            "can_view_enterprises": True,
            "can_edit_enterprises": False,
            "can_create_enterprises": False,
            "can_delete_enterprises": False,
            "can_view_tickets": True,
            "can_create_tickets": False,
            "can_edit_tickets": False,
            "can_delete_tickets": False,
            "can_view_users": False,
            "can_edit_users": False,
            "can_view_all_tickets": False
        },
        {
            "id": "dept_noc",
            "name": "NOC",
            "description": "Network Operations Center Department",
            "department_type": "all",
            "can_view_enterprises": True,
            "can_edit_enterprises": True,
            "can_create_enterprises": True,
            "can_delete_enterprises": False,
            "can_view_tickets": True,
            "can_create_tickets": True,
            "can_edit_tickets": True,
            "can_delete_tickets": False,
            "can_view_users": False,
            "can_edit_users": False,
            "can_view_all_tickets": True
        }
    ]
    
    for dept in default_departments:
        existing = await db.departments.find_one({"id": dept["id"]})
        if not existing:
            await db.departments.insert_one(dept)

async def migrate_users_to_departments():
    """Assign existing users to departments based on their role"""
    # Get all departments
    departments = await db.departments.find({}).to_list(1000)
    dept_map = {d["name"]: d["id"] for d in departments}
    
    # Get all users without department_id
    users = await db.users.find({"department_id": None}).to_list(1000)
    
    for user in users:
        new_dept_id = None
        
        # Assign based on role
        if user.get("role") == "admin":
            new_dept_id = dept_map.get("Admin")
        elif user.get("role") == "am":
            # Check am_type for SMS or Voice
            if user.get("am_type") == "sms":
                new_dept_id = dept_map.get("SMS Sales")
            elif user.get("am_type") == "voice":
                new_dept_id = dept_map.get("Voice Sales")
            else:
                new_dept_id = dept_map.get("SMS Sales")  # Default to SMS
        elif user.get("role") == "noc":
            new_dept_id = dept_map.get("NOC")
        
        if new_dept_id:
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {"department_id": new_dept_id}}
            )
            print(f"Assigned user {user.get('username')} to department")

@api_router.get("/departments", response_model=List[Department])
async def get_departments(current_user: dict = Depends(get_current_user)):
    """Get all departments - accessible by all authenticated users (for selection)"""
    departments = await db.departments.find({}, {"_id": 0}).to_list(1000)
    for dept in departments:
        if isinstance(dept.get('created_at'), str):
            dept['created_at'] = datetime.fromisoformat(dept['created_at'])
    return [Department(**dept) for dept in departments]

@api_router.post("/departments", response_model=Department)
async def create_department(dept_data: DepartmentCreate, current_admin: dict = Depends(get_current_admin)):
    """Create a new department - admin only"""
    dept_obj = Department(**dept_data.model_dump())
    doc = dept_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.departments.insert_one(doc)
    
    # Create audit log for department creation
    await create_audit_log(
        user_id=current_admin["id"],
        username=current_admin.get("username", "admin"),
        action="create",
        entity_type="department",
        entity_id=dept_obj.id,
        entity_name=dept_obj.name,
        changes=dept_data.model_dump()
    )
    
    return dept_obj

@api_router.put("/departments/{dept_id}", response_model=Department)
async def update_department(dept_id: str, dept_data: DepartmentUpdate, current_admin: dict = Depends(get_current_admin)):
    """Update a department - admin only"""
    update_dict = {k: v for k, v in dept_data.model_dump().items() if v is not None}
    
    # Get department before update for audit
    dept_before = await db.departments.find_one({"id": dept_id}, {"_id": 0})
    
    result = await db.departments.find_one_and_update(
        {"id": dept_id},
        {"$set": update_dict},
        return_document=True,
        projection={"_id": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Department not found")
    
    if isinstance(result.get('created_at'), str):
        result['created_at'] = datetime.fromisoformat(result['created_at'])
    
    # Create audit log for department update
    await create_audit_log(
        user_id=current_admin["id"],
        username=current_admin.get("username", "admin"),
        action="update",
        entity_type="department",
        entity_id=dept_id,
        entity_name=dept_before.get("name", dept_id) if dept_before else dept_id,
        changes={"before": dept_before, "after": result}
    )
    
    return Department(**result)

@api_router.delete("/departments/{dept_id}")
async def delete_department(dept_id: str, current_admin: dict = Depends(get_current_admin)):
    """Delete a department - admin only"""
    # Prevent deletion of default departments
    if dept_id in ["dept_admin", "dept_sms_sales", "dept_voice_sales", "dept_noc"]:
        raise HTTPException(status_code=400, detail="Cannot delete default departments")
    
    # Get department before delete for audit
    dept_before = await db.departments.find_one({"id": dept_id}, {"_id": 0})
    
    result = await db.departments.delete_one({"id": dept_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Department not found")
    
    # Create audit log for department deletion
    await create_audit_log(
        user_id=current_admin["id"],
        username=current_admin.get("username", "admin"),
        action="delete",
        entity_type="department",
        entity_id=dept_id,
        entity_name=dept_before.get("name", dept_id) if dept_before else dept_id,
        changes={"deleted_department": dept_before}
    )
    
    return {"message": "Department deleted successfully"}

@api_router.get("/my-department")
async def get_my_department(current_user: dict = Depends(get_current_user)):
    """Get current user's department"""
    if not current_user.get("department_id"):
        return None
    
    dept = await db.departments.find_one({"id": current_user["department_id"]}, {"_id": 0})
    if not dept:
        return None
    
    if isinstance(dept.get('created_at'), str):
        dept['created_at'] = datetime.fromisoformat(dept['created_at'])
    return Department(**dept)

# ==================== CLIENT ROUTES ====================

@api_router.post("/clients", response_model=Client)
async def create_client(client_data: ClientCreate, current_user: dict = Depends(get_current_user)):
    """Create a new client - requires can_create_enterprises permission"""
    dept = await get_user_department(current_user)
    if not dept or not dept.get("can_create_enterprises"):
        raise HTTPException(status_code=403, detail="Admin or NOC access required")
    client_obj = Client(**client_data.model_dump())
    doc = client_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.clients.insert_one(doc)
    
    # Create audit log for client creation
    await create_audit_log(
        user_id=current_user["id"],
        username=current_user.get("username", "admin"),
        action="create",
        entity_type="client",
        entity_id=client_obj.id,
        entity_name=client_obj.name,
        changes=client_data.model_dump()
    )
    
    return client_obj

@api_router.get("/clients", response_model=List[Client])
async def get_clients(current_user: dict = Depends(get_current_user)):
    """Get all clients - filtered by AM if user is AM"""
    dept = await get_user_department(current_user)
    role = get_user_role_from_department(dept)
    
    query = {}
    if role == "am":
        query["assigned_am_id"] = current_user["id"]
    
    clients = await db.clients.find(query, {"_id": 0}).to_list(1000)
    for client in clients:
        if isinstance(client['created_at'], str):
            client['created_at'] = datetime.fromisoformat(client['created_at'])
    return [Client(**client) for client in clients]

@api_router.get("/my-enterprises", response_model=List[Client])
async def get_my_enterprises(current_user: dict = Depends(get_current_user)):
    """Get enterprises assigned to the current AM user"""
    query = {"assigned_am_id": current_user["id"]}
    
    clients = await db.clients.find(query, {"_id": 0}).to_list(1000)
    for client in clients:
        if isinstance(client['created_at'], str):
            client['created_at'] = datetime.fromisoformat(client['created_at'])
    return [Client(**client) for client in clients]

@api_router.put("/clients/{client_id}", response_model=Client)
async def update_client(client_id: str, client_data: ClientUpdate, current_user: dict = Depends(get_current_user)):
    """Update client - requires can_edit_enterprises permission"""
    dept = await get_user_department(current_user)
    if not dept or not dept.get("can_edit_enterprises"):
        raise HTTPException(status_code=403, detail="Admin or NOC access required")
    update_dict = {k: v for k, v in client_data.model_dump().items() if v is not None}
    
    # Get client before update for audit
    client_before = await db.clients.find_one({"id": client_id}, {"_id": 0})
    
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
    
    # Create audit log for client update
    await create_audit_log(
        user_id=current_user["id"],
        username=current_user.get("username", "admin"),
        action="update",
        entity_type="client",
        entity_id=client_id,
        entity_name=client_before.get("name", client_id) if client_before else client_id,
        changes={"before": client_before, "after": result}
    )
    
    return Client(**result)

# AM-specific endpoint to update contact fields only
class ClientContactUpdate(BaseModel):
    contact_person: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    noc_emails: Optional[str] = None
    notes: Optional[str] = None

@api_router.put("/clients/{client_id}/contact", response_model=Client)
async def update_client_contact(client_id: str, contact_data: ClientContactUpdate, current_user: dict = Depends(get_current_user)):
    """Allow AMs to update contact fields for their assigned enterprises"""
    # Check role using department permissions
    dept = await get_user_department(current_user)
    role = get_user_role_from_department(dept)
    
    if role != "am":
        raise HTTPException(status_code=403, detail="Only AMs can use this endpoint")
    
    # Verify the client is assigned to this AM
    client_before = await db.clients.find_one({"id": client_id, "assigned_am_id": current_user["id"]})
    if not client_before:
        raise HTTPException(status_code=404, detail="Client not found or not assigned to you")
    
    update_dict = {k: v for k, v in contact_data.model_dump().items() if v is not None}
    
    result = await db.clients.find_one_and_update(
        {"id": client_id},
        {"$set": update_dict},
        return_document=True,
        projection={"_id": 0}
    )
    
    if isinstance(result['created_at'], str):
        result['created_at'] = datetime.fromisoformat(result['created_at'])
    
    # Create audit log for client contact update
    await create_audit_log(
        user_id=current_user["id"],
        username=current_user.get("username", "am"),
        action="update",
        entity_type="client_contact",
        entity_id=client_id,
        entity_name=client_before.get("name", client_id) if client_before else client_id,
        changes={"before": {k: client_before.get(k) for k in contact_data.model_dump().keys() if client_before.get(k)}, "after": update_dict}
    )
    
    return Client(**result)

@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, current_admin: dict = Depends(get_current_admin)):
    # Get client before delete for audit
    client_before = await db.clients.find_one({"id": client_id}, {"_id": 0})
    
    result = await db.clients.delete_one({"id": client_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Create audit log for client deletion
    await create_audit_log(
        user_id=current_admin["id"],
        username=current_admin.get("username", "admin"),
        action="delete",
        entity_type="client",
        entity_id=client_id,
        entity_name=client_before.get("name", client_id) if client_before else client_id,
        changes={"deleted_client": client_before}
    )
    
    return {"message": "Client deleted successfully"}

@api_router.get("/trunks/{enterprise_type}")
async def get_trunks_by_type(enterprise_type: str, current_user: dict = Depends(get_current_user)):
    """Get all customer and vendor trunks for a specific enterprise type (sms or voice)"""
    # Check department type access
    dept = await get_user_department(current_user)
    ticket_type = get_user_ticket_type(dept)
    if ticket_type != "all" and ticket_type != enterprise_type:
        raise HTTPException(status_code=403, detail=f"You don't have access to {enterprise_type} tickets")
    
    query = {"enterprise_type": enterprise_type}
    dept = await get_user_department(current_user)
    role = get_user_role_from_department(dept)
    if role == "am":
        query["assigned_am_id"] = current_user["id"]
    
    clients = await db.clients.find(query, {"_id": 0, "customer_trunks": 1, "vendor_trunks": 1, "name": 1, "id": 1}).to_list(1000)
    
    customer_trunks = []
    vendor_trunks = []
    
    for client in clients:
        if client.get("customer_trunks"):
            for trunk in client["customer_trunks"]:
                if trunk not in customer_trunks:
                    customer_trunks.append(trunk)
        if client.get("vendor_trunks"):
            for trunk in client["vendor_trunks"]:
                if trunk not in vendor_trunks:
                    vendor_trunks.append(trunk)
    
    return {
        "customer_trunks": customer_trunks,
        "vendor_trunks": vendor_trunks
    }

# ==================== SMS TICKET ROUTES ====================

def generate_ticket_number(date: datetime, ticket_id: str) -> str:
    date_str = date.strftime("%Y%m%d")
    return f"#{date_str}{ticket_id[:8]}"

@api_router.post("/tickets/sms", response_model=SMSTicket)
async def create_sms_ticket(ticket_data: SMSTicketCreate, current_user: dict = Depends(get_current_user)):
    """Create SMS ticket - requires can_create_tickets permission and SMS type access"""
    # Check department type access
    dept = await get_user_department(current_user)
    ticket_type = get_user_ticket_type(dept)
    if ticket_type != "all" and ticket_type != "sms":
        raise HTTPException(status_code=403, detail="You don't have access to SMS tickets")
    
    # Check permission
    if not dept or not dept.get("can_create_tickets"):
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
    
    # Notify AMs about new ticket for their enterprise
    await notify_ams_for_ticket(
        customer_id=ticket_data.customer_id,
        ticket_id=ticket_id,
        ticket_number=ticket_dict["ticket_number"],
        ticket_type="sms",
        enterprise_name=client["name"],
        destination=ticket_data.destination,
        issue=ticket_data.issue or ", ".join(ticket_data.issue_types) if ticket_data.issue_types else None,
        notification_type="created"
    )
    
    return ticket_obj

@api_router.get("/tickets/sms", response_model=List[SMSTicket])
async def get_sms_tickets(current_user: dict = Depends(get_current_user)):
    """Get SMS tickets - filtered by department type and permissions"""
    # Check department type access
    dept = await get_user_department(current_user)
    ticket_type = get_user_ticket_type(dept)
    if ticket_type != "all" and ticket_type != "sms":
        raise HTTPException(status_code=403, detail="You don't have access to SMS tickets")
    
    query = {}
    
    role = get_user_role_from_department(dept)
    
    if role == "am":
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
    """Get a single SMS ticket"""
    # Check department type access
    dept = await get_user_department(current_user)
    ticket_type = get_user_ticket_type(dept)
    if ticket_type != "all" and ticket_type != "sms":
        raise HTTPException(status_code=403, detail="You don't have access to SMS tickets")
    
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
    """Update SMS ticket - requires can_edit_tickets permission and SMS type access"""
    # Check department type access
    dept = await get_user_department(current_user)
    ticket_type = get_user_ticket_type(dept)
    if ticket_type != "all" and ticket_type != "sms":
        raise HTTPException(status_code=403, detail="You don't have access to SMS tickets")
    
    # Check permission
    if not dept or not dept.get("can_edit_tickets"):
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
    
    # Set assigned_at when ticket is assigned
    # Only set if: assigned_to is being set/changed AND status is "Assigned"
    if new_assigned_to and new_status == "Assigned":
        # Check if assigned_to is new or changed
        existing_assigned_to = existing_ticket.get("assigned_to")
        if not existing_assigned_to or existing_assigned_to != new_assigned_to:
            update_dict["assigned_at"] = datetime.now(timezone.utc)
    
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # Check if we need to create a notification for ticket modification
    # Only notify if:
    # 1. Ticket has an assigned user
    # 2. Ticket status is "Assigned" 
    # 3. The user modifying the ticket is different from the assigned user
    existing_assigned_to = existing_ticket.get("assigned_to")
    existing_status = existing_ticket.get("status")
    current_user_id = current_user.get("id")
    
    should_notify = (
        existing_assigned_to and 
        existing_status == "Assigned" and 
        existing_assigned_to != current_user_id
    )
    
    result = await db.sms_tickets.find_one_and_update(
        {"id": ticket_id},
        {"$set": update_dict},
        return_document=True,
        projection={"_id": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    # Create notification after successful update
    if should_notify:
        await create_ticket_modification_notification(
            ticket_id=ticket_id,
            ticket_number=existing_ticket.get("ticket_number", ""),
            ticket_type="sms",
            assigned_to=existing_assigned_to,
            modified_by=current_user_id,
            modified_by_username=current_user.get("username", "Unknown")
        )
    
    # Notify AMs about status change
    if new_status and new_status != existing_status:
        # Determine notification type based on status
        if new_status == "Assigned":
            notification_type = "assigned"
        elif new_status == "Awaiting Vendor":
            notification_type = "awaiting_vendor"
        elif new_status == "Awaiting Client":
            notification_type = "awaiting_client"
        elif new_status == "Awaiting AM":
            notification_type = "awaiting_am"
        elif new_status == "Resolved":
            notification_type = "resolved"
        elif new_status == "Unresolved":
            notification_type = "unresolved"
        else:
            notification_type = "other"
        
        await notify_ams_for_ticket(
            customer_id=existing_ticket.get("customer_id", ""),
            ticket_id=ticket_id,
            ticket_number=existing_ticket.get("ticket_number", ""),
            ticket_type="sms",
            enterprise_name=existing_ticket.get("customer", ""),
            destination=existing_ticket.get("destination"),
            issue=existing_ticket.get("issue"),
            notification_type=notification_type
        )
    
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
    
    # Notify AMs about new ticket for their enterprise
    await notify_ams_for_ticket(
        customer_id=ticket_data.customer_id,
        ticket_id=ticket_id,
        ticket_number=ticket_dict["ticket_number"],
        ticket_type="voice",
        enterprise_name=client["name"],
        destination=ticket_data.destination,
        issue=ticket_data.issue or ", ".join(ticket_data.issue_types) if ticket_data.issue_types else None,
        notification_type="created"
    )
    
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
    
    # Set assigned_at when ticket is assigned
    # Only set if: assigned_to is being set/changed AND status is "Assigned"
    if new_assigned_to and new_status == "Assigned":
        # Check if assigned_to is new or changed
        existing_assigned_to = existing_ticket.get("assigned_to")
        if not existing_assigned_to or existing_assigned_to != new_assigned_to:
            update_dict["assigned_at"] = datetime.now(timezone.utc)
    
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # Check if we need to create a notification for ticket modification
    # Only notify if:
    # 1. Ticket has an assigned user
    # 2. Ticket status is "Assigned" 
    # 3. The user modifying the ticket is different from the assigned user
    existing_assigned_to = existing_ticket.get("assigned_to")
    existing_status = existing_ticket.get("status")
    current_user_id = current_user.get("id")
    
    should_notify = (
        existing_assigned_to and 
        existing_status == "Assigned" and 
        existing_assigned_to != current_user_id
    )
    
    result = await db.voice_tickets.find_one_and_update(
        {"id": ticket_id},
        {"$set": update_dict},
        return_document=True,
        projection={"_id": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    # Create notification after successful update
    if should_notify:
        await create_ticket_modification_notification(
            ticket_id=ticket_id,
            ticket_number=existing_ticket.get("ticket_number", ""),
            ticket_type="voice",
            assigned_to=existing_assigned_to,
            modified_by=current_user_id,
            modified_by_username=current_user.get("username", "Unknown")
        )
    
    # Notify AMs about status change
    if new_status and new_status != existing_status:
        # Determine notification type based on status
        if new_status == "Assigned":
            notification_type = "assigned"
        elif new_status == "Awaiting Vendor":
            notification_type = "awaiting_vendor"
        elif new_status == "Awaiting Client":
            notification_type = "awaiting_client"
        elif new_status == "Awaiting AM":
            notification_type = "awaiting_am"
        elif new_status == "Resolved":
            notification_type = "resolved"
        elif new_status == "Unresolved":
            notification_type = "unresolved"
        else:
            notification_type = "other"
        
        await notify_ams_for_ticket(
            customer_id=existing_ticket.get("customer_id", ""),
            ticket_id=ticket_id,
            ticket_number=existing_ticket.get("ticket_number", ""),
            ticket_type="voice",
            enterprise_name=existing_ticket.get("customer", ""),
            destination=existing_ticket.get("destination"),
            issue=existing_ticket.get("issue"),
            notification_type=notification_type
        )
    
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


# ==================== TICKET ACTIONS ROUTES ====================

class AddTicketAction(BaseModel):
    text: str


class UpdateTicketAction(BaseModel):
    text: str


@api_router.post("/tickets/sms/{ticket_id}/actions")
async def add_sms_ticket_action(
    ticket_id: str,
    action_data: AddTicketAction,
    current_user: dict = Depends(get_current_user)
):
    # Get user info
    user = await db.users.find_one({"id": current_user["id"]})
    username = user.get("username", "Unknown") if user else "Unknown"
    
    action_obj = {
        "id": str(uuid.uuid4()),
        "text": action_data.text,
        "created_by": current_user["id"],
        "created_by_username": username,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.sms_tickets.find_one_and_update(
        {"id": ticket_id},
        {
            "$push": {"actions": action_obj},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        },
        projection={"_id": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    return {"message": "Action added successfully", "action": action_obj}


@api_router.post("/tickets/voice/{ticket_id}/actions")
async def add_voice_ticket_action(
    ticket_id: str,
    action_data: AddTicketAction,
    current_user: dict = Depends(get_current_user)
):
    # Get user info
    user = await db.users.find_one({"id": current_user["id"]})
    username = user.get("username", "Unknown") if user else "Unknown"
    
    action_obj = {
        "id": str(uuid.uuid4()),
        "text": action_data.text,
        "created_by": current_user["id"],
        "created_by_username": username,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.voice_tickets.find_one_and_update(
        {"id": ticket_id},
        {
            "$push": {"actions": action_obj},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        },
        projection={"_id": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    return {"message": "Action added successfully", "action": action_obj}


# Edit and Delete SMS Ticket Actions
@api_router.put("/tickets/sms/{ticket_id}/actions/{action_id}")
async def update_sms_ticket_action(
    ticket_id: str,
    action_id: str,
    action_data: UpdateTicketAction,
    current_user: dict = Depends(get_current_user)
):
    # First get the ticket to find the action
    ticket = await db.sms_tickets.find_one({"id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    # Find the action
    action = None
    for a in ticket.get("actions", []):
        if a.get("id") == action_id:
            action = a
            break
    
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    # Check if user owns this action
    if action.get("created_by") != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only edit your own actions")
    
    # Update the action
    result = await db.sms_tickets.find_one_and_update(
        {"id": ticket_id, "actions.id": action_id},
        {
            "$set": {
                "actions.$.text": action_data.text,
                "actions.$.edited": True,
                "actions.$.edited_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        },
        projection={"_id": 0}
    )
    
    return {"message": "Action updated successfully"}


@api_router.delete("/tickets/sms/{ticket_id}/actions/{action_id}")
async def delete_sms_ticket_action(
    ticket_id: str,
    action_id: str,
    current_user: dict = Depends(get_current_user)
):
    # First get the ticket to find the action
    ticket = await db.sms_tickets.find_one({"id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    # Find the action
    action = None
    for a in ticket.get("actions", []):
        if a.get("id") == action_id:
            action = a
            break
    
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    # Check if user owns this action
    if action.get("created_by") != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only delete your own actions")
    
    # Delete the action using pull
    result = await db.sms_tickets.find_one_and_update(
        {"id": ticket_id},
        {
            "$pull": {"actions": {"id": action_id}},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        },
        projection={"_id": 0}
    )
    
    return {"message": "Action deleted successfully"}


# Edit and Delete Voice Ticket Actions
@api_router.put("/tickets/voice/{ticket_id}/actions/{action_id}")
async def update_voice_ticket_action(
    ticket_id: str,
    action_id: str,
    action_data: UpdateTicketAction,
    current_user: dict = Depends(get_current_user)
):
    # First get the ticket to find the action
    ticket = await db.voice_tickets.find_one({"id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    # Find the action
    action = None
    for a in ticket.get("actions", []):
        if a.get("id") == action_id:
            action = a
            break
    
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    # Check if user owns this action
    if action.get("created_by") != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only edit your own actions")
    
    # Update the action
    result = await db.voice_tickets.find_one_and_update(
        {"id": ticket_id, "actions.id": action_id},
        {
            "$set": {
                "actions.$.text": action_data.text,
                "actions.$.edited": True,
                "actions.$.edited_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        },
        projection={"_id": 0}
    )
    
    return {"message": "Action updated successfully"}


@api_router.delete("/tickets/voice/{ticket_id}/actions/{action_id}")
async def delete_voice_ticket_action(
    ticket_id: str,
    action_id: str,
    current_user: dict = Depends(get_current_user)
):
    # First get the ticket to find the action
    ticket = await db.voice_tickets.find_one({"id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    # Find the action
    action = None
    for a in ticket.get("actions", []):
        if a.get("id") == action_id:
            action = a
            break
    
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    # Check if user owns this action
    if action.get("created_by") != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only delete your own actions")
    
    # Delete the action using pull
    result = await db.voice_tickets.find_one_and_update(
        {"id": ticket_id},
        {
            "$pull": {"actions": {"id": action_id}},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        },
        projection={"_id": 0}
    )
    
    return {"message": "Action deleted successfully"}

# ==================== DASHBOARD ROUTES ====================

@api_router.get("/dashboard/online-users")
async def get_online_users(current_user: dict = Depends(get_current_user)):
    """Get list of users who were active in the last 5 minutes"""
    from datetime import timedelta
    
    # Consider users active in the last 5 minutes as online
    five_minutes_ago = datetime.now(timezone.utc) - timedelta(minutes=5)
    
    # Get users who have been active in the last 5 minutes
    online_users = await db.users.find(
        {"last_active": {"$gte": five_minutes_ago}},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)
    
    # Also include users who logged in recently (last_active not set but logged in recently)
    # For now, just return users with last_active
    return online_users


@api_router.get("/dashboard/user-online-time")
async def get_user_online_time(current_user: dict = Depends(get_current_user)):
    """Get online time statistics for all users today"""
    from datetime import timedelta
    
    now = datetime.now(timezone.utc)
    # Get start of today (midnight UTC)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Get all sessions from today
    sessions = await db.user_sessions.find({
        "login_time": {"$gte": today_start}
    }).to_list(1000)
    
    # Calculate total online time per user from sessions
    user_online_time = {}
    for session in sessions:
        user_id = session.get("user_id")
        username = session.get("username", "Unknown")
        
        login_time = session.get("login_time")
        if isinstance(login_time, str):
            login_time = datetime.fromisoformat(login_time)
        
        # Determine the effective login time (either start of today or session login)
        effective_login = login_time if login_time and login_time >= today_start else today_start
        
        # For ongoing sessions (no logout_time), use current time
        logout_time = session.get("logout_time")
        if logout_time is None:
            # Session is still active - include time until now
            logout_time = now
        elif isinstance(logout_time, str):
            logout_time = datetime.fromisoformat(logout_time)
        
        if effective_login and logout_time:
            duration = (logout_time - effective_login).total_seconds()
            
            if duration > 0:
                if user_id not in user_online_time:
                    user_online_time[user_id] = {
                        "user_id": user_id,
                        "username": username,
                        "total_seconds": 0,
                        "session_count": 0
                    }
                
                user_online_time[user_id]["total_seconds"] += duration
                user_online_time[user_id]["session_count"] += 1
    
    # Also check last_active for users who don't have session records
    # This serves as a fallback for users who logged in before session tracking was added
    all_users = await db.users.find({}, {"_id": 0, "id": 1, "username": 1, "last_active": 1}).to_list(1000)
    
    for user in all_users:
        user_id = user.get("id")
        username = user.get("username", "Unknown")
        last_active = user.get("last_active")
        
        if last_active:
            if isinstance(last_active, str):
                last_active = datetime.fromisoformat(last_active)
            
            # If last_active is within the last hour, consider them online today
            one_hour_ago = now - timedelta(hours=1)
            if last_active >= one_hour_ago:
                # Estimate they were online for at least some time today
                # Use 30 minutes as a conservative estimate
                estimated_time = 1800  # 30 minutes
                
                if user_id not in user_online_time:
                    user_online_time[user_id] = {
                        "user_id": user_id,
                        "username": username,
                        "total_seconds": estimated_time,
                        "session_count": 1
                    }
                else:
                    # Add to existing time
                    user_online_time[user_id]["total_seconds"] += estimated_time
    
    # Convert to list and format duration
    result = []
    for user_id, data in user_online_time.items():
        total_seconds = data["total_seconds"]
        hours = int(total_seconds // 3600)
        minutes = int((total_seconds % 3600) // 60)
        
        # Only include users who have been online for at least 1 minute
        if total_seconds >= 60:
            result.append({
                "user_id": data["user_id"],
                "username": data["username"],
                "total_time_formatted": f"{hours}h {minutes}m",
                "total_seconds": total_seconds,
                "session_count": data["session_count"]
            })
    
    # Sort by total time (descending)
    result.sort(key=lambda x: x["total_seconds"], reverse=True)
    
    return result


@api_router.get("/dashboard/unassigned-alerts")
async def get_unassigned_alerts(current_user: dict = Depends(get_current_user)):
    """Get unassigned tickets that have exceeded their alert threshold based on priority"""
    from datetime import timedelta
    
    # Define alert intervals in minutes based on priority
    priority_intervals = {
        "Urgent": 5,
        "High": 10,
        "Medium": 15,
        "Low": 20
    }
    
    now = datetime.now(timezone.utc)
    alerts = []
    
    # Check SMS tickets
    sms_tickets = await db.sms_tickets.find({
        "status": "Unassigned"
    }).to_list(1000)
    
    for ticket in sms_tickets:
        priority = ticket.get("priority", "Medium")
        interval = priority_intervals.get(priority, 15)  # Default to 15 minutes
        threshold_time = now - timedelta(minutes=interval)
        
        ticket_date = ticket.get("date")
        if isinstance(ticket_date, str):
            ticket_date = datetime.fromisoformat(ticket_date)
        
        if ticket_date and ticket_date <= threshold_time:
            alerts.append({
                "id": ticket["id"],
                "ticket_number": ticket["ticket_number"],
                "type": "sms",
                "priority": priority,
                "interval_minutes": interval,
                "waiting_since": ticket_date.isoformat() if ticket_date else None,
                "customer": ticket.get("customer", "Unknown"),
                "issue": ticket.get("issue", ticket.get("issue_types", []))
            })
    
    # Check Voice tickets
    voice_tickets = await db.voice_tickets.find({
        "status": "Unassigned"
    }).to_list(1000)
    
    for ticket in voice_tickets:
        priority = ticket.get("priority", "Medium")
        interval = priority_intervals.get(priority, 15)  # Default to 15 minutes
        threshold_time = now - timedelta(minutes=interval)
        
        ticket_date = ticket.get("date")
        if isinstance(ticket_date, str):
            ticket_date = datetime.fromisoformat(ticket_date)
        
        if ticket_date and ticket_date <= threshold_time:
            alerts.append({
                "id": ticket["id"],
                "ticket_number": ticket["ticket_number"],
                "type": "voice",
                "priority": priority,
                "interval_minutes": interval,
                "waiting_since": ticket_date.isoformat() if ticket_date else None,
                "customer": ticket.get("customer", "Unknown"),
                "issue": ticket.get("issue", ticket.get("issue_types", []))
            })
    
    return alerts


@api_router.get("/dashboard/ticket-modifications")
async def get_ticket_modification_notifications(current_user: dict = Depends(get_current_user)):
    """Get notifications for tickets that were modified by another user while still assigned to the current user"""
    current_user_id = current_user.get("id")
    
    # Get unread notifications for the current user
    notifications = await db.ticket_notifications.find({
        "assigned_to": current_user_id,
        "read": False
    }).sort("created_at", -1).limit(20).to_list(20)
    
    # Convert datetime fields to ISO format strings for JSON serialization
    for notification in notifications:
        if "created_at" in notification and hasattr(notification["created_at"], "isoformat"):
            notification["created_at"] = notification["created_at"].isoformat()
    
    return notifications


@api_router.post("/dashboard/ticket-modifications/{notification_id}/read")
async def mark_notification_as_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    """Mark a ticket modification notification as read"""
    current_user_id = current_user.get("id")
    
    result = await db.ticket_notifications.find_one_and_update(
        {"id": notification_id, "assigned_to": current_user_id},
        {"$set": {"read": True}},
        return_document=True
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    return {"message": "Notification marked as read"}


@api_router.get("/dashboard/assigned-ticket-reminders")
async def get_assigned_ticket_reminders(current_user: dict = Depends(get_current_user)):
    """Get tickets assigned to current user that have been in 'Assigned' status too long based on priority:
    - Urgent: 10 minutes
    - High: 15 minutes
    - Medium: 25 minutes
    - Low: 30 minutes
    """
    from datetime import timedelta
    
    current_user_id = current_user.get("id")
    
    # Define reminder intervals in minutes based on priority
    priority_intervals = {
        "Urgent": 5,
        "High": 10,
        "Medium": 20,
        "Low": 25
    }
    
    now = datetime.now(timezone.utc)
    reminders = []
    
    # Check SMS tickets assigned to current user
    sms_tickets = await db.sms_tickets.find({
        "assigned_to": current_user_id,
        "status": "Assigned"
    }).to_list(1000)
    
    for ticket in sms_tickets:
        priority = ticket.get("priority", "Medium")
        interval = priority_intervals.get(priority, 25)  # Default to 25 minutes
        threshold_time = now - timedelta(minutes=interval)
        
        # Use assigned_at if available, otherwise use date as fallback
        assigned_at = ticket.get("assigned_at")
        if isinstance(assigned_at, str):
            assigned_at = datetime.fromisoformat(assigned_at)
        
        # If no assigned_at, fall back to ticket date only if it's recent (within last hour)
        if not assigned_at:
            ticket_date = ticket.get("date")
            if isinstance(ticket_date, str):
                ticket_date = datetime.fromisoformat(ticket_date)
            # Only use date as fallback if it's within the last hour
            if ticket_date and ticket_date >= (now - timedelta(hours=1)):
                assigned_at = ticket_date
            else:
                # Skip this ticket - no valid assigned_at and date is too old
                continue
        
        # Only show reminder if ticket has been assigned longer than the threshold
        if assigned_at and assigned_at <= threshold_time:
            reminders.append({
                "id": ticket["id"],
                "ticket_number": ticket["ticket_number"],
                "type": "sms",
                "priority": priority,
                "interval_minutes": interval,
                "assigned_since": assigned_at.isoformat() if assigned_at else None,
                "customer": ticket.get("customer", "Unknown"),
                "issue": ticket.get("issue", ticket.get("issue_types", []))
            })
    
    # Check Voice tickets assigned to current user
    voice_tickets = await db.voice_tickets.find({
        "assigned_to": current_user_id,
        "status": "Assigned"
    }).to_list(1000)
    
    for ticket in voice_tickets:
        priority = ticket.get("priority", "Medium")
        interval = priority_intervals.get(priority, 25)  # Default to 25 minutes
        threshold_time = now - timedelta(minutes=interval)
        
        # Use assigned_at if available, otherwise use date as fallback
        assigned_at = ticket.get("assigned_at")
        if isinstance(assigned_at, str):
            assigned_at = datetime.fromisoformat(assigned_at)
        
        # If no assigned_at, fall back to ticket date only if it's recent (within last hour)
        if not assigned_at:
            ticket_date = ticket.get("date")
            if isinstance(ticket_date, str):
                ticket_date = datetime.fromisoformat(ticket_date)
            # Only use date as fallback if it's within the last hour
            if ticket_date and ticket_date >= (now - timedelta(hours=1)):
                assigned_at = ticket_date
            else:
                # Skip this ticket - no valid assigned_at and date is too old
                continue
        
        # Only show reminder if ticket has been assigned longer than the threshold
        if assigned_at and assigned_at <= threshold_time:
            reminders.append({
                "id": ticket["id"],
                "ticket_number": ticket["ticket_number"],
                "type": "voice",
                "priority": priority,
                "interval_minutes": interval,
                "assigned_since": assigned_at.isoformat() if assigned_at else None,
                "customer": ticket.get("customer", "Unknown"),
                "issue": ticket.get("issue", ticket.get("issue_types", []))
            })
    
    return reminders


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
    sms_pending = 0
    for ticket in sms_tickets:
        status = ticket.get("status", "Unknown")
        priority = ticket.get("priority", "Unknown")
        sms_by_status[status] = sms_by_status.get(status, 0) + 1
        sms_by_priority[priority] = sms_by_priority.get(priority, 0) + 1
        # Count as pending if not resolved or unresolved
        if status not in ["Resolved", "Unresolved"]:
            sms_pending += 1
    
    voice_by_status = {}
    voice_by_priority = {}
    voice_pending = 0
    for ticket in voice_tickets:
        status = ticket.get("status", "Unknown")
        priority = ticket.get("priority", "Unknown")
        voice_by_status[status] = voice_by_status.get(status, 0) + 1
        voice_by_priority[priority] = voice_by_priority.get(priority, 0) + 1
        # Count as pending if not resolved or unresolved
        if status not in ["Resolved", "Unresolved"]:
            voice_pending += 1
    
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
        recent_tickets=recent_tickets,
        sms_pending=sms_pending,
        voice_pending=voice_pending
    )

# ==================== AUDIT LOGS ====================

async def create_audit_log(user_id: str, username: str, action: str, entity_type: str, entity_id: str, entity_name: str, changes: Optional[dict] = None):
    """Create an audit log entry"""
    audit_log = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "username": username,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "entity_name": entity_name,
        "changes": changes,
        "timestamp": datetime.now(timezone.utc)
    }
    await db.audit_logs.insert_one(audit_log)

class AuditLogResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    username: str
    action: str  # create, update, delete
    entity_type: str  # user, department, client, client_contact, ticket_sms, ticket_voice
    entity_id: str
    entity_name: str
    changes: Optional[dict] = None
    timestamp: datetime

@api_router.get("/audit-logs", response_model=List[AuditLogResponse])
async def get_audit_logs(
    limit: int = 20,
    offset: int = 0,
    entity_type: Optional[str] = None,
    action: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_admin: dict = Depends(get_current_admin)
):
    """Get audit logs - admin only"""
    query = {}
    
    if entity_type:
        query["entity_type"] = entity_type
    if action:
        query["action"] = action
    if date_from:
        query["timestamp"] = {"$gte": datetime.fromisoformat(date_from)}
    if date_to:
        if "timestamp" in query:
            query["timestamp"]["$lte"] = datetime.fromisoformat(date_to)
        else:
            query["timestamp"] = {"$lte": datetime.fromisoformat(date_to)}
    
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("timestamp", -1).skip(offset).limit(limit).to_list(limit)
    
    for log in logs:
        if isinstance(log['timestamp'], str):
            log['timestamp'] = datetime.fromisoformat(log['timestamp'])
    
    return [AuditLogResponse(**log) for log in logs]

@api_router.get("/audit-logs/count")
async def get_audit_logs_count(
    entity_type: Optional[str] = None,
    action: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_admin: dict = Depends(get_current_admin)
):
    """Get total count of audit logs - admin only"""
    query = {}
    
    if entity_type:
        query["entity_type"] = entity_type
    if action:
        query["action"] = action
    if date_from:
        query["timestamp"] = {"$gte": datetime.fromisoformat(date_from)}
    if date_to:
        if "timestamp" in query:
            query["timestamp"]["$lte"] = datetime.fromisoformat(date_to)
        else:
            query["timestamp"] = {"$lte": datetime.fromisoformat(date_to)}
    
    total = await db.audit_logs.count_documents(query)
    return {"total": total}

# ==================== REFERENCE LIST MODELS ====================

# Traffic types for reference lists (similar to ticket issue types but for reference)
TRAFFIC_TYPES = [
    "OTP",
    "Spam",
    "Phishing",
    "Spam and Phishing",
    "Casino",
    "Clean Marketing",
    "Banking",
    "Other"
]


class VendorReference(BaseModel):
    """Model for a vendor in a reference list"""
    model_config = ConfigDict(extra="ignore")
    trunk: str  # Vendor trunk name
    cost: Optional[str] = None  # Cost for this vendor trunk
    custom_field: Optional[str] = None  # Custom field similar to tickets
    is_working: bool = True  # Whether this vendor is currently working
    is_backup: bool = False  # Whether this is a backup vendor


class VendorReferenceList(BaseModel):
    """Model for a vendor reference list (working/backup vendors for a destination)"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # Name of the reference list
    list_type: str  # "sms" or "voice"
    destination: str  # Destination country/region
    traffic_type: str  # Type of traffic (OTP, Spam, Phishing, etc.)
    vendors: List[VendorReference] = Field(default_factory=list)
    created_by: str  # User ID who created
    created_by_username: str  # Username who created
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class VendorReferenceListCreate(BaseModel):
    """Model for creating a new vendor reference list"""
    name: str
    list_type: str  # "sms" or "voice"
    destination: str
    traffic_type: str


class VendorReferenceListUpdate(BaseModel):
    """Model for updating a vendor reference list"""
    name: Optional[str] = None
    destination: Optional[str] = None
    traffic_type: Optional[str] = None


class VendorReferenceAdd(BaseModel):
    """Model for adding a vendor to a reference list"""
    trunk: str
    cost: Optional[str] = None
    custom_field: Optional[str] = None
    is_working: bool = True
    is_backup: bool = False


class VendorReferenceUpdate(BaseModel):
    """Model for updating a vendor in a reference list"""
    cost: Optional[str] = None
    custom_field: Optional[str] = None
    is_working: Optional[bool] = None
    is_backup: Optional[bool] = None


# ==================== REFERENCE LIST API ROUTES ====================

@api_router.get("/references", response_model=List[VendorReferenceList])
async def get_reference_lists(
    list_type: Optional[str] = None,  # Filter by "sms" or "voice"
    current_user: dict = Depends(get_current_user)
):
    """Get all vendor reference lists, optionally filtered by type"""
    # Get user's department to determine access
    dept = await get_user_department(current_user)
    user_role = get_user_role_from_department(dept)
    dept_type = dept.get("department_type", "all") if dept else "all"
    
    query = {}
    
    # Filter by type if provided and user has access
    if list_type:
        query["list_type"] = list_type
        # Check if user has access to this type
        if dept_type != "all" and dept_type != list_type:
            if user_role not in ["admin", "noc"]:
                raise HTTPException(
                    status_code=403,
                    detail=f"You don't have access to {list_type} reference lists"
                )
    else:
        # If no type specified, filter based on user's department
        if dept_type != "all":
            query["list_type"] = dept_type
        # Admin and NOC can see all, but we don't filter further
    
    # For AMs, they can only see what they created or all (based on their department)
    if user_role == "am" and dept_type != "all":
        # AMs in specific department can see all lists of that type
        pass
    
    lists = await db.vendor_reference_lists.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return lists


@api_router.post("/references", response_model=VendorReferenceList)
async def create_reference_list(
    list_data: VendorReferenceListCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new vendor reference list"""
    # Get user's department to check access
    dept = await get_user_department(current_user)
    user_role = get_user_role_from_department(dept)
    dept_type = dept.get("department_type", "all") if dept else "all"
    
    # Check if user has access to create for this type
    if dept_type != "all" and dept_type != list_data.list_type:
        if user_role not in ["admin", "noc"]:
            raise HTTPException(
                status_code=403,
                detail=f"You don't have access to create {list_data.list_type} reference lists"
            )
    
    # Get username
    username = current_user.get("username", "unknown")
    
    # Create the reference list
    reference_list = VendorReferenceList(
        name=list_data.name,
        list_type=list_data.list_type,
        destination=list_data.destination,
        traffic_type=list_data.traffic_type,
        vendors=[],
        created_by=current_user["id"],
        created_by_username=username
    )
    
    doc = reference_list.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["updated_at"] = doc["updated_at"].isoformat()
    
    await db.vendor_reference_lists.insert_one(doc)
    
    return reference_list


@api_router.put("/references/{list_id}", response_model=VendorReferenceList)
async def update_reference_list(
    list_id: str,
    list_data: VendorReferenceListUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a vendor reference list"""
    # Find existing list
    existing = await db.vendor_reference_lists.find_one({"id": list_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Reference list not found")
    
    # Get user's department to check access
    dept = await get_user_department(current_user)
    user_role = get_user_role_from_department(dept)
    dept_type = dept.get("department_type", "all") if dept else "all"
    
    # Check if user has access to this type
    list_type = existing.get("list_type")
    if dept_type != "all" and dept_type != list_type:
        if user_role not in ["admin", "noc"]:
            raise HTTPException(
                status_code=403,
                detail=f"You don't have access to update {list_type} reference lists"
            )
    
    # Build update fields
    update_fields = {}
    if list_data.name is not None:
        update_fields["name"] = list_data.name
    if list_data.destination is not None:
        update_fields["destination"] = list_data.destination
    if list_data.traffic_type is not None:
        update_fields["traffic_type"] = list_data.traffic_type
    
    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.vendor_reference_lists.update_one(
        {"id": list_id},
        {"$set": update_fields}
    )
    
    # Return updated list
    updated = await db.vendor_reference_lists.find_one({"id": list_id}, {"_id": 0})
    return updated


@api_router.delete("/references/{list_id}")
async def delete_reference_list(
    list_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a vendor reference list"""
    # Find existing list
    existing = await db.vendor_reference_lists.find_one({"id": list_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Reference list not found")
    
    # Get user's department to check access
    dept = await get_user_department(current_user)
    user_role = get_user_role_from_department(dept)
    dept_type = dept.get("department_type", "all") if dept else "all"
    
    # Check if user has access to this type
    list_type = existing.get("list_type")
    if dept_type != "all" and dept_type != list_type:
        if user_role not in ["admin", "noc"]:
            raise HTTPException(
                status_code=403,
                detail=f"You don't have access to delete {list_type} reference lists"
            )
    
    await db.vendor_reference_lists.delete_one({"id": list_id})
    
    return {"message": "Reference list deleted successfully"}


@api_router.get("/references/{list_id}/vendors")
async def get_available_vendors(
    list_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get available vendor trunks for adding to a reference list"""
    # Find the reference list to get its type
    reference_list = await db.vendor_reference_lists.find_one({"id": list_id}, {"_id": 0, "list_type": 1})
    if not reference_list:
        raise HTTPException(status_code=404, detail="Reference list not found")
    
    list_type = reference_list.get("list_type")
    
    # Get user's department to check access
    dept = await get_user_department(current_user)
    user_role = get_user_role_from_department(dept)
    dept_type = dept.get("department_type", "all") if dept else "all"
    
    # Check if user has access to this type
    if dept_type != "all" and dept_type != list_type:
        if user_role not in ["admin", "noc"]:
            raise HTTPException(
                status_code=403,
                detail=f"You don't have access to {list_type} reference lists"
            )
    
    # Get all vendor trunks for this enterprise type
    clients = await db.clients.find(
        {"enterprise_type": list_type},
        {"_id": 0, "vendor_trunks": 1}
    ).to_list(1000)
    
    # Collect unique vendor trunks
    vendor_trunks = set()
    for client in clients:
        if client.get("vendor_trunks"):
            for trunk in client["vendor_trunks"]:
                vendor_trunks.add(trunk)
    
    # Get the reference list to find already added vendors
    reference = await db.vendor_reference_lists.find_one({"id": list_id}, {"_id": 0, "vendors.trunk": 1})
    existing_trunks = set()
    if reference and reference.get("vendors"):
        for vendor in reference["vendors"]:
            existing_trunks.add(vendor.get("trunk"))
    
    # Return available trunks (not already in the list)
    available = [trunk for trunk in sorted(vendor_trunks) if trunk not in existing_trunks]
    
    return {"available_vendors": available}


@api_router.post("/references/{list_id}/vendors", response_model=VendorReferenceList)
async def add_vendor_to_list(
    list_id: str,
    vendor_data: VendorReferenceAdd,
    current_user: dict = Depends(get_current_user)
):
    """Add a vendor to a reference list"""
    # Find existing list
    existing = await db.vendor_reference_lists.find_one({"id": list_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Reference list not found")
    
    # Get user's department to check access
    dept = await get_user_department(current_user)
    user_role = get_user_role_from_department(dept)
    dept_type = dept.get("department_type", "all") if dept else "all"
    
    # Check if user has access to this type
    list_type = existing.get("list_type")
    if dept_type != "all" and dept_type != list_type:
        if user_role not in ["admin", "noc"]:
            raise HTTPException(
                status_code=403,
                detail=f"You don't have access to update {list_type} reference lists"
            )
    
    # Check if vendor already exists
    vendors = existing.get("vendors", [])
    for vendor in vendors:
        if vendor.get("trunk") == vendor_data.trunk:
            raise HTTPException(status_code=400, detail="Vendor already exists in this list")
    
    # Add the new vendor
    new_vendor = VendorReference(
        trunk=vendor_data.trunk,
        cost=vendor_data.cost,
        custom_field=vendor_data.custom_field,
        is_working=vendor_data.is_working,
        is_backup=vendor_data.is_backup
    )
    
    vendors.append(new_vendor.model_dump())
    
    await db.vendor_reference_lists.update_one(
        {"id": list_id},
        {"$set": {"vendors": vendors, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Return updated list
    updated = await db.vendor_reference_lists.find_one({"id": list_id}, {"_id": 0})
    return updated


@api_router.put("/references/{list_id}/vendors/{vendor_index}", response_model=VendorReferenceList)
async def update_vendor_in_list(
    list_id: str,
    vendor_index: int,
    vendor_data: VendorReferenceUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a vendor in a reference list"""
    # Find existing list
    existing = await db.vendor_reference_lists.find_one({"id": list_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Reference list not found")
    
    # Get user's department to check access
    dept = await get_user_department(current_user)
    user_role = get_user_role_from_department(dept)
    dept_type = dept.get("department_type", "all") if dept else "all"
    
    # Check if user has access to this type
    list_type = existing.get("list_type")
    if dept_type != "all" and dept_type != list_type:
        if user_role not in ["admin", "noc"]:
            raise HTTPException(
                status_code=403,
                detail=f"You don't have access to update {list_type} reference lists"
            )
    
    # Check if vendor index is valid
    vendors = existing.get("vendors", [])
    if vendor_index < 0 or vendor_index >= len(vendors):
        raise HTTPException(status_code=404, detail="Vendor not found at specified index")
    
    # Update the vendor
    if vendor_data.cost is not None:
        vendors[vendor_index]["cost"] = vendor_data.cost
    if vendor_data.custom_field is not None:
        vendors[vendor_index]["custom_field"] = vendor_data.custom_field
    if vendor_data.is_working is not None:
        vendors[vendor_index]["is_working"] = vendor_data.is_working
    if vendor_data.is_backup is not None:
        vendors[vendor_index]["is_backup"] = vendor_data.is_backup
    
    await db.vendor_reference_lists.update_one(
        {"id": list_id},
        {"$set": {"vendors": vendors, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Return updated list
    updated = await db.vendor_reference_lists.find_one({"id": list_id}, {"_id": 0})
    return updated


@api_router.delete("/references/{list_id}/vendors/{vendor_index}", response_model=VendorReferenceList)
async def remove_vendor_from_list(
    list_id: str,
    vendor_index: int,
    current_user: dict = Depends(get_current_user)
):
    """Remove a vendor from a reference list"""
    # Find existing list
    existing = await db.vendor_reference_lists.find_one({"id": list_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Reference list not found")
    
    # Get user's department to check access
    dept = await get_user_department(current_user)
    user_role = get_user_role_from_department(dept)
    dept_type = dept.get("department_type", "all") if dept else "all"
    
    # Check if user has access to this type
    list_type = existing.get("list_type")
    if dept_type != "all" and dept_type != list_type:
        if user_role not in ["admin", "noc"]:
            raise HTTPException(
                status_code=403,
                detail=f"You don't have access to update {list_type} reference lists"
            )
    
    # Check if vendor index is valid
    vendors = existing.get("vendors", [])
    if vendor_index < 0 or vendor_index >= len(vendors):
        raise HTTPException(status_code=404, detail="Vendor not found at specified index")
    
    # Remove the vendor
    vendors.pop(vendor_index)
    
    await db.vendor_reference_lists.update_one(
        {"id": list_id},
        {"$set": {"vendors": vendors, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Return updated list
    updated = await db.vendor_reference_lists.find_one({"id": list_id}, {"_id": 0})
    return updated


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

@app.on_event("startup")
async def startup_init():
    """Initialize default departments and migrate users on startup"""
    await init_default_departments()
    await migrate_users_to_departments()

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
