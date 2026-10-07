const INDEX_PATTERN = /US30|US500|NAS|NDX|SPX|DJ30|GER|DAX|UK100|FTSE|JP225|NIKKEI/;
const CRYPTO_PATTERN = /BTC|ETH|LTC|XRP/;

export class TradeFormatUtils {
  static priceDigits(symbol: string): number {
    const normalized = symbol.toUpperCase();
    if (normalized.includes('JPY')) return 3;
    if (normalized.includes('XAG') || normalized.includes('SILVER')) return 3;
    if (normalized.includes('XAU') || normalized.includes('GOLD')) return 2;
    if (CRYPTO_PATTERN.test(normalized)) return 2;
    if (INDEX_PATTERN.test(normalized)) return 2;
    return 5;
  }

  static formatPrice(symbol: string, value: number | null | undefined): string {
    if (typeof value !== 'number') return '--';
    return value.toFixed(this.priceDigits(symbol));
  }
}
