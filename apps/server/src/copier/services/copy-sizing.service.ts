import { SizingInput, SizingResult } from '../interfaces/copier.interfaces';

/**
 * Translates a master position size into a slave position size.
 *
 * Every mode is clamped to the link's [minLot, maxLot]. Final rounding to the
 * broker's lot step happens in the EA (NormalizeVolumeForSymbol), which is the
 * only place that knows the symbol's real step.
 */
export class CopySizingService {
  static resolveVolume(input: SizingInput): SizingResult {
    const { link } = input;

    switch (link.sizing_mode) {
      case 'FIXED_LOT':
        return CopySizingService.finalize(link, Number(link.fixed_lot ?? 0), null);

      case 'BALANCE_RATIO':
        return CopySizingService.resolveBalanceRatio(input);

      case 'RISK_PERCENT':
        return CopySizingService.resolveRiskPercent(input);

      case 'MULTIPLIER':
      default:
        return CopySizingService.finalize(
          link,
          input.masterVolume * Number(link.lot_multiplier ?? 1),
          null,
        );
    }
  }

  private static resolveBalanceRatio(input: SizingInput): SizingResult {
    const { link, masterEquity, slaveEquity } = input;

    if (!masterEquity || masterEquity <= 0 || !slaveEquity || slaveEquity <= 0) {
      return CopySizingService.finalize(
        link,
        input.masterVolume * Number(link.lot_multiplier ?? 1),
        'BALANCE_RATIO fell back to MULTIPLIER: no equity snapshot for both accounts',
      );
    }

    return CopySizingService.finalize(
      link,
      input.masterVolume * (slaveEquity / masterEquity),
      null,
    );
  }

  private static resolveRiskPercent(input: SizingInput): SizingResult {
    const { link, masterStopLoss, masterEntryPrice, slaveEquity } = input;
    const riskPercent = Number(link.risk_percent ?? 0);

    if (!slaveEquity || slaveEquity <= 0 || riskPercent <= 0) {
      return CopySizingService.finalize(
        link,
        input.masterVolume * Number(link.lot_multiplier ?? 1),
        'RISK_PERCENT fell back to MULTIPLIER: no slave equity snapshot',
      );
    }

    if (!masterStopLoss || !masterEntryPrice) {
      return CopySizingService.finalize(
        link,
        input.masterVolume * Number(link.lot_multiplier ?? 1),
        'RISK_PERCENT fell back to MULTIPLIER: master sent no stop loss',
      );
    }

    const stopDistance = Math.abs(masterEntryPrice - masterStopLoss);

    if (stopDistance <= 0) {
      return CopySizingService.finalize(
        link,
        input.masterVolume * Number(link.lot_multiplier ?? 1),
        'RISK_PERCENT fell back to MULTIPLIER: stop distance is zero',
      );
    }

    // Risk budget per unit of price movement. The EA normalises to the symbol's
    // contract size and lot step, so this is a per-point approximation.
    const riskBudget = (slaveEquity * riskPercent) / 100;
    const impliedVolume = riskBudget / (stopDistance * 100);

    return CopySizingService.finalize(link, impliedVolume, null);
  }

  private static finalize(
    link: SizingInput['link'],
    rawVolume: number,
    note: string | null,
  ): SizingResult {
    const minLot = Number(link.min_lot ?? 0.01);
    const maxLot = Number(link.max_lot ?? 5);

    if (!Number.isFinite(rawVolume) || rawVolume <= 0) {
      return { volume: minLot, note: note ?? 'Computed volume was not positive; used min lot' };
    }

    const clamped = Math.min(Math.max(rawVolume, minLot), maxLot);
    const rounded = Math.round(clamped * 100) / 100;
    const clampNote =
      rawVolume > maxLot
        ? `Volume clamped from ${rawVolume.toFixed(2)} to max lot ${maxLot}`
        : rawVolume < minLot
          ? `Volume raised from ${rawVolume.toFixed(4)} to min lot ${minLot}`
          : null;

    return {
      volume: rounded > 0 ? rounded : minLot,
      note: note ?? clampNote,
    };
  }
}
