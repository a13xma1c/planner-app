import { QueryClient } from '@tanstack/react-query'

import { ApiError } from '@/api/client'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        // Don't retry client errors (404/422...), only transient failures.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status < 500) && failureCount < 2,
        refetchOnWindowFocus: true,
      },
    },
  })
}
