const backendUrl = process.env.AURA_BACKEND_URL || "http://127.0.0.1:8787";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Send a valid audio request." }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${backendUrl}/api/speech`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(65_000),
    });

    if (!upstream.ok) {
      const body = await upstream.json();
      return Response.json(body, { status: upstream.status });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "audio/wav",
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { error: "AURA’s speech service is unavailable. Please try again." },
      { status: 503 },
    );
  }
}
