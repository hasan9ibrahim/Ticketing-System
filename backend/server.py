from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.websockets import WebSocketState
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Union
import uuid
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
import re
import pandas as pd
import io
import pyotp
import secrets

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

# Email configuration
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
FROM_EMAIL = os.environ.get("FROM_EMAIL", SMTP_USER)

async def send_email(to_email: str, subject: str, body: str):
    """Send an email using SMTP"""
    import aiosmtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    
    # Check if SMTP is configured
    if not SMTP_USER or not SMTP_PASSWORD or not FROM_EMAIL:
        logger.warning("SMTP not configured, skipping email send")
        return
    
    msg = MIMEMultipart()
    msg["From"] = FROM_EMAIL
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))
    
    try:
        await aiosmtplib.send(
            message=msg,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            username=SMTP_USER,
            password=SMTP_PASSWORD,
            start_tls=True
        )
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        # Don't raise - just log the error
        pass

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
    is_active: bool = True  # Whether user is active
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
    # Notification preferences for NOC users
    notify_on_am_action: bool = True  # Notify when AM adds action to assigned ticket
    notify_on_noc_ticket_modification: bool = True  # Notify when another NOC modifies assigned ticket

# ==================== CHAT MODELS ====================

class ChatMessage(BaseModel):
    """Chat message model for real-time messaging"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    conversation_id: str  # ID of the conversation
    sender_id: str  # ID of the sender
    sender_name: str  # Name of the sender for quick display
    content: str  # Message content (text)
    message_type: str = "text"  # "text", "image", "file", "link"
    file_url: Optional[str] = None  # URL for file/image
    file_name: Optional[str] = None  # Original file name
    file_size: Optional[int] = None  # File size in bytes
    file_mime_type: Optional[str] = None  # MIME type
    is_read: bool = False  # Whether message has been read
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Conversation(BaseModel):
    """Conversation model representing a chat between two users"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    participant_ids: List[str]  # List of user IDs in this conversation
    last_message: Optional[str] = None  # Preview of last message
    last_message_time: Optional[datetime] = None  # Timestamp of last message
    last_message_sender_id: Optional[str] = None  # Who sent the last message
    unread_counts: dict = Field(default_factory=dict)  # {user_id: count}
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ConversationCreate(BaseModel):
    """Request model to create or get a conversation"""
    participant_id: str  # The other user's ID

class MessageCreate(BaseModel):
    """Request model to create a message"""
    conversation_id: str
    content: str
    message_type: str = "text"
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    file_mime_type: Optional[str] = None

class ChatUser(BaseModel):
    """User info for chat list"""
    id: str
    username: str
    name: str
    last_active: Optional[datetime] = None
    is_online: bool = False

class ConversationResponse(BaseModel):
    """Response model for conversation with participant info"""
    id: str
    participants: List[ChatUser]
    last_message: Optional[str] = None
    last_message_time: Optional[datetime] = None
    last_message_sender_id: Optional[str] = None
    unread_count: int = 0
    created_at: datetime
    updated_at: datetime

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


class NOCSchedule(BaseModel):
    """Model for NOC schedule entries"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    noc_user_id: str  # Reference to the NOC user
    noc_user_name: str  # Cached name for display
    date: str  # Date in YYYY-MM-DD format
    shift_type: str = "off"  # "shift_a", "shift_b", "shift_c", "shift_d", "off", "holiday"
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class NOCScheduleCreate(BaseModel):
    """Model for creating NOC schedule entries"""
    noc_user_id: str
    date: str  # YYYY-MM-DD
    shift_type: str = "off"  # "shift_a", "shift_b", "shift_c", "shift_d", "off", "holiday"
    notes: Optional[str] = None


class NOCScheduleUpdate(BaseModel):
    """Model for updating NOC schedule entries"""
    noc_user_id: Optional[str] = None
    date: Optional[str] = None
    shift_type: Optional[str] = None
    notes: Optional[str] = None


class NOCScheduleBulkCreate(BaseModel):
    """Model for bulk creating schedule entries (e.g., copying a week)"""
    schedules: List[NOCScheduleCreate]


class NOCMonthlyNote(BaseModel):
    """Model for monthly notes"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    year: int
    month: int
    note: str
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class NOCMonthlyNoteCreate(BaseModel):
    """Model for creating monthly notes"""
    year: int
    month: int
    note: str


class NOCMonthlyNoteUpdate(BaseModel):
    """Model for updating monthly notes"""
    note: Optional[str] = None

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
    is_active: Optional[bool] = True
    created_at: datetime
    last_active: Optional[datetime] = None
    two_factor_enabled: Optional[bool] = False
    two_factor_method: Optional[str] = None  # "totp" or "email"

class UserUpdate(BaseModel):
    """Model for updating user - only allows updating certain fields"""
    username: Optional[str] = None  # Admin can change username
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    department_id: Optional[str] = None
    role: Optional[str] = None  # Deprecated
    am_type: Optional[str] = None  # Deprecated
    password: Optional[str] = None  # Admin can change password
    two_factor_enabled: Optional[bool] = None  # Admin can enable/disable 2FA
    two_factor_method: Optional[str] = None  # Admin can set 2FA method

class TwoFactorSetup(BaseModel):
    """Model for setting up 2FA"""
    method: str  # "totp" or "email"

class TwoFactorVerify(BaseModel):
    """Model for verifying 2FA code"""
    code: str

class TwoFactorLogin(BaseModel):
    """Model for completing login with 2FA"""
    user_id: str
    code: str

class TwoFactorResponse(BaseModel):
    """Response model for 2FA required login"""
    two_factor_required: bool
    user_id: str
    method: str
    message: str

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


# ==================== REFERENCE LIST MODELS ====================

class ReferenceVendorEntry(BaseModel):
    """Model for a vendor entry in a reference list"""
    trunk: str
    cost: Optional[str] = None
    notes: Optional[str] = None


class ReferenceList(BaseModel):
    """Model for a reference list (backup vendors for a destination)"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    section: str  # "sms" or "voice"
    destination: str
    traffic_type: str  # OTP, Promo, Casino, Clean Marketing, Banking, etc.
    vendor_entries: List[dict] = Field(default_factory=list)  # List of {trunk, cost, notes} objects
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ReferenceListCreate(BaseModel):
    """Model for creating a reference list"""
    name: str
    section: str  # "sms" or "voice"
    destination: str
    traffic_type: str
    custom_traffic_type: Optional[str] = None  # For Voice "Other" option
    vendor_entries: List[dict] = Field(default_factory=list)


class ReferenceListUpdate(BaseModel):
    """Model for updating a reference list"""
    name: Optional[str] = None
    destination: Optional[str] = None
    traffic_type: Optional[str] = None
    custom_traffic_type: Optional[str] = None
    vendor_entries: Optional[List[dict]] = None



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
    # Add event_type for filtering
    doc['event_type'] = 'ticket_modification'
    # Add additional fields from ticket if available
    # We'll need to fetch the ticket to get these fields
    doc['created_at'] = doc['created_at'].isoformat()
    await db.ticket_notifications.insert_one(doc)


async def notify_ams_about_ticket(ticket, event_type, ticket_type="sms", created_by=None):
    """Notify AMs about ticket events based on their notification preferences"""
    customer_id = ticket.get("customer_id")
    if not customer_id:
        return
    
    # Get the client/enterprise to find assigned AM
    client = await db.clients.find_one({"id": customer_id}, {"_id": 0, "assigned_am_id": 1})
    if not client or not client.get("assigned_am_id"):
        return
    
    am_id = client["assigned_am_id"]
    
    # Don't notify the same user who created the action
    if created_by and am_id == created_by:
        return
    
    # Get AM's notification preferences and type
    am_user = await db.users.find_one({"id": am_id}, {"_id": 0})
    if not am_user:
        return
    
    # Check if AM's type matches the ticket type (SMS AM gets SMS tickets, Voice AM gets Voice tickets)
    am_type = am_user.get("am_type")
    if am_type and am_type != ticket_type:
        # AM type doesn't match ticket type, skip notification
        return
    
    # Check if AM wants to be notified for this event type
    preference_map = {
        "created": "notify_on_ticket_created",
        "assigned": "notify_on_ticket_assigned",
        "awaiting_vendor": "notify_on_ticket_awaiting_vendor",
        "awaiting_client": "notify_on_ticket_awaiting_client",
        "awaiting_am": "notify_on_ticket_awaiting_am",
        "resolved": "notify_on_ticket_resolved",
        "unresolved": "notify_on_ticket_unresolved",
    }
    
    preference_key = preference_map.get(event_type)
    if not preference_key:
        return
    
    # Check if AM has this preference enabled (default to True if not set)
    if not am_user.get(preference_key, True):
        return
    
    # Create notification for the AM
    notification_id = str(uuid.uuid4())
    ticket_number = ticket.get("ticket_number", "")
    customer_name = ticket.get("customer", "")
    
    # Get the assigned NOC user info for more descriptive messages
    # But for "created" events, we always want empty NOC (unassigned)
    assigned_to = ticket.get("assigned_to")
    noc_name = ""
    if assigned_to and event_type != "created":
        noc_user = await db.users.find_one({"id": assigned_to}, {"_id": 0, "username": 1, "name": 1})
        if noc_user:
            noc_name = noc_user.get("name") or noc_user.get("username") or "NOC"
    
    message_map = {
        "created": f"New ticket {ticket_number} for {customer_name} - Waiting for NOC assignment",
        "assigned": f"Ticket {ticket_number} for {customer_name} has been assigned to {noc_name}",
        "awaiting_vendor": f"Ticket {ticket_number} for {customer_name} is awaiting vendor response",
        "awaiting_client": f"Ticket {ticket_number} for {customer_name} is awaiting client response",
        "awaiting_am": f"Ticket {ticket_number} for {customer_name} requires your attention",
        "resolved": f"Ticket {ticket_number} for {customer_name} has been resolved by {noc_name}",
        "unresolved": f"Ticket {ticket_number} for {customer_name} has become unresolved",
    }
    
    doc = {
        "id": notification_id,
        "ticket_id": ticket.get("id"),
        "ticket_number": ticket_number,
        "ticket_type": ticket_type,
        "assigned_to": am_id,
        "assigned_noc": noc_name,
        "modified_by": None,
        "modified_by_username": None,
        "message": message_map.get(event_type, f"Ticket {ticket_number} updated"),
        "event_type": event_type,
        "customer_trunk": ticket.get("customer_trunk", ""),
        "destination": ticket.get("destination", ""),
        "issue_type": ticket.get("issue_type", ""),
        "status": "Unassigned" if event_type == "created" else ticket.get("status", ""),
        "priority": ticket.get("priority", ""),
        "read": False,
        "created_at": datetime.now(timezone.utc)
    }
    doc['created_at'] = doc['created_at'].isoformat()
    await db.ticket_notifications.insert_one(doc)


# ==================== NOC NOTIFICATIONS ====================


async def notify_noc_about_am_action(ticket, action_text, action_created_by, ticket_type="sms"):
    """Notify ALL NOC users when an AM adds an action to any ticket"""
    # Get NOC department to find users with that department_id
    noc_dept = await db.departments.find_one({"name": "NOC"}, {"_id": 0, "id": 1})
    
    if not noc_dept:
        return
    
    noc_dept_id = noc_dept.get("id")
    # Get all NOC users using department_id
    noc_users = await db.users.find(
        {"department_id": noc_dept_id},
        {"_id": 0, "id": 1, "username": 1, "name": 1, "notify_on_am_action": 1}
    ).to_list(100)
    
    if not noc_users:
        return
    
    # Get AM name
    am_user = await db.users.find_one({"id": action_created_by}, {"_id": 0, "username": 1, "name": 1})
    am_name = (am_user.get("name") or am_user.get("username") or "AM") if am_user else "AM"
    
    ticket_number = ticket.get("ticket_number", "")
    customer_name = ticket.get("customer", "")
    
    # Create notification for each NOC user
    for noc_user in noc_users:
        # Check if NOC wants to be notified for AM actions (default True)
        if not noc_user.get("notify_on_am_action", True):
            continue
        
        noc_id = noc_user.get("id")
        if not noc_id:
            continue
        
        notification_id = str(uuid.uuid4())
        
        doc = {
            "id": notification_id,
            "ticket_id": ticket.get("id"),
            "ticket_number": ticket_number,
            "ticket_type": ticket_type,
            "assigned_to": noc_id,
            "modified_by": action_created_by,
            "modified_by_username": am_name,
            "message": f"AM {am_name} added action to ticket {ticket_number} for {customer_name}: {action_text[:50]}..." if len(action_text) > 50 else f"AM {am_name} added action to ticket {ticket_number} for {customer_name}: {action_text}",
            "event_type": "am_action",
            "action_text": action_text,
            "customer_trunk": ticket.get("customer_trunk", ""),
            "destination": ticket.get("destination", ""),
            "issue_type": ticket.get("issue_type", ""),
            "status": ticket.get("status", ""),
            "priority": ticket.get("priority", ""),
            "read": False,
            "created_at": datetime.now(timezone.utc)
        }
        doc['created_at'] = doc['created_at'].isoformat()
        await db.ticket_notifications.insert_one(doc)


async def notify_noc_about_noc_modification(ticket, modified_by_user, modified_by_username, changes, ticket_type="sms"):
    """Notify ALL NOC users when a NOC modifies any ticket"""
    # Get NOC department to find users with that department_id
    noc_dept = await db.departments.find_one({"name": "NOC"}, {"_id": 0, "id": 1})
    
    if not noc_dept:
        return
    
    noc_dept_id = noc_dept.get("id")
    # Get all NOC users using department_id
    noc_users = await db.users.find(
        {"department_id": noc_dept_id},
        {"_id": 0, "id": 1, "username": 1, "name": 1, "notify_on_noc_ticket_modification": 1}
    ).to_list(100)
    
    if not noc_users:
        return
    
    ticket_number = ticket.get("ticket_number", "")
    customer_name = ticket.get("customer", "")
    
    # Build change description
    change_details = []
    for field, (old_val, new_val) in changes.items():
        change_details.append(f"{field}: {old_val} → {new_val}")
    
    change_str = "; ".join(change_details[:3])  # Limit to 3 changes for readability
    if len(change_details) > 3:
        change_str += f"... (+{len(change_details) - 3} more)"
    
    # Create notification for each NOC user
    for noc_user in noc_users:
        # Check if NOC wants to be notified for NOC modifications (default True)
        if not noc_user.get("notify_on_noc_ticket_modification", True):
            continue
        
        noc_id = noc_user.get("id")
        if not noc_id:
            continue
        
        # Don't notify if the modifier is the same as the NOC
        if modified_by_user == noc_id:
            continue
        
        notification_id = str(uuid.uuid4())
        
        doc = {
            "id": notification_id,
            "ticket_id": ticket.get("id"),
            "ticket_number": ticket_number,
            "ticket_type": ticket_type,
            "assigned_to": noc_id,
            "modified_by": modified_by_user,
            "modified_by_username": modified_by_username,
            "message": f"Ticket {ticket_number} for {customer_name} was modified by {modified_by_username}: {change_str}",
            "event_type": "noc_modification",
            "changes": changes,
            "customer_trunk": ticket.get("customer_trunk", ""),
            "destination": ticket.get("destination", ""),
            "issue_type": ticket.get("issue_type", ""),
            "status": ticket.get("status", ""),
            "priority": ticket.get("priority", ""),
            "read": False,
            "created_at": datetime.now(timezone.utc)
        }
        doc['created_at'] = doc['created_at'].isoformat()
        await db.ticket_notifications.insert_one(doc)


# ==================== ALERT NOTIFICATIONS ====================

class AlertNotification(BaseModel):
    """Model for alert notifications"""
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    alert_id: str
    alert_ticket_number: str
    customer: str
    customer_id: str
    ticket_type: str  # "sms" or "voice"
    notification_type: str  # "created", "commented", "alt_vendor", "resolved"
    message: str
    created_by: str
    assigned_to: Optional[str] = None  # AM user ID who should receive this notification
    # Additional fields for detailed notification display
    vendor_trunk: Optional[str] = None
    destination: Optional[str] = None
    issue_type: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    read: bool = False


async def create_alert_notification(
    alert_id: str,
    alert_ticket_number: str,
    customer: str,
    customer_id: str,
    ticket_type: str,
    notification_type: str,
    message: str,
    created_by: str,
    assigned_to: Optional[str] = None,
    vendor_trunk: Optional[str] = None,
    destination: Optional[str] = None,
    issue_type: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None
):
    """Create a notification for an alert event"""
    notification = AlertNotification(
        alert_id=alert_id,
        alert_ticket_number=alert_ticket_number,
        customer=customer,
        customer_id=customer_id,
        ticket_type=ticket_type,
        notification_type=notification_type,
        message=message,
        created_by=created_by,
        assigned_to=assigned_to,
        vendor_trunk=vendor_trunk,
        destination=destination,
        issue_type=issue_type,
        status=status,
        priority=priority
    )
    doc = notification.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.alert_notifications.insert_one(doc)


async def notify_users_about_alert(
    alert_id: str,
    alert_ticket_number: str,
    customer: str,
    customer_id: str,
    ticket_type: str,
    notification_type: str,
    created_by: str
):
    """Notify AMs and ALL NOC users about an alert event based on their preferences"""
    # Get the alert to include more details
    alert = await db.alerts.find_one(
        {"id": alert_id}, 
        {"_id": 0, "assigned_to": 1, "resolved": 1, "vendor_trunk": 1, "destination": 1, "issue_type": 1, "status": 1, "priority": 1}
    )
    
    # Extract additional fields for notification
    vendor_trunk = alert.get("vendor_trunk") if alert else None
    destination = alert.get("destination") if alert else None
    issue_type = alert.get("issue_type") if alert else None
    status = "resolved" if alert and alert.get("resolved") else (alert.get("status") if alert else None)
    priority = alert.get("priority") if alert else None
    
    # Get the assigned NOC user info
    noc_name = "NOC"
    if alert and alert.get("assigned_to"):
        noc_user = await db.users.find_one({"id": alert["assigned_to"]}, {"_id": 0, "username": 1, "name": 1})
        if noc_user:
            noc_name = noc_user.get("name") or noc_user.get("username") or "NOC"
    
    # Build message based on notification type
    messages = {
        "created": f"New alert {alert_ticket_number} for {customer} - Assigned to {noc_name}",
        "commented": f"New comment on alert {alert_ticket_number} for {customer} by {noc_name}",
        "alt_vendor": f"Alternative vendor trunk submitted for alert {alert_ticket_number} ({customer})",
        "resolved": f"Alert {alert_ticket_number} for {customer} has been resolved by {noc_name}"
    }
    
    message = messages.get(notification_type, f"Alert {alert_ticket_number} updated for {customer}")
    
    # Get the client/enterprise to find assigned AM
    client = await db.clients.find_one({"id": customer_id}, {"_id": 0, "assigned_am_id": 1})
    
    # If there's an assigned AM, create notification for them
    if client and client.get("assigned_am_id"):
        am_id = client["assigned_am_id"]
        
        # Don't notify the same user who created the action
        if created_by and am_id == created_by:
            pass  # Skip AM notification but still notify NOC
        else:
            # Get AM's notification preferences
            am_user = await db.users.find_one({"id": am_id}, {"_id": 0})
            if am_user:
                # Check if AM wants to be notified for this event type
                preference_key = f"notify_on_alert_{notification_type}"
                if am_user.get(preference_key, True):
                    await create_alert_notification(
                        alert_id=alert_id,
                        alert_ticket_number=alert_ticket_number,
                        customer=customer,
                        customer_id=customer_id,
                        ticket_type=ticket_type,
                        notification_type=notification_type,
                        message=message,
                        created_by=created_by,
                        assigned_to=am_id,
                        vendor_trunk=vendor_trunk,
                        destination=destination,
                        issue_type=issue_type,
                        status=status,
                        priority=priority
                    )
    
    # Notify ALL NOC users about the alert event (for commented, alt_vendor, created, and resolved types)
    if notification_type in ["commented", "alt_vendor", "created", "resolved"]:
        # Get NOC department to find users with that department_id
        noc_dept = await db.departments.find_one({"name": "NOC"}, {"_id": 0, "id": 1})
        
        if not noc_dept:
            print("NOC department not found, cannot send notifications")
        else:
            noc_dept_id = noc_dept.get("id")
            # Get all NOC users using department_id
            noc_users = await db.users.find(
                {"department_id": noc_dept_id},
                {"_id": 0, "id": 1, "username": 1, "name": 1}
            ).to_list(100)
        
        # Get creator info
        creator_user = await db.users.find_one({"id": created_by}, {"_id": 0, "username": 1, "name": 1})
        creator_name = (creator_user.get("name") or creator_user.get("username") or "User") if creator_user else "User"
        
        # Get user role to include in message
        dept = await get_user_department(current_user if (current_user := await db.users.find_one({"id": created_by})) else {})
        user_role = get_user_role_from_department(dept) if dept else ""
        creator_role = f" ({user_role})" if user_role else ""
        
        # Create notification for each NOC user
        for noc_user in noc_users:
            noc_id = noc_user.get("id")
            if not noc_id:
                continue
            
            # Don't notify the NOC user who created the alert
            if created_by and noc_id == created_by:
                continue
            
            # Build NOC-specific message
            noc_message = f"{creator_name}{creator_role} added comment to alert {alert_ticket_number} for {customer}"
            if notification_type == "alt_vendor":
                noc_message = f"{creator_name}{creator_role} submitted alternative vendor trunk for alert {alert_ticket_number} ({customer})"
            elif notification_type == "created":
                noc_message = f"New alert {alert_ticket_number} created for {customer}"
            elif notification_type == "resolved":
                noc_message = f"Alert {alert_ticket_number} for {customer} has been resolved"
            
            await create_alert_notification(
                alert_id=alert_id,
                alert_ticket_number=alert_ticket_number,
                customer=customer,
                customer_id=customer_id,
                ticket_type=ticket_type,
                notification_type=notification_type,
                message=noc_message,
                created_by=created_by,
                assigned_to=noc_id,
                vendor_trunk=vendor_trunk,
                destination=destination,
                issue_type=issue_type,
                status=status,
                priority=priority
            )


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
    ani: Optional[str] = None  # ANI/Origination for Voice tickets
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
    ani: Optional[str] = None  # ANI/Origination for Voice tickets
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
    ani: Optional[str] = None  # ANI/Origination for Voice tickets
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
            # Calculate role from department permissions
            if dept.get("can_edit_users"):
                user["role"] = "admin"
            elif dept.get("can_create_tickets") and not dept.get("can_edit_enterprises"):
                user["role"] = "am"
            elif dept.get("can_edit_tickets"):
                user["role"] = "noc"
            else:
                user["role"] = "unknown"
    
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

@api_router.post("/auth/login")
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
    
    # Check if user is active
    if user.get("is_active") is False:
        raise HTTPException(status_code=403, detail="User account is inactive. Please contact admin.")
    
    # Check if 2FA is enabled
    if user.get("two_factor_enabled"):
        method = user.get("two_factor_method")
        
        if method == "email":
            # Generate and send email code
            code = "".join([str(secrets.randbelow(10)) for _ in range(6)])
            
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {
                    "two_factor_code": code,
                    "two_factor_code_expires": datetime.now(timezone.utc) + timedelta(minutes=5)
                }}
            )
            
            # Send email
            try:
                await send_email(
                    to_email=user.get("email"),
                    subject="Your WiiTelecom Login Verification Code",
                    body=f"Your login verification code is: {code}\n\nThis code expires in 5 minutes."
                )
            except Exception as e:
                logger.error(f"Failed to send 2FA email: {e}")
            
            # Return partial login - needs 2FA
            return TwoFactorResponse(
                two_factor_required=True,
                user_id=user["id"],
                method="email",
                message="Verification code sent to your email"
            )
        
        elif method == "totp":
            # Return partial login - needs TOTP
            return TwoFactorResponse(
                two_factor_required=True,
                user_id=user["id"],
                method="totp",
                message="Please enter your 2FA code"
            )
    
    # No 2FA - complete login normally
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
    
    # Create audit log for login
    await create_audit_log(
        user_id=user["id"],
        username=user.get("username", "unknown"),
        action="login",
        entity_type="session",
        entity_id=session_id,
        entity_name=f"User logged in"
    )
    
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

@api_router.post("/auth/password-reset/request")
async def request_password_reset(reset_data: dict):
    """Request password reset - sends verification code via user's 2FA method"""
    identifier = reset_data.get("identifier")
    if not identifier:
        raise HTTPException(status_code=400, detail="Identifier is required")
    
    # Find user by username or email
    user = await db.users.find_one({
        "$or": [
            {"username": identifier},
            {"email": identifier}
        ]
    })
    
    if not user:
        # Don't reveal if user exists
        return {"message": "If the user exists, a verification code has been sent"}
    
    # Check if user has 2FA enabled
    if not user.get("two_factor_enabled"):
        raise HTTPException(status_code=400, detail="User does not have 2FA enabled. Please contact admin.")
    
    method = user.get("two_factor_method")
    
    if method == "email":
        # Generate code and send to email
        code = "".join([str(secrets.randbelow(10)) for _ in range(6)])
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {
                "password_reset_code": code,
                "password_reset_expires": datetime.now(timezone.utc) + timedelta(minutes=10)
            }}
        )
        
        try:
            await send_email(
                to_email=user.get("email"),
                subject="Your WiiTelecom Password Reset Code",
                body=f"Your password reset code is: {code}\n\nThis code expires in 10 minutes."
            )
        except:
            pass  # Don't fail if email fails
        
        return {"method": "email", "message": "Verification code sent to your email"}
    
    elif method == "totp":
        # For TOTP, user will enter their current TOTP code as verification
        # No need to send anything - just return the method info
        return {"method": "totp", "message": "Enter your Google Authenticator code"}
    
    raise HTTPException(status_code=400, detail="Invalid 2FA method")

