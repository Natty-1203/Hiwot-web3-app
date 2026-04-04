import pkg from '@stellar/stellar-sdk';
const { rpc, TransactionBuilder, Networks, BASE_FEE, nativeToScVal, scValToNative, Address, Contract, Keypair, xdr, ScInt } = pkg;
import config from '../config/index.js';

import crypto from 'crypto';

// ------------------------------
// Soroban RPC setup
// ------------------------------
const server = new rpc.Server(config.sorobanRpcUrl);
const networkPassphrase = String(config.stellarNetwork || 'testnet').toLowerCase() === 'public'
  ? Networks.PUBLIC
  : Networks.TESTNET;
const backendKeypair = Keypair.fromSecret(config.backendSecret);

// Helper: convert string to BytesN<32> (32‑byte fixed)
function stringToBytesN32(str) {
  const hash = crypto.createHash('sha256').update(str).digest();
  return Buffer.from(hash);
}

function toScaledCoord(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new Error(`Invalid coordinate value: ${value}`);
  }
  return Math.abs(numericValue) <= 500 ? Math.round(numericValue * 1e7) : Math.round(numericValue);
}

function toI128ScVal(value) {
  return new ScInt(value).toI128();
}

function toU32ScVal(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw new Error(`Invalid u32 value: ${value}`);
  }
  return nativeToScVal(Math.round(numericValue), { type: 'u32' });
}

function toU64ScVal(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw new Error(`Invalid u64 value: ${value}`);
  }
  return nativeToScVal(Math.round(numericValue), { type: 'u64' });
}

function isScVal(value) {
  return Boolean(value) && typeof value === 'object' && typeof value.switch === 'function';
}

function toLocationStructScVal(location) {
  const lat = toI128ScVal(toScaledCoord(location.lat));
  const lon = toI128ScVal(toScaledCoord(location.lng ?? location.lon));

  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('lat'),
      val: lat
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('lon'),
      val: lon
    })
  ]);
}

function toLocationTupleScVal(location) {
  const lat = toI128ScVal(toScaledCoord(location.lat));
  const lon = toI128ScVal(toScaledCoord(location.lng ?? location.lon));
  return xdr.ScVal.scvVec([lat, lon]);
}

function isLocationDecodeTrap(error) {
  const msg = String(error?.message || error || '');
  return msg.includes('Error(WasmVm, InvalidAction)') || msg.includes('UnreachableCodeReached');
}

function getDisbursementContractIds() {
  const ids = [config.disbursementContractId, config.contractId]
    .map(id => String(id || '').trim())
    .filter(Boolean);

  return [...new Set(ids)];
}

function getPrimaryDisbursementContractId() {
  const contractIds = getDisbursementContractIds();
  if (!contractIds.length) {
    throw new Error('No disbursement contract ID configured. Set DISBURSEMENT_ADDRESS or CONTRACT_ID.');
  }
  return contractIds[0];
}

function stringifyErrorData(value) {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, (_key, item) => {
      if (typeof item === 'bigint') {
        return item.toString();
      }
      return item;
    });
  } catch (_error) {
    return String(value);
  }
}

function getAuthWalletCandidates(primaryWallet) {
  const candidates = [primaryWallet, backendKeypair.publicKey()]
    .map(wallet => String(wallet || '').trim())
    .filter(Boolean);

  return [...new Set(candidates)];
}

