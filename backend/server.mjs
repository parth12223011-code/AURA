import { createServer } from "node:http";
import { connect as connectHttp2 } from "node:http2";

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "0.0.0.0";
const maxBodyBytes = 16_000;
const allowedClasses = new Set(["Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12"]);
const allowedLevels = new Set(["Build my basics", "Help me improve", "Challenge me"]);
const allowedLanguages = new Set(["English", "Hindi", "Hinglish"]);
const allowedGeminiTtsVoices = new Set(["Achird", "Aoede", "Kore", "Puck", "Zephyr"]);
const allowedLearningStyles = new Set(["Read", "Diagrams", "Watch", "Explore", "Listen", "Practice"]);
const learningStyleInstructions = {
  Read: "[READ] Answer the student's exact question directly. Explain the key idea or reasoning, include one simple example, and end with the takeaway. Be complete but concise (up to 120 words).",
  Diagrams: "[DIAGRAMS] Create a visual mind map. First line exactly CENTER: <main topic or direct answer>. Then exactly four separate lines formatted BRANCH: <subtopic> | <short explanation>. If the input is a question, put its concise direct answer in CENTER and use the four branches to explain it. Do not add prose, bullets, or markdown.",
  Watch: "[WATCH] Make a tiny 3-frame animation storyboard. Put each short visual scene on its own line, labeled exactly Frame 1:, Frame 2:, and Frame 3:.",
  Explore: "[EXPLORE] Give one safe, simple real-world observation or activity the student can do in about 30 seconds.",
  Listen: "[LISTEN] Give a natural 2–3 sentence spoken summary that sounds like a friendly Indian tutor talking to a student, not reading a textbook. Use simple everyday Hindi and short sentences. Add commas where a speaker should take a small pause, and full stops for clear pauses. For Hindi, use Devanagari. For Hinglish, write Hindi words in Devanagari and keep only familiar English terms in Latin letters; never write Hindi phonetically in Roman script. Avoid headings, markdown, symbols, and long Sanskritized constructions. Make the wording easy to pronounce aloud.",
  Practice: "[PRACTICE] Ask exactly two short multiple-choice questions with options A), B), and C). End this section with ANSWER KEY: and the correct choices plus a brief reason.",
};

const nvidiaHindiAsrFunction = "71203149-d3b7-4460-8231-1be2543a1fca";

function encodeVarint(value) {
  let remaining = BigInt(value);
  const bytes = [];
  while (remaining > 0x7fn) {
    bytes.push(Number((remaining & 0x7fn) | 0x80n));
    remaining >>= 7n;
  }
  bytes.push(Number(remaining));
  return Buffer.from(bytes);
}

function encodeProtoInt(field, value) {
  return Buffer.concat([encodeVarint((field << 3) | 0), encodeVarint(value)]);
}

function encodeProtoBytes(field, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  return Buffer.concat([
    encodeVarint((field << 3) | 2),
    encodeVarint(bytes.length),
    bytes,
  ]);
}

