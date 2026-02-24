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

        let episodes = entries
            .filter(entry => entry.title && entry.title.toLowerCase().includes('episode') && !entry.title.toLowerCase().includes('promo'))
            .map(entry => {
                let thumbnail = '';
                if (entry['media:group'] && entry['media:group']['media:thumbnail']) {
                    thumbnail = entry['media:group']['media:thumbnail']['@_url'];
                }

                // Clean title by removing trailing dates (e.g. ` || 23-02-26` or date variants)
                let cleanTitle = entry.title.replace(/\s*\|\|?\s*\d{2}[-/]\d{2}[-/]\d{2,4}.*$/, '');
                cleanTitle = cleanTitle.replace(/\s*\|\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}.*$/, '');

                return {
                    id: entry['yt:videoId'],
                    title: cleanTitle,
                    published: entry.published,
                    thumbnail: thumbnail
                };
            });

        // Merge with previously cached episodes to keep episodes that fell off the RSS feed limit
        const allEpisodes = [...cachedEpisodes, ...episodes];
        const uniqueEpisodesMap = new Map();
        allEpisodes.forEach(ep => uniqueEpisodesMap.set(ep.id, ep));
        let mergedEpisodes = Array.from(uniqueEpisodesMap.values());

        // Default sort: newest first (descending)
        mergedEpisodes.sort((a, b) => new Date(b.published) - new Date(a.published));

        // Filter to keep only the latest 2 distinct upload dates (adjusted to IST timezone approximately)
        const uniqueDates = [...new Set(mergedEpisodes.map(ep => {
            const date = new Date(ep.published);
            date.setUTCHours(date.getUTCHours() + 5, date.getUTCMinutes() + 30);
            return date.toISOString().split('T')[0];
        }))];

        const allowedDates = uniqueDates.slice(0, 2);

        mergedEpisodes = mergedEpisodes.filter(ep => {
            const date = new Date(ep.published);
            date.setUTCHours(date.getUTCHours() + 5, date.getUTCMinutes() + 30);
            return allowedDates.includes(date.toISOString().split('T')[0]);
        });

        cachedEpisodes = mergedEpisodes;
        lastFetchTime = Date.now();

        res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
        res.status(200).json(cachedEpisodes);
    } catch (error) {
        console.error('Error fetching RSS feed:', error.message);
        res.status(500).json({ error: 'Failed to parse RSS' });
    }
}
