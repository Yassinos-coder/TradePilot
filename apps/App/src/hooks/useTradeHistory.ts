import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api';

const PAGE_SIZE = 10;
const ALL = 'ALL';

export function useTradeHistory() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(ALL);
  const [symbol, setSymbol] = useState(ALL);
  const [accountId, setAccountId] = useState(ALL);

  const query = useQuery({
    queryKey: ['execution', 'trades', 'page', page, status, symbol, accountId],
    queryFn: () =>
      apiClient.tradesPage({
        page,
        pageSize: PAGE_SIZE,
        ...(status !== ALL ? { status } : {}),
        ...(symbol !== ALL ? { symbol } : {}),
        ...(accountId !== ALL ? { accountId } : {}),
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 120_000,
  });

  const changeFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  return {
    query,
    page,
    pageSize: PAGE_SIZE,
    setPage,
    filters: { status, symbol, accountId },
    setStatus: changeFilter(setStatus),
    setSymbol: changeFilter(setSymbol),
    setAccountId: changeFilter(setAccountId),
  };
}