function readVarint(buffer, state) {
  let value = 0n;
  let shift = 0n;
  while (state.offset < buffer.length && shift < 70n) {
    const byte = buffer[state.offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return value;
    shift += 7n;
  }
  throw new Error("The speech service returned an invalid response.");
}

function parseProto(buffer) {
  const fields = [];
  const state = { offset: 0 };
  while (state.offset < buffer.length) {
    const tag = Number(readVarint(buffer, state));
    const field = tag >>> 3;
    const wire = tag & 7;
    if (wire === 0) {
      fields.push({ field, wire, value: readVarint(buffer, state) });
    } else if (wire === 2) {
      const length = Number(readVarint(buffer, state));
      const end = state.offset + length;
      if (end > buffer.length) throw new Error("The speech service returned an incomplete response.");
      fields.push({ field, wire, value: buffer.subarray(state.offset, end) });
      state.offset = end;
    } else if (wire === 1 || wire === 5) {
      state.offset += wire === 1 ? 8 : 4;
      if (state.offset > buffer.length) throw new Error("The speech service returned an incomplete response.");
    } else {
      throw new Error("The speech service returned an unsupported response.");
    }
  }
  return fields;
}

function extractGrpcMessages(buffer) {
  const messages = [];
  let offset = 0;
  while (offset + 5 <= buffer.length) {
    const compressed = buffer[offset];
    const length = buffer.readUInt32BE(offset + 1);
    if (offset + 5 + length > buffer.length) break;
    if (compressed !== 0) throw new Error("The speech service compressed its response unexpectedly.");
    messages.push(buffer.subarray(offset + 5, offset + 5 + length));
    offset += 5 + length;
  }
  return messages;
}

function transcribeWithNvidia(audio, language) {
  const config = Buffer.concat([
    encodeProtoInt(1, 1),
    encodeProtoInt(2, 16_000),
    encodeProtoBytes(3, language),
    encodeProtoInt(4, 1),
    encodeProtoInt(7, 1),
    encodeProtoInt(11, 1),
  ]);
  const rpcMessage = Buffer.concat([
    encodeProtoBytes(1, config),
    encodeProtoBytes(2, audio),
  ]);
  const grpcFrame = Buffer.allocUnsafe(rpcMessage.length + 5);
  grpcFrame[0] = 0;
  grpcFrame.writeUInt32BE(rpcMessage.length, 1);
  rpcMessage.copy(grpcFrame, 5);

  return new Promise((resolve, reject) => {
    const client = connectHttp2("https://grpc.nvcf.nvidia.com");
    let call;
    let httpStatus = 0;
    let grpcStatus = "";
    let grpcMessage = "";
    let responseBody = Buffer.alloc(0);
    let settled = false;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) {
        call?.close();
        client.destroy();
        reject(error);
      } else {
        client.close();
        resolve(result);
      }
    };
    const timeout = setTimeout(() => finish(new Error("Speech transcription timed out.")), 60_000);

    client.on("error", (error) => finish(error));
    call = client.request({
      ":method": "POST",
      ":path": "/nvidia.riva.asr.RivaSpeechRecognition/Recognize",
      "content-type": "application/grpc",
      te: "trailers",
      "grpc-accept-encoding": "identity",
      "grpc-timeout": "60S",
      "function-id": nvidiaHindiAsrFunction,
      authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
    });
    call.on("response", (headers) => { httpStatus = Number(headers[":status"] || 0); });
    call.on("trailers", (headers) => {
      grpcStatus = String(headers["grpc-status"] || "");
      grpcMessage = String(headers["grpc-message"] || "");
    });
    call.on("data", (chunk) => { responseBody = Buffer.concat([responseBody, chunk]); });
    call.on("error", (error) => finish(error));
    call.on("end", () => {
      try {
        if (httpStatus !== 200) throw new Error(`Speech service returned HTTP ${httpStatus || "an error"}.`);
        if (grpcStatus && grpcStatus !== "0") {
          throw new Error(grpcMessage ? decodeURIComponent(grpcMessage) : `Speech service returned gRPC status ${grpcStatus}.`);
        }
        const transcripts = extractGrpcMessages(responseBody).flatMap((message) =>
          parseProto(message)
            .filter((field) => field.field === 1 && field.wire === 2)
            .flatMap((result) => parseProto(result.value)
              .filter((field) => field.field === 1 && field.wire === 2)
              .map((alternative) => parseProto(alternative.value)
                .find((field) => field.field === 1 && field.wire === 2)?.value.toString("utf8") || "")),
        ).filter(Boolean);
        const transcript = transcripts.join(" ").trim();
        if (!transcript) throw new Error("No speech was recognized. Try speaking a little closer to the microphone.");
        finish(null, transcript);
      } catch (error) {
        finish(error instanceof Error ? error : new Error("Speech transcription failed."));
      }
    });
    call.end(grpcFrame);
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > maxBodyBytes) {
      throw Object.assign(new Error("Request is too large."), { status: 413 });
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    throw Object.assign(new Error("Send a valid JSON request."), { status: 400 });
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/health") {
    return sendJson(response, 200, {
      status: "ok",
      service: "aura-2-backend",
      aiConfigured: Boolean(process.env.NVIDIA_API_KEY),
    });
  }

  if (request.method === "POST" && url.pathname === "/api/transcribe") {
    const language = request.headers["x-audio-language"];
    const contentType = request.headers["content-type"];
    if (contentType !== "application/octet-stream") {
      return sendJson(response, 415, { error: "AURA received an unsupported microphone recording." });
    }
    if (language !== "en-US" && language !== "hi-IN") {
      return sendJson(response, 400, { error: "Choose English or Hindi for voice input." });
    }
    if (!process.env.NVIDIA_API_KEY) {
      return sendJson(response, 503, { error: "AI speech recognition is not configured. Add NVIDIA_API_KEY to backend/.env." });
    }

    const audioChunks = [];
    let audioLength = 0;
    try {
      for await (const chunk of request) {
        audioLength += chunk.length;
        if (audioLength > 2 * 1024 * 1024) {
          return sendJson(response, 413, { error: "Please keep voice questions under about a minute." });
        }
        audioChunks.push(chunk);
      }
      const audio = Buffer.concat(audioChunks, audioLength);
      if (audio.length < 4_000 || audio.length % 2 !== 0) {
        return sendJson(response, 400, { error: "The microphone recording was too short or incomplete. Please try again." });
      }
      const text = await transcribeWithNvidia(audio, language);
      return sendJson(response, 200, { text });
    } catch (error) {
      console.error("NVIDIA transcription request failed:", error.name || "Error", error.message || "No error message");
      const timedOut = error.message?.includes("timed out");
      return sendJson(response, timedOut ? 504 : 502, {
        error: timedOut
          ? "Voice transcription took too long. Please try a shorter question."
          : "AURA could not transcribe the recording. Check the NVIDIA connection and try again.",
      });
    }
  }

  if (request.method === "POST" && url.pathname === "/api/speech") {
    let payload;
    try {
      payload = await readJson(request);
    } catch (error) {
      return sendJson(response, error.status || 400, { error: error.message });
    }

    const { text, language, voice } = payload || {};
    if (typeof text !== "string" || !text.trim() || text.length > 4_000) {
      return sendJson(response, 400, { error: "Send lesson text between 1 and 4,000 characters." });
    }
    if (!["English", "Hindi", "Hinglish"].includes(language)) {
      return sendJson(response, 400, { error: "Choose English, Hindi, or Hinglish for audio." });
    }
    const hindiVoice = language !== "English";
    if (hindiVoice) {
      if (!process.env.GEMINI_API_KEY) {
        return sendJson(response, 503, {
          error: "Hindi audio needs a Gemini key. Add GEMINI_API_KEY to backend/.env, then restart AURA’s backend.",
        });
      }

      const selectedVoice = allowedGeminiTtsVoices.has(voice) ? voice : "Achird";
      try {
        const audioResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": process.env.GEMINI_API_KEY,
          },
          body: JSON.stringify({
            model: "gemini-3.8-flash-tts",
            input: [{
              type: "user_input",
              content: [{
                type: "text",
                text: text.trim(),
                annotations: [{
                  type: "speech_metadata",
                  style: "Warm, clear, natural-paced teaching. Pronounce words distinctly and pause briefly between sentences.",
                }],
              }],
            }],
            response_format: { type: "audio" },
            generation_config: {
              speech_config: [{ voice: selectedVoice }],
            },
          }),
          signal: AbortSignal.timeout(60_000),
        });

        if (!audioResponse.ok) {
          console.error("Gemini speech request failed:", audioResponse.status);
          if (audioResponse.status === 401 || audioResponse.status === 403) {
            return sendJson(response, 502, { error: "Gemini rejected its API key. Check GEMINI_API_KEY in backend/.env." });
          }
          if (audioResponse.status === 429) {
            return sendJson(response, 429, { error: "Gemini’s free voice limit is reached for now. Wait a little, then try again." });
          }
          return sendJson(response, 502, { error: "Gemini could not create the Hindi audio. Please try again." });
        }

        const result = await audioResponse.json();
        const audioPart = (result.steps || [])
          .filter((step) => step.type === "model_output")
          .flatMap((step) => step.content || [])
          .reverse()
          .find((part) => part.type === "audio" && typeof part.data === "string");
        if (!audioPart) {
          console.error("Gemini speech response did not contain audio.");
          return sendJson(response, 502, { error: "Gemini returned no audio. Please try again." });
        }

        const audio = Buffer.from(audioPart.data, "base64");
        response.writeHead(200, {
          "content-type": "audio/wav",
          "content-length": audio.length,
          "cache-control": "no-store",
        });
        response.end(audio);
      } catch (error) {
        console.error("Gemini speech request failed:", error.name || "Error", error.cause?.code || "");
        const timedOut = error.name === "TimeoutError";
        return sendJson(response, timedOut ? 504 : 502, {
          error: timedOut ? "Gemini audio took too long. Please try again." : "AURA could not reach Gemini. Check the server connection and try again.",
        });
      }
      return;
    }

    if (!process.env.NVIDIA_API_KEY) {
      return sendJson(response, 503, { error: "English audio is not configured. Add NVIDIA_API_KEY to backend/.env." });
    }

    const form = new FormData();
    form.set("text", text.trim());
    form.set("language", "en-US");
    form.set("voice", "Magpie-Multilingual.EN-US.Aria");
    form.set("encoding", "LINEAR_PCM");
    form.set("sample_rate_hz", "44100");

    try {
      const audioResponse = await fetch("https://877104f7-e885-42b9-8de8-f6e4c6303969.invocation.api.nvcf.nvidia.com/v1/audio/synthesize", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.NVIDIA_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
      if (!audioResponse.ok) {
        const providerError = (await audioResponse.text()).slice(0, 1_000);
        console.error("NVIDIA speech request failed:", audioResponse.status, providerError);
        return sendJson(response, 502, { error: "AURA could not create the audio. Please try again." });
      }
      const audio = Buffer.from(await audioResponse.arrayBuffer());
      response.writeHead(200, {
        "content-type": "audio/wav",
        "content-length": audio.length,
        "cache-control": "no-store",
      });
      response.end(audio);
    } catch (error) {
      console.error("NVIDIA speech request failed:", error.name || "Error", error.cause?.code || error.message);
      const timedOut = error.name === "TimeoutError";
      return sendJson(response, timedOut ? 504 : 502, {
        error: timedOut ? "Audio generation took too long. Please try again." : "AURA could not reach the speech service.",
      });
    }
    return;
  }

  if (request.method !== "POST" || url.pathname !== "/api/explain") {
    return sendJson(response, 404, { error: "Route not found." });
  }

  let payload;
  try {
    payload = await readJson(request);
  } catch (error) {
    return sendJson(response, error.status || 400, { error: error.message });
  }

  const {
    subject,
    chapter,
    difficulty,
    studentClass = "Class 8",
    learningLevel = "Build my basics",
    language = "English",
    learningStyles = ["Read"],
  } = payload || {};
  if (![subject, chapter, difficulty, studentClass, learningLevel, language].every((value) => typeof value === "string" && value.trim())) {
    return sendJson(response, 400, { error: "Subject, chapter, class, learning level, language, and difficulty are required." });
  }
  if (subject.length > 200 || chapter.length > 1_000) {
    return sendJson(response, 400, { error: "Subject must be 200 characters or fewer, and a topic or question must be 1,000 characters or fewer." });
  }
  if (!allowedClasses.has(studentClass) || !allowedLevels.has(learningLevel) || !allowedLanguages.has(language)) {
    return sendJson(response, 400, { error: "Choose a supported class, learning level, and language." });
  }
  if (!Array.isArray(learningStyles) || learningStyles.length > allowedLearningStyles.size || learningStyles.some((style) => !allowedLearningStyles.has(style))) {
    return sendJson(response, 400, { error: "Choose valid learning styles." });
  }
  const requestedStyles = [...new Set(learningStyles)];
  if (requestedStyles.length === 0) {
    return sendJson(response, 400, { error: "Choose at least one way you like to learn." });
  }
  if (!process.env.NVIDIA_API_KEY) {
    return sendJson(response, 503, { error: "AI is not configured. Add NVIDIA_API_KEY to backend/.env and restart the backend." });
  }

  const controller = new AbortController();
  const abortIfClientLeft = () => {
    if (!response.writableEnded) controller.abort();
  };
  response.on("close", abortIfClientLeft);

  try {
    const aiResponse = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.NVIDIA_MODEL || "meta/muse-glimmer-30b",
        messages: [
          {
            role: "system",
            content: "You are AURA, a warm and clear school tutor. Follow the learner's requested language, class, level, and learning styles. Answer exact questions directly and fully. Use only the requested section markers, each on its own line, in the order given. Keep a single-style response under 180 words and a multi-style response under 380 words. Finish every requested section: all four mind-map branches, all three storyboard frames, and both quiz questions plus their answer key. Never stop mid-sentence. Keep the response accurate, age-appropriate, and useful. Do not add an introduction or claim an image, video, or audio file was created. Section markers must remain exactly as written even when the lesson language is Hindi or Hinglish.",
          },
          {
            role: "user",
            content: [
              `Subject: ${subject.trim()}`,
              `Topic or exact question: ${chapter.trim()}`,
              `Student class: ${studentClass}`,
              `Learning level: ${learningLevel}`,
              `Explanation difficulty: ${difficulty.trim()}`,
              `Answer language: ${language}. For Hindi, use natural Hindi in Devanagari. For Hinglish, use Hindi words in Devanagari and familiar English terms in Latin script. Never write Hindi words phonetically in Roman script, especially in the spoken Listen section.`,
              "",
              "Create these sections only:",
              ...requestedStyles.map((style) => learningStyleInstructions[style]),
            ].join("\n"),
          },
        ],
        temperature: 0.55,
        top_p: 1,
        reasoning_effort: "low",
        max_tokens: Math.min(1_700, 600 + requestedStyles.length * 180),
        stream: true,
      }),
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]),
    });
    if (!aiResponse.ok) {
      const result = await aiResponse.json();
      const providerError = result?.error?.message || result?.detail || result?.error?.type || "unknown_error";
      console.error("NVIDIA API request failed:", aiResponse.status, providerError);
      return sendJson(response, 502, { error: "AURA could not get an explanation right now. Check the AI provider settings and try again." });
    }

    if (!aiResponse.body) {
      return sendJson(response, 502, { error: "The AI provider could not start a response. Please try again." });
    }

    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    });

    for await (const chunk of aiResponse.body) {
      if (!response.write(chunk)) {
        await new Promise((resolve) => response.once("drain", resolve));
      }
    }
    response.end();
  } catch (error) {
    console.error("NVIDIA API request failed:", {
      name: error.name || "Error",
      message: error.message || "No error message",
      cause: error.cause?.code || error.cause?.message,
    });
    const timedOut = error.name === "TimeoutError";
    if (response.headersSent) {
      if (!response.destroyed) {
        response.write(`data: ${JSON.stringify({ error: { message: timedOut ? "The explanation took too long. Please try again." : "AURA lost its connection to the AI provider." } })}\n\n`);
        response.write("data: [DONE]\n\n");
        response.end();
      }
      return;
    }
    return sendJson(response, timedOut ? 504 : 502, {
      error: timedOut ? "The explanation took too long. Please try again." : "AURA could not reach NVIDIA. Check the server connection and try again.",
    });
  } finally {
    response.removeListener("close", abortIfClientLeft);
  }
});

server.listen(port, host, () => {
  console.log(`AURA 2.0 backend listening at http://${host}:${port}`);
  console.log(`NVIDIA API key: ${process.env.NVIDIA_API_KEY ? "configured" : "not configured (add NVIDIA_API_KEY to backend/.env)"}`);
  console.log(`Gemini API key: ${process.env.GEMINI_API_KEY ? "configured" : "not configured (add GEMINI_API_KEY to backend/.env)"}`);
});
