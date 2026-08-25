/** Shared factory/retrofit ETCS surcharge — catalog Grundpreis, same number as the Händler. */

export const ETCS_RATE = 0.08;

export function etcsPriceForBase(basePrice: number): number {
  return Math.round(basePrice * ETCS_RATE);
}
