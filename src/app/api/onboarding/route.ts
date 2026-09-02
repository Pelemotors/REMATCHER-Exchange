import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getDealerSetupStatus,
  markOnboardingStep,
} from "@/services/dealer/onboarding-state";

export async function GET() {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getDealerSetupStatus(session.user.dealerId);
  return NextResponse.json(status);
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { step } = await req.json();
  const allowed = ["intro", "profile", "inventory", "demand", "push", "complete", "dismiss"];
  if (!allowed.includes(step)) {
    return NextResponse.json({ error: "Invalid step" }, { status: 400 });
  }

  await markOnboardingStep(session.user.dealerId, step);
  const status = await getDealerSetupStatus(session.user.dealerId);
  return NextResponse.json(status);
}
