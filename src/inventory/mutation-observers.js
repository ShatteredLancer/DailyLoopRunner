export function createInventoryMutationObservers(coordinator) {
  if (!coordinator) throw new TypeError('Inventory Ledger coordinator is required');

  async function packReceipt(receipt, context = {}) {
    return coordinator.recordPackReceipt(receipt, context);
  }

  async function moveResult(result, context = {}) {
    return coordinator.recordMove({
      result,
      items: context.items || [],
      fromPile: context.fromPile,
      toPile: context.toPile,
      ambiguous: context.ambiguous === true,
      reason: context.reason,
      confirmedAt: context.confirmedAt,
    });
  }

  async function submissionResult(result, context = {}) {
    return coordinator.recordSubmission(result, {
      ambiguous: context.ambiguous === true,
      primary: context.primary === true,
      confirmedAt: context.confirmedAt,
    });
  }

  async function pickConfirmed(payload = {}, context = {}) {
    const entry = payload.entry || payload;
    return coordinator.recordPickSelection({
      status: 'selected',
      confirmed: true,
      pickedCards: entry.pickedCards || payload.pickedCards || [],
    }, {
      pile: context.pile || payload.pile || 'unassigned',
      confirmedAt: context.confirmedAt,
    });
  }

  async function capacities(value, context = {}) {
    return coordinator.recordCapacities(value, context);
  }

  return Object.freeze({ capacities, moveResult, packReceipt, pickConfirmed, submissionResult });
}
