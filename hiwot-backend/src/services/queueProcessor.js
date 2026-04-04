import OfflineQueue from '../models/OfflineQueue.js';
import Beneficiary from '../models/Beneficiary.js';
import Claim from '../models/Claim.js';
import CashProgram from '../models/CashProgram.js';
import GoodsProgram from '../models/GoodsProgram.js';
import { stellarService } from './stellar.js';
import { mockBankService } from './mockBank.js';
import crypto from 'crypto';

function computeCommitment(nullifier, programId, secret) {
  const data = nullifier + programId.toString() + secret;
  return '0x' + crypto.createHash('sha256').update(data).digest('hex');
}

export async function processQueue() {
  const pending = await OfflineQueue.find({ status: 'pending' }).sort('createdAt').limit(10);
  for (const item of pending) {
    item.status = 'processing';
    await item.save();
    try {
      const { actionType, payload } = item;

      if (actionType === 'register') {
        const result = await stellarService.registerBeneficiary(payload.nullifier);
        await Beneficiary.findOneAndUpdate(
          { nullifier: payload.nullifier },
          { synced: true, txHash: result.txHash }
        );
        item.status = 'completed';
        item.processedAt = new Date();
        item.txHash = result.txHash;

      } else if (actionType === 'claim') {
        const { nullifier, programId, programInternalId, location, claimType, secret, commitment, beneficiaryAddress } = payload;

        if (claimType === 'cash') {
          const claimReceipt = await stellarService.claimAid(
            nullifier,
            programId,
            location,
            beneficiaryAddress,
            secret
          );
          const amount = claimReceipt.amount;
          const amountUSD = amount / 1e7;
          const timestamp = new Date(claimReceipt.timestamp * 1000);
          const txHash = claimReceipt.txHash;

          const claim = new Claim({
            nullifier,
            programId,
            programInternalId,
            claimType: 'cash',
            amount,
            timestamp,
            txHash,
            status: 'completed',
            synced: true,
            secret,
            commitment,
            disbursementMethod: payload.disbursementMethod,
            beneficiaryAddress
          });
          await claim.save();

          // Update program
          await CashProgram.findOneAndUpdate(
            { internalId: programInternalId },
            { $inc: { totalClaims: 1, remainingFunds: -amountUSD } }
          );

          // Mock bank transfer
          await mockBankService.transfer({
            commitment,
            nullifier,
            amountUSD,
            programId,
            timestamp: claimReceipt.timestamp
          });

          item.status = 'completed';
          item.processedAt = new Date();
          item.txHash = txHash;

        } else if (claimType === 'goods') {
          // For goods, we need to update the specific inventory batch
          const program = await GoodsProgram.findOne({ internalId: programInternalId });
          if (program) {
            const inventoryIndex = program.inventory.findIndex(
              i => i.itemId === itemId && i.batchNumber === batchNumber
            );
            if (inventoryIndex !== -1 && program.inventory[inventoryIndex].quantityAvailable >= quantity) {
              program.inventory[inventoryIndex].quantityAvailable -= quantity;
              program.totalClaims += 1;
              await program.save();

              await Claim.create({
                nullifier,
                programId,
                programInternalId,
                claimType: 'goods',
                itemId,
                quantity,
                unit: program.inventory[inventoryIndex].unit,
                batchNumber,
                expiryDate: program.inventory[inventoryIndex].expiryDate,
                timestamp: new Date(),
                status: 'completed',
                synced: true,
                location
              });
            } else {
              throw new Error('Insufficient stock or batch not found');
            }
          } else {
            throw new Error('Goods program not found');
          }
        }
        item.status = 'completed';
        item.processedAt = new Date();
        
      }
    } catch (error) {
      item.retryCount += 1;
      item.error = error.message;
      item.status = item.retryCount > 3 ? 'failed' : 'pending';
    } finally {
      await item.save();
    }
  }
}

export function startProcessing(intervalMs = 10000) {
  setInterval(processQueue, intervalMs);
}
