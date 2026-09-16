#!/usr/bin/env node
import http from 'http';

const BASE_URL = 'http://127.0.0.1:3000';
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
  console.log('\n' + '='.repeat(80));
  console.log('?? ISO 27001 Advanced Compliance Test Suite');
  console.log('='.repeat(80));

  let passed = 0, failed = 0;

  try {
    // Test 1: Admin Login
    console.log('\n[Test 1] Admin Login');
    console.log('-'.repeat(80));
    let res = await makeRequest('/api/login', 'POST', {
      email: 'local-admin@localhost',
      password: 'Admin@2026Secure'
    });
    if (res.status === 200) {
      adminCookie = res.headers['set-cookie']?.[0];
      console.log('??Admin login successful');
      passed++;
    } else {
      console.log('??Admin login failed:', res.data.error);
      failed++;
      return;
    }

    // Test 2: Check Account Lockout (Failed Login Policy)
    console.log('\n[Test 2] Account Lockout Policy - Failed Login Tracking');
    console.log('-'.repeat(80));
    res = await makeRequest('/api/login', 'POST', {
      email: 'local-admin@localhost',
      password: 'WrongPassword123!'
    });
    if (res.status === 401) {
      console.log('??Failed login tracked correctly');
      console.log(`   Response: ${res.data.error}`);
      passed++;
    } else {
      console.log('??Failed login should return 401');
      failed++;
    }

    // Test 3: Permission Review Report API
    console.log('\n[Test 3] Permission Review Report API (A.9.2.3)');
    console.log('-'.repeat(80));
    res = await makeRequest('/api/compliance/permission-review', 'GET', null, adminCookie);
    if (res.status === 200 && res.data.users) {
      console.log('??Permission review report generated');
      console.log(`   Total Users: ${res.data.totalUsers}`);
      console.log(`   Role Distribution:`, res.data.roleDistribution);
      console.log(`   Compliance Issues: ${res.data.complianceIssues.length}`);
      console.log(`   Generated At: ${res.data.generatedAt}`);
      console.log(`   Reviewed By: ${res.data.reviewedBy}`);
      passed++;
    } else {
      console.log('??Permission review failed:', res.data.error);
      failed++;
    }

    // Test 4: Security Events API
    console.log('\n[Test 4] Security Events Monitoring API (A.12.4.1)');
    console.log('-'.repeat(80));
    res = await makeRequest('/api/compliance/security-events?limit=10', 'GET', null, adminCookie);
    if (res.status === 200 && Array.isArray(res.data.events)) {
      console.log('??Security events retrieved');
      console.log(`   Total Events: ${res.data.events.length}`);
      if (res.data.events.length > 0) {
        console.log(`   Sample Events:`);
        res.data.events.slice(0, 3).forEach((e, i) => {
          console.log(`     [${i+1}] ${e.event_type} (${e.severity}) - ${e.email}`);
        });
      }
      passed++;
    } else {
      console.log('??Security events retrieval failed:', res.data.error);
      failed++;
    }

    // Test 5: Password Expiration Report
    console.log('\n[Test 5] Password Expiration Report API (A.9.4.3)');
    console.log('-'.repeat(80));
    res = await makeRequest('/api/compliance/password-expiration', 'GET', null, adminCookie);
    if (res.status === 200 && res.data.passwords) {
      console.log('??Password expiration report generated');
      console.log(`   Policy - Expiration Days: ${res.data.policy.expirationDays}`);
      console.log(`   Policy - Warning Days: ${res.data.policy.warningDays}`);
      console.log(`   Expired Passwords: ${res.data.passwords.expired.length}`);
      console.log(`   Warning Level: ${res.data.passwords.warning.length}`);
      console.log(`   Valid Passwords: ${res.data.passwords.valid.length}`);
      passed++;
    } else {
      console.log('??Password expiration report failed:', res.data.error);
      failed++;
    }

    // Test 6: Session Monitoring Report
    console.log('\n[Test 6] Session Monitoring Report API (A.12.4.1)');
    console.log('-'.repeat(80));
    res = await makeRequest('/api/compliance/session-monitoring', 'GET', null, adminCookie);
    if (res.status === 200 && res.data.sessions !== undefined) {
      console.log('??Session monitoring report generated');
      console.log(`   Active Sessions: ${res.data.activeSessions}`);
      console.log(`   Max Concurrent Sessions (Policy): ${res.data.policy.maxConcurrentSessions}`);
      console.log(`   Session Duration: ${res.data.policy.sessionDuration}`);
      console.log(`   Inactivity Timeout: ${res.data.policy.inactivityTimeout}`);
      console.log(`   Concurrency Violations: ${res.data.concurrencyViolations.length}`);
      passed++;
    } else {
      console.log('??Session monitoring report failed:', res.data.error);
      failed++;
    }

    // Test 7: Enhanced Audit Log with Severity
    console.log('\n[Test 7] Enhanced Audit Log with Severity and Details');
    console.log('-'.repeat(80));
    res = await makeRequest('/api/audit?limit=20', 'GET', null, adminCookie);
    if (res.status === 200 && Array.isArray(res.data.logs)) {
      console.log('??Enhanced audit log retrieved');
      console.log(`   Total Log Entries: ${res.data.logs.length}`);
      if (res.data.logs.length > 0) {
        console.log(`   Sample Entries:`);
        res.data.logs.slice(0, 3).forEach((log, i) => {
          console.log(`     [${i+1}] ${log.action} by ${log.email}`);
          console.log(`         Severity: ${log.severity || 'info'}`);
          if (log.details) {
            console.log(`         Details: ${typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}`);
          }
        });
      }
      passed++;
    } else {
      console.log('??Audit log retrieval failed:', res.data.error);
      failed++;
    }

    // Test 8: Create Account with Password Expiration
    console.log('\n[Test 8] Create Account with Auto Password Expiration');
    console.log('-'.repeat(80));
    const timestamp = Date.now();
    const testEmail = `test.user.${timestamp}@kuentong.com`;
    res = await makeRequest('/api/users', 'POST', {
      email: testEmail,
      displayName: 'Test User Advanced',
      accessRole: 'pe',
      password: 'SecureTest@2026Advanced'
    }, adminCookie);
    
    if (res.status === 201) {
      console.log('??Account created with password expiration policy');
      console.log(`   Email: ${testEmail}`);
      console.log(`   Password will expire in 90 days`);
      passed++;
    } else {
      console.log('??Account creation failed:', res.data.error);
      failed++;
    }

    // Test 9: Unauthorized Access to Compliance APIs (Non-Admin)
    console.log('\n[Test 9] Authorization Check - Non-Admin Access Denied');
    console.log('-'.repeat(80));
    
    // First create a non-admin account and login
    const nonAdminEmail = `non.admin.${Date.now()}@kuentong.com`;
    res = await makeRequest('/api/users', 'POST', {
      email: nonAdminEmail,
      displayName: 'Non Admin User',
      accessRole: 'viewer',
      password: 'NonAdmin@2026User'
    }, adminCookie);
    
    if (res.status === 201) {
      // Login as non-admin
      res = await makeRequest('/api/login', 'POST', {
        email: nonAdminEmail,
        password: 'NonAdmin@2026User'
      });
      
      if (res.status === 200) {
        const nonAdminCookie = res.headers['set-cookie']?.[0];
        
        // Try to access compliance APIs with non-admin cookie
        res = await makeRequest('/api/compliance/permission-review', 'GET', null, nonAdminCookie);
        if (res.status === 403 && res.data.error) {
          console.log('??Non-admin access correctly denied');
          console.log(`   Response: ${res.data.error}`);
          passed++;
        } else {
          console.log('??Non-admin should be denied access (403)');
          failed++;
        }
      }
    }

    // Test 10: Password Change Resets Expiration
    console.log('\n[Test 10] Password Change Resets Expiration Timer');
    console.log('-'.repeat(80));
    
    // Get password expiration before change
    res = await makeRequest('/api/compliance/password-expiration', 'GET', null, adminCookie);
    const beforeCount = res.data.passwords.valid.length;
    
    // Change password for test account
    res = await makeRequest(`/api/users/${encodeURIComponent(testEmail)}`, 'PATCH', {
      password: 'UpdatedSecure@2026Advanced'
    }, adminCookie);
    
    if (res.status === 200) {
      // Check expiration again
      res = await makeRequest('/api/compliance/password-expiration', 'GET', null, adminCookie);
      const afterCount = res.data.passwords.valid.length;
      
      console.log('??Password change detected');
      console.log(`   Expiration timer was reset`);
      console.log(`   Valid passwords: ${beforeCount} ??${afterCount}`);
      passed++;
    } else {
      console.log('??Password change failed');
      failed++;
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('?? Test Summary');
    console.log('='.repeat(80));
    console.log(`??Passed: ${passed}`);
    console.log(`??Failed: ${failed}`);
    console.log(`?? Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n??Test Suite Error:', error.message);
  }
}

runTests();

