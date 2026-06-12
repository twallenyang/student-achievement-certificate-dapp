const express = require("express");
const path = require("path");

const app = express();
const port = process.env.FRONTEND_PORT || 5173;
const frontendDir = path.join(__dirname, "..", "frontend");

app.use(express.static(frontendDir));

app.listen(port, () => {
  console.log(`Frontend running at http://localhost:${port}`);
});
