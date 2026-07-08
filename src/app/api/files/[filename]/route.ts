import { readFile } from "node:fs/promises";
import path from "node:path";
import { errorResponse } from "@/lib/errors";

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> },
) {
  try {
    const { filename } = await context.params;
    if (filename !== path.basename(filename) || !filename.endsWith(".md")) {
      return Response.json({ message: "ファイル名が不正です。" }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), "outputs", "markdown", filename);
    const markdown = await readFile(filePath, "utf8");

    return new Response(markdown, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
