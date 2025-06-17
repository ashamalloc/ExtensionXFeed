// server.js
import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

const TWITTER_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

app.post("/twitter-feed", async (req, res) => {
  const { username } = req.body;
  const authToken = req.headers.authorization?.split(" ")[1];
  const ct0 = req.headers["x-csrf-token"];

  if (!authToken || !ct0) {
    return res.status(400).json({ success: false, error: "Missing tokens" });
  }

  try {
    // STEP 1: Get userId from username
    const userInfoUrl = `https://twitter.com/i/api/graphql/nK1dw4oV3k4V8Twf4xeCgA/UserByScreenName?variables=${encodeURIComponent(
      JSON.stringify({
        screen_name: username,
        withSafetyModeUserFields: true,
        withSuperFollowsUserFields: true,
      })
    )}`;

    const userInfoResponse = await fetch(userInfoUrl, {
      headers: {
        Authorization: `Bearer ${TWITTER_BEARER}`,
        "x-csrf-token": ct0,
        Cookie: `auth_token=${authToken}; ct0=${ct0};`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36",
      },
    });

    const userInfoData = await userInfoResponse.json();
    const userId = userInfoData?.data?.user?.result?.rest_id;
    console.log("UserInfo JSON:", JSON.stringify(userInfoData, null, 2));


    if (!userId) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // STEP 2: Fetch tweets using userId
    const tweetsQuery = {
      userId,
      count: 10,
      includePromotedContent: true,
      withQuickPromoteEligibilityTweetFields: true,
      withVoice: true,
      withV2Timeline: true,
    };

    const tweetsUrl = `https://twitter.com/i/api/graphql/VvDgkXwOKXeG0hg4A7xSww/UserTweets?variables=${encodeURIComponent(
      JSON.stringify(tweetsQuery)
    )}`;

    const tweetsResponse = await fetch(tweetsUrl, {
      headers: {
        Authorization: `Bearer ${TWITTER_BEARER}`,
        "x-csrf-token": ct0,
        Cookie: `auth_token=${authToken}; ct0=${ct0};`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36",
      },
    });

    if (!tweetsResponse.ok) {
      const errorText = await tweetsResponse.text();
      console.error("Twitter fetch error:", errorText);
      return res.status(tweetsResponse.status).json({
        success: false,
        error: `Twitter API error: ${tweetsResponse.status}`,
        body: errorText,
      });
    }

    const data = await tweetsResponse.json();

    const instructions =
      data?.data?.user?.result?.timeline_v2?.timeline?.instructions || [];

    let entries = [];
    for (const instruction of instructions) {
      if (instruction.type === "TimelineAddEntries" && instruction.entries) {
        entries = instruction.entries;
        break;
      }
    }

    const tweetTexts = entries
      .filter((entry) => entry.content?.itemContent?.tweet_results)
      .map((entry) => {
        const result =
          entry.content.itemContent.tweet_results.result.legacy || {};
        return {
          id: entry.entryId,
          full_text: result.full_text || result.text,
        };
      });

    if (!tweetTexts.length) {
      return res.json({
        success: false,
        error: "No tweets found. Check username or visibility.",
      });
    }

    res.json({ success: true, feed: tweetTexts });
  } catch (error) {
    console.error("Twitter fetch error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(5000, () =>
  console.log("Server running on http://localhost:5000")
);
