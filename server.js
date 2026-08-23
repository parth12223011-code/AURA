const express = require("express");
const path = require("path");
const Groq = require("groq-sdk");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "AURA AI backend is online!"
  });
});

// AI endpoint
app.post("/api/ask", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({
        error: "Please enter a question."
      });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({
        error: "GROQ_API_KEY is not configured."
      });
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "You are AURA, an AI-powered Unified Revision Assistant. " +
            "You are a helpful, friendly study assistant. " +
            "Explain concepts clearly and simply for school students. " +
            "Use examples when helpful and structure answers with headings or bullet points when appropriate."
        },
        {
          role: "user",
          content: question
        }
      ],
      temperature: 0.7,
      max_completion_tokens: 2048
    });

    const answer = completion.choices?.[0]?.message?.content;

    if (!answer) {
      return res.status(500).json({
        error: "Groq returned an empty response."
      });
    }

    res.json({
      answer: answer
    });

  } catch (error) {
    console.error("AURA AI error:", error);

    res.status(500).json({
      error: "AURA could not get a response from Groq."
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`AURA AI is running on port ${PORT}`);
});