import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  forgetMemory,
  listDealerMemories,
} from "@/services/assistant/dealer-memory";
import { deleteAllDealerMemoryForOwner } from "@/services/privacy/deletion";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await listDealerMemories({
    dealerId: session.user.dealerId,
  });
  return NextResponse.json({ items });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    const result = await forgetMemory({
      dealerId: session.user.dealerId,
      memoryId: id,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.mutation.reason ?? "not_found" },
        { status: 404 }
      );
    }
    return NextResponse.json(result);
  }

  const result = await deleteAllDealerMemoryForOwner({
    dealerId: session.user.dealerId,
    userId: session.user.id,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }
  return NextResponse.json(result);
}
