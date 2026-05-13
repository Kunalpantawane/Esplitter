const crypto = require('crypto');
const mongoose = require('mongoose');
const { request, app, setupDatabase } = require('../setup');

const PaymentRecord = require('../../server/models/PaymentRecord');
const Transaction = require('../../server/models/Transaction');
const Group = require('../../server/models/Group');
const User = require('../../server/models/User');
const paymentIdempotency = require('../../server/services/paymentIdempotency');
const paymentService = require('../../server/services/paymentService');

setupDatabase();

let testUserId;
let testUser2Id;
let testGroupId;
let token;

beforeEach(async () => {
  const bcrypt = require('bcrypt');

  const user = await User.create({
    name: 'Test User 1',
    email: 'user1@test.com',
    password: 'Password123',
    upiId: 'user1@test',
    createdAt: new Date(),
  });
  testUserId = user._id;

  const user2 = await User.create({
    name: 'Test User 2',
    email: 'user2@test.com',
    password: 'Password123',
    upiId: 'user2@test',
    createdAt: new Date(),
  });
  testUser2Id = user2._id;

  const jwt = require('jsonwebtoken');
  token = jwt.sign({ userId: testUserId, email: user.email }, process.env.JWT_SECRET, { expiresIn: '24h' });

  const group = await Group.create({
    name: 'Test Group',
    adminId: testUserId,
    members: [testUserId, testUser2Id],
    settlementMode: 'smart',
    createdAt: new Date(),
  });
  testGroupId = group._id;
});

afterEach(async () => {
  await paymentIdempotency.clearAll();
});

