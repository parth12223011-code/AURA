const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({
    status: "AURA AI backend is online!"
  });
});

app.post("/api/ask", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({
        error: "Please enter a question."
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured."
      });
    }

    const { GoogleGenAI } = await import("@google/genai");

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    });

    const interaction = await ai.interactions.create({
      model: "gemini-3.7-flash",
      input: question
    });

    res.json({
      answer: interaction.output_text
    });

  } catch (error) {
    console.error("AURA AI error:", error);

    res.status(500).json({
      error: "AURA could not get a response from Gemini."
    });
  }
});

app.listen(PORT, () => {
  console.log(`AURA AI is running on port ${PORT}`);
});