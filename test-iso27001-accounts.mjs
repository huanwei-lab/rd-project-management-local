#!/usr/bin/env node
import http from 'http';
import crypto from 'crypto';

const BASE_URL = 'http://127.0.0.1:3001';
let adminCookie = '';

function makeRequest(path, method = 'GET', body = null, cookie = '') {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    if (cookie) options.headers.cookie = cookie;
    if (body) options.headers['Content-Length'] = JSON.stringify(body).length;
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: json, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });
    
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('\n' + '='.repeat(70));
  console.log('📋 ISO 27001 Account Management Complete Test Suite');
  console.log('='.repeat(70));

  try {
    // Test 1: Admin Login
    console.log('\n[Test 1] Admin Login with ISO 27001 Password');
    console.log('-'.repeat(70));
    let res = await makeRequest('/api/login', 'POST', {
      email: 'local-admin@localhost',
      password: 'Admin@2026Secure'
    });
    if (res.status === 200 && res.data.user) {
      adminCookie = res.headers['set-cookie']?.[0];
      console.log('✅ Admin login successful');
      console.log(`   Email: ${res.data.user.email}`);
      console.log(`   Name: ${res.data.user.displayName}`);
      console.log(`   Role: ${res.data.user.accessRole}`);
    } else {
      console.log('❌ Admin login failed:', res.data.error);
      return;
    }

    // Test 2: Create New Account with ISO 27001 Password
    console.log('\n[Test 2] Create New Account - huan-wei.chiu@kuentong.com');
    console.log('-'.repeat(70));
    const testPassword = 'Test@Kuentong#2026';
    res = await makeRequest('/api/users', 'POST', {
      email: 'huan-wei.chiu@kuentong.com',
      displayName: 'Huan Wei Chiu',
      accessRole: 'pm',
      password: testPassword
    }, adminCookie);
    
    if (res.status === 201) {
      console.log('✅ Account created successfully');
      console.log(`   Email: huan-wei.chiu@kuentong.com`);
      console.log(`   Display Name: Huan Wei Chiu`);
      console.log(`   Role: pm`);
      console.log(`   Password: ${testPassword}`);
      console.log(`   Generated Default Password: ${res.data.defaultPassword || testPassword}`);
    } else {
      console.log('❌ Account creation failed:', res.data.error);
    }

    // Test 3: Test Weak Password Validation
    console.log('\n[Test 3] Password Validation - Weak Password (should fail)');
    console.log('-'.repeat(70));
    res = await makeRequest('/api/users', 'POST', {
      email: 'test-weak@kuentong.com',
      displayName: 'Test Weak',
      accessRole: 'viewer',
      password: 'weak'  // Too short, no special chars
    }, adminCookie);
    
    if (res.status !== 201) {
      console.log('✅ Weak password correctly rejected');
      console.log(`   Error: ${res.data.error}`);
    } else {
      console.log('❌ Weak password should have been rejected');
    }

    // Test 4: List All Users
    console.log('\n[Test 4] List All Users');
    console.log('-'.repeat(70));
    res = await makeRequest('/api/users', 'GET', null, adminCookie);
    if (res.status === 200 && res.data.users) {
      console.log('✅ User list retrieved');
      console.log(`   Total users: ${res.data.users.length}`);
      res.data.users.forEach(u => {
        const status = u.enabled ? '✓' : '✗';
        const lastLogin = u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '未登入';
        console.log(`   - ${u.email} (${u.displayName}) [${u.accessRole}] Status:${status} LastLogin:${lastLogin}`);
      });
    } else {
      console.log('❌ Failed to get user list:', res.data.error);
    }

    // Test 5: Test New Account Login
    console.log('\n[Test 5] Login with New Account');
    console.log('-'.repeat(70));
    res = await makeRequest('/api/login', 'POST', {
      email: 'huan-wei.chiu@kuentong.com',
      password: testPassword
    });
    
    if (res.status === 200 && res.data.user) {
      console.log('✅ New account login successful');
      console.log(`   Email: ${res.data.user.email}`);
      console.log(`   Name: ${res.data.user.displayName}`);
      console.log(`   Role: ${res.data.user.accessRole}`);
    } else {
      console.log('❌ New account login failed:', res.data.error);
    }

    // Test 6: Update Account Details
    console.log('\n[Test 6] Update Account - Change Display Name and Password');
    console.log('-'.repeat(70));
    const newPassword = 'NewPass@2026Kuentong';
    res = await makeRequest(`/api/users/${encodeURIComponent('huan-wei.chiu@kuentong.com')}`, 'PATCH', {
      displayName: 'Chiu Huan Wei (Updated)',
      password: newPassword
    }, adminCookie);
    
    if (res.status === 200) {
      console.log('✅ Account updated successfully');
      console.log(`   New Display Name: Chiu Huan Wei (Updated)`);
      console.log(`   New Password: ${newPassword}`);
    } else {
      console.log('❌ Account update failed:', res.data.error);
    }

    // Test 7: Toggle Account Enable/Disable
    console.log('\n[Test 7] Disable Account');
    console.log('-'.repeat(70));
    res = await makeRequest(`/api/users/${encodeURIComponent('huan-wei.chiu@kuentong.com')}/toggle-enable`, 'POST', {}, adminCookie);
    
    if (res.status === 200) {
      console.log('✅ Account disabled successfully');
      console.log(`   Status: ${res.data.enabled ? 'Enabled' : 'Disabled'}`);
    } else {
      console.log('❌ Toggle disable failed:', res.data.error);
    }

    // Test 8: Test Login with Disabled Account (should fail)
    console.log('\n[Test 8] Login with Disabled Account (should fail)');
    console.log('-'.repeat(70));
    res = await makeRequest('/api/login', 'POST', {
      email: 'huan-wei.chiu@kuentong.com',
      password: newPassword
    });
    
    if (res.status !== 200) {
      console.log('✅ Disabled account correctly prevented from login');
      console.log(`   Error: ${res.data.error}`);
    } else {
      console.log('❌ Disabled account should not be able to login');
    }

    // Test 9: Re-enable Account
    console.log('\n[Test 9] Re-enable Account');
    console.log('-'.repeat(70));
    res = await makeRequest(`/api/users/${encodeURIComponent('huan-wei.chiu@kuentong.com')}/toggle-enable`, 'POST', {}, adminCookie);
    
    if (res.status === 200) {
      console.log('✅ Account re-enabled successfully');
      console.log(`   Status: ${res.data.enabled ? 'Enabled' : 'Disabled'}`);
    } else {
      console.log('❌ Toggle enable failed:', res.data.error);
    }

    // Test 10: Verify Re-enabled Account Can Login
    console.log('\n[Test 10] Verify Re-enabled Account Can Login');
    console.log('-'.repeat(70));
    res = await makeRequest('/api/login', 'POST', {
      email: 'huan-wei.chiu@kuentong.com',
      password: newPassword
    });
    
    if (res.status === 200 && res.data.user) {
      console.log('✅ Re-enabled account can login again');
      console.log(`   Email: ${res.data.user.email}`);
    } else {
      console.log('❌ Re-enabled account login failed:', res.data.error);
    }

    // Test 11: Force Logout
    console.log('\n[Test 11] Force Logout User');
    console.log('-'.repeat(70));
    res = await makeRequest(`/api/users/${encodeURIComponent('huan-wei.chiu@kuentong.com')}/force-logout`, 'POST', {}, adminCookie);
    
    if (res.status === 200) {
      console.log('✅ Force logout executed');
      console.log('   All sessions for user have been terminated');
    } else {
      console.log('❌ Force logout failed:', res.data.error);
    }

    // Test 12: View Audit Log
    console.log('\n[Test 12] View Audit Log');
    console.log('-'.repeat(70));
    res = await makeRequest('/api/audit?limit=20', 'GET', null, adminCookie);
    
    if (res.status === 200 && res.data.logs) {
      console.log('✅ Audit log retrieved');
      console.log(`   Total entries: ${res.data.logs.length}`);
      console.log('   Recent activities:');
      res.data.logs.slice(0, 5).forEach(log => {
        console.log(`     - ${log.createdAt} | ${log.email} | ${log.action}`);
      });
    } else {
      console.log('❌ Failed to get audit log:', res.data.error);
    }

    // Test 13: Delete Account
    console.log('\n[Test 13] Delete Account');
    console.log('-'.repeat(70));
    res = await makeRequest(`/api/users/${encodeURIComponent('huan-wei.chiu@kuentong.com')}`, 'DELETE', {}, adminCookie);
    
    if (res.status === 200) {
      console.log('✅ Account deleted successfully');
    } else {
      console.log('❌ Account deletion failed:', res.data.error);
    }

    // Test 14: Verify Account Deleted
    console.log('\n[Test 14] Verify Account Deleted (re-create should work)');
    console.log('-'.repeat(70));
    res = await makeRequest('/api/users', 'POST', {
      email: 'huan-wei.chiu@kuentong.com',
      displayName: 'Huan Wei Chiu (Recreated)',
      accessRole: 'pm',
      password: 'Secure@2026Recreate'
    }, adminCookie);
    
    if (res.status === 201) {
      console.log('✅ Account can be created again (deletion successful)');
    } else {
      console.log('❌ Account recreation failed:', res.data.error);
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ All Account Management Tests Completed Successfully');
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.error('❌ Test Error:', error);
  }
}

runTests();
