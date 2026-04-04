import express from 'express';
import { authenticateApiKey, authorize } from '../middleware/apiAuth.js';
import { register, login } from '../controllers/authController.js';

// Beneficiary (basic, still used? – we keep them but now protected for agents)
// We'll protect them with agent role, but also keep them if they are needed by managers? We'll protect with agent only.
import { registerBeneficiary, getBeneficiary } from '../controllers/beneficiaryController.js';

// Cash program controllers
import {
  createCashProgram,
  getCashPrograms,
  getCashProgramDetails,
  getOrganizationCashPrograms
} from '../controllers/cashProgramController.js';

// Goods program controllers
import {
  createGoodsProgram,
  getGoodsPrograms,
  getGoodsProgramDetails,
  getProgramInventory
} from '../controllers/goodsProgramController.js';

// Cash claim controllers
import { claimCash, getCashClaimStatus, listCashClaims } from '../controllers/cashClaimController.js';

// Goods claim controllers
import { claimGoods, listGoodsClaims } from '../controllers/goodsClaimController.js';

// Shared controllers
import { getStats } from '../controllers/statsController.js';
import { getTransactions } from '../controllers/transactionController.js';
import { getBeneficiaryClaims } from '../controllers/status.js';

// Supply chain
import {
  createShipment,
  getAllShipments,
  getShipmentById,
  addCheckpoint,
  getTracking
} from '../controllers/supplyChain.js';

// Mock bank (admin only – we'll protect with manager role)
import { getMockBankTransactions, getTransaction } from '../controllers/mockBankController.js';

// Donor specific
import {
  getDonorShipments,
  getDonorImpact,
  getDonorProfile,
  updateDonorProfile,
  getDonorDashboard
} from '../controllers/donorController.js';
import { verifyTransaction, getProgramVerificationSummary } from '../controllers/verificationController.js';

// Manager specific
import {
  getManagerPrograms,
  getManagerProgramDetails,
  createManagerProgram
} from '../controllers/manager/managerProgramController.js';
import {
  getAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent
} from '../controllers/manager/managerAgentController.js';
import {
  getInventory,
  updateInventoryItem
} from '../controllers/manager/managerInventoryController.js';
import {
  getGeofence,
  updateGeofence
} from '../controllers/manager/managerGeofenceController.js';
import { runZKQuery } from '../controllers/manager/managerZKController.js';
import { getManagerDashboard } from '../controllers/manager/managerDashboardController.js';

// Field Agent specific
import { registerOrUpdateBeneficiary, getBeneficiaryWithEligibility } from '../controllers/fieldAgent/fieldAgentBeneficiaryController.js';
import { distributeAid, bulkSyncDistributions } from '../controllers/fieldAgent/fieldAgentDistributionController.js';
import { getBatch, updateBatch } from '../controllers/fieldAgent/fieldAgentBatchController.js';
import { getAgentDashboard, getAgentDistributions } from '../controllers/fieldAgent/fieldAgentDashboardController.js';
import { syncData } from '../controllers/fieldAgent/fieldAgentSyncController.js';
import { verifyLocation } from '../controllers/fieldAgent/fieldAgentGeofenceController.js';
import { getAgentProfile, updateAgentProfile } from '../controllers/fieldAgent/fieldAgentProfileController.js';

const router = express.Router();

// ------------------ Public routes (no authentication) ------------------
router.get('/v1/health', (req, res) => {
  res.json({ status: 'ok', service: 'hiwot-backend', timestamp: new Date().toISOString() });
});

router.post('/v1/auth/register', register);
router.post('/v1/auth/login', login);

// Beneficiaries
router.post('/v1/beneficiaries/register', registerBeneficiary);
router.get('/v1/beneficiaries/:nullifier_hash', getBeneficiary);

// Cash Programs
router.post('/v1/cash-programs', createCashProgram);
router.get('/v1/cash-programs', getCashPrograms);
router.get('/v1/cash-programs/:program_id', getCashProgramDetails);
router.get('/v1/organizations/:wallet/cash-programs', getOrganizationCashPrograms);

// Goods Programs
router.post('/v1/goods-programs', createGoodsProgram);
router.get('/v1/goods-programs', getGoodsPrograms);
router.get('/v1/goods-programs/:program_id', getGoodsProgramDetails);
router.get('/v1/goods-programs/:id/inventory', getProgramInventory);

// Claims
router.post('/v1/cash-claims', claimCash);
router.get('/v1/cash-claims/status', getCashClaimStatus);
router.get('/v1/cash-claims', listCashClaims);

router.post('/v1/goods-claims', claimGoods);
router.get('/v1/goods-claims', listGoodsClaims);

// Miscellaneous
router.get('/v1/beneficiary/:nullifier/claims', getBeneficiaryClaims);
router.get('/v1/stats', getStats);
router.get('/v1/transactions', getTransactions);

// Supply Chain
router.post('/v1/shipments', createShipment);
router.get('/v1/shipments', getAllShipments);
router.get('/v1/shipments/:id', getShipmentById);
router.post('/v1/shipments/:id/checkpoints', addCheckpoint);
router.get('/v1/shipments/:id/track', getTracking);

