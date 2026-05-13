const crypto = require('crypto');
const PaymentRecord = require('../models/PaymentRecord');
const Transaction = require('../models/Transaction');
const Group = require('../models/Group');
const { getRazorpayClient, getRazorpayKeyId } = require('../lib/razorpay');
const paymentIdempotency = require('./paymentIdempotency');
const runAtomic = require('../lib/runAtomic');

async function createRazorpayOrder({
  groupId,
  amount,
  debtorId,
  creditorId,
  clientId,
  description,
}) {
  const parsedAmount = Number(amount);
  if (!groupId || !debtorId || !creditorId || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw {
      status: 400,
      message: 'Valid group, debtor, creditor, and amount are required.',
    };
  }

  const group = await Group.findById(groupId).populate('members', '_id name email').lean();
  if (!group) {
    throw { status: 404, message: 'Group not found.' };
  }
  if (group.isArchived) {
    throw { status: 403, message: 'Cannot settle archived groups.' };
  }

  const memberIds = (group.members || []).map((m) => String(m._id));
  if (!memberIds.includes(String(debtorId)) || !memberIds.includes(String(creditorId))) {
    throw { status: 400, message: 'Both settlement users must belong to the group.' };
  }

  const orderClientId = clientId || crypto.randomUUID();

  const idempotencyResult = await paymentIdempotency.getOrderIdempotency(orderClientId);
  if (idempotencyResult) {
    return idempotencyResult;
  }

  const razorpay = getRazorpayClient();
  const amountPaise = Math.round(parsedAmount * 100);
  const receipt = buildSettlementReceipt({
    groupId,
    debtorId,
    creditorId,
    clientId: orderClientId,
  });

  let order;
  try {
    order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt,
      notes: {
        groupId: String(groupId),
        debtorId: String(debtorId),
        creditorId: String(creditorId),
        clientId: String(orderClientId),
        description: description || 'Group settlement',
      },
    });
  } catch (err) {
    throw {
      status: err.statusCode || 502,
      message: err.error?.description || 'Failed to create Razorpay order.',
    };
  }

  const result = {
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    receipt: order.receipt,
    clientId: orderClientId,
    keyId: getRazorpayKeyId(),
  };

  await paymentIdempotency.setOrderIdempotency(orderClientId, result, 2592000);

  const now = new Date();
  await PaymentRecord.findOneAndUpdate(
    { clientId: orderClientId },
    {
      clientId: orderClientId,
      razorpayOrderId: order.id,
      groupId,
      debtorId,
      creditorId,
      amount: amountPaise,
      status: 'pending',
      description: description || 'Group settlement',
      lastVerifiedAt: now,
    },
    { upsert: true, new: true }
  );

  return result;
}

async function handleWebhookEvent(event, signature) {
  if (!event || !event.event || !event.payload) {
    return { processed: false, reason: 'Invalid event structure' };
  }

  const eventId = event.id;
  if (!eventId) {
    return { processed: false, reason: 'No event ID' };
  }

  const existingResult = await paymentIdempotency.getWebhookResult(eventId);
  if (existingResult) {
    return { processed: true, idempotent: true, cached: true };
  }

  if (!['payment.captured', 'order.paid', 'payment.authorized'].includes(event.event)) {
    await paymentIdempotency.setWebhookResult(eventId, { processed: true, ignored: true });
    return { processed: true, ignored: true };
  }

  const payment = event.payload?.payment?.entity;
  if (!payment) {
    await paymentIdempotency.setWebhookResult(eventId, { processed: true, ignored: true });
    return { processed: true, ignored: true };
  }

  const notes = payment.notes || {};
  const groupId = notes.groupId;
  const debtorId = notes.debtorId || payment.contact;
  const creditorId = notes.creditorId;
  const amount = Number(payment.amount) / 100;
  const clientId = notes.clientId || `razorpay_${payment.id}`;

  if (!groupId || !debtorId || !creditorId || !Number.isFinite(amount) || amount <= 0) {
    await paymentIdempotency.setWebhookResult(eventId, { processed: true, ignored: true });
    return { processed: true, ignored: true };
  }

  const group = await Group.findById(groupId);
  if (!group) {
    await paymentIdempotency.setWebhookResult(eventId, { processed: true, ignored: true });
    return { processed: true, ignored: true };
  }

  const now = new Date();
  let transaction;

  try {
    await runAtomic(async (session) => {
      const options = session ? { session } : {};

      const paymentRecord = await PaymentRecord.findOneAndUpdate(
        { razorpayPaymentId: payment.id },
        {
          clientId,
          razorpayPaymentId: payment.id,
          groupId,
          debtorId,
          creditorId,
          amount: payment.amount,
          webhookEventId: eventId,
          status:
            event.event === 'payment.captured' ? 'captured' : event.event === 'payment.authorized' ? 'authorized' : 'captured',
          lastVerifiedAt: now,
          $push: {
            webhookEvents: {
              eventId,
              event: event.event,
              receivedAt: now,
              processed: true,
            },
          },
        },
        { upsert: true, new: true, ...options }
      );

      const docs = await Transaction.find({ clientId }, null, options).limit(1);
      if (!docs.length) {
        const txDocs = await Transaction.create(
          [
            {
              clientId,
              groupId,
              description: notes.description || 'Razorpay settlement',
              amount,
              paidBy: debtorId,
              receiverId: creditorId,
              splits: [{ userId: creditorId, amount }],
              splitType: 'EQUAL',
              type: 'PAYMENT',
              status: 'CONFIRMED',
              paymentRecordId: paymentRecord._id,
              paymentVerifiedAt: now,
              syncedAt: now,
            },
          ],
          options
        );
        transaction = txDocs[0];
      } else {
        transaction = docs[0];
      }

      await Group.findByIdAndUpdate(groupId, { lastActivityAt: now }, options);
    });
  } catch (err) {
    console.error('[Payment Service] Webhook processing failed:', err.message);
    await paymentIdempotency.setWebhookResult(eventId, {
      processed: false,
      error: err.message,
    });
    throw err;
  }

  const result = { processed: true, transactionId: transaction._id };
  await paymentIdempotency.setWebhookResult(eventId, result);
  return result;
}