describe('Payment Reconciliation & Idempotency', () => {
  describe('Webhook Deduplication', () => {
    it('should process webhook event only once with same event ID', async () => {
      const clientId = crypto.randomUUID();
      const eventId = `evt_${Date.now()}`;

      const paymentData = {
        id: `pay_${Date.now()}`,
        amount: 50000,
        currency: 'INR',
        status: 'captured',
        notes: {
          groupId: testGroupId.toString(),
          debtorId: testUserId.toString(),
          creditorId: testUser2Id.toString(),
          clientId,
          description: 'Test settlement',
        },
      };

      const event1 = {
        id: eventId,
        event: 'payment.captured',
        payload: {
          payment: {
            entity: paymentData,
          },
        },
      };

      const result1 = await paymentService.handleWebhookEvent(event1);
      expect(result1.processed).toBe(true);

      const transactionCount1 = await Transaction.countDocuments({ clientId });
      expect(transactionCount1).toBe(1);

      const result2 = await paymentService.handleWebhookEvent(event1);
      expect(result2.processed).toBe(true);
      expect(result2.idempotent).toBe(true);

      const transactionCount2 = await Transaction.countDocuments({ clientId });
      expect(transactionCount2).toBe(1);
    });

    it('should ignore events that are not payment-related', async () => {
      const eventId = `evt_${Date.now()}`;

      const event = {
        id: eventId,
        event: 'order.refunded',
        payload: {},
      };

      const result = await paymentService.handleWebhookEvent(event);
      expect(result.processed).toBe(true);
      expect(result.ignored).toBe(true);

      const cachedResult = await paymentIdempotency.getWebhookResult(eventId);
      expect(cachedResult).not.toBeNull();
    });
  });

  describe('Order Creation Idempotency', () => {
    it('should return cached result for duplicate order creation', async () => {
      const clientId = crypto.randomUUID();

      const orderData = {
        groupId: testGroupId.toString(),
        amount: 500,
        debtorId: testUserId.toString(),
        creditorId: testUser2Id.toString(),
        clientId,
        description: 'Test settlement',
      };

      const idempotencyResult = {
        order_id: `order_${Date.now()}`,
        amount: 50000,
        currency: 'INR',
        clientId,
        keyId: 'test_key_123',
      };

      await paymentIdempotency.setOrderIdempotency(clientId, idempotencyResult);

      const cachedResult = await paymentIdempotency.getOrderIdempotency(clientId);
      expect(cachedResult).not.toBeNull();
      expect(cachedResult.order_id).toBe(idempotencyResult.order_id);
    });
  });

  describe('Payment Status Tracking', () => {
    it('should create PaymentRecord with pending status', async () => {
      const clientId = crypto.randomUUID();

      await PaymentRecord.create({
        clientId,
        razorpayOrderId: `order_${Date.now()}`,
        groupId: testGroupId,
        debtorId: testUserId,
        creditorId: testUser2Id,
        amount: 50000,
        status: 'pending',
        description: 'Test payment',
      });

      const status = await paymentService.getPaymentStatus(clientId);
      expect(status).not.toBeNull();
      expect(status.paymentRecord.status).toBe('pending');
      expect(status.transaction).toBeNull();
    });

    it('should track payment lifecycle through multiple statuses', async () => {
      const clientId = crypto.randomUUID();
      const paymentId = `pay_${Date.now()}`;

      const paymentRecord = await PaymentRecord.create({
        clientId,
        razorpayOrderId: `order_${Date.now()}`,
        razorpayPaymentId: paymentId,
        groupId: testGroupId,
        debtorId: testUserId,
        creditorId: testUser2Id,
        amount: 50000,
        status: 'captured',
        description: 'Test payment',
      });

      let status = await paymentService.getPaymentStatus(clientId);
      expect(status.paymentRecord.status).toBe('captured');

      await paymentService.markPaymentFailed(paymentRecord._id, 'Test failure');

      status = await paymentService.getPaymentStatus(clientId);
      expect(status.paymentRecord.status).toBe('failed');
      expect(status.paymentRecord.errorReason).toBe('Test failure');
    });

    it('should link Transaction to PaymentRecord', async () => {
      const clientId = crypto.randomUUID();

      const paymentRecord = await PaymentRecord.create({
        clientId,
        razorpayOrderId: `order_${Date.now()}`,
        groupId: testGroupId,
        debtorId: testUserId,
        creditorId: testUser2Id,
        amount: 50000,
        status: 'captured',
      });

      const transaction = await Transaction.create({
        clientId,
        groupId: testGroupId,
        description: 'Test settlement',
        amount: 500,
        paidBy: testUserId,
        receiverId: testUser2Id,
        splits: [{ userId: testUser2Id, amount: 500 }],
        type: 'PAYMENT',
        status: 'CONFIRMED',
        paymentRecordId: paymentRecord._id,
      });

      const status = await paymentService.getPaymentStatus(clientId);
      expect(status.transaction).not.toBeNull();
      expect(status.transaction.id.toString()).toBe(transaction._id.toString());
      expect(status.transaction.status).toBe('CONFIRMED');
    });
  });

  describe('Webhook Event Audit Trail', () => {
    it('should record webhook events in PaymentRecord', async () => {
      const clientId = crypto.randomUUID();
      const eventId1 = `evt_${Date.now()}_1`;

      const paymentData = {
        id: `pay_${Date.now()}`,
        amount: 50000,
        currency: 'INR',
        status: 'captured',
        notes: {
          groupId: testGroupId.toString(),
          debtorId: testUserId.toString(),
          creditorId: testUser2Id.toString(),
          clientId,
        },
      };

      const event1 = {
        id: eventId1,
        event: 'payment.authorized',
        payload: { payment: { entity: paymentData } },
      };

      await paymentService.handleWebhookEvent(event1);

      const paymentRecord = await PaymentRecord.findOne({ clientId });
      expect(paymentRecord.webhookEvents.length).toBeGreaterThan(0);
      expect(paymentRecord.webhookEvents[0].eventId).toBe(eventId1);
      expect(paymentRecord.webhookEvents[0].event).toBe('payment.authorized');
    });
  });

  describe('Invalid Payment Handling', () => {
    it('should ignore payment with missing required fields', async () => {
      const eventId = `evt_${Date.now()}`;

      const event = {
        id: eventId,
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: `pay_${Date.now()}`,
              amount: 50000,
              notes: {
                groupId: testGroupId.toString(),
              },
            },
          },
        },
      };

      const result = await paymentService.handleWebhookEvent(event);
      expect(result.processed).toBe(true);
      expect(result.ignored).toBe(true);

      const transactionCount = await Transaction.countDocuments({});
      expect(transactionCount).toBe(0);
    });

    it('should handle non-existent group gracefully', async () => {
      const eventId = `evt_${Date.now()}`;
      const fakeGroupId = new mongoose.Types.ObjectId();

      const event = {
        id: eventId,
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: `pay_${Date.now()}`,
              amount: 50000,
              notes: {
                groupId: fakeGroupId.toString(),
                debtorId: testUserId.toString(),
                creditorId: testUser2Id.toString(),
                clientId: crypto.randomUUID(),
              },
            },
          },
        },
      };

      const result = await paymentService.handleWebhookEvent(event);
      expect(result.processed).toBe(true);
      expect(result.ignored).toBe(true);
    });
  });

  describe('Error Scenarios', () => {
    it('should reject order creation for archived group', async () => {
      const archivedGroup = await Group.create({
        name: 'Archived Group',
        adminId: testUserId,
        members: [testUserId, testUser2Id],
        isArchived: true,
      });

      try {
        await paymentService.createRazorpayOrder({
          groupId: archivedGroup._id.toString(),
          amount: 500,
          debtorId: testUserId.toString(),
          creditorId: testUser2Id.toString(),
          clientId: crypto.randomUUID(),
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err.status).toBe(403);
      }
    });
  });
});

