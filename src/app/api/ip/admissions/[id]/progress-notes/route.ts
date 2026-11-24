import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { progressNoteSchema } from "@/modules/ip/schemas";
import { addProgressNote } from "@/modules/ip/service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiPermission("ip.access");
    const { id } = await params;
    const input = await parseBody(progressNoteSchema, req);
    const note = await addProgressNote(id, input, user);
    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
