#!/bin/bash
# Fix vendor trunks API calls on all three pages

echo "Fixing SMSTicketsPage.js..."
sed -i 's|const response = await axios.get(`${API}/trunks/sms`|const vendorTrunkResponse = await axios.get(`${API}/references/trunks/sms`|g' /c/Users/HP/ticketing-system/frontend/src/pages/SMSTicketsPage.js
sed -i 's|setCustomerTrunkOptions(response.data|setCustomerTrunkOptions(customerTrunkResponse.data|g' /c/Users/HP/ticketing-system/frontend/src/pages/SMSTicketsPage.js
sed -i 's|setVendorTrunkOptions(response.data|setVendorTrunkOptions(vendorTrunkResponse.data|g' /c/Users/HP/ticketing-system/frontend/src/pages/SMSTicketsPage.js

echo "Fixing VoiceTicketsPage.js..."
sed -i 's|const response = await axios.get(`${API}/trunks/voice`|const vendorTrunkResponse = await axios.get(`${API}/references/trunks/voice`|g' /c/Users/HP/ticketing-system/frontend/src/pages/VoiceTicketsPage.js
sed -i 's|setCustomerTrunkOptions(response.data|setCustomerTrunkOptions(customerTrunkResponse.data|g' /c/Users/HP/ticketing-system/frontend/src/pages/VoiceTicketsPage.js
sed -i 's|setVendorTrunkOptions(response.data|setVendorTrunkOptions(vendorTrunkResponse.data|g' /c/Users/HP/ticketing-system/frontend/src/pages/VoiceTicketsPage.js

echo "✅ Fixed all pages!"
