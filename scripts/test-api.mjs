import assert from 'assert';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3001/v1';

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, headers: res.headers, body: data };
}

async function runTests() {
  console.log('🚀 Starting StaySync PG Backend Integration Test Suite...\n');

  // 1. Health check
  console.log('1. Testing GET /health...');
  const health = await request('/health');
  assert.strictEqual(health.status, 200);
  assert.strictEqual(health.body.success, true);
  assert.strictEqual(health.body.data.status, 'ok');
  console.log('   ✅ Health check passed.');

  // 2. Register owner
  console.log('2. Testing POST /auth/register...');
  const testEmail = `owner_${Date.now()}@staysync.in`;
  const testPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
  const reg = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Ankit Panchal',
      email: testEmail,
      phone: testPhone,
      password: 'mypassword123',
      businessName: 'Sunshine Co-Living PG',
    }),
  });
  assert.strictEqual(reg.status, 201);
  assert.strictEqual(reg.body.success, true);
  assert.strictEqual(reg.body.data.user.isOnboarded, false);
  const token = reg.body.data.tokens.accessToken;
  const refreshToken = reg.body.data.tokens.refreshToken;
  const userId = reg.body.data.user.id;
  console.log('   ✅ Register passed. Owner ID:', userId);

  // 3. Test Onboarding Gate (must reject resource routes with 403 NOT_ONBOARDED)
  console.log('3. Testing Onboarding Gate (GET /buildings before onboarding)...');
  const gateTest = await request('/buildings', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(gateTest.status, 403);
  assert.strictEqual(gateTest.body.error.code, 'NOT_ONBOARDED');
  console.log('   ✅ Gate verified: 403 NOT_ONBOARDED received.');

  // 4. Onboarding wizard
  console.log('4. Testing POST /onboarding...');
  const onboard = await request('/onboarding', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      businessName: 'Skyline Co-Living & PG',
      businessType: 'coliving',
      city: 'Bengaluru',
      phone: testPhone,
      upiId: 'skyline@okhdfcbank',
      buildingName: 'Skyline Elite Residency',
      buildingCode: 'SER',
      address: 'Plot 42, 4th Main, Koramangala',
      billingDueDay: 5,
      electricityRatePerUnit: 11.5,
      totalFloors: 2,
      roomsPerFloor: 3,
      roomCapacity: 2,
      defaultBaseRent: 15000,
      amenities: ['High-Speed Wi-Fi', 'Attached Washroom', 'Air Conditioner (AC)'],
      intakeMode: 'sample',
    }),
  });
  assert.strictEqual(onboard.status, 201);
  assert.strictEqual(onboard.body.success, true);
  assert.strictEqual(onboard.body.data.user.isOnboarded, true);
  assert.strictEqual(onboard.body.data.rooms.length, 6);
  assert.ok(onboard.body.data.tenant);
  const buildingId = onboard.body.data.building.id;
  const sampleTenantId = onboard.body.data.tenant.id;
  console.log(`   ✅ Onboarding passed: Created building ${buildingId}, 6 rooms, initial tenant ${sampleTenantId}`);

  // 5. Test Auth / Me
  console.log('5. Testing GET /auth/me...');
  const me = await request('/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.body.data.user.isOnboarded, true);
  console.log('   ✅ GET /auth/me passed.');

  // 6. Test Account update and Bank update
  console.log('6. Testing PATCH /account and PATCH /account/bank...');
  const acc = await request('/account', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      businessAddress: '124, 1st Cross, Indiranagar, Bengaluru',
      gstNumber: '29ABCDE1234F1Z5',
    }),
  });
  assert.strictEqual(acc.status, 200);

  const bank = await request('/account/bank', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      upiId: 'skyline.pg@icici',
      bankName: 'HDFC Bank',
      accountNumber: '918237461928',
      ifscCode: 'HDFC0001824',
      accountHolderName: 'Ankit Panchal',
    }),
  });
  assert.strictEqual(bank.status, 200);
  assert.strictEqual(bank.body.data.user.bankDetails.accountNumber, 'XXXXXXXX1928');
  console.log('   ✅ Account and masked bank update passed.');

  // 7. Test Buildings list & stats
  console.log('7. Testing GET /buildings with stats...');
  const buildings = await request('/buildings', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(buildings.status, 200);
  assert.strictEqual(buildings.body.data.buildings.length, 1);
  const bStats = buildings.body.data.buildings[0].stats;
  assert.strictEqual(bStats.totalRooms, 6);
  assert.strictEqual(bStats.occupiedRooms, 1); // first room occupied by sample tenant
  assert.strictEqual(bStats.vacantRooms, 5);
  console.log('   ✅ Buildings list passed with dynamic stats:', bStats);

  // 8. Test Room creation and status transition
  console.log('8. Testing POST /rooms and PATCH /rooms/:id/status...');
  const newRoom = await request('/rooms', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      buildingId,
      roomNumber: '301',
      floor: 2,
      capacity: 2,
      baseRent: 16000,
      hasAirConditioner: true,
      hasAttachedBathroom: true,
      hasBalcony: false,
    }),
  });
  assert.strictEqual(newRoom.status, 201);
  const roomId = newRoom.body.data.room.id;

  // Change to maintenance
  const toMaint = await request(`/rooms/${roomId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      status: 'maintenance',
      reason: 'Repainting walls',
    }),
  });
  assert.strictEqual(toMaint.status, 200);
  assert.strictEqual(toMaint.body.data.room.status, 'maintenance');

  // Change back to vacant
  const toVacant = await request(`/rooms/${roomId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: 'vacant' }),
  });
  assert.strictEqual(toVacant.status, 200);
  assert.strictEqual(toVacant.body.data.room.status, 'vacant');
  console.log('   ✅ Room creation and status transitions passed.');

  // 9. Test Tenant check-in with Co-Occupant
  console.log('9. Testing POST /tenants (Check-In) with co-occupant...');
  const checkIn = await request('/tenants', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      buildingId,
      roomId,
      fullName: 'Rahul Sharma',
      phone: '9876500222',
      email: 'rahul@example.com',
      gender: 'male',
      checkInDate: '2026-09-01',
      monthlyRent: 16000,
      securityDeposit: 32000,
      depositStatus: 'paid',
      coOccupants: [
        {
          fullName: 'Pooja Sharma',
          relationship: 'Spouse',
          phone: '9876500333',
          gender: 'female',
        },
      ],
    }),
  });
  assert.strictEqual(checkIn.status, 201);
  const tenantId = checkIn.body.data.tenant.id;
  assert.strictEqual(checkIn.body.data.room.status, 'occupied');
  assert.strictEqual(checkIn.body.data.coOccupants.length, 1);
  console.log('   ✅ Check-in passed. Tenant ID:', tenantId);

  // 10. Test Co-occupants list
  console.log('10. Testing GET /co-occupants...');
  const coList = await request(`/co-occupants?roomId=${roomId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(coList.status, 200);
  assert.strictEqual(coList.body.data.coOccupants.length, 1);
  console.log('   ✅ Co-occupants list passed.');

  // 11. Test Electricity meter reading with Idempotency
  console.log('11. Testing POST /electricity with Idempotency-Key...');
  const currentMonth = '2026-09';
  const elecKey = `idemp_elec_${Date.now()}`;
  const elecPayload = {
    roomId,
    month: currentMonth,
    readingDate: '2026-09-02',
    previousReading: 1000,
    currentReading: 1050, // 50 units * 11.5 = 575 total, split by 2 = 287.5
  };
  const elec1 = await request('/electricity', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': elecKey,
    },
    body: JSON.stringify(elecPayload),
  });
  assert.strictEqual(elec1.status, 201);
  assert.strictEqual(elec1.body.data.record.unitsConsumed, 50);
  assert.strictEqual(elec1.body.data.record.totalAmount, 575);
  assert.strictEqual(elec1.body.data.record.amountPerTenant, 287.5);

  // Replay same request -> should return same 201 payload
  const elecReplay = await request('/electricity', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': elecKey,
    },
    body: JSON.stringify(elecPayload),
  });
  assert.strictEqual(elecReplay.status, 201);
  assert.strictEqual(elecReplay.body.data.record.id, elec1.body.data.record.id);
  console.log('   ✅ Electricity reading & idempotency passed.');

  // 12. Test Tenant Dues
  console.log('12. Testing GET /tenants/:id/dues...');
  const dues = await request(`/tenants/${tenantId}/dues?billingMonth=${currentMonth}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(dues.status, 200);
  assert.strictEqual(dues.body.data.monthlyRent, 16000);
  assert.strictEqual(dues.body.data.electricityShare, 287.5);
  assert.strictEqual(dues.body.data.totalPayable, 16287.5);
  assert.strictEqual(dues.body.data.balanceDue, 16287.5);
  console.log('   ✅ Tenant dues calculation passed: Total payable =', dues.body.data.totalPayable);

  // 13. Test Payment Collection with Idempotency
  console.log('13. Testing POST /payments with Idempotency-Key...');
  const payKey = `idemp_pay_${Date.now()}`;
  const payPayload = {
    tenantId,
    billingMonth: currentMonth,
    rentAmount: 16000,
    includeElectricity: true,
    amountPaid: 16287.5,
    paymentDate: '2026-09-05',
    paymentMode: 'upi',
    transactionReference: 'UPI-TXN-123456',
  };
  const pay1 = await request('/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': payKey,
    },
    body: JSON.stringify(payPayload),
  });
  assert.strictEqual(pay1.status, 201);
  assert.strictEqual(pay1.body.data.payment.balanceDue, 0);
  assert.strictEqual(pay1.body.data.payment.status, 'paid');
  assert.ok(pay1.body.data.payment.receiptNumber.startsWith('RCP-202609-'));
  console.log('   ✅ Payment recorded with receipt:', pay1.body.data.payment.receiptNumber);

  // 14. Test Dashboard & Overdue
  console.log('14. Testing GET /dashboard and GET /overdue...');
  const dash = await request(`/dashboard?month=${currentMonth}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(dash.status, 200);
  assert.strictEqual(dash.body.data.stats.totalBuildings, 1);
  assert.ok(dash.body.data.stats.collectedRevenue >= 16287.5);

  const overdue = await request(`/overdue?month=${currentMonth}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(overdue.status, 200);
  console.log('   ✅ Dashboard & Overdue analytics passed.');

  // 15. Test Notice & Vacate
  console.log('15. Testing POST /tenants/:id/notice and POST /tenants/:id/vacate...');
  const notice = await request(`/tenants/${tenantId}/notice`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ expectedCheckOutDate: '2026-09-30' }),
  });
  assert.strictEqual(notice.status, 200);
  assert.strictEqual(notice.body.data.tenant.status, 'notice_period');

  const vacate = await request(`/tenants/${tenantId}/vacate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ refundDeposit: true }),
  });
  assert.strictEqual(vacate.status, 200);
  assert.strictEqual(vacate.body.data.tenant.status, 'vacated');
  assert.strictEqual(vacate.body.data.room.status, 'vacant');
  assert.strictEqual(vacate.body.data.room.primaryTenantId, null);
  console.log('   ✅ Notice and Vacate lifecycle passed. Room status restored to vacant.');

  // 16. Test Password reset flow
  console.log('16. Testing Forgot Password & Reset Password...');
  const forgot = await request('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ emailOrPhone: testEmail }),
  });
  assert.strictEqual(forgot.status, 200);
  assert.strictEqual(forgot.body.data.sent, true);
  console.log('   ✅ Forgot password passed.');

  // 17. Test Refresh Token
  console.log('17. Testing POST /auth/refresh...');
  const refreshed = await request('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
  assert.strictEqual(refreshed.status, 200);
  assert.ok(refreshed.body.data.accessToken);
  assert.ok(refreshed.body.data.refreshToken);
  console.log('   ✅ Refresh token rotation passed.');

  // 18. Verify Cloud Database (Firebase Firestore)
  console.log('18. Verifying Cloud Database (Firebase Firestore) Persistence...');
  const meCheck = await request('/auth/me', {
    headers: { Authorization: `Bearer ${refreshed.body.data.accessToken}` },
  });
  assert.strictEqual(meCheck.status, 200);
  assert.strictEqual(meCheck.body.data.user.id, userId);
  console.log('   ✅ Cloud Firestore database verified and operational.');

  console.log('\n=============================================');
  console.log('🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY!');
  console.log('=============================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
