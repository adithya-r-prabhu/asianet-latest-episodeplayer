const http = require('http');
const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const PORT = process.env.PORT || 3000;
const RSS_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCp_r6Z-Oh0YTf-ym71z5Nqg';
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

let cachedEpisodes = [];
let lastFetchTime = 0;

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
});

async function fetchEpisodes() {
    try {
        const response = await fetch(RSS_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const xmlData = await response.text();
        const result = parser.parse(xmlData);

        // Safety check if entry exists
        if (!result.feed || !result.feed.entry) {
            console.log('No entries found in feed.');
            return;
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
        console.log(`[${new Date().toISOString()}] Fetched and cached ${cachedEpisodes.length} episodes.`);
    } catch (error) {
        console.error('Error fetching RSS feed:', error.message);
    }
}

// Initial fetch
fetchEpisodes();

// Periodic fetch
setInterval(fetchEpisodes, CACHE_DURATION);

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
    // Basic CORS & static routing
    if (req.url === '/api/episodes' && req.method === 'GET') {
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 's-maxage=600, stale-while-revalidate'
        });
        res.end(JSON.stringify(cachedEpisodes));
        return;
    }

    // Serve static files from 'public' directory
    let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                console.error(`404: ${filePath}`);
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                console.error(`500: ${error.code}`);
                res.writeHead(500);
                res.end(`Server Error: ${error.code}\n`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