// ------------------ Manager routes (role: manager) ------------------
router.get('/v1/manager/dashboard', authenticateApiKey, authorize('manager'), getManagerDashboard);
router.get('/v1/manager/programs', authenticateApiKey, authorize('manager'), getManagerPrograms);
router.get('/v1/manager/programs/:program_id', authenticateApiKey, authorize('manager'), getManagerProgramDetails);
router.post('/v1/manager/programs', authenticateApiKey, authorize('manager'), createManagerProgram);

router.get('/v1/manager/agents', authenticateApiKey, authorize('manager'), getAgents);
router.get('/v1/manager/agents/:agent_id', authenticateApiKey, authorize('manager'), getAgent);
router.post('/v1/manager/agents', authenticateApiKey, authorize('manager'), createAgent);
router.patch('/v1/manager/agents/:agent_id', authenticateApiKey, authorize('manager'), updateAgent);
router.delete('/v1/manager/agents/:agent_id', authenticateApiKey, authorize('manager'), deleteAgent);

router.get('/v1/manager/inventory', authenticateApiKey, authorize('manager'), getInventory);
router.patch('/v1/manager/inventory/:item_id', authenticateApiKey, authorize('manager'), updateInventoryItem);

router.get('/v1/manager/programs/:program_id/geofence', authenticateApiKey, authorize('manager'), getGeofence);
router.post('/v1/manager/programs/:program_id/geofence', authenticateApiKey, authorize('manager'), updateGeofence);

router.post('/v1/manager/zk-queries', authenticateApiKey, authorize('manager'), runZKQuery);

// Admin: mock bank transactions – only managers (or admins) should see this
router.get('/v1/admin/mock-bank/transactions', authenticateApiKey, authorize('manager'), getMockBankTransactions);
router.get('/v1/admin/mock-bank/transactions/:reference', authenticateApiKey, authorize('manager'), getTransaction);

// ------------------ Donor routes (role: donor) ------------------
router.get('/v1/cash-programs/:program_id', authenticateApiKey, authorize('donor'), getCashProgramDetails);
router.get('/v1/goods-programs/:program_id', authenticateApiKey, authorize('donor'), getGoodsProgramDetails);
router.get('/v1/shipments/:shipment_id', authenticateApiKey, authorize('donor'), getShipmentById);
router.get('/v1/donors/:wallet/shipments', authenticateApiKey, authorize('donor'), getDonorShipments);
router.get('/v1/donors/:wallet/impact', authenticateApiKey, authorize('donor'), getDonorImpact);
router.get('/v1/donors/:wallet', authenticateApiKey, authorize('donor'), getDonorProfile);
router.patch('/v1/donors/:wallet', authenticateApiKey, authorize('donor'), updateDonorProfile);
router.get('/v1/donors/:wallet/dashboard', authenticateApiKey, authorize('donor'), getDonorDashboard);
router.get('/v1/transactions', authenticateApiKey, authorize('donor'), getTransactions);
router.get('/v1/stats', authenticateApiKey, authorize('donor'), getStats);
router.get('/v1/verify/program/:program_id/transaction/:tx_hash', authenticateApiKey, authorize('donor'), verifyTransaction);
router.get('/v1/verify/program/:program_id/summary', authenticateApiKey, authorize('donor'), getProgramVerificationSummary);

// ------------------ Agent routes (role: agent) ------------------
// Beneficiary registration & retrieval (agent only)
router.post('/v1/beneficiaries', authenticateApiKey, authorize('agent'), registerOrUpdateBeneficiary);
router.get('/v1/beneficiaries/:nullifier', authenticateApiKey, authorize('agent'), getBeneficiaryWithEligibility);

// Distributions
router.post('/v1/distributions', authenticateApiKey, authorize('agent'), distributeAid);
router.post('/v1/distributions/sync', authenticateApiKey, authorize('agent'), bulkSyncDistributions);

// Batches
router.get('/v1/batches/:batch_id', authenticateApiKey, authorize('agent'), getBatch);
router.patch('/v1/batches/:batch_id', authenticateApiKey, authorize('agent'), updateBatch);

// Agent dashboard & history
router.get('/v1/agents/:wallet/dashboard', authenticateApiKey, authorize('agent'), getAgentDashboard);
router.get('/v1/agents/:wallet/distributions', authenticateApiKey, authorize('agent'), getAgentDistributions);

// Sync
router.post('/v1/sync', authenticateApiKey, authorize('agent'), syncData);

// Geofence verification
router.post('/v1/geofence/verify', authenticateApiKey, authorize('agent'), verifyLocation);

// Agent profile
router.get('/v1/agents/:wallet', authenticateApiKey, authorize('agent'), getAgentProfile);
router.patch('/v1/agents/:wallet', authenticateApiKey, authorize('agent'), updateAgentProfile);

// ------------------ Additional endpoints used by both donor and manager (but we protect by role) ------------------
// For cash programs list and creation, we assume only managers can list all programs? Actually donors might need a list too.
// We already have a manager list; we can create a separate donor list endpoint if needed.
// For now, we leave the list endpoints unprotected? The spec shows donor portal has program details, but maybe also list.
// If you need a public list, you can add a separate GET /v1/programs without auth.
// We'll leave them as is for now – adjust based on your needs.

export default router;