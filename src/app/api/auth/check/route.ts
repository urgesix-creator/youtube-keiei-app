import { requireRequestUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    return Response.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
