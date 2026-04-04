import { mockBankService } from '../services/mockBank.js';

export const getMockBankTransactions = async (req, res) => {
  try {
    const { status, nullifier } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (nullifier) filter.nullifier = nullifier;
    const transactions = await mockBankService.getTransactions(filter);
    res.status(200).json({ transactions });
  } catch (error) {
    console.error('Error fetching mock bank transactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getTransaction = async (req, res) => {
  try {
    const { reference } = req.params;
    const transaction = await mockBankService.getTransactionByReference(reference);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.status(200).json(transaction);
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
