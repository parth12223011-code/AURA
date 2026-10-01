const http = require("http");
const fs = require("fs");
const path = require("path");

const frontendPath = path.join(
  "C:",
  "Users",
  "parth",
  "OneDrive",
  "Desktop",
  "AURA",
  "frontend"
);

const server = http.createServer((req, res) => {
  let filePath;

  if (req.url === "/" || req.url === "/index.html") {
    filePath = path.join(frontendPath, "index.html");
  } else if (req.url === "/style.css") {
    filePath = path.join(frontendPath, "style.css");
  } else if (req.url === "/script.js") {
    filePath = path.join(frontendPath, "script.js");
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("AURA: File not found");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("AURA: Server error");
      return;
    }

    const ext = path.extname(filePath);

    const contentTypes = {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "text/javascript"
    };

    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "text/plain"
    });

    res.end(data);
  });
});

server.listen(3000, () => {
  console.log("AURA SERVER ONLINE");
  console.log("Open http://localhost:3000");
});