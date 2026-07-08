import { z } from "zod";
import { requireRequestUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { completeJobFromTranscript, getJobForUser } from "@/lib/jobs";

export const maxDuration = 300;

const schema = z.object({
  transcriptText: z.string().min(100, "文字起こし本文が短すぎます。"),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRequestUser(request);
    const { id } = await context.params;
    await getJobForUser(id, user.id);
    const body = schema.parse(await request.json());
    const job = await completeJobFromTranscript({
      jobId: id,
      transcriptText: body.transcriptText,
      transcriptSource: "manual_transcript",
    });

    return Response.json({ job });
  } catch (error) {
    return errorResponse(error);
  }
}
