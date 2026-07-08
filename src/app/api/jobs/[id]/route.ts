import { requireRequestUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { getJobForUser } from "@/lib/jobs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRequestUser(request);
    const { id } = await context.params;
    const job = await getJobForUser(id, user.id);
    return Response.json({ job });
  } catch (error) {
    return errorResponse(error);
  }
}
