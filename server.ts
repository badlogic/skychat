import compression from "compression";
import express from "express";
import * as http from "http";
import cors from "cors";

const port = process.env.PORT ?? 3333;

(async () => {
  const app = express();
  app.use(cors());
  app.use(compression());
  app.use(express.static("./"));

  app.get("/api/fetch", async (req, res) => {
    res.json({ hi: "test" });
  });

  http.createServer(app).listen(port, () => {
    console.log(`App listening on port ${port}`);
  });
})();
