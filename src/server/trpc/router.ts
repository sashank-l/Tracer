import { initTRPC } from "@trpc/server";

const t = initTRPC.create();

export const appRouter = t.router({
  health: t.procedure.query(() => ({
    message: "Tracer API is connected.",
  })),
});

export type AppRouter = typeof appRouter;
