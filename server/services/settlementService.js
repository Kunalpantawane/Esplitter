/**
 * Re-export balance service as the plan-specified "settlementService".
 * The canonical implementation lives in ./balanceService.js and includes:
 *   - computeDebtsNormal() via buildNormalPairwiseDebts()
 *   - computeDebtsSmart() via simplifyDebts()
 *   - computeGroupBalances() with ?mode=smart|normal
 */
module.exports = require('./balanceService');
