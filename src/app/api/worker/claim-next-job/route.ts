import { requireWorkerToken } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { claimNextWorkerJob } from "@/lib/jobs";

export async function POST(request: Request) {
  try {
    requireWorkerToken(request);
    const job = await claimNextWorkerJob();
    return Response.json({ job });
  } catch (error) {
    return errorResponse(error);
  }
}
