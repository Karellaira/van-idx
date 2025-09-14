// server.js
import dotenv from "dotenv";
import express from "express";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// --- Health Check ---
app.get("/health", (req, res) => {
  res.status(200).json({ ok: true, message: "Server is healthy" });
});

// --- Featured Listings Test Route ---
app.get("/api/har/featured", async (req, res) => {
  try {
    // For now just return sample data
    res.json({
      ok: true,
      listings: [
        {
          price: "$599,000",
          address: "12811 Harry Douglass Way, St. Albans",
          beds: 2,
          baths: 2,
          link: "https://www.har.com/",
          photo: "https://via.placeholder.com/300x200?text=Listing+Photo",
        },
        {
          price: "$2,200,000",
          address: "250 E 40th St, Unit 47C, Murray Hill",
          beds: 2,
          baths: 3,
          link: "https://www.har.com/",
          photo: "https://via.placeholder.com/300x200?text=Listing+Photo",
        },
      ],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Failed to fetch listings" });
  }
});

// --- Default Route ---
app.get("/", (req, res) => {
  res.send("Backend is running. Use /api/har/featured or /health");
});

// --- Start Server ---
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});
