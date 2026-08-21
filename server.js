const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/ask", async (req, res) => {
  try {
    const question = req.body.question?.trim();

    if (!question) {
      return res.status(400).json({ error: "Please provide a question." });
    }

    const ollamaResponse = await fetch(
      "http://127.0.0.1:11434/api/generate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3.2:1b",
          prompt: question,
          stream: false,
        }),
      }
    );

    if (!ollamaResponse.ok) {
      throw new Error(`Ollama returned ${ollamaResponse.status}`);
    }

    const data = await ollamaResponse.json();
    res.json({ answer: data.response });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "AURA could not get a response from the local AI.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`AURA AI is running at http://localhost:${PORT}`);
});