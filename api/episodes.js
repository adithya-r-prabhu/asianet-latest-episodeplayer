const { XMLParser } = require('fast-xml-parser');

const RSS_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCp_r6Z-Oh0YTf-ym71z5Nqg';
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

let cachedEpisodes = [];
let lastFetchTime = 0;

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
});

module.exports = async function handler(req, res) {
    // Return cached data if valid
    if (Date.now() - lastFetchTime < CACHE_DURATION && cachedEpisodes.length > 0) {
        return res.status(200).json(cachedEpisodes);
    }

    try {
        const response = await fetch(RSS_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const xmlData = await response.text();
        const result = parser.parse(xmlData);

        if (!result.feed || !result.feed.entry) {
            return res.status(200).json([]);
        }

        let entries = result.feed.entry;
        if (!Array.isArray(entries)) {
            entries = [entries];
        }

        const episodes = entries
            .filter(entry => entry.title && entry.title.toLowerCase().includes('episode') && !entry.title.toLowerCase().includes('promo'))
            .map(entry => {
                let thumbnail = '';
                if (entry['media:group'] && entry['media:group']['media:thumbnail']) {
                    thumbnail = entry['media:group']['media:thumbnail']['@_url'];
                }
                return {
                    id: entry['yt:videoId'],
                    title: entry.title,
                    published: entry.published,
                    thumbnail: thumbnail
                };
            })
            // Default sort: newest first (descending)
            .sort((a, b) => new Date(b.published) - new Date(a.published));

        cachedEpisodes = episodes;
        lastFetchTime = Date.now();

        res.status(200).json(cachedEpisodes);
    } catch (error) {
        console.error('Error fetching RSS feed:', error.message);
        res.status(500).json({ error: 'Failed to parse RSS' });
    }
}