async function verifyPaymentWithRazorpay(paymentId, maxRetries = 3) {
  const razorpay = getRazorpayClient();
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const payment = await razorpay.payments.fetch(paymentId);
      return {
        status: payment.status,
        id: payment.id,
        amount: payment.amount / 100,
        currency: payment.currency,
        acquirerData: payment.acquirer_data || {},
        method: payment.method,
      };
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) {
        throw {
          status: 503,
          message: `Failed to verify payment after ${maxRetries} retries: ${err.message}`,
          retryable: true,
        };
      }
      const delayMs = Math.pow(2, attempt - 1) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function getPaymentStatus(clientId) {
  const paymentRecord = await PaymentRecord.findOne({ clientId });
  if (!paymentRecord) {
    return null;
  }

  const transaction = await Transaction.findOne({ clientId });

  return {
    paymentRecord: {
      id: paymentRecord._id,
      razorpayOrderId: paymentRecord.razorpayOrderId,
      razorpayPaymentId: paymentRecord.razorpayPaymentId,
      status: paymentRecord.status,
      amount: paymentRecord.amount / 100,
      createdAt: paymentRecord.createdAt,
      updatedAt: paymentRecord.updatedAt,
      lastVerifiedAt: paymentRecord.lastVerifiedAt,
      errorReason: paymentRecord.errorReason,
      webhookEventCount: paymentRecord.webhookEvents.length,
    },
    transaction: transaction
      ? {
          id: transaction._id,
          status: transaction.status,
          amount: transaction.amount,
          createdAt: transaction.createdAt,
        }
      : null,
  };
}

async function reconcilePayment(paymentRecordId) {
  const paymentRecord = await PaymentRecord.findById(paymentRecordId);
  if (!paymentRecord) {
    throw { status: 404, message: 'Payment record not found.' };
  }

  if (!paymentRecord.razorpayPaymentId) {
    throw {
      status: 400,
      message: 'Cannot reconcile payment without Razorpay payment ID.',
    };
  }

  const paymentStatus = await verifyPaymentWithRazorpay(paymentRecord.razorpayPaymentId);

  const now = new Date();
  const updated = await PaymentRecord.findByIdAndUpdate(
    paymentRecordId,
    {
      status: paymentStatus.status === 'captured' ? 'captured' : paymentStatus.status,
      lastVerifiedAt: now,
    },
    { new: true }
  );

  return {
    status: updated.status,
    lastVerifiedAt: updated.lastVerifiedAt,
    razorpayStatus: paymentStatus.status,
  };
}

async function markPaymentFailed(paymentRecordId, reason) {
  const now = new Date();
  const updated = await PaymentRecord.findByIdAndUpdate(
    paymentRecordId,
    {
      status: 'failed',
      errorReason: reason,
      lastVerifiedAt: now,
    },
    { new: true }
  );
  return updated;
}

async function refundPayment(paymentRecordId, reason) {
  const paymentRecord = await PaymentRecord.findById(paymentRecordId);
  if (!paymentRecord) {
    throw { status: 404, message: 'Payment record not found.' };
  }

  if (!paymentRecord.razorpayPaymentId) {
    throw {
      status: 400,
      message: 'Cannot refund payment without Razorpay payment ID.',
    };
  }

  const razorpay = getRazorpayClient();
  try {
    const refund = await razorpay.payments.refund(paymentRecord.razorpayPaymentId, {
      notes: { reason },
    });

    const now = new Date();
    const updated = await PaymentRecord.findByIdAndUpdate(
      paymentRecordId,
      {
        status: 'refunded',
        errorReason: reason,
        lastVerifiedAt: now,
      },
      { new: true }
    );

    return { refundId: refund.id, updated };
  } catch (err) {
    throw {
      status: 502,
      message: `Failed to refund payment: ${err.error?.description || err.message}`,
    };
  }
}

function buildSettlementReceipt({ groupId, debtorId, creditorId, clientId }) {
  const shortId = (value) => String(value).slice(-6);
  const receipt = `stl_${shortId(groupId)}_${shortId(debtorId)}_${shortId(creditorId)}_${shortId(clientId || crypto.randomUUID())}`;
  return receipt.slice(0, 40);
}

module.exports = {
  createRazorpayOrder,
  handleWebhookEvent,
  verifyPaymentWithRazorpay,
  getPaymentStatus,
  reconcilePayment,
  markPaymentFailed,
  refundPayment,
};