function toHex32(value) {
  const normalized = String(value || '').trim().replace(/^0x/i, '').toLowerCase();
  if (/^[0-9a-f]{64}$/.test(normalized)) {
    return normalized;
  }
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

// Helper: invoke any contract method
async function invokeContract(contractId, method, args = [], isView = false) {
  const contract = new Contract(contractId);
  const account = await server.getAccount(backendKeypair.publicKey());
  const scValArgs = args.map(arg => {
    if (isScVal(arg)) {
      return arg;
    }

    if (arg && typeof arg === 'object' && arg.type === 'i128') {
      return new ScInt(arg.value).toI128();
    }

    return nativeToScVal(arg);
  });

  let tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
    .addOperation(contract.call(method, ...scValArgs))
    .setTimeout(30)
    .build();

  if (isView) {
    const sim = await server.simulateTransaction(tx);
    if (sim.error) throw new Error(`Simulation error: ${sim.error}`);
    return scValToNative(sim.result);
  } else {
    const sim = await server.simulateTransaction(tx);
    if (sim.error) throw new Error(`Simulation error: ${sim.error}`);
    const assembled = rpc.assembleTransaction(tx, sim).build();
    assembled.sign(backendKeypair);
    const sendResponse = await server.sendTransaction(assembled);
    if (sendResponse.error) {
      throw new Error(`Send error: ${stringifyErrorData(sendResponse.error)}`);
    }

    let getResponse = await server.getTransaction(sendResponse.hash);
    while (getResponse.status === 'NOT_FOUND') {
      await new Promise(resolve => setTimeout(resolve, 2000));
      getResponse = await server.getTransaction(sendResponse.hash);
    }
    if (getResponse.status === 'SUCCESS') {
      // Return the transaction hash (for logging)
      return { txHash: sendResponse.hash };
    } else {
      const details = stringifyErrorData(getResponse.errorResultXdr || getResponse.resultXdr || getResponse);
      throw new Error(`Transaction failed (status=${getResponse.status}, hash=${sendResponse.hash}): ${details}`);
    }
  }
}

// ------------------------------
// Exported service
// ------------------------------
export const stellarService = {
  // ----- Identity Contract -----
  async registerBeneficiary(nullifier, agentWallet, metadataHash) {
    const nullifierBytes = Buffer.from(nullifier.replace('0x', ''), 'hex');
    const agentAddr = new Address(agentWallet);
    const metadataHashBytes = Buffer.from(metadataHash.replace('0x', ''), 'hex');
    const result = await invokeContract(
      config.identityContractId,
      'register',
      [agentAddr, nullifierBytes, metadataHashBytes],
      false
    );
    return { txHash: result.txHash };
  },

  async verifyBeneficiary(nullifier) {
    const nullifierBytes = Buffer.from(nullifier.replace('0x', ''), 'hex');
    // The contract expects (agent, nullifier) – we can pass a dummy agent address.
    const dummyAgent = new Address(backendKeypair.publicKey());
    const result = await invokeContract(
      config.identityContractId,
      'verify',
      [dummyAgent, nullifierBytes],
      true
    );
    return result; // boolean
  },

  // ----- Disbursement Contract -----
  async createProgram(donorWallet, programIdString, amountPerPersonStroops, totalBudgetStroops, frequencyDays, geofenceVertices, startTime, endTime) {
    const programIdBytes = stringToBytesN32(programIdString);
    const contractIds = getDisbursementContractIds();
    const authWalletCandidates = getAuthWalletCandidates(donorWallet);
    if (!contractIds.length) {
      throw new Error('No disbursement contract ID configured. Set DISBURSEMENT_ADDRESS or CONTRACT_ID.');
    }
    if (!authWalletCandidates.length) {
      throw new Error('No donor wallet configured for create_program authorization.');
    }

    const geofenceStruct = geofenceVertices.map(v => toLocationStructScVal(v));
    const geofenceTuple = geofenceVertices.map(v => toLocationTupleScVal(v));
    const createErrors = [];
    const startTimeScVal = toU64ScVal(startTime);
    const endTimeScVal = toU64ScVal(endTime);
    const frequencyDaysScVal = toU32ScVal(frequencyDays);

    for (const contractId of contractIds) {
      for (const authWallet of authWalletCandidates) {
        let donorAddr;
        try {
          donorAddr = new Address(authWallet);
        } catch (addressError) {
          createErrors.push(`[${contractId}|auth=${authWallet}] Invalid donor wallet: ${addressError.message}`);
          continue;
        }

        const commonArgs = [
          donorAddr,
          programIdBytes,
          { type: 'i128', value: Math.round(amountPerPersonStroops) },
          { type: 'i128', value: Math.round(totalBudgetStroops) },
          frequencyDaysScVal
        ];

        try {
          const result = await invokeContract(
            contractId,
            'create_program',
            [...commonArgs, geofenceStruct, startTimeScVal, endTimeScVal],
            false
          );
          return { txHash: result.txHash, contractId, authWallet };
        } catch (error) {
          if (!isLocationDecodeTrap(error)) {
            createErrors.push(`[${contractId}|auth=${authWallet}] ${error.message}`);
            continue;
          }

          try {
            const result = await invokeContract(
              contractId,
              'create_program',
              [...commonArgs, geofenceTuple, startTimeScVal, endTimeScVal],
              false
            );
            return { txHash: result.txHash, contractId, authWallet };
          } catch (fallbackError) {
            createErrors.push(
              `[${contractId}|auth=${authWallet}] struct error: ${error.message}; tuple error: ${fallbackError.message}`
            );
          }
        }
      }
    }

    throw new Error(
      `create_program failed across configured contract IDs and auth wallets. ${createErrors.join(' | ')}`
    );
  },

  async fundProgram(donorWallet, programIdString, amountStroops) {
    const programIdBytes = stringToBytesN32(programIdString);
    const contractId = getPrimaryDisbursementContractId();
    const authWalletCandidates = getAuthWalletCandidates(donorWallet);
    const fundErrors = [];

    for (const authWallet of authWalletCandidates) {
      try {
        const donorAddr = new Address(authWallet);
        const result = await invokeContract(
          contractId,
          'fund_program',
          [donorAddr, programIdBytes, { type: 'i128', value: Math.round(amountStroops) }],
          false
        );
        return { txHash: result.txHash, contractId, authWallet };
      } catch (error) {
        fundErrors.push(`[${contractId}|auth=${authWallet}] ${error.message}`);
      }
    }

    throw new Error(
      `fund_program failed across configured auth wallets. ${fundErrors.join(' | ')}`
    );
  },

  async distribute(agentWallet, programIdString, nullifier, location, batchId = null) {
    const programIdBytes = stringToBytesN32(programIdString);
    const nullifierBytes = Buffer.from(nullifier.replace('0x', ''), 'hex');

    let batchIdScVal = null;
    if (batchId) {
      batchIdScVal = stringToBytesN32(batchId);
    }

    const contractId = getPrimaryDisbursementContractId();
    const authWalletCandidates = getAuthWalletCandidates(agentWallet);
    const distributeErrors = [];

    for (const authWallet of authWalletCandidates) {
      let agentAddr;
      try {
        agentAddr = new Address(authWallet);
      } catch (addressError) {
        distributeErrors.push(`[${contractId}|auth=${authWallet}] Invalid agent wallet: ${addressError.message}`);
        continue;
      }

      try {
        const locationScVal = toLocationStructScVal(location);
        const result = await invokeContract(
          contractId,
          'distribute',
          [agentAddr, programIdBytes, nullifierBytes, locationScVal, batchIdScVal],
          false
        );
        return { txHash: result.txHash, contractId, authWallet };
      } catch (error) {
        if (!isLocationDecodeTrap(error)) {
          distributeErrors.push(`[${contractId}|auth=${authWallet}] ${error.message}`);
          continue;
        }

        try {
          const locationScVal = toLocationTupleScVal(location);
          const result = await invokeContract(
            contractId,
            'distribute',
            [agentAddr, programIdBytes, nullifierBytes, locationScVal, batchIdScVal],
            false
          );
          return { txHash: result.txHash, contractId, authWallet };
        } catch (fallbackError) {
          distributeErrors.push(
            `[${contractId}|auth=${authWallet}] struct error: ${error.message}; tuple error: ${fallbackError.message}`
          );
        }
      }
    }

    throw new Error(
      `distribute failed across configured auth wallets. ${distributeErrors.join(' | ')}`
    );
  },

  async checkEligibility(programIdString, nullifier, location) {
    const programIdBytes = stringToBytesN32(programIdString);
    const nullifierBytes = Buffer.from(nullifier.replace('0x', ''), 'hex');

    let result;
    try {
      const locationScVal = toLocationStructScVal(location);
      result = await invokeContract(
        getPrimaryDisbursementContractId(),
        'check_eligibility',
        [programIdBytes, nullifierBytes, locationScVal],
        true
      );
    } catch (error) {
      if (!isLocationDecodeTrap(error)) {
        throw error;
      }

      const locationScVal = toLocationTupleScVal(location);
      result = await invokeContract(
        getPrimaryDisbursementContractId(),
        'check_eligibility',
        [programIdBytes, nullifierBytes, locationScVal],
        true
      );
    }

    return result; // boolean
  },

  async getProgram(programIdString) {
    const programIdBytes = stringToBytesN32(programIdString);
    const result = await invokeContract(
      getPrimaryDisbursementContractId(),
      'get_program',
      [programIdBytes],
      true
    );
    return result;
  },

  async getRemainingBudget(programIdString) {
    const programIdBytes = stringToBytesN32(programIdString);
    const result = await invokeContract(
      getPrimaryDisbursementContractId(),
      'get_remaining_budget',
      [programIdBytes],
      true
    );
    return result;
  },

  // ----- Token Contract (mock USDC) -----
  async mintTokens(toWallet, amountStroops) {
    const toAddr = new Address(toWallet);
    const result = await invokeContract(
      config.tokenContractId,
      'mint',
      [toAddr, { type: 'i128', value: Math.round(amountStroops) }],
      false
    );
    return { txHash: result.txHash };
  },

  async transferTokens(fromWallet, toWallet, amountStroops) {
    const fromAddr = new Address(fromWallet);
    const toAddr = new Address(toWallet);
    const result = await invokeContract(
      config.tokenContractId,
      'transfer',
      [fromAddr, toAddr, { type: 'i128', value: Math.round(amountStroops) }],
      false
    );
    return { txHash: result.txHash };
  },

  async balance(accountWallet) {
    const accountAddr = new Address(accountWallet);
    const result = await invokeContract(
      config.tokenContractId,
      'balance',
      [accountAddr],
      true
    );
    return result; // i128
  },

  // ----- Supply Chain Contract -----
  async createBatch(creatorWallet, batchIdString, description, quantity, metadataHash) {
    const creatorAddr = new Address(creatorWallet);
    const batchIdBytes = stringToBytesN32(batchIdString);
    const metadataHashBytes = Buffer.from(metadataHash.replace('0x', ''), 'hex');
    const result = await invokeContract(
      config.supplyChainContractId,
      'create_batch',
      [creatorAddr, batchIdBytes, description, quantity, metadataHashBytes],
      false
    );
    return { txHash: result.txHash };
  },

  async transferCustody(senderWallet, batchIdString, newCustodianWallet, location, notes) {
    const senderAddr = new Address(senderWallet);
    const batchIdBytes = stringToBytesN32(batchIdString);
    const newCustodianAddr = new Address(newCustodianWallet);
    const locationScVal = [ 
      { type: 'i128', value: Math.abs(location.lat) <= 500 ? Math.round(location.lat * 1e7) : Math.round(location.lat) }, 
      { type: 'i128', value: Math.abs(location.lng) <= 500 ? Math.round(location.lng * 1e7) : Math.round(location.lng) } 
    ];
    const result = await invokeContract(
      config.supplyChainContractId,
      'transfer_custody',
      [senderAddr, batchIdBytes, newCustodianAddr, locationScVal, notes],
      false
    );
    return { txHash: result.txHash };
  },

  async recordDamage(custodianWallet, batchIdString, damagedQuantity, location, notes) {
    const custodianAddr = new Address(custodianWallet);
    const batchIdBytes = stringToBytesN32(batchIdString);
    const locationScVal = [ 
      { type: 'i128', value: Math.abs(location.lat) <= 500 ? Math.round(location.lat * 1e7) : Math.round(location.lat) }, 
      { type: 'i128', value: Math.abs(location.lng) <= 500 ? Math.round(location.lng * 1e7) : Math.round(location.lng) } 
    ];
    const result = await invokeContract(
      config.supplyChainContractId,
      'record_damage',
      [custodianAddr, batchIdBytes, damagedQuantity, locationScVal, notes],
      false
    );
    return { txHash: result.txHash };
  },

  async linkToDistribution(custodianWallet, batchIdString, distributionIdString, nullifier, quantity, location) {
    const custodianAddr = new Address(custodianWallet);
    const batchIdBytes = stringToBytesN32(batchIdString);
    const distributionIdBytes = stringToBytesN32(distributionIdString);
    const nullifierBytes = Buffer.from(nullifier.replace('0x', ''), 'hex');
    const locationScVal = [ 
      { type: 'i128', value: Math.abs(location.lat) <= 500 ? Math.round(location.lat * 1e7) : Math.round(location.lat) }, 
      { type: 'i128', value: Math.abs(location.lng) <= 500 ? Math.round(location.lng * 1e7) : Math.round(location.lng) } 
    ];
    const result = await invokeContract(
      config.supplyChainContractId,
      'link_to_distribution',
      [custodianAddr, batchIdBytes, distributionIdBytes, nullifierBytes, quantity, locationScVal],
      false
    );
    return { txHash: result.txHash };
  },

  async getBatch(batchIdString) {
    const batchIdBytes = stringToBytesN32(batchIdString);
    const result = await invokeContract(
      config.supplyChainContractId,
      'get_batch',
      [batchIdBytes],
      true
    );
    return result;
  },

  async getBatchHistory(batchIdString) {
    const batchIdBytes = stringToBytesN32(batchIdString);
    const result = await invokeContract(
      config.supplyChainContractId,
      'get_batch_history',
      [batchIdBytes],
      true
    );
    return result;
  },

  async getRemainingQuantity(batchIdString) {
    const batchIdBytes = stringToBytesN32(batchIdString);
    const result = await invokeContract(
      config.supplyChainContractId,
      'get_remaining_quantity',
      [batchIdBytes],
      true
    );
    return result;
  },

  async batchExists(batchIdString) {
    const batchIdBytes = stringToBytesN32(batchIdString);
    const result = await invokeContract(
      config.supplyChainContractId,
      'batch_exists',
      [batchIdBytes],
      true
    );
    return result;
  },

  async recordShipmentHash(anchorKey, dataHash, creatorWallet = backendKeypair.publicKey()) {
    const key = String(anchorKey || '').trim();
    if (!key) {
      throw new Error('anchorKey is required');
    }

    const metadataHashHex = toHex32(dataHash);
    const uniqueAnchorId = `${key}_${metadataHashHex.slice(0, 12)}`;
    const description = `anchor:${key}`;
    const errors = [];

    for (const quantity of [0, 1]) {
      try {
        const result = await this.createBatch(
          creatorWallet,
          uniqueAnchorId,
          description,
          quantity,
          `0x${metadataHashHex}`
        );
        return result.txHash;
      } catch (error) {
        errors.push(`q=${quantity}: ${error.message}`);
      }
    }

    // Keep shipment flow operational even if the supply-chain contract has stale storage/schema.
    const fallbackAnchor = `local_${crypto.createHash('sha256').update(`${key}:${metadataHashHex}`).digest('hex')}`;
    console.warn(`recordShipmentHash fallback to local anchor for ${key}. Errors: ${errors.join(' | ')}`);
    return fallbackAnchor;
  }
};