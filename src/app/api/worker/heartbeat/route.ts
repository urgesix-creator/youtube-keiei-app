import { z } from "zod";
import { requireWorkerToken } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { updateWorkerHeartbeat } from "@/lib/jobs";

const schema = z.object({
  workerName: z.string().min(1),
  machineName: z.string().nullable().default(null),
  status: z.enum(["idle", "processing", "error"]).default("idle"),
  currentJobId: z.string().uuid().nullable().default(null),
});

export async function POST(request: Request) {
  try {
    requireWorkerToken(request);
    const body = schema.parse(await request.json());
    await updateWorkerHeartbeat(body);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
