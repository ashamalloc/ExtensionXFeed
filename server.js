/*app.post('/fetch-feed', async (req, res) => {
  const { authToken, csrfToken, cookie } = req.body;

  if (!authToken || !csrfToken || !cookie) {
    return res.status(400).json({ error: 'Missing required tokens' });
  }

  try {
    const response = await axios.post(
      'https://x.com/i/api/graphql/5Sf4kVgNwfYTvqEnQ6Zr3g/HomeTimeline',
      {
        variables: {
          count: 40,
          cursor: null,
          includePromotedContent: true,
          latestControlAvailable: true,
          seenTweetIds: [],
          withCommunity: true
        },
        features: { /* all your earlier feature flags here */ }
     /* },
      {
      /*  headers: {
          'Authorization': `Bearer ${authToken}`,
          'x-csrf-token': csrfToken,
          'cookie': cookie,
          'x-twitter-active-user': 'yes',
          'x-twitter-auth-type': 'OAuth2Session',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
          'Content-Type': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching feed:', error?.response?.status, error?.message);
    res.status(error?.response?.status || 500).json({
      error: 'Failed to fetch timeline',
      message: error?.response?.data || error.message,
    });
  }
});

