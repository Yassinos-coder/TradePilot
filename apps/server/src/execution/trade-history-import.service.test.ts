import assert from 'node:assert/strict';

import { BadRequestException } from '@nestjs/common';

import { TradeHistoryImportService } from './trade-history-import.service';

const service = new TradeHistoryImportService({} as never, {} as never);

const csv = `Order,Open Time,Type,Size,Item,Price,S / L,T / P,Close Time,Price,Commission,Taxes,Swap,Profit,Comment
12345,2026.06.01 09:00:00,buy,0.10,XAUUSD,2350.50,2340.00,2365.00,2026.06.01 10:15:00,2360.50,0,0,-1.25,98.75,London scalp
balance,2026.06.01 11:00:00,balance,0,,0,0,0,2026.06.01 11:00:00,0,0,0,0,1000,Deposit`;

const csvResult = service.parse(csv, 'mt4-report.csv');
assert.equal(csvResult.platform, 'MT4');
assert.equal(csvResult.trades.length, 1);
assert.equal(csvResult.skippedRows, 1);
assert.equal(csvResult.trades[0]?.ticket, '12345');
assert.equal(csvResult.trades[0]?.symbol, 'XAUUSD');
assert.equal(csvResult.trades[0]?.type, 'BUY');
assert.equal(csvResult.trades[0]?.profit, 98.75);
assert.equal(csvResult.trades[0]?.opened_at, '2026-06-01T09:00:00.000Z');
assert.equal(csvResult.trades[0]?.closed_at, '2026-06-01T10:15:00.000Z');

const html = `
<html><body><table>
<tr><td>Order</td><td>Open Time</td><td>Type</td><td>Size</td><td>Item</td><td>Price</td><td>S / L</td><td>T / P</td><td>Close Time</td><td>Price</td><td>Profit</td></tr>
<tr><td>54321</td><td>2026.06.02 13:00</td><td>sell</td><td>0.20</td><td>EURUSD</td><td>1.0820</td><td>1.0870</td><td>1.0750</td><td>2026.06.02 14:30</td><td>1.0780</td><td>80.5</td></tr>
</table></body></html>`;

const htmlResult = service.parse(html, 'statement.html');
assert.equal(htmlResult.platform, 'MT4');
assert.equal(htmlResult.trades.length, 1);
assert.equal(htmlResult.trades[0]?.ticket, '54321');
assert.equal(htmlResult.trades[0]?.type, 'SELL');
assert.equal(htmlResult.trades[0]?.exit_price, 1.078);

assert.throws(
  () => service.parse('hello world', 'notes.pdf'),
  BadRequestException,
);
