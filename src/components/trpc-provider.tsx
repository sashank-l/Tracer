"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createContext, useContext, useState } from "react";

import type { AppRouter } from "@/server/trpc/router";

const TrpcClientContext = createContext<ReturnType<
  typeof createTRPCClient<AppRouter>
> | null>(null);

export function TrpcProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: "/api/trpc" })],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TrpcClientContext.Provider value={trpcClient}>
        {children}
      </TrpcClientContext.Provider>
    </QueryClientProvider>
  );
}

export function useTrpcClient() {
  const client = useContext(TrpcClientContext);

  if (!client) {
    throw new Error("useTrpcClient must be used inside TrpcProvider");
  }

  return client;
}
