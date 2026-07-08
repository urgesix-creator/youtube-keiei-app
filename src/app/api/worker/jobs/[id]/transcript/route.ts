import { z } from "zod";
import { requireWorkerToken } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { completeJobFromTranscript } from "@/lib/jobs";

export const maxDuration = 300;

const schema = z.object({
  transcriptText: z.string().min(100),
  sourceTitle: z.string().nullable().optional(),
  durationSeconds: z.number().int().positive().nullable().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireWorkerToken(request);
    const { id } = await context.params;
    const body = schema.parse(await request.json());
    const job = await completeJobFromTranscript({
      jobId: id,
      transcriptText: body.transcriptText,
      transcriptSource: "youtube_summary_chrome",
      sourceTitle: body.sourceTitle,
      durationSeconds: body.durationSeconds,
    });

    return Response.json({ job });
  } catch (error) {
    return errorResponse(error);
  }
}
