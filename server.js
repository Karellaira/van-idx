import express from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const app = express();
const PORT = process.env.PORT || 3000;

// Health check
app.get("/health", (req, res) => {
  res.json({ ok: true, message: "Server is healthy" });
});

// HAR Featured Listings
app.get("/api/har/featured", async (req, res) => {
  try {
    const agentNumber = req.query.agent_number;
    const cid = req.query.cid;

    if (!agentNumber && !cid) {
      return res.json({ ok: false, error: "Missing agent_number or cid" });
    }

    let url;
    if (agentNumber) {
      url = `https://web.har.com/aws/dispFeaturedIDX.cfm?agent_number=${agentNumber}`;
    } else if (cid) {
      url = `https://web.har.com/aws/dispFeaturedIDX.cfm?cid=${cid}`;
    }

    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    const listings = [];

    $(".awsdisplayListing").each((i, el) => {
      const price = $(el).find(".awsdisplayPrice").text().trim();
      const address = $(el).find(".awsdisplayAddress").text().trim();
      const beds = $(el).find(".awsdisplayBed").text().trim();
      const baths = $(el).find(".awsdisplayBath").text().trim();
      const link = $(el).find("a").attr("href");
      const photo = $(el).find("img").attr("src");

      listings.push({
        price,
        address,
        beds,
        baths,
        link: link ? `https://www.har.com${link}` : "",
        photo: photo || "https://via.placeholder.com/300x200?text=Listing+Photo",
      });
    });

    res.json({ ok: true, listings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Failed to fetch listings" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
