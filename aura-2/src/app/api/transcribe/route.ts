const backendUrl = process.env.AURA_BACKEND_URL || "http://127.0.0.1:8787";
const maxAudioBytes = 2 * 1024 * 1024;

export async function POST(request: Request) {
  const audioType = request.headers.get("content-type") || "";
  const language = request.headers.get("x-audio-language") || "hi-IN";
  if (audioType.split(";")[0] !== "application/octet-stream") {
    return Response.json({ error: "AURA received an unsupported microphone recording." }, { status: 415 });
  }
  if (!new Set(["en-US", "hi-IN"]).has(language)) {
    return Response.json({ error: "Choose English or Hindi for voice input." }, { status: 400 });
  }

  const audio = await request.arrayBuffer();
  if (audio.byteLength < 4_000) {
    return Response.json({ error: "The recording was too short. Please speak your question and try again." }, { status: 400 });
  }
  if (audio.byteLength > maxAudioBytes) {
    return Response.json({ error: "Please keep voice questions under about a minute." }, { status: 413 });
  }

  try {
    const upstream = await fetch(`${backendUrl}/api/transcribe`, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-audio-language": language,
      },
      body: audio,
      cache: "no-store",
      signal: AbortSignal.timeout(70_000),
    });
    const result = await upstream.json();
    return Response.json(result, { status: upstream.status });
  } catch {
    return Response.json(
      { error: "AURA’s transcription service is unavailable. Check the AURA backend and try again." },
      { status: 503 },
    );
  }
}
