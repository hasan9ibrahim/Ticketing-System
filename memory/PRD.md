# Wii Telecom NOC Ticketing System - PRD

## Original Problem Statement
Build a ticketing system for Wii Telecom with user authentication, role-based access control (Admin, Account Manager, NOC), and comprehensive ticket management for both SMS and Voice trouble tickets.

## User Personas
- **Admin**: Full system access - manages enterprises, users, and all tickets
- **Account Manager (AM)**: Assigned to either SMS or Voice tickets. View-only access to tickets related to their enterprises (as client or vendor). Cannot create/modify tickets.
- **NOC Member**: Can create and manage tickets. Can be assigned to tickets.

## Core Requirements

### Authentication
- Username/Phone Number/Email + Password authentication
- JWT-based session management
- Role-based access control

### Roles & Permissions
| Role | Create Tickets | Edit Tickets | View Tickets | Manage Users | Manage Enterprises |
|------|---------------|--------------|--------------|--------------|-------------------|
| Admin | Yes | Yes | All | Yes | Yes |
| AM (SMS) | No | No | SMS only (own enterprises) | No | View own only |
| AM (Voice) | No | No | Voice only (own enterprises) | No | View own only |
| NOC | Yes | Yes | All | No | No |

### Ticket Fields

#### SMS Tickets
| Field | Required | Description |
|-------|----------|-------------|
| Ticket # | Auto | Format: #<Date><ID> |
| Date | Auto | Creation timestamp |
| Priority | Yes | Low, Medium, High, Urgent |
| Volume | Yes | Message volume |
| Customer (Enterprise) | Yes | Associated enterprise |
| Client/Vendor Role | Yes | Enterprise's role in this ticket |
| Customer Trunk | Yes | Enterprise trunk identifier |
| Destination | No | Target destination |
| Issue | Yes | Problem description |
| Opened Via | Yes | Monitoring, Email, Teams, AM, or combinations |
| Assigned To | No | NOC member assignment |
| Status | Yes | Unassigned, Assigned, Awaiting Vendor, Awaiting Client, Awaiting AM, Resolved, Unresolved |
| SID | No | Message SID |
| Content | No | Message content sample |
| Rate | No | Rate per message |
| Vendor Trunk | No | Vendor trunk identifier |
| Cost | No | Cost per message |
| Is LCR | No | Yes/No |
| Root Cause | No | Identified root cause |
| Action Taken | No | Resolution actions |
| Internal Notes | No | Internal notes (not visible to client) |

#### Voice Tickets
Same as SMS tickets, excluding SID and Content fields.

### UI Requirements
- Dark theme with emerald green accents
- Searchable dropdowns for form fields
- Date range filter with calendar picker (default: today)
- Status tabs: Unassigned (default), Assigned, Other
- Complex sorting: Priority → Volume → Opened Via (Monitoring > Teams > Email)
- Date separators grouping tickets by day

### Enterprise Attributes
- Name
- Contact Person
- Contact Email/Phone
- Assigned AM
- Tier (priority level)
- NOC Emails

## What's Been Implemented ✅

### Authentication & Users (Dec 2025)
- [x] JWT-based authentication with username/email/phone login
- [x] Role-based access control (admin, am, noc)
- [x] AM type assignment (SMS or Voice)
- [x] User management (admin only)

### Enterprises Management (Dec 2025)
- [x] CRUD operations for enterprises
- [x] Tier and NOC emails fields
- [x] AM assignment to enterprises
- [x] "My Enterprises" view for AMs

### SMS Tickets (Feb 2026)
- [x] Full CRUD operations
- [x] All required fields implemented
- [x] Client/Vendor role selector
- [x] AM restrictions (view-only, filtered by enterprise)
- [x] Status tabs (Unassigned, Assigned, Other)
- [x] Complex sorting (Priority → Volume → Opened Via)
- [x] Date range filtering
- [x] Date separators

### Voice Tickets (Feb 2026)
- [x] Full CRUD operations
- [x] All required fields (excluding SMS-specific SID/Content)
- [x] Mirrored UI from SMS tickets page
- [x] AM restrictions and filtering

### Dashboard (Dec 2025)
- [x] Overview statistics
- [x] Ticket counts by status and priority
- [x] Recent tickets list

### Navigation (Feb 2026)
- [x] Role-based navigation filtering
- [x] AM type-specific navigation (SMS AM sees SMS only, Voice AM sees Voice only)

## Test Coverage
- Backend: 21 API tests passing (100%)
- Frontend: UI verification complete (100%)
- Test file: `/app/backend/tests/test_wii_telecom.py`

## Test Credentials
| User | Username | Password | Role | AM Type |
|------|----------|----------|------|---------|
| Admin | admin | admin123 | admin | - |
| SMS AM | am_sms | am123 | am | sms |
| Voice AM | am_voice | am123 | am | voice |
| NOC | noc_user | noc123 | noc | - |

## Architecture
- **Backend**: FastAPI, Python, MongoDB
- **Frontend**: React, TailwindCSS, Shadcn/UI
- **Authentication**: JWT tokens

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | User login |
| GET | /api/auth/me | Current user info |
| GET/POST | /api/users | User management |
| GET/POST | /api/clients | Enterprise management |
| GET/POST/PUT/DELETE | /api/tickets/sms | SMS ticket CRUD |
| GET/POST/PUT/DELETE | /api/tickets/voice | Voice ticket CRUD |
| GET | /api/dashboard/stats | Dashboard statistics |

## Prioritized Backlog

### P0 - Critical (Complete ✅)
- All core ticketing functionality implemented
- Role-based access control working
- AM navigation filtering working

### P1 - High Priority
- [ ] Email/SMS notifications for ticket updates
- [ ] Bulk ticket import/export (CSV)
- [ ] Advanced reporting and analytics

### P2 - Medium Priority
- [ ] Ticket templates for common issues
- [ ] Auto-assignment rules based on enterprise/priority
- [ ] SLA tracking and alerts

### P3 - Future Enhancements
- [ ] Mobile-responsive optimizations
- [ ] Real-time ticket updates (WebSocket)
- [ ] Integration with monitoring systems
- [ ] Audit log for ticket changes
