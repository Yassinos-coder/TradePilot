export const TRADE_COPIER_FAQ = [
  {
    question: 'What is a trade copier?',
    answer:
      'A trade copier is software that mirrors trades from one trading account to others. You nominate one MetaTrader account as the master; every position it opens, closes, partially closes or modifies is replicated on your slave accounts within seconds, so you place an order once instead of repeating it on each terminal.',
  },
  {
    question: 'Can I copy trades between MT4 and MT5 accounts?',
    answer:
      'Yes. TradePilot runs an Expert Advisor on each terminal and passes trades through its own bridge rather than through MetaTrader, so a master on MT4 can copy to slaves on MT5 and the other way around.',
  },
  {
    question: 'Can I copy trades between accounts at different brokers?',
    answer:
      'Yes. Brokers name instruments differently — one lists gold as XAUUSD, another as GOLD, another with a suffix such as XAUUSD.pro. TradePilot maps symbols per link, so a trade opened on the master resolves to the right instrument on each slave account.',
  },
  {
    question: 'Can each copied account use a different lot size?',
    answer:
      'Yes, and this is the point of per-account risk parameters. Each master-to-slave link carries its own sizing mode — fixed lot, multiplier, balance ratio or percent risk — plus its own lot caps and position limits, so a small account and a large account can follow the same master at completely different exposure.',
  },
  {
    question: 'Does trade copying work with prop firm accounts?',
    answer:
      'It does, and the risk rules matter more there than anywhere else. Daily loss limits, drawdown ceilings, equity floors and position caps are enforced before a copy is sent rather than reported afterwards, so a link stops opening new trades once its limit is reached. Closes are never blocked.',
  },
  {
    question: 'Do I need a VPS to copy trades?',
    answer:
      'Copying only happens while the master terminal is running and connected, so most traders run MetaTrader on a VPS to keep it online overnight and through the weekend gap. Slave terminals also need to be running to execute the copies they receive.',
  },
];
