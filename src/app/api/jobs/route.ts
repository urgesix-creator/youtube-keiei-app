import { z } from "zod";
import { requireRequestUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { createJob, listJobs } from "@/lib/jobs";

const createJobSchema = z.object({
  sourceUrl: z.string().url(),
  outputMode: z.enum(["all", "individual"]).default("all"),
  selectedOutputs: z
    .array(
      z.enum([
        "report",
        "x",
        "threads",
        "note",
        "instagram_carousel",
        "instagram_caption",
        "instagram_reel",
        "handoff",
      ]),
    )
    .default([]),
});

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const url = new URL(request.url);
    const jobs = await listJobs({
      userId: user.id,
      query: url.searchParams.get("q"),
      status: url.searchParams.get("status"),
    });

    return Response.json({ jobs });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const body = createJobSchema.parse(await request.json());
    const result = await createJob({
      userId: user.id,
      sourceUrl: body.sourceUrl,
      outputMode: body.outputMode,
      selectedOutputs: body.selectedOutputs,
    });

    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