@api_router.post("/auth/password-reset/verify")
async def verify_password_reset(verify_data: dict):
    """Verify password reset code"""
    identifier = verify_data.get("identifier")
    code = verify_data.get("code")
    
    if not identifier or not code:
        raise HTTPException(status_code=400, detail="Identifier and code are required")
    
    # Find user
    user = await db.users.find_one({
        "$or": [
            {"username": identifier},
            {"email": identifier}
        ]
    })
    
    if not user:
        raise HTTPException(status_code=400, detail="Invalid code")
    
    method = user.get("two_factor_method")
    
    if method == "totp":
        # For TOTP, verify using live TOTP code
        secret = user.get("two_factor_secret")
        if not secret:
            raise HTTPException(status_code=400, detail="2FA not properly configured")
        
        totp = pyotp.TOTP(secret)
        if not totp.verify(code, valid_window=1):
            raise HTTPException(status_code=400, detail="Invalid verification code")
    
    elif method == "email":
        # For email, verify using stored code
        stored_code = user.get("password_reset_code")
        expires = user.get("password_reset_expires")
        
        if not stored_code or stored_code != code:
            raise HTTPException(status_code=400, detail="Invalid verification code")
        
        if expires and datetime.now(timezone.utc) > expires:
            raise HTTPException(status_code=400, detail="Verification code expired")
    
    return {"message": "Code verified successfully"}

@api_router.post("/auth/password-reset/confirm")
async def confirm_password_reset(reset_data: dict):
    """Confirm password reset with new password"""
    identifier = reset_data.get("identifier")
    code = reset_data.get("code")
    new_password = reset_data.get("new_password")
    
    if not identifier or not code or not new_password:
        raise HTTPException(status_code=400, detail="All fields are required")
    
    # Find user
    user = await db.users.find_one({
        "$or": [
            {"username": identifier},
            {"email": identifier}
        ]
    })
    
    if not user:
        raise HTTPException(status_code=400, detail="Invalid request")
    
    method = user.get("two_factor_method")
    
    if method == "totp":
        # For TOTP, verify the current TOTP code
        secret = user.get("two_factor_secret")
        if not secret:
            raise HTTPException(status_code=400, detail="2FA not properly configured")
        
        totp = pyotp.TOTP(secret)
        if not totp.verify(code, valid_window=1):
            raise HTTPException(status_code=400, detail="Invalid verification code")
    
    elif method == "email":
        # For email, verify the code we sent
        stored_code = user.get("password_reset_code")
        expires = user.get("password_reset_expires")
        
        if not stored_code or stored_code != code:
            raise HTTPException(status_code=400, detail="Invalid verification code")
        
        if expires and datetime.now(timezone.utc) > expires:
            raise HTTPException(status_code=400, detail="Verification code expired")
    
    # Update password
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    password_hash = pwd_context.hash(new_password)
    
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "password_hash": password_hash
        }, "$unset": {
            "password_reset_code": "",
            "password_reset_expires": ""
        }}
    )
    
    return {"message": "Password reset successfully"}

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
        # Create audit log for logout
        await create_audit_log(
            user_id=current_user.get("id"),
            username=current_user.get("username", "unknown"),
            action="logout",
            entity_type="session",
            entity_id=current_session_id,
            entity_name=f"User logged out"
        )
        # Clear the current_session_id from user document
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$unset": {"current_session_id": ""}}
        )
    
    # Broadcast to all connected clients about user logout
    await manager.broadcast_to_all({
        "type": "user_logout",
        "data": {"user_id": current_user.get("id"), "username": current_user.get("username")},
        "user_id": current_user.get("id"),
        "username": current_user.get("username")
    })
    
    return {"message": "Logged out successfully"}

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    if isinstance(current_user['created_at'], str):
        current_user['created_at'] = datetime.fromisoformat(current_user['created_at'])
    return UserResponse(**current_user)

# ==================== 2FA AUTHENTICATION ====================

@api_router.post("/auth/2fa/setup")
async def setup_2fa(setup_data: TwoFactorSetup, current_user: dict = Depends(get_current_user)):
    """Setup 2FA for the current user"""
    print(f"[DEBUG] setup_2fa called, current_user: {current_user.get('id')}, username: {current_user.get('username')}, method: {setup_data.method}")
    method = setup_data.method
    
    if method not in ["totp", "email"]:
        raise HTTPException(status_code=400, detail="Invalid 2FA method. Use 'totp' or 'email'")
    
    if method == "totp":
        # Generate TOTP secret
        secret = pyotp.random_base32()
        print(f"[DEBUG] Generating TOTP secret for user {current_user['id']}: {secret}")
        
        # Save secret to user (pending verification) - clear any previous email settings
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$set": {
                "two_factor_secret": secret,
                "two_factor_pending": True,
                "two_factor_method": "totp",
                "two_factor_code": None,
                "two_factor_code_expires": None
            }}
        )
        
        # Generate QR code URL for Google Authenticator
        totp = pyotp.TOTP(secret)
        provisioning_uri = totp.provisioning_uri(
            name=current_user["username"],
            issuer_name="WiiTelecom"
        )
        print(f"[DEBUG] Generated provisioning_uri: {provisioning_uri}")
        
        return {
            "secret": secret,
            "provisioning_uri": provisioning_uri,
            "message": "Scan the QR code with Google Authenticator, then verify with a code"
        }
    
    elif method == "email":
        # Send verification code to user's email
        user = await db.users.find_one({"id": current_user["id"]})
        email = user.get("email")
        
        if not email:
            raise HTTPException(status_code=400, detail="No email address on file")
        
        # Generate 6-digit code
        code = "".join([str(secrets.randbelow(10)) for _ in range(6)])
        
        # Save code with expiry (5 minutes)
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$set": {
                "two_factor_code": code,
                "two_factor_code_expires": datetime.now(timezone.utc) + timedelta(minutes=5),
                "two_factor_pending": True
            }}
        )
        
        # Send email
        try:
            await send_email(
                to_email=email,
                subject="Your WiiTelecom 2FA Verification Code",
                body=f"Your 2FA verification code is: {code}\n\nThis code expires in 5 minutes."
            )
        except Exception as e:
            logger.error(f"Failed to send 2FA email: {e}")
            raise HTTPException(status_code=500, detail="Failed to send verification email")
        
        return {"message": "Verification code sent to your email"}

