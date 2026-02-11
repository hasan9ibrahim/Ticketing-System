"""
Wii Telecom Ticketing System - Backend API Tests
Tests: Authentication, User Management, Client Management, SMS/Voice Tickets, Role Restrictions
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL environment variable must be set")

# Test credentials
ADMIN_CREDS = {"identifier": "admin", "password": "admin123"}
SMS_AM_CREDS = {"identifier": "am_sms", "password": "am123"}
VOICE_AM_CREDS = {"identifier": "am_voice", "password": "am123"}
NOC_CREDS = {"identifier": "noc_user", "password": "noc123"}


class TestAuthentication:
    """Test authentication endpoints"""
    
    def test_admin_login_success(self):
        """Test admin login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["username"] == "admin"
        assert data["user"]["role"] == "admin"
        print(f"Admin login successful: {data['user']['username']}")
    
    def test_sms_am_login_success(self):
        """Test SMS AM login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SMS_AM_CREDS)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "am"
        assert data["user"]["am_type"] == "sms"
        print(f"SMS AM login successful: {data['user']['username']}, am_type={data['user']['am_type']}")
    
    def test_voice_am_login_success(self):
        """Test Voice AM login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=VOICE_AM_CREDS)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "am"
        assert data["user"]["am_type"] == "voice"
        print(f"Voice AM login successful: {data['user']['username']}, am_type={data['user']['am_type']}")
    
    def test_noc_login_success(self):
        """Test NOC user login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=NOC_CREDS)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "noc"
        print(f"NOC login successful: {data['user']['username']}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": "invalid_user",
            "password": "wrong_password"
        })
        assert response.status_code == 401
        print("Invalid credentials properly rejected")
    
    def test_get_me_with_token(self):
        """Test getting current user info with valid token"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        token = login_response.json()["access_token"]
        
        # Get current user
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        
        data = response.json()
        assert data["username"] == "admin"
        print(f"Get me successful: {data['username']}")


