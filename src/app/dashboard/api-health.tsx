"use client";

import { useEffect, useState } from "react";

import { useTrpcClient } from "@/components/trpc-provider";

export function ApiHealth() {
  const trpc = useTrpcClient();
  const [message, setMessage] = useState("Checking API connection…");

  useEffect(() => {
    trpc.health
      .query()
      .then((result) => setMessage(result.message))
      .catch(() => setMessage("Unable to reach the Tracer API."));
  }, [trpc]);

  return <p>{message}</p>;
}
