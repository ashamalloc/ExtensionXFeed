const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post('/fetch-feed', async (req, res) => {
  try {
    const response = await axios.post(
      'https://x.com/i/api/graphql/5Sf4kVgNwfYTvqEnQ6Zr3g/HomeTimeline',
      {
        variables: {
          count: 40,
          cursor: "DAABCgABGtf2H3nAJxEKAAIa146kTNqxMQgAAwAAAAEAAA",
          includePromotedContent: true,
          latestControlAvailable: true,
          seenTweetIds: ["1934179408585371795", "1934171401294098737"],
          withCommunity: true
        },
        features: {
          articles_preview_enabled: true,
          c9s_tweet_anatomy_moderator_badge_enabled: true,
          communities_web_enable_tweet_community_results_fetch: true,
          creator_subscriptions_quote_tweet_preview_enabled: false,
          creator_subscriptions_tweet_preview_api_enabled: true,
          freedom_of_speech_not_reach_fetch_enabled: true,
          graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
          longform_notetweets_consumption_enabled: true,
          longform_notetweets_inline_media_enabled: true,
          longform_notetweets_rich_text_read_enabled: true,
          payments_enabled: false,
          premium_content_api_read_enabled: false,
          profile_label_improvements_pcf_label_in_post_enabled: true,
          responsive_web_edit_tweet_api_enabled: true,
          responsive_web_enhance_cards_enabled: false,
          responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
          responsive_web_graphql_timeline_navigation_enabled: true,
          responsive_web_grok_analysis_button_from_backend: true,
          responsive_web_grok_analyze_button_fetch_trends_enabled: false,
          responsive_web_grok_analyze_post_followups_enabled: true,
          responsive_web_grok_image_annotation_enabled: true,
          responsive_web_grok_share_attachment_enabled: true,
          responsive_web_grok_show_grok_translated_post: false,
          responsive_web_jetfuel_frame: false,
          responsive_web_twitter_article_tweet_consumption_enabled: true,
          rweb_tipjar_consumption_enabled: true,
          rweb_video_screen_enabled: false,
          standardized_nudges_misinfo: true,
          tweet_awards_web_tipping_enabled: false,
          tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
          verified_phone_label_enabled: true,
          view_counts_everywhere_api_enabled: true
        }
      },
      {
        headers: {
          'Authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
          'x-csrf-token': '8ee20f8abf72bbadfc8fe8bc9542631db673ff28b87b966d0f06180c54902e0098459b81816654ebec4c5b82b9b1d86bc0092aecfde2292fccc97cdcdf786d09b5b536df4ef2111fbee84f90c50a0d46',
          'cookie': `guest_id_marketing=v1%3A175000255006280533; guest_id_ads=v1%3A175000255006280533; guest_id=v1%3A175000255006280533; personalization_id="v1_kif0+W2pKpd9l3bmKf+fVw=="; gt=1934277006306533753; external_referer=padhuUp37zh6Cref6jvj%2BPtO9lYzutOI|0|8e8t2xd8A2w%3D; att=1-CH7uIlZDSeHOrPkFWRBQpAik8lLwBVH246wfEtFN; g_state={"i_l":0}; kdt=veYGQfwxCbmhvcKftHLF4NivUPsYc5GEhSQOexIZ; auth_token=2f61833e561dea376ae3331d6017e83b0ca81b9b; ct0=8ee20f8abf72bbadfc8fe8bc9542631db673ff28b87b966d0f06180c54902e0098459b81816654ebec4c5b82b9b1d86bc0092aecfde2292fccc97cdcdf786d09b5b536df4ef2111fbee84f90c50a0d46; lang=en; twid=u%3D1934277098736369665; __cf_bm=WkQK6UylmVuzZe1FMeG0A0.ZUs8sR32Ttin0qSXstfc-1750004367-1.0.1.1-KpudX7_eUY8QajSyCK0TmKk7GKIQoPdT_9WbmSR0eVfK9ofcdE4znScPgTH5e8g5WSQ1fiweVIL2lWRh6bmBn.lgkwSYCAbBmhSDDEPtjfM`,
          'x-twitter-active-user': 'yes',
          'x-twitter-auth-type': 'OAuth2Session',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.3',
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

app.listen(PORT, () => {
  console.log(`FeedMirror backend running on http://localhost:${PORT}`);
});