class TestClientManagement:
    """Test client/enterprise management"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        return response.json()["access_token"]
    
    def test_get_clients_list(self, admin_token):
        """Test listing clients"""
        response = requests.get(f"{BASE_URL}/api/clients", headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Got {len(data)} clients")
    
    def test_create_client_admin_only(self, admin_token):
        """Test creating a client as admin"""
        client_data = {
            "name": "TEST_Enterprise_Pytest",
            "contact_person": "Test Contact",
            "contact_email": "test@enterprise.com",
            "tier": "Gold"
        }
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["name"] == "TEST_Enterprise_Pytest"
        assert "id" in data
        print(f"Created client: {data['name']}, id={data['id']}")
        
        # Store for cleanup
        self.__class__.created_client_id = data["id"]
    
    def test_am_cannot_create_client(self):
        """Test that AM cannot create clients"""
        # Login as AM
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json=SMS_AM_CREDS)
        if login_response.status_code != 200:
            pytest.skip("SMS AM user not available")
        
        token = login_response.json()["access_token"]
        
        client_data = {
            "name": "TEST_AM_Enterprise",
            "tier": "Bronze"
        }
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 403, f"Expected 403 for AM creating client, got {response.status_code}"
        print("AM correctly denied from creating clients")


class TestSMSTickets:
    """Test SMS ticket management"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        return response.json()["access_token"]
    
    @pytest.fixture
    def noc_token(self):
        """Get NOC token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=NOC_CREDS)
        if response.status_code != 200:
            pytest.skip("NOC user not available")
        return response.json()["access_token"]
    
    @pytest.fixture
    def sms_am_token(self):
        """Get SMS AM token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SMS_AM_CREDS)
        if response.status_code != 200:
            pytest.skip("SMS AM user not available")
        return response.json()["access_token"]
    
    @pytest.fixture
    def enterprise_id(self, admin_token):
        """Get or create an enterprise for testing"""
        # Get existing clients
        response = requests.get(f"{BASE_URL}/api/clients", headers={"Authorization": f"Bearer {admin_token}"})
        clients = response.json()
        
        if clients:
            return clients[0]["id"]
        
        # Create one if none exist
        client_data = {"name": "TEST_SMS_Enterprise", "tier": "Gold"}
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers={"Authorization": f"Bearer {admin_token}"})
        return response.json()["id"]
    
    def test_get_sms_tickets_list(self, admin_token):
        """Test listing SMS tickets"""
        response = requests.get(f"{BASE_URL}/api/tickets/sms", headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Got {len(data)} SMS tickets")
    
    def test_create_sms_ticket_admin(self, admin_token, enterprise_id):
        """Test creating SMS ticket as admin with all fields"""
        ticket_data = {
            "priority": "High",
            "volume": "1000",
            "customer_id": enterprise_id,
            "client_or_vendor": "client",
            "customer_trunk": "TRUNK-001",
            "destination": "US",
            "issue": "TEST_High latency on SMS delivery",
            "opened_via": "Monitoring",
            "status": "Unassigned",
            "sid": "SM123456789",
            "content": "Test message content sample",
            "rate": "0.01",
            "vendor_trunk": "VENDOR-001",
            "cost": "0.005",
            "is_lcr": "yes",
            "root_cause": "",
            "action_taken": "",
            "internal_notes": "TEST ticket - pytest"
        }
        
        response = requests.post(f"{BASE_URL}/api/tickets/sms", json=ticket_data, headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["priority"] == "High"
        assert data["volume"] == "1000"
        assert data["client_or_vendor"] == "client"
        assert data["sid"] == "SM123456789"
        assert data["content"] == "Test message content sample"
        assert data["rate"] == "0.01"
        assert data["vendor_trunk"] == "VENDOR-001"
        assert data["cost"] == "0.005"
        assert data["is_lcr"] == "yes"
        assert "ticket_number" in data
        print(f"Created SMS ticket: {data['ticket_number']}")
        
        # Store for later tests
        self.__class__.created_sms_ticket_id = data["id"]
    
    def test_create_sms_ticket_noc(self, noc_token, enterprise_id):
        """Test creating SMS ticket as NOC user"""
        ticket_data = {
            "priority": "Medium",
            "volume": "500",
            "customer_id": enterprise_id,
            "client_or_vendor": "vendor",
            "customer_trunk": "TRUNK-002",
            "issue": "TEST_NOC created ticket",
            "opened_via": "Email",
            "status": "Unassigned"
        }
        
        response = requests.post(f"{BASE_URL}/api/tickets/sms", json=ticket_data, headers={"Authorization": f"Bearer {noc_token}"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["client_or_vendor"] == "vendor"
        print(f"NOC created SMS ticket: {data['ticket_number']}")
    
    def test_am_cannot_create_sms_ticket(self, sms_am_token, enterprise_id):
        """Test that AM cannot create SMS tickets"""
        ticket_data = {
            "priority": "Low",
            "volume": "100",
            "customer_id": enterprise_id,
            "customer_trunk": "TRUNK-003",
            "issue": "TEST_AM trying to create ticket",
            "opened_via": "Teams",
            "status": "Unassigned"
        }
        
        response = requests.post(f"{BASE_URL}/api/tickets/sms", json=ticket_data, headers={"Authorization": f"Bearer {sms_am_token}"})
        assert response.status_code == 403, f"Expected 403 for AM creating ticket, got {response.status_code}"
        print("AM correctly denied from creating SMS tickets")
    
    def test_am_cannot_update_sms_ticket(self, admin_token, sms_am_token, enterprise_id):
        """Test that AM cannot update SMS tickets"""
        # First create a ticket as admin
        ticket_data = {
            "priority": "Medium",
            "volume": "200",
            "customer_id": enterprise_id,
            "customer_trunk": "TRUNK-004",
            "issue": "TEST_Ticket for AM update test",
            "opened_via": "Monitoring",
            "status": "Unassigned"
        }
        create_response = requests.post(f"{BASE_URL}/api/tickets/sms", json=ticket_data, headers={"Authorization": f"Bearer {admin_token}"})
        ticket_id = create_response.json()["id"]
        
        # Try to update as AM
        update_data = {"priority": "Urgent"}
        response = requests.put(f"{BASE_URL}/api/tickets/sms/{ticket_id}", json=update_data, headers={"Authorization": f"Bearer {sms_am_token}"})
        assert response.status_code == 403, f"Expected 403 for AM updating ticket, got {response.status_code}"
        print("AM correctly denied from updating SMS tickets")
    
    def test_sms_am_cannot_access_voice_tickets(self, sms_am_token):
        """Test that SMS AM cannot access Voice tickets"""
        response = requests.get(f"{BASE_URL}/api/tickets/voice", headers={"Authorization": f"Bearer {sms_am_token}"})
        assert response.status_code == 403, f"Expected 403 for SMS AM accessing Voice tickets, got {response.status_code}"
        print("SMS AM correctly denied from accessing Voice tickets")


class TestVoiceTickets:
    """Test Voice ticket management"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        return response.json()["access_token"]
    
    @pytest.fixture
    def voice_am_token(self):
        """Get Voice AM token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=VOICE_AM_CREDS)
        if response.status_code != 200:
            pytest.skip("Voice AM user not available")
        return response.json()["access_token"]
    
    @pytest.fixture
    def enterprise_id(self, admin_token):
        """Get or create an enterprise for testing"""
        response = requests.get(f"{BASE_URL}/api/clients", headers={"Authorization": f"Bearer {admin_token}"})
        clients = response.json()
        if clients:
            return clients[0]["id"]
        client_data = {"name": "TEST_Voice_Enterprise", "tier": "Gold"}
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers={"Authorization": f"Bearer {admin_token}"})
        return response.json()["id"]
    
    def test_get_voice_tickets_list(self, admin_token):
        """Test listing Voice tickets"""
        response = requests.get(f"{BASE_URL}/api/tickets/voice", headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Got {len(data)} Voice tickets")
    
    def test_create_voice_ticket_admin(self, admin_token, enterprise_id):
        """Test creating Voice ticket as admin with all fields"""
        ticket_data = {
            "priority": "Urgent",
            "volume": "5000",
            "customer_id": enterprise_id,
            "client_or_vendor": "client",
            "customer_trunk": "VOICE-TRUNK-001",
            "destination": "UK",
            "issue": "TEST_Call quality degradation",
            "opened_via": "Monitoring",
            "status": "Unassigned",
            "rate": "0.02",
            "vendor_trunk": "VENDOR-VOICE-001",
            "cost": "0.015",
            "is_lcr": "no",
            "root_cause": "",
            "action_taken": "",
            "internal_notes": "TEST Voice ticket - pytest"
        }
        
        response = requests.post(f"{BASE_URL}/api/tickets/voice", json=ticket_data, headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["priority"] == "Urgent"
        assert data["volume"] == "5000"
        assert data["client_or_vendor"] == "client"
        assert data["rate"] == "0.02"
        assert data["vendor_trunk"] == "VENDOR-VOICE-001"
        assert data["cost"] == "0.015"
        assert data["is_lcr"] == "no"
        # Voice tickets should NOT have SID and Content fields
        assert "sid" not in data or data.get("sid") is None
        assert "content" not in data or data.get("content") is None
        print(f"Created Voice ticket: {data['ticket_number']}")
    
    def test_am_cannot_create_voice_ticket(self, voice_am_token, enterprise_id):
        """Test that AM cannot create Voice tickets"""
        ticket_data = {
            "priority": "Low",
            "volume": "100",
            "customer_id": enterprise_id,
            "customer_trunk": "VOICE-TRUNK-002",
            "issue": "TEST_AM trying to create voice ticket",
            "opened_via": "Teams",
            "status": "Unassigned"
        }
        
        response = requests.post(f"{BASE_URL}/api/tickets/voice", json=ticket_data, headers={"Authorization": f"Bearer {voice_am_token}"})
        assert response.status_code == 403, f"Expected 403 for AM creating Voice ticket, got {response.status_code}"
        print("AM correctly denied from creating Voice tickets")
    
    def test_voice_am_cannot_access_sms_tickets(self, voice_am_token):
        """Test that Voice AM cannot access SMS tickets"""
        response = requests.get(f"{BASE_URL}/api/tickets/sms", headers={"Authorization": f"Bearer {voice_am_token}"})
        assert response.status_code == 403, f"Expected 403 for Voice AM accessing SMS tickets, got {response.status_code}"
        print("Voice AM correctly denied from accessing SMS tickets")


class TestDashboard:
    """Test dashboard stats endpoint"""
    
    def test_dashboard_stats(self):
        """Test getting dashboard statistics"""
        # Login as admin
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        token = login_response.json()["access_token"]
        
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        
        data = response.json()
        assert "total_sms_tickets" in data
        assert "total_voice_tickets" in data
        assert "sms_by_status" in data
        assert "voice_by_status" in data
        print(f"Dashboard stats: SMS={data['total_sms_tickets']}, Voice={data['total_voice_tickets']}")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_data(self):
        """Clean up TEST_ prefixed data after tests"""
        # Login as admin
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get and delete test clients
        clients_response = requests.get(f"{BASE_URL}/api/clients", headers=headers)
        for client in clients_response.json():
            if client["name"].startswith("TEST_"):
                requests.delete(f"{BASE_URL}/api/clients/{client['id']}", headers=headers)
                print(f"Deleted test client: {client['name']}")
        
        print("Cleanup completed")