@api_router.post("/auth/2fa/verify")
async def verify_2fa(verify_data: TwoFactorVerify, current_user: dict = Depends(get_current_user)):
    """Verify 2FA setup with a code"""
    print(f"[DEBUG] verify_2fa called, current_user: {current_user.get('id')}, username: {current_user.get('username')}")
    user = await db.users.find_one({"id": current_user["id"]})
    print(f"[DEBUG] User from DB: {user}")
    print(f"[DEBUG] two_factor_pending: {user.get('two_factor_pending')}, two_factor_method: {user.get('two_factor_method')}")
    
    if not user.get("two_factor_pending"):
        raise HTTPException(status_code=400, detail="No pending 2FA setup")
    
    method = user.get("two_factor_method")
    
    if method == "totp":
        secret = user.get("two_factor_secret")
        if not secret:
            print(f"[ERROR] No TOTP secret found for user {current_user['id']}")
            raise HTTPException(status_code=400, detail="No TOTP secret found")
        
        print(f"[DEBUG] User: {current_user['id']}, Secret from DB: {secret}")
        print(f"[DEBUG] User entered code: {verify_data.code}")
        
        totp = pyotp.TOTP(secret)
        print(f"[DEBUG] Current valid TOTP code: {totp.now()}")
        
        # Allow for 1 window (30 seconds) of time drift
        is_valid = totp.verify(verify_data.code, valid_window=1)
        print(f"[DEBUG] TOTP verification result: {is_valid}")
        
        if not is_valid:
            raise HTTPException(status_code=400, detail="Invalid verification code")
    
    elif method == "email":
        code = user.get("two_factor_code")
        expires = user.get("two_factor_code_expires")
        
        if not code or code != verify_data.code:
            raise HTTPException(status_code=400, detail="Invalid verification code")
        
        if expires and datetime.now(timezone.utc) > expires:
            raise HTTPException(status_code=400, detail="Verification code expired")
    
    # Enable 2FA (keep the secret for future authentication)
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {
            "two_factor_enabled": True,
            "two_factor_method": method,
            "two_factor_pending": False
        }}
    )
    # Remove temporary code fields but keep the secret
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$unset": {"two_factor_code": "", "two_factor_code_expires": ""}}
    )
    
    return {"message": "2FA enabled successfully"}

@api_router.post("/auth/2fa/disable")
async def disable_2fa(current_user: dict = Depends(get_current_user)):
    """Disable 2FA for the current user"""
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {
            "two_factor_enabled": False,
            "two_factor_method": None
        }}
    )
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$unset": {
            "two_factor_secret": "",
            "two_factor_code": "",
            "two_factor_code_expires": "",
            "two_factor_pending": ""
        }}
    )
    
    return {"message": "2FA disabled successfully"}

@api_router.post("/auth/2fa/login")
async def verify_2fa_login(login_data: TwoFactorLogin):
    """Complete login with 2FA code"""
    user = await db.users.find_one({"id": login_data.user_id})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if user is active
    if user.get("is_active") is False:
        raise HTTPException(status_code=403, detail="User account is inactive. Please contact admin.")
    
    method = user.get("two_factor_method")
    
    if method == "totp":
        # For TOTP, we need to check both new and previous code (for time drift tolerance)
        secret = user.get("two_factor_secret")
        if not secret:
            raise HTTPException(status_code=400, detail="2FA not properly setup")
        
        totp = pyotp.TOTP(secret)
        if not totp.verify(login_data.code, valid_window=1):
            raise HTTPException(status_code=400, detail="Invalid 2FA code")
    
    elif method == "email":
        code = user.get("two_factor_code")
        expires = user.get("two_factor_code_expires")
        
        if not code or code != login_data.code:
            raise HTTPException(status_code=400, detail="Invalid 2FA code")
        
        if expires and datetime.now(timezone.utc) > expires:
            raise HTTPException(status_code=400, detail="2FA code expired")
    
    # Clear the 2FA code after successful verification
    await db.users.update_one(
        {"id": login_data.user_id},
        {"$unset": {"two_factor_code": "", "two_factor_code_expires": ""}}
    )
    
    # Create session and return token
    session_id = str(uuid.uuid4())
    await db.user_sessions.insert_one({
        "id": session_id,
        "user_id": user["id"],
        "username": user["username"],
        "login_time": datetime.now(timezone.utc),
        "logout_time": None,
        "created_at": datetime.now(timezone.utc)
    })
    
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "last_active": datetime.now(timezone.utc),
            "current_session_id": session_id
        }}
    )
    
    # Create audit log for 2FA login
    await create_audit_log(
        user_id=user["id"],
        username=user.get("username", "unknown"),
        action="login",
        entity_type="session",
        entity_id=session_id,
        entity_name=f"User logged in (2FA)"
    )
    
    if isinstance(user.get('created_at'), str):
        user['created_at'] = datetime.fromisoformat(user['created_at'])
    
    access_token = create_access_token(data={"sub": user["id"]})
    user_response = UserResponse(**user)
    
    return Token(access_token=access_token, token_type="bearer", user=user_response)


class NotificationPreferencesUpdate(BaseModel):
    """Model for updating notification preferences"""
    notify_on_ticket_created: Optional[bool] = None
    notify_on_ticket_assigned: Optional[bool] = None
    notify_on_ticket_awaiting_vendor: Optional[bool] = None
    notify_on_ticket_awaiting_client: Optional[bool] = None
    notify_on_ticket_awaiting_am: Optional[bool] = None
    notify_on_ticket_resolved: Optional[bool] = None
    notify_on_ticket_unresolved: Optional[bool] = None
    # Alert notifications
    notify_on_alert_created: Optional[bool] = None
    notify_on_alert_commented: Optional[bool] = None
    notify_on_alert_alt_vendor: Optional[bool] = None
    notify_on_alert_resolved: Optional[bool] = None
    # NOC notifications
    notify_on_am_action: Optional[bool] = None
    notify_on_noc_ticket_modification: Optional[bool] = None


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
        # Alert notifications
        "notify_on_alert_created": current_user.get("notify_on_alert_created", True),
        "notify_on_alert_commented": current_user.get("notify_on_alert_commented", True),
        "notify_on_alert_alt_vendor": current_user.get("notify_on_alert_alt_vendor", True),
        "notify_on_alert_resolved": current_user.get("notify_on_alert_resolved", True),
        # NOC notifications
        "notify_on_am_action": current_user.get("notify_on_am_action", True),
        "notify_on_noc_ticket_modification": current_user.get("notify_on_noc_ticket_modification", True),
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


# ==================== ADMIN NOTIFICATION MANAGEMENT ====================


@api_router.get("/users/notification-preferences")
async def get_all_users_notification_preferences(current_user: dict = Depends(get_current_user)):
    """Get all users' notification preferences - admin only"""
    user_role = get_user_role_from_department(current_user.get("department"))
    if user_role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can access this resource")
    
    # Get all users with their departments
    all_users_cursor = await db.users.find({}, {"password_hash": 0}).to_list(1000)
    
    # Separate AM and NOC users based on their actual department/role
    am_users = []
    noc_users = []
    
    for user in all_users_cursor:
        # Get the user's department
        dept = await get_user_department(user)
        user_role = get_user_role_from_department(dept) if dept else "unknown"
        
        if user_role == "am":
            am_users.append(user)
        elif user_role == "noc":
            noc_users.append(user)
    
    result = []
    for user in am_users:
        result.append({
            "id": user.get("id"),
            "username": user.get("username"),
            "name": user.get("name"),
            "am_type": user.get("am_type"),
            "role": "am",
            "notify_on_ticket_created": user.get("notify_on_ticket_created", True),
            "notify_on_ticket_assigned": user.get("notify_on_ticket_assigned", True),
            "notify_on_ticket_awaiting_vendor": user.get("notify_on_ticket_awaiting_vendor", True),
            "notify_on_ticket_awaiting_client": user.get("notify_on_ticket_awaiting_client", True),
            "notify_on_ticket_awaiting_am": user.get("notify_on_ticket_awaiting_am", True),
            "notify_on_ticket_resolved": user.get("notify_on_ticket_resolved", True),
            "notify_on_ticket_unresolved": user.get("notify_on_ticket_unresolved", True),
            "notify_on_alert_created": user.get("notify_on_alert_created", True),
            "notify_on_alert_commented": user.get("notify_on_alert_commented", True),
            "notify_on_alert_alt_vendor": user.get("notify_on_alert_alt_vendor", True),
            "notify_on_alert_resolved": user.get("notify_on_alert_resolved", True),
            # NOC notifications
            "notify_on_am_action": user.get("notify_on_am_action", True),
            "notify_on_noc_ticket_modification": user.get("notify_on_noc_ticket_modification", True),
        })
    
    # Add NOC users to result
    for user in noc_users:
        result.append({
            "id": user.get("id"),
            "username": user.get("username"),
            "name": user.get("name"),
            "am_type": None,
            "role": "noc",
            "notify_on_ticket_created": user.get("notify_on_ticket_created", True),
            "notify_on_ticket_assigned": user.get("notify_on_ticket_assigned", True),
            "notify_on_ticket_awaiting_vendor": user.get("notify_on_ticket_awaiting_vendor", True),
            "notify_on_ticket_awaiting_client": user.get("notify_on_ticket_awaiting_client", True),
            "notify_on_ticket_awaiting_am": user.get("notify_on_ticket_awaiting_am", True),
            "notify_on_ticket_resolved": user.get("notify_on_ticket_resolved", True),
            "notify_on_ticket_unresolved": user.get("notify_on_ticket_unresolved", True),
            "notify_on_alert_created": user.get("notify_on_alert_created", True),
            "notify_on_alert_commented": user.get("notify_on_alert_commented", True),
            "notify_on_alert_alt_vendor": user.get("notify_on_alert_alt_vendor", True),
            "notify_on_alert_resolved": user.get("notify_on_alert_resolved", True),
            # NOC notifications
            "notify_on_am_action": user.get("notify_on_am_action", True),
            "notify_on_noc_ticket_modification": user.get("notify_on_noc_ticket_modification", True),
        })
    
    return result


@api_router.put("/users/{user_id}/notification-preferences")
async def update_user_notification_preferences(user_id: str, prefs: NotificationPreferencesUpdate, current_user: dict = Depends(get_current_user)):
    """Update a specific user's notification preferences - admin only"""
    user_role = get_user_role_from_department(current_user.get("department"))
    if user_role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can access this resource")
    
    # Check if user exists
    target_user = await db.users.find_one({"id": user_id})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_dict = {k: v for k, v in prefs.model_dump().items() if v is not None}
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": update_dict}
    )
    
    return {"message": f"Notification preferences updated for user {target_user.get('username')}"}


# ==================== ALERT NOTIFICATION ENDPOINTS ====================

@api_router.get("/users/me/alert-notifications")
async def get_alert_notifications(current_user: dict = Depends(get_current_user)):
    """Get alert notifications for the current user based on role and department"""
    try:
        current_user_id = current_user.get("id")
        
        # Get alert notifications for this user - return ALL (read and unread)
        # Frontend handles read status filtering via readNotificationIds in localStorage
        notifications = await db.alert_notifications.find(
            {"assigned_to": current_user_id},
            {"_id": 0}
        ).sort("created_at", -1).limit(20).to_list(20)
        
        return notifications
    except Exception as e:
        print(f"Error fetching alert notifications: {str(e)}")
        return []


@api_router.get("/users/me/request-notifications")
async def get_request_notifications(current_user: dict = Depends(get_current_user)):
    """Get request update notifications for the current user (AM)"""
    try:
        current_user_id = current_user.get("id")
        
        # Get request notifications for this user
        notifications = await db.notifications.find(
            {"assigned_to": current_user_id, "type": "request_update"},
            {"_id": 0}
        ).sort("created_at", -1).limit(20).to_list(20)
        
        # Convert datetime fields to ISO format strings for JSON serialization
        for notification in notifications:
            if "created_at" in notification:
                if hasattr(notification["created_at"], "isoformat"):
                    notification["created_at"] = notification["created_at"].isoformat()
                elif notification["created_at"] is not None:
                    pass
        
        return notifications
    except Exception as e:
        print(f"Error fetching request notifications: {str(e)}")
        return []


