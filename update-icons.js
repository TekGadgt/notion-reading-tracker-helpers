require('dotenv').config();
const { Client } = require('@notionhq/client');

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATABASE_ID;

const EMOJIS = {
    'Currently Reading': '📖', // open book
    'To Read': '📘',          // closed books
    'Completed': '📗',        // closed books
    'DNF': '📕'              // closed books
};

async function updateBookIcons() {
    try {
        let hasMore = true;
        let startCursor = undefined;
        let totalUpdated = 0;
        let totalSkipped = 0;

        while (hasMore) {
            // Query books with pagination support
            const response = await notion.databases.query({
                database_id: databaseId,
                start_cursor: startCursor,
            });

            // Process this page of results
            console.log(`Processing batch of ${response.results.length} books...`);
            
            // Update each book's icon based on its status
            for (const page of response.results) {
                const status = page.properties.Status?.status?.name;
                const title = page.properties.Title?.title[0]?.plain_text || 'Unknown Title';
                
                if (!status) {
                    console.log(`Skipping book "${title}" - no status found`);
                    continue;
                }

                const expectedEmoji = EMOJIS[status] || '📚';
                const currentEmoji = page.icon?.type === 'emoji' ? page.icon.emoji : null;
                
                // Only update if the current emoji doesn't match what's expected
                if (currentEmoji === expectedEmoji) {
                    console.log(`Skipping "${title}" - emoji already matches status (${expectedEmoji})`);
                    totalSkipped++;
                    continue;
                }

                try {
                    await notion.pages.update({
                        page_id: page.id,
                        icon: {
                            type: 'emoji',
                            emoji: expectedEmoji
                        }
                    });

                    console.log(`Updated icon for "${title}" to ${expectedEmoji} (${status})`);
                    totalUpdated++;
                } catch (error) {
                    console.error(`Error updating icon for "${title}":`, error.message);
                }

                // Add a small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 250));
            }

            // Update pagination data for next iteration
            hasMore = response.has_more;
            startCursor = response.next_cursor;
            
            console.log(`Batch complete. ${hasMore ? 'Moving to next page...' : 'No more pages.'}`);
        }

        console.log(`\nIcon update complete! Updated ${totalUpdated} books, skipped ${totalSkipped} books (already had correct icon).`);

    } catch (error) {
        console.error('Error updating book icons:', error);
    }
}

// Run the update
updateBookIcons();