export const SIIGO_IVA_RATE = 1.19

export function withoutIva(amount: number): number {
  return amount / SIIGO_IVA_RATE
}