@api_router.post("/users/me/alert-notifications/{notification_id}/read")
async def mark_alert_notification_as_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    """Mark an alert notification as read"""
    current_user_id = current_user.get("id")
    
    result = await db.alert_notifications.find_one_and_update(
        {"id": notification_id, "assigned_to": current_user_id},
        {"$set": {"read": True}},
        return_document=True
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    return {"message": "Notification marked as read"}


@api_router.post("/users/me/alert-notifications/read-all")
async def mark_all_alert_notifications_as_read(current_user: dict = Depends(get_current_user)):
    """Mark all alert notifications as read"""
    result = await db.alert_notifications.update_many(
        {"read": False},
        {"$set": {"read": True}}
    )
    
    return {"message": f"Marked {result.modified_count} notifications as read"}


@api_router.post("/users/me/request-notifications/{notification_id}/read")
async def mark_request_notification_as_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    """Mark a request notification as read"""
    current_user_id = current_user.get("id")
    
    result = await db.notifications.find_one_and_update(
        {"id": notification_id, "assigned_to": current_user_id},
        {"$set": {"read": True}},
        return_document=True
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    return {"message": "Notification marked as read"}


@api_router.post("/users/me/request-notifications/read-all")
async def mark_all_request_notifications_as_read(current_user: dict = Depends(get_current_user)):
    """Mark all request notifications as read"""
    current_user_id = current_user.get("id")
    
    result = await db.notifications.update_many(
        {"assigned_to": current_user_id, "type": "request_update", "read": False},
        {"$set": {"read": True}}
    )
    
    return {"message": f"Marked {result.modified_count} notifications as read"}

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
    
    # Hash password if provided
    if "password" in update_dict and update_dict["password"]:
        from passlib.context import CryptContext
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        update_dict["password_hash"] = pwd_context.hash(update_dict.pop("password"))
    
    # Handle 2FA setup when admin enables it
    if update_dict.get("two_factor_enabled") and update_dict.get("two_factor_method") == "totp":
        # Generate TOTP secret
        secret = pyotp.random_base32()
        update_dict["two_factor_secret"] = secret
        # Mark as pending so user must verify before 2FA is active
        update_dict["two_factor_pending"] = True
    
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

@api_router.patch("/users/{user_id}/active-status")
async def toggle_user_active_status(user_id: str, request: dict, current_admin: dict = Depends(get_current_admin)):
    """Toggle user active status - admin only"""
    active_status = request.get("is_active")
    
    if active_status is None:
        raise HTTPException(status_code=400, detail="is_active field is required")
    
    # Get user before update for audit
    user_before = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    
    if not user_before:
        raise HTTPException(status_code=404, detail="User not found")
    
    result = await db.users.find_one_and_update(
        {"id": user_id},
        {"$set": {"is_active": active_status}},
        return_document=True,
        projection={"_id": 0, "password_hash": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Create audit log for status change
    await create_audit_log(
        user_id=current_admin["id"],
        username=current_admin.get("username", "admin"),
        action="toggle_active",
        entity_type="user",
        entity_id=user_id,
        entity_name=user_before.get("username", user_id),
        changes={"before": {"is_active": user_before.get("is_active", True)}, "after": {"is_active": active_status}}
    )
    
    return {"message": f"User {'activated' if active_status else 'deactivated'} successfully", "is_active": active_status}

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
            "can_create_tickets": True,
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
            "can_create_tickets": True,
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
        else:
            # Update existing department with correct permissions
            await db.departments.update_one(
                {"id": dept["id"]},
                {"$set": dept}
            )

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

@api_router.post("/clients/import")
async def import_clients(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Import enterprises from a CSV file.
    Required columns: name, enterprise_type, tier, contact_email, noc_emails
    Optional columns: contact_person, contact_phone, notes, customer_trunks, vendor_trunks
    """
    # Check if user has permission to create clients
    dept = await get_user_department(current_user)
    role = get_user_role_from_department(dept)
    if role not in ["admin", "noc"]:
        raise HTTPException(status_code=403, detail="You don't have permission to import enterprises")
    
    # Validate file type
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")
    
    try:
        # Read and parse CSV
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        # Validate required columns
        required_columns = ['name', 'enterprise_type', 'tier', 'contact_email', 'noc_emails']
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            raise HTTPException(
                status_code=400,
                detail=f"Missing required columns: {', '.join(missing_columns)}"
            )
        
        imported_count = 0
        errors = []
        
        for index, row in df.iterrows():
            try:
                # Validate required fields
                if pd.isna(row['name']) or pd.isna(row['enterprise_type']) or pd.isna(row['tier']):
                    errors.append(f"Row {index + 2}: Missing required fields (name, enterprise_type, tier)")
                    continue
                    
                if pd.isna(row['contact_email']) or pd.isna(row['noc_emails']):
                    errors.append(f"Row {index + 2}: Missing required fields (contact_email, noc_emails)")
                    continue
                
                # Validate enterprise_type
                if row['enterprise_type'] not in ['sms', 'voice']:
                    errors.append(f"Row {index + 2}: enterprise_type must be 'sms' or 'voice'")
                    continue
                
                # Validate tier
                valid_tiers = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4']
                if row['tier'] not in valid_tiers:
                    errors.append(f"Row {index + 2}: tier must be one of {valid_tiers}")
                    continue
                
                # Parse trunks (semicolon-separated)
                customer_trunks = []
                if 'customer_trunks' in df.columns and not pd.isna(row.get('customer_trunks')):
                    customer_trunks = [t.strip() for t in str(row['customer_trunks']).split(';') if t.strip()]
                
                vendor_trunks = []
                if 'vendor_trunks' in df.columns and not pd.isna(row.get('vendor_trunks')):
                    vendor_trunks = [t.strip() for t in str(row['vendor_trunks']).split(';') if t.strip()]
                
                # Create client document
                client_doc = {
                    "id": str(uuid.uuid4()),
                    "name": str(row['name']).strip(),
                    "enterprise_type": str(row['enterprise_type']).strip().lower(),
                    "tier": str(row['tier']).strip(),
                    "contact_email": str(row['contact_email']).strip(),
                    "contact_person": str(row.get('contact_person', '')).strip() if not pd.isna(row.get('contact_person')) else None,
                    "contact_phone": str(row.get('contact_phone', '')).strip() if not pd.isna(row.get('contact_phone')) else None,
                    "noc_emails": str(row['noc_emails']).strip(),
                    "notes": str(row.get('notes', '')).strip() if not pd.isna(row.get('notes')) else None,
                    "customer_trunks": customer_trunks,
                    "vendor_trunks": vendor_trunks,
                    "assigned_am_id": None,
                    "created_at": datetime.now(timezone.utc)
                }
                
                # Insert into database
                await db.clients.insert_one(client_doc)
                imported_count += 1
                
                # Create audit log for imported enterprise
                await create_audit_log(
                    user_id=current_user.get("id"),
                    username=current_user.get("username", "user"),
                    action="create",
                    entity_type="client",
                    entity_id=client_doc["id"],
                    entity_name=client_doc["name"],
                    changes={"imported": True, "enterprise_type": client_doc["enterprise_type"], "tier": client_doc["tier"]}
                )
                
            except Exception as e:
                errors.append(f"Row {index + 2}: {str(e)}")
        
        if errors and imported_count == 0:
            raise HTTPException(
                status_code=400,
                detail=f"Import failed. Errors: {'; '.join(errors[:5])}"
            )
        
        return {
            "imported_count": imported_count,
            "message": f"Successfully imported {imported_count} enterprises",
            "errors": errors if errors else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")

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

# ==================== REFERENCE LIST ROUTES ====================

TRAFFIC_TYPES = [
    "OTP",
    "Promo",
    "Casino",
    "Clean Marketing",
    "Banking",
    "Other"
]

VOICE_TRAFFIC_TYPES = [
    "CLI",
    "NCLI",
    "CC",
    "TDM",
    "Other"
]

@api_router.get("/references/trunks/{section}")
async def get_reference_trunks(section: str, current_user: dict = Depends(get_current_user)):
    """Get all vendor trunks for a specific section (sms or voice)"""
    # Validate section
    if section not in ["sms", "voice"]:
        raise HTTPException(status_code=400, detail="Section must be 'sms' or 'voice'")
    
    # Check department type access
    dept = await get_user_department(current_user)
    ticket_type = get_user_ticket_type(dept)
    if ticket_type != "all" and ticket_type != section:
        raise HTTPException(status_code=403, detail=f"You don't have access to {section} references")
    
    # Get all enterprises of this type (no AM restriction - all can see)
    query = {"enterprise_type": section}
    
    clients = await db.clients.find(query, {"_id": 0, "vendor_trunks": 1}).to_list(1000)
    
    vendor_trunks = []
    for client in clients:
        if client.get("vendor_trunks"):
            for trunk in client["vendor_trunks"]:
                if trunk not in vendor_trunks:
                    vendor_trunks.append(trunk)
    
    return {
        "vendor_trunks": vendor_trunks,
        "traffic_types": VOICE_TRAFFIC_TYPES if section == "voice" else TRAFFIC_TYPES
    }


@api_router.get("/references/{section}")
async def get_reference_lists(section: str, current_user: dict = Depends(get_current_user)):
    """Get all reference lists for a specific section (sms or voice)"""
    # Validate section
    if section not in ["sms", "voice"]:
        raise HTTPException(status_code=400, detail="Section must be 'sms' or 'voice'")
    
    # Check department type access
    dept = await get_user_department(current_user)
    ticket_type = get_user_ticket_type(dept)
    if ticket_type != "all" and ticket_type != section:
        raise HTTPException(status_code=403, detail=f"You don't have access to {section} references")
    
    # Get all reference lists for this section
    print(f"Fetching reference lists for section: {section}")
    
    # First, migrate any lists that don't have an id field
    async for doc in db.reference_lists.find({"section": section, "id": {"$exists": False}}):
        # Add id field using the _id or generate a new one
        import uuid
        new_id = str(uuid.uuid4())
        await db.reference_lists.update_one(
            {"_id": doc["_id"]},
            {"$set": {"id": new_id}}
        )
        print(f"Migrated list {doc['_id']} with new id: {new_id}")
    
    # Now get all lists
    lists = await db.reference_lists.find(
        {"section": section},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    print(f"Found lists: {lists}")
    
    return lists


@api_router.post("/references", response_model=ReferenceList)
async def create_reference_list(list_data: ReferenceListCreate, current_user: dict = Depends(get_current_user)):
    """Create a new reference list"""
    print(f"Received request to create reference list: {list_data}")
    print(f"User: {current_user}")
    # Validate section
    if list_data.section not in ["sms", "voice"]:
        raise HTTPException(status_code=400, detail="Section must be 'sms' or 'voice'")
    
    # Check department type access
    dept = await get_user_department(current_user)
    ticket_type = get_user_ticket_type(dept)
    if ticket_type != "all" and ticket_type != list_data.section:
        raise HTTPException(status_code=403, detail=f"You don't have access to {list_data.section} references")
    
    # Create the reference list
    reference_list = ReferenceList(
        name=list_data.name,
        section=list_data.section,
        destination=list_data.destination,
        traffic_type=list_data.traffic_type,
        vendor_entries=list_data.vendor_entries,
        created_by=current_user.get("username", "unknown")
    )
    
    # Include the id in the insert
    list_dict = reference_list.model_dump()
    print(f"Creating reference list with id: {list_dict.get('id')}")
    list_dict["id"] = reference_list.id
    if "_id" in list_dict:
        del list_dict["_id"]
    
    await db.reference_lists.insert_one(list_dict)
    
    # Create audit log for reference list creation
    await create_audit_log(
        user_id=current_user.get("id"),
        username=current_user.get("username", "Unknown"),
        action="create",
        entity_type="reference_list",
        entity_id=list_dict.get("id"),
        entity_name=f"{list_data.name} ({list_data.section})",
        changes=list_dict
    )
    
    print(f"Inserted list: {list_dict}")
    
    # Return the created list from MongoDB to ensure id is properly returned
    created = await db.reference_lists.find_one({"id": list_dict["id"]}, {"_id": 0})
    
    # Broadcast to all connected clients
    await manager.broadcast_to_all({
        "type": "reference_created",
        "data": created,
        "user_id": current_user.get("id"),
        "username": current_user.get("username")
    })
    
    return created


@api_router.put("/references/{list_id}", response_model=ReferenceList)
async def update_reference_list(list_id: str, list_data: ReferenceListUpdate, current_user: dict = Depends(get_current_user)):
    """Update an existing reference list"""
    print(f"Attempting to update list with id: {list_id}")
    
    # Find existing list - check both id and _id
    from bson import ObjectId
    try:
        existing = await db.reference_lists.find_one({"id": list_id})
        if not existing:
            existing = await db.reference_lists.find_one({"_id": ObjectId(list_id)})
    except:
        existing = await db.reference_lists.find_one({"id": list_id})
    
    # If still not found, try to find by name+destination+section (fallback for legacy data)
    if not existing and '-' in list_id:
        parts = list_id.rsplit('-', 2)
        if len(parts) >= 3:
            section = parts[-1]
            destination = parts[-2]
            name = '-'.join(parts[:-2])
            existing = await db.reference_lists.find_one({
                "name": name,
                "destination": destination,
                "section": section
            })
            if existing and "id" not in existing:
                import uuid
                new_id = str(uuid.uuid4())
                await db.reference_lists.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {"id": new_id}}
                )
                existing["id"] = new_id
    
    print(f"Found list: {existing}")
    
    if not existing:
        raise HTTPException(status_code=404, detail=f"Reference list not found: {list_id}")
    
    # Check department type access
    dept = await get_user_department(current_user)
    ticket_type = get_user_ticket_type(dept)
    if ticket_type != "all" and ticket_type != existing.get("section"):
        raise HTTPException(status_code=403, detail=f"You don't have access to {existing.get('section')} references")
    
    # Build update dict
    update_data = list_data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    # Use the correct key for update
    update_key = "id" if "id" in existing else "_id"
    await db.reference_lists.update_one(
        {update_key: existing.get(update_key)},
        {"$set": update_data}
    )
    
    # Get updated list for audit log
    updated = await db.reference_lists.find_one({update_key: existing.get(update_key)}, {"_id": 0})
    
    # Create audit log for reference list update
    await create_audit_log(
        user_id=current_user.get("id"),
        username=current_user.get("username", "Unknown"),
        action="update",
        entity_type="reference_list",
        entity_id=list_id,
        entity_name=f"{existing.get('name', '')} ({existing.get('section', '')})",
        changes={"before": existing, "after": updated}
    )
    
    # Broadcast to all connected clients
    await manager.broadcast_to_all({
        "type": "reference_updated",
        "data": updated,
        "user_id": current_user.get("id"),
        "username": current_user.get("username")
    })
    
    # Return updated list
    return updated


@api_router.delete("/references/{list_id}")
async def delete_reference_list(list_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a reference list"""
    print(f"Attempting to delete list with id: {list_id}")
    
    # Find existing list - check both id and _id
    from bson import ObjectId
    try:
        # Try to find by id field first
        existing = await db.reference_lists.find_one({"id": list_id})
        if not existing:
            # Try to find by _id (MongoDB's ObjectId)
            existing = await db.reference_lists.find_one({"_id": ObjectId(list_id)})
    except:
        # If list_id is not a valid ObjectId, just search by id field
        existing = await db.reference_lists.find_one({"id": list_id})
    
    # If still not found, try to find by name+destination+section (fallback for legacy data)
    if not existing and '-' in list_id:
        parts = list_id.rsplit('-', 2)
        if len(parts) >= 3:
            section = parts[-1]
            destination = parts[-2]
            name = '-'.join(parts[:-2])
            existing = await db.reference_lists.find_one({
                "name": name,
                "destination": destination,
                "section": section
            })
            if existing and "id" not in existing:
                # Add id to the existing record
                import uuid
                new_id = str(uuid.uuid4())
                await db.reference_lists.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {"id": new_id}}
                )
                existing["id"] = new_id
    
    print(f"Found list: {existing}")
    
    if not existing:
        raise HTTPException(status_code=404, detail=f"Reference list not found: {list_id}")
    
    # Check department type access
    dept = await get_user_department(current_user)
    ticket_type = get_user_ticket_type(dept)
    if ticket_type != "all" and ticket_type != existing.get("section"):
        raise HTTPException(status_code=403, detail=f"You don't have access to {existing.get('section')} references")
    
    # Delete using the found document's id field or _id
    delete_key = "id" if "id" in existing else "_id"
    await db.reference_lists.delete_one({delete_key: existing.get(delete_key)})
    
    # Create audit log for reference list deletion
    await create_audit_log(
        user_id=current_user.get("id"),
        username=current_user.get("username", "Unknown"),
        action="delete",
        entity_type="reference_list",
        entity_id=list_id,
        entity_name=f"{existing.get('name', '')} ({existing.get('section', '')})",
        changes={"deleted_reference_list": existing}
    )
    
    # Broadcast to all connected clients
    await manager.broadcast_to_all({
        "type": "reference_deleted",
        "data": {"id": list_id, "section": existing.get("section")},
        "user_id": current_user.get("id"),
        "username": current_user.get("username")
    })
    
    return {"message": "Reference list deleted successfully"}

# ==================== ALERT ROUTES ====================

class Alert(BaseModel):
    """Model for an alert sent from a ticket"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    ticket_id: str
    ticket_number: str
    ticket_type: str  # "sms" or "voice"
    customer: str
    customer_id: str
    destination: Optional[str] = None
    issue_types: List[str] = Field(default_factory=list)
    issue_other: Optional[str] = None
    vendor_trunk: Optional[str] = None
    vendor_trunks: List[dict] = Field(default_factory=list)  # List of {trunk, percentage, position, cost}
    sms_details: List[dict] = Field(default_factory=list)  # List of {sid, content} for SMS
    rate: Optional[str] = None
    cost: Optional[str] = None
    alternative_routes: Optional[str] = None  # Alternative solutions field
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    comments: List[dict] = Field(default_factory=list)  # List of {id, text, created_by, created_at}
    resolved: bool = False  # Whether the alert has been resolved/archived


class AlertCreate(BaseModel):
    """Model for creating an alert"""
    ticket_id: str
    ticket_number: str
    ticket_type: str  # "sms" or "voice"
    customer: str
    customer_id: str
    destination: Optional[str] = None
    issue_types: List[str] = Field(default_factory=list)
    issue_other: Optional[str] = None
    vendor_trunk: Optional[str] = None
    vendor_trunks: List[dict] = Field(default_factory=list)
    sms_details: List[dict] = Field(default_factory=list)
    rate: Optional[str] = None
    cost: Optional[str] = None
    alternative_routes: Optional[str] = None


class AlertComment(BaseModel):
    """Model for adding a comment to an alert"""
    text: str
    alternative_vendor: Optional[str] = None  # Alternative vendor trunk suggestion


@api_router.post("/alerts", response_model=Alert)
async def create_alert(alert_data: AlertCreate, current_user: dict = Depends(get_current_user)):
    """Create a new alert from a ticket"""
    # AMs cannot create alerts - only NOC can
    if current_user.get("role") == "am":
        raise HTTPException(status_code=403, detail="Account Managers cannot create alerts")
    
    print(f"Creating alert from ticket: {alert_data.ticket_number}")
    
    # Create the alert
    alert = Alert(
        ticket_id=alert_data.ticket_id,
        ticket_number=alert_data.ticket_number,
        ticket_type=alert_data.ticket_type,
        customer=alert_data.customer,
        customer_id=alert_data.customer_id,
        destination=alert_data.destination,
        issue_types=alert_data.issue_types,
        issue_other=alert_data.issue_other,
        vendor_trunk=alert_data.vendor_trunk,
        vendor_trunks=alert_data.vendor_trunks,
        sms_details=alert_data.sms_details,
        rate=alert_data.rate,
        cost=alert_data.cost,
        alternative_routes=alert_data.alternative_routes,
        created_by=current_user.get("username", "unknown")
    )
    
    alert_dict = alert.model_dump()
    await db.alerts.insert_one(alert_dict)
    
    # Create audit log for alert creation
    await create_audit_log(
        user_id=current_user.get("id"),
        username=current_user.get("username", "Unknown"),
        action="create",
        entity_type="alert",
        entity_id=alert_dict.get("id"),
        entity_name=alert_data.ticket_number,
        changes=alert_dict
    )
    
    # Notify AMs and NOC about the new alert
    await notify_users_about_alert(
        alert_id=alert_dict.get("id"),
        alert_ticket_number=alert_data.ticket_number,
        customer=alert_data.customer,
        customer_id=alert_data.customer_id,
        ticket_type=alert_data.ticket_type,
        notification_type="created",
        created_by=current_user.get("id")
    )
    
    # Broadcast to all connected clients
    await manager.broadcast_to_all({
        "type": "alert_created",
        "data": alert_dict,
        "user_id": current_user.get("id"),
        "username": current_user.get("username")
    })
    
    return alert


@api_router.get("/alerts/{section}")
async def get_alerts(section: str, current_user: dict = Depends(get_current_user)):
    """Get all alerts for a specific section (sms or voice)"""
    if section not in ["sms", "voice"]:
        raise HTTPException(status_code=400, detail="Section must be 'sms' or 'voice'")
    
    # Check department type access
    dept = await get_user_department(current_user)
    ticket_type = get_user_ticket_type(dept)
    if ticket_type != "all" and ticket_type != section:
        raise HTTPException(status_code=403, detail=f"You don't have access to {section} alerts")
    
    alerts = await db.alerts.find(
        {"ticket_type": section},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    
    return alerts


@api_router.post("/alerts/{alert_id}/comments")
async def add_alert_comment(alert_id: str, comment: AlertComment, current_user: dict = Depends(get_current_user)):
    """Add a comment to an alert"""
    # AMs cannot submit alternative vendor trunks - only text comments
    if current_user.get("role") == "am" and comment.alternative_vendor and comment.alternative_vendor.strip():
        raise HTTPException(status_code=403, detail="Account Managers cannot submit alternative vendor trunks")
    
    # Find the alert
    alert = await db.alerts.find_one({"id": alert_id})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    # Create comment
    comment_obj = {
        "id": str(uuid.uuid4()),
        "text": comment.text,
        "alternative_vendor": comment.alternative_vendor,
        "created_by": current_user.get("username", "unknown"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Add comment to alert
    await db.alerts.update_one(
        {"id": alert_id},
        {"$push": {"comments": comment_obj}}
    )
    
    # Create audit log for alert comment
    await create_audit_log(
        user_id=current_user.get("id"),
        username=current_user.get("username", "Unknown"),
        action="create",
        entity_type="alert_comment",
        entity_id=comment_obj["id"],
        entity_name=f"{alert.get('ticket_number', alert_id)} - Comment",
        changes=comment_obj
    )
    
    # Determine notification type based on comment content
    notification_type = "commented"
    if comment.alternative_vendor and comment.alternative_vendor.strip():
        notification_type = "alt_vendor"
    
    # Notify AMs and NOC about the comment/alternative vendor
    await notify_users_about_alert(
        alert_id=alert_id,
        alert_ticket_number=alert.get("ticket_number", ""),
        customer=alert.get("customer", ""),
        customer_id=alert.get("customer_id", ""),
        ticket_type=alert.get("ticket_type", "sms"),
        notification_type=notification_type,
        created_by=current_user.get("id")
    )
    
    return {"message": "Comment added successfully", "comment": comment_obj}


@api_router.delete("/alerts/{alert_id}")
async def delete_alert(alert_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an alert"""
    # AMs cannot delete alerts - only NOC can
    if current_user.get("role") == "am":
        raise HTTPException(status_code=403, detail="Account Managers cannot delete alerts")
    
    alert = await db.alerts.find_one({"id": alert_id})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    await db.alerts.delete_one({"id": alert_id})
    
    # Create audit log for alert deletion
    await create_audit_log(
        user_id=current_user.get("id"),
        username=current_user.get("username", "Unknown"),
        action="delete",
        entity_type="alert",
        entity_id=alert_id,
        entity_name=alert.get("ticket_number", alert_id),
        changes={"deleted_alert": alert}
    )
    
    # Broadcast to all connected clients
    await manager.broadcast_to_all({
        "type": "alert_deleted",
        "data": {"id": alert_id},
        "user_id": current_user.get("id"),
        "username": current_user.get("username")
    })
    
    return {"message": "Alert deleted successfully"}


@api_router.post("/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str, current_user: dict = Depends(get_current_user)):
    """Resolve an alert - marks it as archived/resolved"""
    # AMs cannot resolve alerts - only NOC can
    if current_user.get("role") == "am":
        raise HTTPException(status_code=403, detail="Account Managers cannot resolve alerts")
    
    alert = await db.alerts.find_one({"id": alert_id})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    await db.alerts.update_one(
        {"id": alert_id},
        {"$set": {"resolved": True}}
    )
    
    # Notify AMs and NOC about the resolved alert
    await notify_users_about_alert(
        alert_id=alert_id,
        alert_ticket_number=alert.get("ticket_number", ""),
        customer=alert.get("customer", ""),
        customer_id=alert.get("customer_id", ""),
        ticket_type=alert.get("ticket_type", "sms"),
        notification_type="resolved",
        created_by=current_user.get("id")
    )
    
    # Broadcast to all connected clients
    await manager.broadcast_to_all({
        "type": "alert_resolved",
        "data": {"id": alert_id, "ticket_type": alert.get("ticket_type")},
        "user_id": current_user.get("id"),
        "username": current_user.get("username")
    })
    
    return {"message": "Alert resolved successfully"}


# ==================== AM REQUEST ROUTES ====================

class AMRequest(BaseModel):
    """Model for AM requests (Rating, Routing, Testing, Translation, Investigation)"""
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    request_type: str  # "rating_routing", "testing", "translation", "investigation"
    request_type_label: str  # Display label for the request type
    department: str  # "sms" or "voice"
    priority: str  # "Low", "Medium", "High", "Urgent"
    
    # Client info
    customer: Optional[str] = None
    customer_id: Optional[str] = None
    customer_ids: List[str] = Field(default_factory=list)  # List of customer IDs for rating/routing
    ticket_id: Optional[str] = None  # Optional ticket reference
    
    # Rating/Routing fields
    rating: Optional[str] = None
    customer_trunk: Optional[str] = None
    customer_trunks: List[dict] = Field(default_factory=list)  # List of {trunk, destination, rate}
    destination: Optional[str] = None
    by_loss: bool = False  # By Loss option for rating/routing
    enable_mnp_hlr: bool = False  # Enable MNP/HLR for SMS
    mnp_hlr_type: Optional[str] = None  # MNP or HLR
    enable_threshold: bool = False  # Enable threshold for SMS
    threshold_count: Optional[str] = None  # Threshold count
    via_vendor: Optional[str] = None  # Via vendor for threshold routing
    enable_whitelisting: bool = False  # Enable numbers whitelisting for SMS
    rating_vendor_trunks: List[dict] = Field(default_factory=list)  # List of {trunk, percentage, position, cost_type, cost_min, cost_max}
    
    # Testing fields
    vendor_trunks: List[dict] = Field(default_factory=list)  # List of {trunk, sid, content}
    
    # Translation fields
    translation_type: Optional[str] = None  # "sid_change", "content_change", "sid_content_change", "remove"
    trunk_type: Optional[str] = None  # "customer", "vendor"
    trunk_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    old_sid: Optional[str] = None
    new_sid: Optional[str] = None
    word_to_remove: Optional[str] = None
    translation_destination: Optional[str] = None
    
    # Testing fields - for Voice
    test_type: Optional[str] = None  # "tool_test", "manual_test"
    test_description: Optional[str] = None  # Optional description for voice testing
    
    # LCR fields - for Voice
    lcr_type: Optional[str] = None  # "PRM", "STD", "CC"
    lcr_change: Optional[str] = None  # "add", "drop"
    
    # Investigation fields - using issue_types like tickets
    issue_types: List[str] = Field(default_factory=list)  # Predefined issue types checklist (same as tickets)
    issue_other: Optional[str] = None  # Custom "Other" issue text
    investigation_destination: Optional[str] = None  # Destination to investigate
    
    # Status
    status: str = "pending"  # "pending", "in_progress", "completed", "rejected"
    created_by: str
    created_by_username: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None
    response: Optional[str] = None
    responded_by: Optional[str] = None
    responded_at: Optional[datetime] = None
    claimed_by: Optional[str] = None
    claimed_by_username: Optional[str] = None
    test_result_image: Optional[str] = None  # URL to uploaded test result image


class AMRequestCreate(BaseModel):
    """Model for creating an AM request"""
    request_type: str
    request_type_label: str
    department: str
    priority: str
    customer: Optional[str] = None
    customer_id: Optional[str] = None
    customer_ids: List[str] = Field(default_factory=list)  # List of customer IDs for rating/routing
    ticket_id: Optional[str] = None  # Optional ticket reference
    rating: Optional[str] = None
    customer_trunk: Optional[str] = None
    customer_trunks: List[dict] = Field(default_factory=list)  # List of {trunk, destination, rate}
    destination: Optional[str] = None
    by_loss: bool = False  # By Loss option for rating/routing
    enable_mnp_hlr: bool = False  # Enable MNP/HLR for SMS
    mnp_hlr_type: Optional[str] = None  # MNP or HLR
    enable_threshold: bool = False  # Enable threshold for SMS
    threshold_count: Optional[str] = None  # Threshold count
    via_vendor: Optional[str] = None  # Via vendor for threshold routing
    enable_whitelisting: bool = False  # Enable numbers whitelisting for SMS
    rating_vendor_trunks: List[dict] = Field(default_factory=list)
    vendor_trunks: List[dict] = Field(default_factory=list)
    translation_type: Optional[str] = None
    trunk_type: Optional[str] = None
    trunk_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    old_sid: Optional[str] = None
    new_sid: Optional[str] = None
    word_to_remove: Optional[str] = None
    translation_destination: Optional[str] = None
    
    # Testing fields - for Voice
    test_type: Optional[str] = None  # "tool_test", "manual_test"
    test_description: Optional[str] = None  # Optional description for voice testing
    
    # LCR fields - for Voice
    lcr_type: Optional[str] = None  # "PRM", "STD", "CC"
    lcr_change: Optional[str] = None  # "add", "drop"

    issue_types: List[str] = Field(default_factory=list)
    issue_other: Optional[str] = None
    investigation_destination: Optional[str] = None
    issue_description: Optional[str] = None


@api_router.get("/requests", response_model=List[AMRequest])
async def get_requests(
    department: Optional[str] = None,
    request_type: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all requests - filtered by user's department and role"""
    user_role = current_user.get("role")
    user_id = current_user.get("id")
    
    # Get user's department
    user_dept = current_user.get("department")
    if user_dept and isinstance(user_dept, dict):
        user_dept_name = user_dept.get("name", "").lower()
    elif user_dept and isinstance(user_dept, str):
        user_dept_name = user_dept.lower()
    else:
        user_dept_name = ""
    
    # Build query
    query = {}
    
    # Filter by department based on user role
    if user_role == "am":
        # AMs only see their own requests
        # Use flexible matching to handle different department name formats
        if user_dept_name.startswith("sms") or user_dept_name == "sms":
            query["department"] = "sms"
        elif user_dept_name.startswith("voice") or user_dept_name == "voice":
            query["department"] = "voice"
        # Filter by the AM's user ID to show only their own requests
        query["created_by"] = user_id
    elif department:
        # NOC/Admin can filter by department
        query["department"] = department
    
    # Filter by request type
    if request_type:
        query["request_type"] = request_type
    
    # Filter by status
    if status:
        query["status"] = status
    
    requests = await db.am_requests.find(query).sort("created_at", -1).to_list(100)
    
    # Convert datetime fields
    for req in requests:
        if req.get("created_at") and hasattr(req["created_at"], "isoformat"):
            req["created_at"] = req["created_at"].isoformat()
        if req.get("updated_at") and hasattr(req["updated_at"], "isoformat"):
            req["updated_at"] = req["updated_at"].isoformat()
        if req.get("responded_at") and hasattr(req["responded_at"], "isoformat"):
            req["responded_at"] = req["responded_at"].isoformat()
    
    return requests


@api_router.get("/requests/{request_id}", response_model=AMRequest)
async def get_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single request by ID - for navigation from notifications"""
    user_role = current_user.get("role")
    user_id = current_user.get("id")
    
    # Find the request
    request_obj = await db.am_requests.find_one({"id": request_id})
    if not request_obj:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Check access - AMs can only view their own requests
    if user_role == "am" and request_obj.get("created_by") != user_id:
        raise HTTPException(status_code=403, detail="You can only view your own requests")
    
    # Convert datetime fields
    if request_obj.get("created_at") and hasattr(request_obj["created_at"], "isoformat"):
        request_obj["created_at"] = request_obj["created_at"].isoformat()
    if request_obj.get("updated_at") and hasattr(request_obj["updated_at"], "isoformat"):
        request_obj["updated_at"] = request_obj["updated_at"].isoformat()
    if request_obj.get("responded_at") and hasattr(request_obj["responded_at"], "isoformat"):
        request_obj["responded_at"] = request_obj["responded_at"].isoformat()
    
    return request_obj


@api_router.post("/requests", response_model=AMRequest)
async def create_request(request_data: AMRequestCreate, current_user: dict = Depends(get_current_user)):
    """Create a new AM request"""
    user_role = current_user.get("role")
    
    # Log for debugging
    logging.info(f"User {current_user.get('username')} - role: {user_role}, department: {current_user.get('department')}")
    
    # Only AMs can create requests
    if user_role != "am":
        raise HTTPException(status_code=403, detail=f"Only Account Managers can create requests. Your role: {user_role}")
    
    # Get user's department
    user_dept = current_user.get("department")
    if user_dept and isinstance(user_dept, dict):
        # Use department_type instead of name for comparison
        user_dept_type = user_dept.get("department_type", "").lower()
    else:
        user_dept_type = ""
    
    # Verify department matches - compare with department_type
    if request_data.department.lower() != user_dept_type and user_dept_type != "all":
        raise HTTPException(status_code=403, detail="You can only create requests for your department")
    
    # Create the request
    request_obj = AMRequest(
        request_type=request_data.request_type,
        request_type_label=request_data.request_type_label,
        department=request_data.department,
        priority=request_data.priority,
        customer=request_data.customer,
        customer_id=request_data.customer_id,
        customer_ids=request_data.customer_ids,
        rating=request_data.rating,
        customer_trunk=request_data.customer_trunk,
        customer_trunks=request_data.customer_trunks,
        destination=request_data.destination,
        by_loss=request_data.by_loss,
        enable_mnp_hlr=request_data.enable_mnp_hlr,
        mnp_hlr_type=request_data.mnp_hlr_type,
        enable_threshold=request_data.enable_threshold,
        threshold_count=request_data.threshold_count,
        via_vendor=request_data.via_vendor,
        enable_whitelisting=request_data.enable_whitelisting,
        rating_vendor_trunks=request_data.rating_vendor_trunks,
        vendor_trunks=request_data.vendor_trunks,
        translation_type=request_data.translation_type,
        trunk_type=request_data.trunk_type,
        trunk_name=request_data.trunk_name,
        old_value=request_data.old_value,
        new_value=request_data.new_value,
        old_sid=request_data.old_sid,
        new_sid=request_data.new_sid,
        word_to_remove=request_data.word_to_remove,
        translation_destination=request_data.translation_destination,
        lcr_type=request_data.lcr_type,
        lcr_change=request_data.lcr_change,
        issue_types=request_data.issue_types,
        issue_other=request_data.issue_other,
        investigation_destination=request_data.investigation_destination,
        issue_description=request_data.issue_description,
        created_by=current_user.get("id"),
        created_by_username=current_user.get("username", "Unknown")
    )
    
    doc = request_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.am_requests.insert_one(doc)
    
    # Create audit log for request creation
    await create_audit_log(
        user_id=current_user.get("id"),
        username=current_user.get("username", "Unknown"),
        action="create",
        entity_type="request",
        entity_id=doc.get("id"),
        entity_name=f"{request_data.request_type_label} - {request_data.customer}",
        changes=doc
    )
    
    return request_obj


@api_router.put("/requests/{request_id}", response_model=AMRequest)
async def update_request(request_id: str, request_data: dict, current_user: dict = Depends(get_current_user)):
    """Update a request - can be response from NOC or edit from AM"""
    user_role = current_user.get("role")
    user_id = current_user.get("id")
    
    # Find the request first
    request_obj = await db.am_requests.find_one({"id": request_id})
    if not request_obj:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Check if AM is editing their own request
    is_am_editing_own = user_role == "am" and request_obj.get("created_by") == user_id
    
    # Only NOC can respond to requests, OR AM can edit their own request
    if user_role == "am" and not is_am_editing_own:
        raise HTTPException(status_code=403, detail="You can only edit your own requests")
    
    if is_am_editing_own:
        # AM editing their own request - update the request fields (not response)
        # Only allow editing certain fields
        allowed_fields = [
            "priority", "customer", "customer_id", "customer_ids", "rating", "routing",
            "customer_trunk", "customer_trunks", "destination", "by_loss",
            "enable_mnp_hlr", "mnp_hlr_type", "enable_threshold", "threshold_count", "via_vendor", "enable_whitelisting",
            "rating_vendor_trunks",
            "vendor_trunks", "translation_type", "trunk_type", "trunk_name",
            "old_value", "new_value", "old_sid", "new_sid", "word_to_remove", "translation_destination",
            "test_type", "test_description",
            "lcr_type", "lcr_change",
            "issue_types", "issue_other", "investigation_destination", "issue_description"
        ]
        
        update_data = {}
        for field in allowed_fields:
            if request_data.get(field) is not None:
                update_data[field] = request_data[field]
        
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.am_requests.update_one({"id": request_id}, {"$set": update_data})
    else:
        # NOC responding to request - can be claim (set claimed_by) or response
        update_data = {
            "status": request_data.get("status", request_obj.get("status")),
            "response": request_data.get("response"),
            "responded_by": current_user.get("id"),
            "responded_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        # Handle test result image for testing requests
        if request_data.get("test_result_image"):
            update_data["test_result_image"] = request_data["test_result_image"]
        
        # Handle claim - set claimed_by when status changes to in_progress
        if request_data.get("claimed_by"):
            update_data["claimed_by"] = request_data["claimed_by"]
            update_data["claimed_by_username"] = current_user.get("username", "Unknown")
        elif request_obj.get("claimed_by"):
            update_data["claimed_by"] = request_obj.get("claimed_by")
            update_data["claimed_by_username"] = request_obj.get("claimed_by_username", "Unknown")
        
        await db.am_requests.update_one({"id": request_id}, {"$set": update_data})
    
    # Get updated request for audit log
    updated_request = await db.am_requests.find_one({"id": request_id})
    
    # Create audit log for request update
    await create_audit_log(
        user_id=current_user.get("id"),
        username=current_user.get("username", "Unknown"),
        action="update",
        entity_type="request",
        entity_id=request_id,
        entity_name=f"{request_obj.get('request_type_label', 'Request')} - {request_obj.get('customer', '')}",
        changes={"before": request_obj, "after": updated_request}
    )
    
    # Check if request was claimed - notify the AM who created it
    new_claimed_by = update_data.get("claimed_by")
    old_claimed_by = request_obj.get("claimed_by")
    if new_claimed_by and not old_claimed_by:
        # Request was just claimed
        am_id = request_obj.get("created_by")
        if am_id and am_id != user_id:
            am_user = await db.users.find_one({"id": am_id}, {"_id": 0, "username": 1, "name": 1})
            if am_user:
                am_name = am_user.get("name") or am_user.get("username") or "AM"
                noc_name = current_user.get("name") or current_user.get("username") or "NOC"
                request_type_label = request_obj.get("request_type_label", "Request")
                
                # Build notification message
                notification_message = f"Your {request_type_label} Request has been Claimed by {noc_name}:\n"
                
                # Add request-specific details
                request_type = request_obj.get("request_type", "")
                if request_type == "investigation":
                    # For investigation requests, show Enterprise Trunk, Destination and Issue Type
                    # Investigation uses customer_trunk (singular) and investigation_destination
                    customer_trunk = request_obj.get("customer_trunk", "")
                    investigation_destination = request_obj.get("investigation_destination", "")
                    
                    if customer_trunk:
                        notification_message += f"Enterprise Trunk: {customer_trunk}\n"
                    if investigation_destination:
                        notification_message += f"Destination: {investigation_destination}\n"
                    
                    # Add issue types
                    issue_types = request_obj.get("issue_types", [])
                    issue_other = request_obj.get("issue_other", "")
                    if issue_types:
                        notification_message += f"Issue Type: {', '.join(issue_types)}"
                    elif issue_other:
                        notification_message += f"Issue Type: {issue_other}"
                elif request_type == "rating_routing":
                    customer_trunks = request_obj.get("customer_trunks", [])
                    if customer_trunks:
                        trunks = [ct.get("trunk", "") for ct in customer_trunks if ct.get("trunk")]
                        if trunks:
                            notification_message += f"Enterprise Trunk(s): {', '.join(trunks)}\n"
                    destinations = set()
                    for ct in customer_trunks:
                        dest = ct.get("destination", "").strip()
                        if dest:
                            destinations.add(dest)
                    if destinations:
                        notification_message += f"Destination(s): {', '.join(destinations)}"
                        
                elif request_type == "testing":
                    vendor_trunks = request_obj.get("vendor_trunks", [])
                    if vendor_trunks:
                        trunks = [vt.get("trunk", "") for vt in vendor_trunks if vt.get("trunk")]
                        if trunks:
                            notification_message += f"Vendor Trunk(s): {', '.join(trunks)}\n"
                    destination = request_obj.get("destination", "").strip()
                    if destination:
                        notification_message += f"Destination(s): {destination}"
                        
                elif request_type == "translation":
                    trunk_name = request_obj.get("trunk_name", "").strip()
                    if trunk_name:
                        notification_message += f"Enterprise/Vendor Trunk: {trunk_name}\n"
                    translation_dest = request_obj.get("translation_destination", "").strip()
                    if translation_dest:
                        notification_message += f"Destination(s): {translation_dest}"
                
                notification_doc = {
                    "id": f"request_{request_id}_claimed_{int(datetime.now(timezone.utc).timestamp())}",
                    "type": "request_update",
                    "message": notification_message,
                    "request_id": request_id,
                    "request_number": request_obj.get("request_number"),
                    "request_type": request_type,
                    "status": "claimed",
                    "created_by": user_id,
                    "assigned_to": am_id,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "read": False
                }
                await db.notifications.insert_one(notification_doc)
    
    # Check if request was completed or rejected - notify the AM who created it
    new_status = request_data.get("status")
    old_status = request_obj.get("status")
    
    if new_status in ["completed", "rejected"] and old_status != new_status:
        # Get the AM who created the request
        am_id = request_obj.get("created_by")
        if am_id and am_id != user_id:  # Don't notify if NOC is updating their own
            # Get AM user info
            am_user = await db.users.find_one({"id": am_id}, {"_id": 0, "username": 1, "name": 1})
            if am_user:
                am_name = am_user.get("name") or am_user.get("username") or "AM"
                noc_name = current_user.get("name") or current_user.get("username") or "NOC"
                # Use request id (last 8 chars for readability) or generate a number
                request_display = request_obj.get("id", "Unknown")[-8:]
                
                # Get request type for building detailed message
                request_type = request_obj.get("request_type", "")
                request_type_label = request_obj.get("request_type_label", "Request")
                
                # Build status text
                status_text = "completed" if new_status == "completed" else "rejected"
                
                # Build message based on request type
                notification_message = f"Your {request_type_label} Request has been {status_text} by {noc_name}:\n"
                
                # Add request-specific details
                if request_type == "investigation":
                    # For investigation requests, show Enterprise Trunk, Destination and Issue Type
                    # Investigation uses customer_trunk (singular) and investigation_destination
                    customer_trunk = request_obj.get("customer_trunk", "")
                    investigation_destination = request_obj.get("investigation_destination", "")
                    
                    if customer_trunk:
                        notification_message += f"Enterprise Trunk: {customer_trunk}\n"
                    if investigation_destination:
                        notification_message += f"Destination: {investigation_destination}\n"
                    
                    # Add issue types
                    issue_types = request_obj.get("issue_types", [])
                    issue_other = request_obj.get("issue_other", "")
                    if issue_types:
                        notification_message += f"Issue Type: {', '.join(issue_types)}"
                    elif issue_other:
                        notification_message += f"Issue Type: {issue_other}"
                elif request_type == "rating_routing":
                    # Get enterprise trunks from customer_trunks
                    customer_trunks = request_obj.get("customer_trunks", [])
                    if customer_trunks:
                        trunks = [ct.get("trunk", "") for ct in customer_trunks if ct.get("trunk")]
                        if trunks:
                            notification_message += f"Enterprise Trunk(s): {', '.join(trunks)}\n"
                    # Get destinations
                    destinations = set()
                    for ct in customer_trunks:
                        dest = ct.get("destination", "").strip()
                        if dest:
                            destinations.add(dest)
                    if destinations:
                        notification_message += f"Destination(s): {', '.join(destinations)}"
                        
                elif request_type == "testing":
                    # Get vendor trunks
                    vendor_trunks = request_obj.get("vendor_trunks", [])
                    if vendor_trunks:
                        trunks = [vt.get("trunk", "") for vt in vendor_trunks if vt.get("trunk")]
                        if trunks:
                            notification_message += f"Vendor Trunk(s): {', '.join(trunks)}\n"
                    # Get destination
                    destination = request_obj.get("destination", "").strip()
                    if destination:
                        notification_message += f"Destination(s): {destination}"
                        
                elif request_type == "translation":
                    # Get trunk name
                    trunk_name = request_obj.get("trunk_name", "").strip()
                    if trunk_name:
                        notification_message += f"Enterprise/Vendor Trunk: {trunk_name}\n"
                    # Get destination
                    translation_dest = request_obj.get("translation_destination", "").strip()
                    if translation_dest:
                        notification_message += f"Destination(s): {translation_dest}"
                
                if request_data.get("response"):
                    notification_message += f"\nNote: {request_data.get('response')}"
                
                # Create notification in database
                notification_doc = {
                    "id": f"request_{request_id}_{new_status}_{int(datetime.now(timezone.utc).timestamp())}",
                    "type": "request_update",
                    "message": notification_message,
                    "request_id": request_id,
                    "request_number": request_obj.get("request_number"),
                    "request_type": request_type,
                    "status": new_status,
                    "response": request_data.get("response", ""),
                    "created_by": user_id,
                    "assigned_to": am_id,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "read": False
                }
                await db.notifications.insert_one(notification_doc)
    
    # Return updated request
    updated = await db.am_requests.find_one({"id": request_id})
    return updated


@api_router.delete("/requests/{request_id}")
async def delete_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a request - AMs can delete their own pending requests, Admins can delete any request"""
    user_role = current_user.get("role")
    user_id = current_user.get("id")
    
    # Find the request
    request_obj = await db.am_requests.find_one({"id": request_id})
    if not request_obj:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Admins can delete any request in any state
    if user_role == "admin":
        await db.am_requests.delete_one({"id": request_id})
        # Create audit log for request deletion
        await create_audit_log(
            user_id=current_user.get("id"),
            username=current_user.get("username", "Unknown"),
            action="delete",
            entity_type="request",
            entity_id=request_id,
            entity_name=f"{request_obj.get('request_type_label', 'Request')} - {request_obj.get('customer', '')}",
            changes={"deleted_request": request_obj}
        )
        return {"message": "Request deleted successfully"}
    
    # Only AMs can delete their own requests
    if user_role != "am":
        raise HTTPException(status_code=403, detail="Only Account Managers can delete requests")
    
    if request_obj.get("created_by") != user_id:
        raise HTTPException(status_code=403, detail="You can only delete your own requests")
    
    # AMs can only delete pending requests
    if request_obj.get("status") != "pending":
        raise HTTPException(status_code=403, detail="You can only delete pending requests")
    
    # Delete the request
    await db.am_requests.delete_one({"id": request_id})
    
    # Create audit log for request deletion by AM
    await create_audit_log(
        user_id=current_user.get("id"),
        username=current_user.get("username", "Unknown"),
        action="delete",
        entity_type="request",
        entity_id=request_id,
        entity_name=f"{request_obj.get('request_type_label', 'Request')} - {request_obj.get('customer', '')}",
        changes={"deleted_request": request_obj}
    )
    
    return {"message": "Request deleted successfully"}


# ==================== SMS TICKET ROUTES ====================


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
    
    # Create audit log for SMS ticket creation
    await create_audit_log(
        user_id=current_user.get("id"),
        username=current_user.get("username", "Unknown"),
        action="create",
        entity_type="ticket_sms",
        entity_id=ticket_id,
        entity_name=doc.get("ticket_number", ticket_id),
        changes=doc
    )
    
    # Notify AMs about the new ticket
    current_user_id = current_user.get("id")
    await notify_ams_about_ticket(doc, "created", "sms", current_user_id)
    
    # If a NOC is assigned, also notify about assignment
    if doc.get("assigned_to"):
        await notify_ams_about_ticket(doc, "assigned", "sms", current_user_id)
    
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
    
    # Build changes dict for NOC modification notification
    changes = {}
    for key, value in update_dict.items():
        if key in existing_ticket and existing_ticket[key] != value:
            changes[key] = (existing_ticket[key], value)
    
    # Check if the modifier is a NOC user (for NOC modification notification)
    dept = await get_user_department(current_user)
    modifier_role = get_user_role_from_department(dept) if dept else None
    is_noc_modifier = modifier_role == "noc"
    
    result = await db.sms_tickets.find_one_and_update(
        {"id": ticket_id},
        {"$set": update_dict},
        return_document=True,
        projection={"_id": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    # Create audit log for SMS ticket update
    if changes:
        await create_audit_log(
            user_id=current_user.get("id"),
            username=current_user.get("username", "Unknown"),
            action="update",
            entity_type="ticket_sms",
            entity_id=ticket_id,
            entity_name=result.get("ticket_number", ticket_id),
            changes={"before": existing_ticket, "after": result}
        )
    
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
        
        # Also notify NOC about NOC modification if applicable
        if is_noc_modifier and changes:
            await notify_noc_about_noc_modification(
                existing_ticket,
                current_user_id,
                current_user.get("username", "Unknown"),
                changes,
                "sms"
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
            notification_type = None
        
        # Send notification to AMs about the status change
        if notification_type:
            current_user_id = current_user.get("id")
            await notify_ams_about_ticket(result, notification_type, "sms", current_user_id)
    
    if isinstance(result['date'], str):
        result['date'] = datetime.fromisoformat(result['date'])
    if isinstance(result['updated_at'], str):
        result['updated_at'] = datetime.fromisoformat(result['updated_at'])
    # Normalize opened_via for backward compatibility
    result['opened_via'] = normalize_opened_via(result.get('opened_via'))
    return SMSTicket(**result)

@api_router.delete("/tickets/sms/{ticket_id}")
async def delete_sms_ticket(ticket_id: str, current_user: dict = Depends(get_current_admin_or_noc)):
    # Get ticket details before deletion for audit log
    existing_ticket = await db.sms_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not existing_ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    result = await db.sms_tickets.delete_one({"id": ticket_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    # Create audit log for SMS ticket deletion
    await create_audit_log(
        user_id=current_user.get("id"),
        username=current_user.get("username", "Unknown"),
        action="delete",
        entity_type="ticket_sms",
        entity_id=ticket_id,
        entity_name=existing_ticket.get("ticket_number", ticket_id),
        changes={"deleted_ticket": existing_ticket}
    )
    
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
    
    # Create audit log for Voice ticket creation
    await create_audit_log(
        user_id=current_user.get("id"),
        username=current_user.get("username", "Unknown"),
        action="create",
        entity_type="ticket_voice",
        entity_id=ticket_id,
        entity_name=doc.get("ticket_number", ticket_id),
        changes=doc
    )
    
    # Notify AMs about the new ticket
    current_user_id = current_user.get("id")
    await notify_ams_about_ticket(doc, "created", "voice", current_user_id)
    
    # If a NOC is assigned, also notify about assignment
    if doc.get("assigned_to"):
        await notify_ams_about_ticket(doc, "assigned", "voice", current_user_id)
    
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
    # Get user department to check role
    dept = await get_user_department(current_user)
    user_role = get_user_role_from_department(dept) if dept else "unknown"
    
    # AMs cannot update tickets
    if user_role == "am":
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
    
    # Build changes dict for NOC modification notification
    changes = {}
    for key, value in update_dict.items():
        if key in existing_ticket and existing_ticket[key] != value:
            changes[key] = (existing_ticket[key], value)
    
    # Check if the modifier is a NOC user (for NOC modification notification)
    dept = await get_user_department(current_user)
    modifier_role = get_user_role_from_department(dept) if dept else None
    is_noc_modifier = modifier_role == "noc"
    
    result = await db.voice_tickets.find_one_and_update(
        {"id": ticket_id},
        {"$set": update_dict},
        return_document=True,
        projection={"_id": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    # Create audit log for Voice ticket update
    if changes:
        await create_audit_log(
            user_id=current_user.get("id"),
            username=current_user.get("username", "Unknown"),
            action="update",
            entity_type="ticket_voice",
            entity_id=ticket_id,
            entity_name=result.get("ticket_number", ticket_id),
            changes={"before": existing_ticket, "after": result}
        )
    
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
        
        # Also notify NOC about NOC modification if applicable
        if is_noc_modifier and changes:
            await notify_noc_about_noc_modification(
                existing_ticket,
                current_user_id,
                current_user.get("username", "Unknown"),
                changes,
                "voice"
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
            notification_type = None
        
        # Send notification to AMs about the status change
        if notification_type:
            current_user_id = current_user.get("id")
            await notify_ams_about_ticket(result, notification_type, "voice", current_user_id)
    
    if isinstance(result['date'], str):
        result['date'] = datetime.fromisoformat(result['date'])
    if isinstance(result['updated_at'], str):
        result['updated_at'] = datetime.fromisoformat(result['updated_at'])
    # Normalize opened_via for backward compatibility
    result['opened_via'] = normalize_opened_via(result.get('opened_via'))
    return VoiceTicket(**result)

@api_router.delete("/tickets/voice/{ticket_id}")
async def delete_voice_ticket(ticket_id: str, current_user: dict = Depends(get_current_admin_or_noc)):
    # Get ticket details before deletion for audit log
    existing_ticket = await db.voice_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not existing_ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    result = await db.voice_tickets.delete_one({"id": ticket_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    # Create audit log for Voice ticket deletion
    await create_audit_log(
        user_id=current_user.get("id"),
        username=current_user.get("username", "Unknown"),
        action="delete",
        entity_type="ticket_voice",
        entity_id=ticket_id,
        entity_name=existing_ticket.get("ticket_number", ticket_id),
        changes={"deleted_ticket": existing_ticket}
    )
    
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
    
    # Create audit log for SMS ticket action
    await create_audit_log(
        user_id=current_user.get("id"),
        username=username,
        action="create",
        entity_type="ticket_sms_action",
        entity_id=action_obj["id"],
        entity_name=f"{result.get('ticket_number', ticket_id)} - Action",
        changes=action_obj
    )
    
    # Notify NOC about AM action (only if the user adding action is an AM)
    user_dept = await get_user_department(user)
    user_role = get_user_role_from_department(user_dept) if user_dept else None
    if user_role == "am":
        await notify_noc_about_am_action(result, action_data.text, current_user["id"], "sms")
    
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
    
    # Create audit log for Voice ticket action
    await create_audit_log(
        user_id=current_user.get("id"),
        username=username,
        action="create",
        entity_type="ticket_voice_action",
        entity_id=action_obj["id"],
        entity_name=f"{result.get('ticket_number', ticket_id)} - Action",
        changes=action_obj
    )
    
    # Notify NOC about AM action (only if the user adding action is an AM)
    user_dept = await get_user_department(user)
    user_role = get_user_role_from_department(user_dept) if user_dept else None
    if user_role == "am":
        await notify_noc_about_am_action(result, action_data.text, current_user["id"], "voice")
    
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
    try:
        current_user_id = current_user.get("id")
        
        # Get user role to determine which notifications to return
        user_dept = await get_user_department(current_user)
        user_role = get_user_role_from_department(user_dept) if user_dept else "unknown"
        user_ticket_type = get_user_ticket_type(user_dept) if user_dept else "all"
        
        # Build query based on user role
        # AMs should only see AM notifications (notify_ams_about_ticket)
        # NOC users should only see NOC notifications (notify_noc_about_am_action, notify_noc_about_noc_modification)
        # Return all notifications (read and unread) for the current user
        query = {"assigned_to": current_user_id}
        
        if user_role == "am":
            # AMs should only see AM-specific event types
            query["event_type"] = {"$in": ["created", "assigned", "awaiting_vendor", "awaiting_client", "awaiting_am", "resolved", "unresolved"]}
            # Also filter by ticket type for AMs (voice or sms)
            if user_ticket_type != "all":
                query["ticket_type"] = user_ticket_type
        elif user_role in ["noc", "admin"]:
            # NOC and Admin should only see NOC-specific event types
            query["event_type"] = {"$in": ["am_action", "noc_modification", "ticket_modification"]}
        else:
            # Unknown role - return empty results for safety
            query["event_type"] = {"$in": []}
        
        # Get unread notifications for the current user, excluding _id field
        notifications = await db.ticket_notifications.find(
            query,
            {"_id": 0}
        ).sort("created_at", -1).limit(20).to_list(20)
        
        # Convert datetime fields to ISO format strings for JSON serialization
        for notification in notifications:
            if "created_at" in notification:
                if hasattr(notification["created_at"], "isoformat"):
                    notification["created_at"] = notification["created_at"].isoformat()
                elif notification["created_at"] is not None:
                    # Already a string or other type, leave as is
                    pass
        
        return notifications
    except Exception as e:
        print(f"Error fetching ticket modifications: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching notifications: {str(e)}")


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
    
    # Use projection to explicitly include only these fields (excludes _id)
    projection = {field: 1 for field in ['id', 'user_id', 'username', 'action', 'entity_type', 'entity_id', 'entity_name', 'changes', 'timestamp']}
    
    # Check if collection exists, create if not
    try:
        collections = await db.list_collection_names()
        if "audit_logs" not in collections:
            await db.create_collection("audit_logs")
            await db.audit_logs.create_index("timestamp")
            await db.audit_logs.create_index("user_id")
            await db.audit_logs.create_index("entity_type")
            logger.info("Created audit_logs collection")
    except Exception as e:
        logger.error(f"Error checking/creating audit_logs collection: {e}")
    
    # Fetch logs - wrap entire operation in try-except to catch any errors
    try:
        raw_logs = await db.audit_logs.find(query, projection).sort("timestamp", -1).skip(offset).limit(limit).to_list(limit)
    except Exception as e:
        logger.error(f"Error fetching audit logs: {e}")
        return []
    
    # Convert all values to ensure no ObjectIds remain
    from bson import ObjectId
    import datetime
    
    def convert_value(val):
        """Recursively convert ObjectId and datetime values to JSON-serializable formats"""
        if isinstance(val, ObjectId):
            return str(val)
        elif isinstance(val, datetime.datetime):
            return val.isoformat()
        elif isinstance(val, dict):
            return {k: convert_value(v) for k, v in val.items()}
        elif isinstance(val, list):
            return [convert_value(v) for v in val]
        else:
            return val
    
    logs = []
    for raw_log in raw_logs:
        log = convert_value(raw_log)
        
        # Ensure id field exists
        if "id" not in log or not log["id"]:
            log["id"] = log.get("entity_id", str(uuid.uuid4()))
        
        logs.append(log)
    
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
    
    try:
        total = await db.audit_logs.count_documents(query)
    except Exception as e:
        logger.error(f"Error counting audit logs: {e}")
        total = 0
    return {"total": total}

# ==================== WEBSOCKET CONNECTION MANAGER ====================

class ConnectionManager:
    """Manages WebSocket connections for real-time chat"""
    def __init__(self):
        # Map user_id to set of websocket connections
        self.active_connections: dict[str, set[WebSocket]] = {}
        # Map websocket to user_id for quick lookup
        self.connection_users: dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)
        self.connection_users[websocket] = user_id
        # Update user's online status
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"last_active": datetime.now(timezone.utc)}}
        )

    def disconnect(self, websocket: WebSocket):
        user_id = self.connection_users.pop(websocket, None)
        if user_id and user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.active_connections:
            disconnected = set()
            for connection in self.active_connections[user_id]:
                try:
                    if connection.client_state == WebSocketState.CONNECTED:
                        await connection.send_json(message)
                    else:
                        disconnected.add(connection)
                except Exception:
                    disconnected.add(connection)
            # Clean up disconnected connections
            for conn in disconnected:
                self.disconnect(conn)

    async def broadcast_to_conversation(self, message: dict, participant_ids: List[str]):
        """Send message to all participants in a conversation"""
        for user_id in participant_ids:
            await self.send_personal_message(message, user_id)

    async def broadcast_to_all(self, message: dict):
        """Broadcast message to all connected users"""
        # Get all user_ids with active connections
        all_user_ids = list(self.active_connections.keys())
        for user_id in all_user_ids:
            await self.send_personal_message(message, user_id)

# Global connection manager
manager = ConnectionManager()

@api_router.websocket("/ws/chat/{token}")
async def websocket_chat(websocket: WebSocket, token: str):
    """WebSocket endpoint for real-time chat"""
    # Verify token and get user
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            await websocket.close(code=4001, reason="Invalid token")
            return
    except JWTError:
        await websocket.close(code=4001, reason="Invalid token")
        return

    # Get user info
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "name": 1, "username": 1})
    if not user:
        await websocket.close(code=4002, reason="User not found")
        return

    await manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")

            if message_type == "ping":
                # Heartbeat to keep user online
                await db.users.update_one(
                    {"id": user_id},
                    {"$set": {"last_active": datetime.now(timezone.utc)}}
                )
                continue

            if message_type == "message":
                # New message sent
                message_data = data.get("message")
                conversation_id = message_data.get("conversation_id")
                content = message_data.get("content", "")
                msg_type = message_data.get("message_type", "text")
                file_url = message_data.get("file_url")
                file_name = message_data.get("file_name")
                file_size = message_data.get("file_size")
                file_mime_type = message_data.get("file_mime_type")

                # Create message in database
                msg_obj = ChatMessage(
                    conversation_id=conversation_id,
                    sender_id=user_id,
                    sender_name=user.get("name", user.get("username", "Unknown")),
                    content=content,
                    message_type=msg_type,
                    file_url=file_url,
                    file_name=file_name,
                    file_size=file_size,
                    file_mime_type=file_mime_type
                )
                await db.chat_messages.insert_one(msg_obj.model_dump())

                # Update conversation
                await db.conversations.update_one(
                    {"id": conversation_id},
                    {
                        "$set": {
                            "last_message": content[:100] if content else f"{msg_type}: {file_name or 'file'}",
                            "last_message_time": datetime.now(timezone.utc),
                            "last_message_sender_id": user_id,
                            "updated_at": datetime.now(timezone.utc)
                        }
                    }
                )

                # Get conversation to find participants
                conv = await db.conversations.find_one({"id": conversation_id})
                if conv:
                    # Broadcast to all participants
                    for participant_id in conv.get("participant_ids", []):
                        if participant_id != user_id:
                            # Increment unread count
                            await db.conversations.update_one(
                                {"id": conversation_id},
                                {"$inc": {f"unread_counts.{participant_id}": 1}}
                            )

                    # Send message to all participants including sender
                    message_payload = {
                        "type": "new_message",
                        "message": {
                            "id": msg_obj.id,
                            "conversation_id": conversation_id,
                            "sender_id": user_id,
                            "sender_name": user.get("name", user.get("username", "Unknown")),
                            "content": content,
                            "message_type": msg_type,
                            "file_url": file_url,
                            "file_name": file_name,
                            "file_size": file_size,
                            "file_mime_type": file_mime_type,
                            "is_read": False,
                            "created_at": msg_obj.created_at.isoformat()
                        }
                    }
                    await manager.broadcast_to_conversation(message_payload, conv.get("participant_ids", []))

            elif message_type == "typing":
                # User is typing
                conversation_id = data.get("conversation_id")
                conv = await db.conversations.find_one({"id": conversation_id})
                if conv:
                    typing_payload = {
                        "type": "typing",
                        "user_id": user_id,
                        "user_name": user.get("name", user.get("username", "Unknown")),
                        "conversation_id": conversation_id
                    }
                    for participant_id in conv.get("participant_ids", []):
                        if participant_id != user_id:
                            await manager.send_personal_message(typing_payload, participant_id)

            elif message_type == "read":
                # User read messages
                conversation_id = data.get("conversation_id")
                # Mark all messages from the other user as read
                other_user = data.get("other_user_id")
                if other_user:
                    await db.chat_messages.update_many(
                        {
                            "conversation_id": conversation_id,
                            "sender_id": other_user,
                            "is_read": False
                        },
                        {"$set": {"is_read": True}}
                    )
                    # Reset unread count
                    await db.conversations.update_one(
                        {"id": conversation_id},
                        {"$set": {f"unread_counts.{user_id}": 0}}
                    )
                    # Notify the other user
                    read_payload = {
                        "type": "message_read",
                        "conversation_id": conversation_id,
                        "read_by": user_id
                    }
                    await manager.send_personal_message(read_payload, other_user)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)

@api_router.websocket("/ws/data/{token}")
async def websocket_data(websocket: WebSocket, token: str):
    """WebSocket endpoint for real-time data updates (references, alerts, user status)"""
    # Verify token and get user
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            await websocket.close(code=4001, reason="Invalid token")
            return
    except JWTError:
        await websocket.close(code=4001, reason="Invalid token")
        return

    # Get user info
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "name": 1, "username": 1, "department_type": 1})
    if not user:
        await websocket.close(code=4002, reason="User not found")
        return

    await manager.connect(websocket, user_id)
    
    # Send welcome message confirming connection
    await websocket.send_json({
        "type": "connected",
        "user_id": user_id,
        "message": "Connected to real-time data updates"
    })
    
    try:
        while True:
            # Keep connection alive, listen for any client messages if needed
            data = await websocket.receive_json()
            # Could handle subscription updates here if needed
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket data error: {e}")
        manager.disconnect(websocket)

# ==================== CHAT API ENDPOINTS ====================

@api_router.get("/chat/users")
async def get_chat_users(current_user: dict = Depends(get_current_user)):
    """Get all users that can be chatted with (all users except current)"""
    try:
        users = await db.users.find(
            {"id": {"$ne": current_user["id"]}},
            {"_id": 0, "id": 1, "username": 1, "name": 1, "last_active": 1}
        ).to_list(length=500)

        # Determine online status (active in last 5 minutes)
        now = datetime.now(timezone.utc)
        online_threshold = now - timedelta(minutes=5)

        result = []
        for u in users:
            is_online = False
            if u.get("last_active"):
                last_active = u["last_active"]
                # Convert to timezone-aware if naive
                if isinstance(last_active, str):
                    last_active = datetime.fromisoformat(last_active)
                if last_active.tzinfo is None:
                    last_active = last_active.replace(tzinfo=timezone.utc)
                is_online = last_active > online_threshold
            result.append({
                "id": u["id"],
                "username": u["username"],
                "name": u["name"],
                "last_active": u.get("last_active"),
                "is_online": is_online
            })

        return result
    except Exception as e:
        logger.error(f"Error in get_chat_users: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/chat/conversations")
async def get_conversations(current_user: dict = Depends(get_current_user)):
    """Get all conversations for the current user"""
    try:
        user_id = current_user["id"]

        conversations = await db.conversations.find(
            {"participant_ids": user_id}
        ).sort("updated_at", -1).to_list(length=100)

        result = []
        for conv in conversations:
            # Get participant info
            participants = []
            for pid in conv.get("participant_ids", []):
                if pid != user_id:
                    puser = await db.users.find_one(
                        {"id": pid},
                        {"_id": 0, "id": 1, "username": 1, "name": 1, "last_active": 1}
                    )
                    if puser:
                        is_online = False
                        if puser.get("last_active"):
                            last_active = puser["last_active"]
                            # Convert to timezone-aware if naive
                            if isinstance(last_active, str):
                                last_active = datetime.fromisoformat(last_active)
                            if last_active.tzinfo is None:
                                last_active = last_active.replace(tzinfo=timezone.utc)
                            online_threshold = datetime.now(timezone.utc) - timedelta(minutes=5)
                            is_online = last_active > online_threshold
                        participants.append({
                            "id": puser["id"],
                            "username": puser["username"],
                            "name": puser["name"],
                            "last_active": puser.get("last_active"),
                            "is_online": is_online
                        })

            # Get unread count for current user
            unread_count = conv.get("unread_counts", {}).get(user_id, 0)

            result.append({
                "id": conv["id"],
                "participants": participants,
                "last_message": conv.get("last_message"),
                "last_message_time": conv.get("last_message_time"),
                "last_message_sender_id": conv.get("last_message_sender_id"),
                "unread_count": unread_count,
                "created_at": conv.get("created_at"),
                "updated_at": conv.get("updated_at")
            })

        return result
    except Exception as e:
        logger.error(f"Error in get_conversations: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/chat/conversations")
async def create_or_get_conversation(
    data: ConversationCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new conversation or get existing one with a user"""
    user_id = current_user["id"]
    other_user_id = data.participant_id

    # Check if conversation already exists
    existing = await db.conversations.find_one({
        "participant_ids": {"$all": [user_id, other_user_id], "$size": 2}
    })

    if existing:
        # Return existing conversation
        other_user = await db.users.find_one(
            {"id": other_user_id},
            {"_id": 0, "id": 1, "username": 1, "name": 1, "last_active": 1}
        )
        is_online = False
        if other_user and other_user.get("last_active"):
            last_active = other_user["last_active"]
            # Convert to timezone-aware if naive
            if isinstance(last_active, str):
                last_active = datetime.fromisoformat(last_active)
            if last_active.tzinfo is None:
                last_active = last_active.replace(tzinfo=timezone.utc)
            online_threshold = datetime.now(timezone.utc) - timedelta(minutes=5)
            is_online = last_active > online_threshold

        return {
            "id": existing["id"],
            "participants": [{
                "id": other_user["id"],
                "username": other_user["username"],
                "name": other_user["name"],
                "last_active": other_user.get("last_active"),
                "is_online": is_online
            }] if other_user else [],
            "last_message": existing.get("last_message"),
            "last_message_time": existing.get("last_message_time"),
            "last_message_sender_id": existing.get("last_message_sender_id"),
            "unread_count": existing.get("unread_counts", {}).get(user_id, 0),
            "created_at": existing.get("created_at"),
            "updated_at": existing.get("updated_at")
        }

    # Create new conversation
    conv = Conversation(
        participant_ids=[user_id, other_user_id],
        unread_counts={user_id: 0, other_user_id: 0}
    )
    await db.conversations.insert_one(conv.model_dump())

    # Get other user info
    other_user = await db.users.find_one(
        {"id": other_user_id},
        {"_id": 0, "id": 1, "username": 1, "name": 1, "last_active": 1}
    )
    is_online = False
    if other_user and other_user.get("last_active"):
        if isinstance(other_user["last_active"], str):
            other_user["last_active"] = datetime.fromisoformat(other_user["last_active"])
        # Make sure last_active is timezone-aware
        last_active = other_user["last_active"]
        if last_active.tzinfo is None:
            last_active = last_active.replace(tzinfo=timezone.utc)
        online_threshold = datetime.now(timezone.utc) - timedelta(minutes=5)
        is_online = last_active > online_threshold

    return {
        "id": conv.id,
        "participants": [{
            "id": other_user["id"],
            "username": other_user["username"],
            "name": other_user["name"],
            "last_active": other_user.get("last_active"),
            "is_online": is_online
        }] if other_user else [],
        "last_message": None,
        "last_message_time": None,
        "last_message_sender_id": None,
        "unread_count": 0,
        "created_at": conv.created_at,
        "updated_at": conv.updated_at
    }

@api_router.get("/chat/conversations/{conversation_id}/messages")
async def get_conversation_messages(
    conversation_id: str,
    limit: int = 50,
    before: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get messages for a conversation"""
    user_id = current_user["id"]

    # Verify user is part of conversation
    conv = await db.conversations.find_one({
        "id": conversation_id,
        "participant_ids": user_id
    })
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Build query
    query = {"conversation_id": conversation_id}
    if before:
        try:
            before_dt = datetime.fromisoformat(before)
            query["created_at"] = {"$lt": before_dt}
        except ValueError:
            pass

    messages = await db.chat_messages.find(query).sort("created_at", -1).limit(limit).to_list(length=limit)

    # Reverse to get chronological order
    messages = list(reversed(messages))

    # Convert ObjectId and datetime to JSON-serializable format
    for msg in messages:
        # Convert _id to string
        if "_id" in msg:
            msg["_id"] = str(msg["_id"])
        # Convert datetime to ISO strings
        if isinstance(msg.get("created_at"), datetime):
            msg["created_at"] = msg["created_at"].isoformat()

    return messages

@api_router.post("/chat/messages")
async def create_message(
    data: MessageCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new message (also handles file uploads)"""
    user_id = current_user["id"]

    # Verify user is part of conversation
    conv = await db.conversations.find_one({
        "id": data.conversation_id,
        "participant_ids": user_id
    })
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Create message
    msg_obj = ChatMessage(
        conversation_id=data.conversation_id,
        sender_id=user_id,
        sender_name=current_user.get("name", current_user.get("username", "Unknown")),
        content=data.content,
        message_type=data.message_type,
        file_url=data.file_url,
        file_name=data.file_name,
        file_size=data.file_size,
        file_mime_type=data.file_mime_type
    )
    await db.chat_messages.insert_one(msg_obj.model_dump())

    # Update conversation
    await db.conversations.update_one(
        {"id": data.conversation_id},
        {
            "$set": {
                "last_message": data.content[:100] if data.content else f"{data.message_type}: {data.file_name or 'file'}",
                "last_message_time": datetime.now(timezone.utc),
                "last_message_sender_id": user_id,
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )

    # Send real-time message to participants
    for participant_id in conv.get("participant_ids", []):
        if participant_id != user_id:
            # Increment unread count
            await db.conversations.update_one(
                {"id": data.conversation_id},
                {"$inc": {f"unread_counts.{participant_id}": 1}}
            )
            # Send real-time notification
            await manager.send_personal_message({
                "type": "new_message",
                "message": {
                    "id": msg_obj.id,
                    "conversation_id": data.conversation_id,
                    "sender_id": user_id,
                    "sender_name": current_user.get("name", current_user.get("username", "Unknown")),
                    "content": data.content,
                    "message_type": data.message_type,
                    "file_url": data.file_url,
                    "file_name": data.file_name,
                    "file_size": data.file_size,
                    "file_mime_type": data.file_mime_type,
                    "is_read": False,
                    "created_at": msg_obj.created_at.isoformat()
                }
            }, participant_id)

    return {
        "id": msg_obj.id,
        "conversation_id": data.conversation_id,
        "sender_id": user_id,
        "sender_name": msg_obj.sender_name,
        "content": data.content,
        "message_type": data.message_type,
        "file_url": data.file_url,
        "file_name": data.file_name,
        "file_size": data.file_size,
        "file_mime_type": data.file_mime_type,
        "is_read": False,
        "created_at": msg_obj.created_at.isoformat()
    }

@api_router.post("/chat/upload")
async def upload_chat_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a file for chat"""
    # Create uploads directory
    upload_dir = Path(__file__).parent / "uploads" / "chat"
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Generate unique filename
    file_id = str(uuid.uuid4())
    file_ext = Path(file.filename).suffix if file.filename else ""
    safe_filename = f"{file_id}{file_ext}"
    file_path = upload_dir / safe_filename

    # Save file
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # Get file size
    file_size = len(content)

    # Determine if it's an image
    content_type = file.content_type or "application/octet-stream"
    is_image = content_type.startswith("image/")

    # Return file URL (relative to backend)
    return {
        "file_url": f"/api/chat/files/{safe_filename}",
        "file_name": file.filename,
        "file_size": file_size,
        "file_mime_type": content_type,
        "is_image": is_image
    }

@api_router.get("/chat/files/{filename}")
async def get_chat_file(filename: str):
    """Serve uploaded chat files"""
    file_path = Path(__file__).parent / "uploads" / "chat" / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    from fastapi.responses import FileResponse
    return FileResponse(file_path)


# =====================
# NOC Schedule Endpoints
# =====================

@api_router.get("/noc-schedule", response_model=List[NOCSchedule])
async def get_noc_schedule(
    year: int,
    month: int,
    current_user: dict = Depends(get_current_user)
):
    """Get NOC schedule for a specific month"""
    # Calculate start and end dates for the month
    start_date = datetime(year, month, 1)
    if month == 12:
        end_date = datetime(year + 1, 1, 1)
    else:
        end_date = datetime(year, month + 1, 1)
    
    # Get active NOC users to filter out inactive ones
    # Also include users who don't have is_active field (backward compatibility)
    active_noc_users = await db.users.find(
        {
            "department_id": "dept_noc",
            "$or": [
                {"is_active": True},
                {"is_active": {"$exists": False}}
            ]
        },
        {"_id": 0, "id": 1}
    ).to_list(1000)
    active_noc_user_ids = [u["id"] for u in active_noc_users]
    
    # Fetch schedules for the month only for active NOC users
    schedules = await db.noc_schedules.find({
        "date": {
            "$gte": start_date.strftime("%Y-%m-%d"),
            "$lt": end_date.strftime("%Y-%m-%d")
        },
        "noc_user_id": {"$in": active_noc_user_ids}
    }).to_list(1000)
    
    # Convert and clean up MongoDB documents
    result = []
    for schedule in schedules:
        # Remove MongoDB _id field which can't be serialized by Pydantic
        schedule.pop("_id", None)
        
        # Convert datetime fields
        if schedule.get("created_at") and hasattr(schedule["created_at"], "isoformat"):
            schedule["created_at"] = schedule["created_at"].isoformat()
        if schedule.get("updated_at") and hasattr(schedule["updated_at"], "isoformat"):
            schedule["updated_at"] = schedule["updated_at"].isoformat()
        
        # Validate with Pydantic model
        try:
            result.append(NOCSchedule(**schedule))
        except Exception as e:
            logger.error(f"Error parsing schedule: {e}, schedule: {schedule}")
    
    return result


@api_router.post("/noc-schedule", response_model=NOCSchedule)
async def create_noc_schedule(
    schedule: NOCScheduleCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new NOC schedule entry (Admin only)"""
    # Check if user is admin
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create schedules")
    
    # Get NOC user info
    noc_user = await db.users.find_one({"id": schedule.noc_user_id})
    if not noc_user:
        raise HTTPException(status_code=404, detail="NOC user not found")
    
    # Check if schedule already exists
    existing = await db.noc_schedules.find_one({
        "noc_user_id": schedule.noc_user_id,
        "date": schedule.date
    })
    
    noc_user_name = noc_user.get("name", noc_user.get("username", "Unknown"))
    now = datetime.now(timezone.utc)
    
    if existing:
        # Update existing
        await db.noc_schedules.update_one(
            {"id": existing["id"]},
            {"$set": {
                "shift_type": schedule.shift_type,
                "notes": schedule.notes,
                "updated_at": now
            }}
        )
    else:
        # Create new
        schedule_obj = NOCSchedule(
            noc_user_id=schedule.noc_user_id,
            noc_user_name=noc_user_name,
            date=schedule.date,
            shift_type=schedule.shift_type,
            notes=schedule.notes,
            created_by=current_user.get("id")
        )
        await db.noc_schedules.insert_one(schedule_obj.model_dump())
    
    # Return the schedule
    updated = await db.noc_schedules.find_one({
        "noc_user_id": schedule.noc_user_id,
        "date": schedule.date
    })
    
    # Remove MongoDB _id field
    if updated:
        updated.pop("_id", None)
    
    if updated.get("created_at") and hasattr(updated["created_at"], "isoformat"):
        updated["created_at"] = updated["created_at"].isoformat()
    if updated.get("updated_at") and hasattr(updated["updated_at"], "isoformat"):
        updated["updated_at"] = updated["updated_at"].isoformat()
    
    return NOCSchedule(**updated)


@api_router.put("/noc-schedule/{schedule_id}", response_model=NOCSchedule)
async def update_noc_schedule(
    schedule_id: str,
    schedule_update: NOCScheduleUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a NOC schedule entry (Admin only)"""
    # Check if user is admin
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update schedules")
    
    # Check if schedule exists
    existing = await db.noc_schedules.find_one({"id": schedule_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    # Build update fields
    update_data = schedule_update.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    # If noc_user_id is being changed, update the name too
    if "noc_user_id" in update_data:
        noc_user = await db.users.find_one({"id": update_data["noc_user_id"]})
        if noc_user:
            update_data["noc_user_name"] = noc_user.get("name", noc_user.get("username", "Unknown"))
    
    await db.noc_schedules.update_one(
        {"id": schedule_id},
        {"$set": update_data}
    )
    
    # Return updated schedule
    updated = await db.noc_schedules.find_one({"id": schedule_id})
    
    # Remove MongoDB _id field
    if updated:
        updated.pop("_id", None)
    
    if updated.get("created_at") and hasattr(updated["created_at"], "isoformat"):
        updated["created_at"] = updated["created_at"].isoformat()
    if updated.get("updated_at") and hasattr(updated["updated_at"], "isoformat"):
        updated["updated_at"] = updated["updated_at"].isoformat()
    
    return NOCSchedule(**updated)


@api_router.delete("/noc-schedule/{schedule_id}")
async def delete_noc_schedule(
    schedule_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a NOC schedule entry (Admin only)"""
    # Check if user is admin
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete schedules")
    
    # Check if schedule exists
    existing = await db.noc_schedules.find_one({"id": schedule_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    await db.noc_schedules.delete_one({"id": schedule_id})
    
    return {"message": "Schedule deleted successfully"}


@api_router.post("/noc-schedule/bulk", response_model=List[NOCSchedule])
async def bulk_create_noc_schedule(
    bulk_data: NOCScheduleBulkCreate,
    current_user: dict = Depends(get_current_user)
):
    """Bulk create NOC schedule entries (Admin only)"""
    # Check if user is admin
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create schedules")
    
    created_schedules = []
    
    for schedule_data in bulk_data.schedules:
        # Get NOC user info
        noc_user = await db.users.find_one({"id": schedule_data.noc_user_id})
        if not noc_user:
            continue  # Skip invalid users
        
        # Check if schedule already exists for this user on this date
        existing = await db.noc_schedules.find_one({
            "noc_user_id": schedule_data.noc_user_id,
            "date": schedule_data.date
        })
        if existing:
            continue  # Skip existing schedules
        
        # Create schedule
        schedule_obj = NOCSchedule(
            noc_user_id=schedule_data.noc_user_id,
            noc_user_name=noc_user.get("name", noc_user.get("username", "Unknown")),
            date=schedule_data.date,
            shift_type=schedule_data.shift_type,
            notes=schedule_data.notes,
            created_by=current_user.get("id")
        )
        
        await db.noc_schedules.insert_one(schedule_obj.model_dump())
        
        # Convert to dict and add to results
        result = schedule_obj.model_dump()
        created_schedules.append(result)
    
    return created_schedules


# =====================
# NOC Monthly Notes Endpoints
# =====================

@api_router.get("/noc-schedule/monthly-note", response_model=Optional[NOCMonthlyNote])
async def get_monthly_note(
    year: int,
    month: int,
    current_user: dict = Depends(get_current_user)
):
    """Get monthly note for NOC schedule"""
    note = await db.noc_monthly_notes.find_one({
        "year": year,
        "month": month
    })
    
    if note:
        # Remove MongoDB _id field
        note.pop("_id", None)
        
        if note.get("created_at") and hasattr(note["created_at"], "isoformat"):
            note["created_at"] = note["created_at"].isoformat()
        if note.get("updated_at") and hasattr(note["updated_at"], "isoformat"):
            note["updated_at"] = note["updated_at"].isoformat()
        
        return NOCMonthlyNote(**note)
    
    return None


@api_router.post("/noc-schedule/monthly-note", response_model=NOCMonthlyNote)
async def create_or_update_monthly_note(
    note_data: NOCMonthlyNoteCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create or update monthly note (Admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update monthly notes")
    
    # Check if note exists
    existing = await db.noc_monthly_notes.find_one({
        "year": note_data.year,
        "month": note_data.month
    })
    
    if existing:
        # Update existing
        await db.noc_monthly_notes.update_one(
            {"id": existing["id"]},
            {"$set": {
                "note": note_data.note,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        updated = await db.noc_monthly_notes.find_one({"id": existing["id"]})
    else:
        # Create new
        note_obj = NOCMonthlyNote(
            year=note_data.year,
            month=note_data.month,
            note=note_data.note,
            created_by=current_user.get("id")
        )
        await db.noc_monthly_notes.insert_one(note_obj.model_dump())
        updated = note_obj.model_dump()
    
    # Remove MongoDB _id field
    if updated:
        updated.pop("_id", None)
    
    if updated.get("created_at") and hasattr(updated["created_at"], "isoformat"):
        updated["created_at"] = updated["created_at"].isoformat()
    if updated.get("updated_at") and hasattr(updated["updated_at"], "isoformat"):
        updated["updated_at"] = updated["updated_at"].isoformat()
    
    return NOCMonthlyNote(**updated)


# Include router
app.include_router(api_router)

# CORS middleware - must be added AFTER including routers for proper middleware order
# Note: When allow_credentials=True, we cannot use allow_origins='*'
cors_origins = [
    o.strip()
    for o in os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:8080,http://127.0.0.1:8080,http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000"
    ).split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
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
    
    # Create chat collections if they don't exist
    try:
        # Create conversations collection with indexes
        if "conversations" not in await db.list_collection_names():
            await db.create_collection("conversations")
        await db.conversations.create_index("participant_ids")
        await db.conversations.create_index("updated_at")
        
        # Create chat_messages collection with indexes
        if "chat_messages" not in await db.list_collection_names():
            await db.create_collection("chat_messages")
        await db.chat_messages.create_index("conversation_id")
        await db.chat_messages.create_index("created_at")
        
        # Create audit_logs collection if it doesn't exist
        if "audit_logs" not in await db.list_collection_names():
            await db.create_collection("audit_logs")
        await db.audit_logs.create_index("timestamp")
        await db.audit_logs.create_index("user_id")
        await db.audit_logs.create_index("entity_type")
        
        # Create noc_schedules collection if it doesn't exist
        if "noc_schedules" not in await db.list_collection_names():
            await db.create_collection("noc_schedules")
        await db.noc_schedules.create_index("date")
        await db.noc_schedules.create_index("noc_user_id")
        await db.noc_schedules.create_index([("noc_user_id", 1), ("date", 1)])
        
        # Create noc_monthly_notes collection if it doesn't exist
        if "noc_monthly_notes" not in await db.list_collection_names():
            await db.create_collection("noc_monthly_notes")
        await db.noc_monthly_notes.create_index([("year", 1), ("month", 1)])
        
        logger.info("Chat collections initialized successfully")
    except Exception as e:
        logger.error(f"Error initializing chat collections: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
