import { z } from "zod";
import { requireWorkerToken } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { recordChromeFailure } from "@/lib/jobs";

const schema = z.object({
  errorCode: z.string().default("chrome_automation_error"),
  errorMessage: z.string().min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireWorkerToken(request);
    const { id } = await context.params;
    const body = schema.parse(await request.json());
    const job = await recordChromeFailure({
      jobId: id,
      errorCode: body.errorCode,
      errorMessage: body.errorMessage,
    });

    return Response.json({ job });
  } catch (error) {
    return errorResponse(error);
  }
}
