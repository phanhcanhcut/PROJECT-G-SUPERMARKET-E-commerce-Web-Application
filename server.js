// src/server.js
const app = require("./app");
const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`API running at http://localhost:${port}`));