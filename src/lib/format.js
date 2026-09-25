// Shared currency formatting so every page formats money the same way.
// Uses Intl.NumberFormat so numbers get proper Indian-style grouping
// (e.g. 1,27,155 not 127,155) alongside the ₹ symbol.

export function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value)
}
