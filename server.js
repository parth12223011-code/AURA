
const express = require("express");
const path = require("path");
const Groq = require("groq-sdk");

const app = express();
const PORT = process.env.PORT || 10000;

if (!process.env.GROQ_API_KEY) {
  console.error("GROQ_API_KEY is missing.");
  process.exit(1);
}

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

app.use(express.json());

// Show the email/login page first
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "auth.html"));
});

// Serve CSS, JavaScript, images, auth.html, etc.
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({
    status: "AURA AI backend is online!",
  });
});

app.get("/api/models", async (req, res) => {
  try {
    const models = await groq.models.list();

    res.json({
      models: models.data
        .filter((model) => model.active !== false)
        .map((model) => model.id),
    });
  } catch (error) {
    console.error("MODEL ERROR:", error);

    res.status(500).json({
      error: error.message,
    });
  }
});

app.post("/api/ask", async (req, res) => {
  try {
    const question = req.body.question;

    if (!question || !question.trim()) {
      return res.status(400).json({
        error: "Please enter a question.",
      });
    }

    const models = await groq.models.list();

    const available = models.data
      .filter((model) => model.active !== false)
      .map((model) => model.id);

    const preferred = [
      "openai/gpt-oss-20b",
    ];

    const model =
      preferred.find((name) => available.includes(name)) ||
      available.find((name) => !name.includes("whisper"));

    if (!model) {
      return res.status(500).json({
        error: "No suitable Groq chat model is available.",
      });
    }

    console.log("AURA using model:", model);

    const completion = await groq.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are AURA, an AI-powered Unified Revision Assistant. Help students understand school subjects clearly and simply. Give accurate, concise, student-friendly explanations.",
        },
        {
          role: "user",
          content: question.trim(),
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const answer = completion.choices?.[0]?.message?.content;

    res.json({
      answer: answer || "AURA could not generate an answer.",
      model,
    });
  } catch (error) {
    console.error("AURA AI error:", error);

    res.status(500).json({
      error: error.message || "AURA could not get a response.",
    });
  }
});

// Other pages fall back to the main AURA page
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`AURA AI is running on port ${PORT}`);
});