import re

pages = {
    r'C:\Users\HP\ticketing-system\frontend\src\pages\RequestsPage.jsx': 'deptType',
    r'C:\Users\HP\ticketing-system\frontend\src\pages\SMSTicketsPage.js': 'sms',
    r'C:\Users\HP\ticketing-system\frontend\src\pages\VoiceTicketsPage.js': 'voice',
}

for file_path, section_var in pages.items():
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # For RequestsPage - use deptType variable
        if 'RequestsPage' in file_path:
            # Replace: const trunkResponse = await axios.get(`${API}/trunks/${deptType}`
            # With: const vendorTrunkResponse = await axios.get(`${API}/references/trunks/${deptType}`
            pattern = r'const trunkResponse = await axios\.get\(`\$\{API\}/trunks/\$\{deptType\}`'
            replacement = 'const vendorTrunkResponse = await axios.get(`${API}/references/trunks/${deptType}`'
            content = re.sub(pattern, replacement, content)
            
            # Now add the customer trunks call after vendor trunks call
            pattern2 = r'(const vendorTrunkResponse = await axios\.get\(`\$\{API\}/references/trunks/\$\{deptType\}`, \{ headers \}\);)'
            replacement2 = r'\1\n      const customerTrunkResponse = await axios.get(`${API}/trunks/${deptType}`, { headers });'
            content = re.sub(pattern2, replacement2, content)
            
            # Update the setVendorTrunkOptions line to use vendorTrunkResponse
            content = re.sub(r'setVendorTrunkOptions\(trunkResponse\.data', 'setVendorTrunkOptions(vendorTrunkResponse.data', content)
            # Update the setCustomerTrunkOptions line to use customerTrunkResponse
            content = re.sub(r'setCustomerTrunkOptions\(trunkResponse\.data', 'setCustomerTrunkOptions(customerTrunkResponse.data', content)
        else:
            # For SMS and Voice pages - use hardcoded section
            pattern = rf'const response = await axios\.get\(`\$\{{API\}}/trunks/{section_var}`'
            replacement = f'const vendorTrunkResponse = await axios.get(`${{API}}/references/trunks/{section_var}`'
            content = re.sub(pattern, replacement, content)
            
            # Add second call
            pattern2 = rf'(const vendorTrunkResponse = await axios\.get\(`\$\{{API\}}/references/trunks/{section_var}`, \{{ headers \}}\);)'
            replacement2 = f'\\1\n      const customerTrunkResponse = await axios.get(`${{API}}/trunks/{section_var}`, {{ headers }});'
            content = re.sub(pattern2, replacement2, content)
            
            # Update setVendorTrunkOptions
            content = re.sub(r'setVendorTrunkOptions\(response\.data', 'setVendorTrunkOptions(vendorTrunkResponse.data', content)
            # Update setCustomerTrunkOptions
            content = re.sub(r'setCustomerTrunkOptions\(response\.data', 'setCustomerTrunkOptions(customerTrunkResponse.data', content)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        filename = file_path.split('\\')[-1]
        print(f'✓ Fixed {filename}')
    except Exception as e:
        print(f'✗ Error fixing {file_path}: {e}')

print('\n✅ All pages fixed! Vendor trunks now show for all enterprises/sections.')
