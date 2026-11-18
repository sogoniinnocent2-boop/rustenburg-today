import { aiStatus, requestAi } from "@/server/ai";
import { AppError } from "@/server/errors";

export const runtime = "nodejs";

export function GET() {
  return Response.json(aiStatus(), { status: 503 });
}

export async function POST(request: Request) {
  const text = await request.text();
  try {
    requestAi(null, text);
  } catch (error) {
    const status = error instanceof AppError ? error.status : 503;
    const reason = error instanceof Error ? error.message : "The assistant is unavailable.";
    return Response.json({ connected: false, reason }, { status });
  }
}
