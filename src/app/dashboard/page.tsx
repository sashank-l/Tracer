import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    await auth.protect();
  }

  return (
    <main>
      <header>
        <h1>Tracer dashboard</h1>
      </header>
      <p>Your connected repositories and incidents will appear here.</p>
    </main>
  );
}
