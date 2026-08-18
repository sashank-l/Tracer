import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const event = await verifyWebhook(request);

    if (event.type === "user.created" || event.type === "user.updated") {
      const primaryEmail = event.data.email_addresses.find(
        (email) => email.id === event.data.primary_email_address_id,
      )?.email_address;

      await prisma.user.upsert({
        where: { clerkId: event.data.id },
        create: {
          clerkId: event.data.id,
          email: primaryEmail,
        },
        update: {
          email: primaryEmail,
        },
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Unable to process Clerk webhook", error);
    return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
  }
}
