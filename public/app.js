document.addEventListener('DOMContentLoaded', () => {
    const episodesGrid = document.getElementById('episodes-grid');
    const statusMessage = document.getElementById('status-message');
    const btnLatest = document.getElementById('btn-latest');
    const btnSequence = document.getElementById('btn-sequence');

    let episodes = [];
    let currentMode = 'latest'; // 'latest' or 'sequence'

    // Fetch episodes from backend
    async function fetchEpisodes() {
        try {
            const response = await fetch('/api/episodes');
            if (!response.ok) {
                throw new Error('Failed to fetch episodes');
            }
            episodes = await response.json();

            if (episodes.length === 0) {
                statusMessage.textContent = 'No episodes found at the moment.';
            } else {
                statusMessage.style.display = 'none';
                renderEpisodes();
            }
        } catch (error) {
            console.error('Error:', error);
            statusMessage.textContent = 'Failed to load episodes. Please try again later.';
        }
    }

    // Format Date securely
    function formatDate(dateString) {
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return new Date(dateString).toLocaleDateString(undefined, options);
    }

    function renderEpisodes() {
        // Clear grid
        episodesGrid.innerHTML = '';

        // Sort based on mode
        let sortedEpisodes = [...episodes];
        if (currentMode === 'sequence') {
            // Ascending (Oldest first)
            sortedEpisodes.sort((a, b) => new Date(a.published) - new Date(b.published));
        } else {
            // Descending (Newest first)
            sortedEpisodes.sort((a, b) => new Date(b.published) - new Date(a.published));
        }

        // Render each
        sortedEpisodes.forEach(ep => {
            const card = document.createElement('a');
            // Redirect to Yewtu.be instead of embedding
            card.href = `https://yewtu.be/watch?v=${ep.id}`;
            card.target = '_blank';
            card.rel = 'noopener noreferrer';
            card.className = 'episode-card';

            const thumbnailWrapper = document.createElement('div');
            thumbnailWrapper.className = 'card-thumbnail-wrapper';

            const img = document.createElement('img');
            img.src = ep.thumbnail || 'https://via.placeholder.com/640x360.png?text=No+Thumbnail';
            img.alt = ep.title;
            img.className = 'card-thumbnail';
            img.loading = 'lazy';

            const playOverlay = document.createElement('div');
            playOverlay.className = 'play-overlay';
            // Play icon SVG
            playOverlay.innerHTML = `
                <div class="play-icon">
                    <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
            `;

            thumbnailWrapper.appendChild(img);
            thumbnailWrapper.appendChild(playOverlay);

            const content = document.createElement('div');
            content.className = 'card-content';

            const title = document.createElement('h3');
            title.className = 'card-title';
            title.textContent = ep.title;

            const meta = document.createElement('div');
            meta.className = 'card-meta';

            const dateBadge = document.createElement('span');
            dateBadge.className = 'date-badge';
            dateBadge.textContent = formatDate(ep.published);

            meta.appendChild(dateBadge);

            content.appendChild(title);
            content.appendChild(meta);

            card.appendChild(thumbnailWrapper);
            card.appendChild(content);

            episodesGrid.appendChild(card);
        });
    }

    // Event Listeners
    btnLatest.addEventListener('click', () => {
        if (currentMode !== 'latest') {
            currentMode = 'latest';
            btnLatest.classList.add('active');
            btnSequence.classList.remove('active');
            renderEpisodes();
        }
    });

    btnSequence.addEventListener('click', () => {
        if (currentMode !== 'sequence') {
            currentMode = 'sequence';
            btnSequence.classList.add('active');
            btnLatest.classList.remove('active');
            renderEpisodes();
        }
    });

    // Start fetch
    fetchEpisodes();
});
