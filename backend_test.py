#!/usr/bin/env python3

import requests
import json
import sys
from datetime import datetime
import time

class WiiTicketingAPITester:
    def __init__(self, base_url="https://wii-trouble-tracker.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.admin_token = None
        self.am_token = None
        self.noc_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        self.created_user_id = None
        self.created_client_id = None
        self.created_sms_ticket_id = None
        self.created_voice_ticket_id = None

    def log_result(self, test_name, success, details=""):
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            status = "✅ PASS"
        else:
            status = "❌ FAIL"
        
        result = f"{status} - {test_name}"
        if details:
            result += f" ({details})"
        
        print(result)
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details
        })
        return success

    def make_request(self, method, endpoint, data=None, token=None, expected_status=None):
        """Make HTTP request with error handling"""
        url = f"{self.base_url}{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            if expected_status and response.status_code != expected_status:
                return False, f"Expected {expected_status}, got {response.status_code}"

            try:
                return True, response.json()
            except:
                if response.status_code in [200, 201, 204]:
                    return True, {"message": "Success"}
                return False, f"Invalid JSON response with status {response.status_code}"

        except requests.exceptions.RequestException as e:
            return False, f"Request failed: {str(e)}"

    def test_login(self, username, password, description):
        """Test user login"""
        success, response = self.make_request(
            'POST', '/auth/login', 
            data={"identifier": username, "password": password},
            expected_status=200
        )
        
        if success and 'access_token' in response:
            token = response['access_token']
            user = response.get('user', {})
            return self.log_result(f"Login {description}", True, f"Role: {user.get('role')}"), token
        else:
            return self.log_result(f"Login {description}", False, str(response)), None

    def test_auth_endpoints(self):
        """Test authentication endpoints"""
        print("\n=== AUTHENTICATION TESTS ===")
        
        # Test admin login
        success, self.admin_token = self.test_login("admin", "admin123", "Admin")
        if not success:
            return False

        # Test AM login
        success, self.am_token = self.test_login("am_user", "am123", "Account Manager")
        if not success:
            return False

        # Test NOC login
        success, self.noc_token = self.test_login("noc_user", "noc123", "NOC Member")
        if not success:
            return False

        # Test /auth/me endpoint
        success, response = self.make_request('GET', '/auth/me', token=self.admin_token)
        self.log_result("Get current user info", success and 'username' in response)

        return True

    def test_user_management(self):
        """Test user management endpoints"""
        print("\n=== USER MANAGEMENT TESTS ===")

        # Get all users
        success, response = self.make_request('GET', '/users', token=self.admin_token)
        self.log_result("Get all users", success and isinstance(response, list))

        # Create a new user
        new_user_data = {
            "username": f"test_user_{int(time.time())}",
            "email": "testuser@example.com",
            "password": "TestPass123!",
            "role": "noc"
        }
        success, response = self.make_request('POST', '/auth/register', data=new_user_data, token=self.admin_token, expected_status=200)
        if success and 'id' in response:
            self.created_user_id = response['id']
            self.log_result("Create new user", True, f"ID: {self.created_user_id}")
        else:
            self.log_result("Create new user", False, str(response))

        return True

    def test_client_management(self):
        """Test client management endpoints"""
        print("\n=== CLIENT MANAGEMENT TESTS ===")

        # Get all clients
        success, response = self.make_request('GET', '/clients', token=self.admin_token)
        self.log_result("Get all clients", success and isinstance(response, list))

        # Create a new client
        new_client_data = {
            "name": f"Test Client {int(time.time())}",
            "contact_person": "John Doe",
            "contact_email": "john@testclient.com",
            "contact_phone": "+1234567890",
            "notes": "Test client for API testing"
        }
        success, response = self.make_request('POST', '/clients', data=new_client_data, token=self.admin_token, expected_status=200)
        if success and 'id' in response:
            self.created_client_id = response['id']
            self.log_result("Create new client", True, f"ID: {self.created_client_id}")
        else:
            self.log_result("Create new client", False, str(response))

        # Update the client - assign to AM
        if self.created_client_id:
            # First get AM user ID
            success, users = self.make_request('GET', '/users', token=self.admin_token)
            am_user = next((u for u in users if u['username'] == 'am_user'), None) if success else None
            
            if am_user:
                update_data = {"assigned_am_id": am_user['id']}
                success, response = self.make_request('PUT', f'/clients/{self.created_client_id}', data=update_data, token=self.admin_token)
                self.log_result("Assign client to AM", success and 'id' in response)

        # Test AM can see their assigned clients
        success, response = self.make_request('GET', '/clients', token=self.am_token)
        am_clients = response if success else []
        self.log_result("AM can view assigned clients", success and isinstance(am_clients, list))

        return True

    def test_sms_ticket_management(self):
        """Test SMS ticket management"""
        print("\n=== SMS TICKET MANAGEMENT TESTS ===")

        if not self.created_client_id:
            self.log_result("SMS ticket tests", False, "No client ID available")
            return False

        # Create SMS ticket
        sms_ticket_data = {
            "priority": "High",
            "customer_id": self.created_client_id,
            "issue": "SMS delivery failure - test ticket",
            "opened_via": "API Testing",
            "status": "Assigned",
            "customer_trunk": "TRUNK001",
            "destination": "+1234567890",
            "volume": "1000",
            "content": "Test SMS content"
        }
        success, response = self.make_request('POST', '/tickets/sms', data=sms_ticket_data, token=self.admin_token, expected_status=200)
        if success and 'id' in response:
            self.created_sms_ticket_id = response['id']
            self.log_result("Create SMS ticket", True, f"Ticket: {response.get('ticket_number')}")
        else:
            self.log_result("Create SMS ticket", False, str(response))

        # Get all SMS tickets
        success, response = self.make_request('GET', '/tickets/sms', token=self.admin_token)
        self.log_result("Get all SMS tickets", success and isinstance(response, list))

        # Update SMS ticket
        if self.created_sms_ticket_id:
            update_data = {"status": "Resolved", "action_taken": "Issue resolved via API test"}
            success, response = self.make_request('PUT', f'/tickets/sms/{self.created_sms_ticket_id}', data=update_data, token=self.admin_token)
            self.log_result("Update SMS ticket", success and 'id' in response)

        # Get specific SMS ticket
        if self.created_sms_ticket_id:
            success, response = self.make_request('GET', f'/tickets/sms/{self.created_sms_ticket_id}', token=self.admin_token)
            self.log_result("Get specific SMS ticket", success and 'id' in response)

        return True

    def test_voice_ticket_management(self):
        """Test Voice ticket management"""
        print("\n=== VOICE TICKET MANAGEMENT TESTS ===")

        if not self.created_client_id:
            self.log_result("Voice ticket tests", False, "No client ID available")
            return False

        # Create Voice ticket
        voice_ticket_data = {
            "priority": "Medium",
            "customer_id": self.created_client_id,
            "issue": "Voice call quality issues - test ticket",
            "opened_via": "API Testing",
            "status": "Assigned",
            "customer_trunk": "VOICE_TRUNK001",
            "destination": "+1987654321",
            "volume": "500",
            "rate": "0.05",
            "cost": "25.00"
        }
        success, response = self.make_request('POST', '/tickets/voice', data=voice_ticket_data, token=self.admin_token, expected_status=200)
        if success and 'id' in response:
            self.created_voice_ticket_id = response['id']
            self.log_result("Create Voice ticket", True, f"Ticket: {response.get('ticket_number')}")
        else:
            self.log_result("Create Voice ticket", False, str(response))

        # Get all Voice tickets
        success, response = self.make_request('GET', '/tickets/voice', token=self.admin_token)
        self.log_result("Get all Voice tickets", success and isinstance(response, list))

        # Update Voice ticket
        if self.created_voice_ticket_id:
            update_data = {"status": "Resolved", "action_taken": "Call quality improved via API test"}
            success, response = self.make_request('PUT', f'/tickets/voice/{self.created_voice_ticket_id}', data=update_data, token=self.admin_token)
            self.log_result("Update Voice ticket", success and 'id' in response)

        return True

    def test_dashboard_stats(self):
        """Test dashboard statistics"""
        print("\n=== DASHBOARD TESTS ===")

        # Test admin dashboard
        success, response = self.make_request('GET', '/dashboard/stats', token=self.admin_token)
        admin_stats_valid = (success and 
                           'total_sms_tickets' in response and 
                           'total_voice_tickets' in response and
                           'recent_tickets' in response)
        self.log_result("Admin dashboard stats", admin_stats_valid)

        # Test AM dashboard (should only show their assigned clients' tickets)
        success, response = self.make_request('GET', '/dashboard/stats', token=self.am_token)
        am_stats_valid = (success and 
                         'total_sms_tickets' in response and 
                         'total_voice_tickets' in response)
        self.log_result("AM dashboard stats", am_stats_valid)

        # Test NOC dashboard
        success, response = self.make_request('GET', '/dashboard/stats', token=self.noc_token)
        noc_stats_valid = (success and 
                          'total_sms_tickets' in response and 
                          'total_voice_tickets' in response)
        self.log_result("NOC dashboard stats", noc_stats_valid)

        return True

    def test_role_based_access(self):
        """Test role-based access control"""
        print("\n=== ROLE-BASED ACCESS CONTROL TESTS ===")

        # Test AM cannot create users (should fail)
        user_data = {"username": "test", "password": "test", "role": "noc"}
        success, response = self.make_request('POST', '/auth/register', data=user_data, token=self.am_token)
        self.log_result("AM cannot create users", not success, "Expected failure")

        # Test NOC cannot create clients (should fail)
        client_data = {"name": "Test Client"}
        success, response = self.make_request('POST', '/clients', data=client_data, token=self.noc_token)
        self.log_result("NOC cannot create clients", not success, "Expected failure")

        # Test AM can view their assigned clients only
        success, response = self.make_request('GET', '/clients', token=self.am_token)
        self.log_result("AM can view clients", success and isinstance(response, list))

        return True

    def cleanup(self):
        """Clean up created test resources"""
        print("\n=== CLEANUP ===")

        # Delete created user
        if self.created_user_id:
            success, response = self.make_request('DELETE', f'/users/{self.created_user_id}', token=self.admin_token)
            self.log_result("Delete test user", success)

        # Delete created client
        if self.created_client_id:
            success, response = self.make_request('DELETE', f'/clients/{self.created_client_id}', token=self.admin_token)
            self.log_result("Delete test client", success)

    def run_all_tests(self):
        """Run comprehensive API test suite"""
        print("🚀 Starting Wii Telecom Ticketing System API Tests")
        print(f"Testing against: {self.base_url}")
        print("=" * 60)

        try:
            # Test authentication first - critical for all other tests
            if not self.test_auth_endpoints():
                print("\n❌ Authentication failed - cannot proceed with other tests")
                return self.print_summary()

            # Run all test suites
            self.test_user_management()
            self.test_client_management()
            self.test_sms_ticket_management()
            self.test_voice_ticket_management()
            self.test_dashboard_stats()
            self.test_role_based_access()

            # Clean up
            self.cleanup()

        except Exception as e:
            print(f"\n💥 Unexpected error during testing: {str(e)}")

        return self.print_summary()

    def print_summary(self):
        """Print test summary and return success status"""
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            success_rate = 100
        else:
            success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
            print(f"⚠️  Success rate: {success_rate:.1f}%")

        # Show failed tests
        failed_tests = [r for r in self.test_results if not r['success']]
        if failed_tests:
            print("\n❌ Failed Tests:")
            for test in failed_tests:
                print(f"   - {test['test']}: {test['details']}")

        return self.tests_passed == self.tests_run

def main():
    """Main test execution"""
    tester = WiiTicketingAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())