import config from '../config/index.js';
import MockBankTransaction from '../models/MockBankTransaction.js';
import crypto from 'crypto';

export const mockBankService = {
  async transfer({ commitment, nullifier, amountUSD, programId, timestamp }) {
    await new Promise(resolve => setTimeout(resolve, config.mockBankDelayMs));

    // Replay protection using commitment
    const existing = await MockBankTransaction.findOne({ commitment });
    if (existing) throw new Error('Commitment already used');

    if (!commitment || commitment.length < 10) throw new Error('Invalid commitment');

    if (Math.random() < config.mockBankFailureRate) {
      await MockBankTransaction.create({
        commitment,
        nullifier,
        amountUSD,
        amountETB: 0,
        exchangeRate: config.mockExchangeRate,
        programId,
        status: 'failed',
        errorMessage: 'Simulated bank failure',
        reference: 'FAILED_' + Date.now()
      });
      throw new Error('Simulated bank failure');
    }

    const exchangeRate = config.mockExchangeRate;
    const amountETB = amountUSD * exchangeRate;
    const reference = `MOCK_BANK_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    await MockBankTransaction.create({
      commitment,
      nullifier,
      amountUSD,
      amountETB,
      exchangeRate,
      programId,
      reference,
      status: 'success'
    });

    return {
      success: true,
      reference,
      amountETB,
      exchangeRate,
      timestamp: Date.now(),
      message: 'Funds transferred successfully (simulated)'
    };
  },

  async getTransactions(filter = {}) {
    return await MockBankTransaction.find(filter).sort('-timestamp').lean();
  },

  async getTransactionByReference(reference) {
    return await MockBankTransaction.findOne({ reference }).lean();
  }
};
