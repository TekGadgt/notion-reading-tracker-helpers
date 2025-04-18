require('dotenv').config();
const { Client } = require('@notionhq/client');
const https = require('https');
const { program } = require('commander');

// Setup command line options
program
  .option('-f, --force', 'Force update of Total Pages even if already populated')
  .parse(process.argv);

const options = program.opts();

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATABASE_ID;

// Function to fetch book data from OpenLibrary API
async function fetchBookDataFromOpenLibrary(isbn) {
  return new Promise((resolve, reject) => {
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
    
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const bookData = JSON.parse(data);
          resolve(bookData[`ISBN:${isbn}`] || null);
        } catch (error) {
          reject(new Error(`Failed to parse OpenLibrary response: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`OpenLibrary API request failed: ${error.message}`));
    });
  });
}

async function updateBookTotalPages() {
  try {
    let hasMore = true;
    let startCursor = undefined;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalMissingISBN = 0;
    let totalFailedFetch = 0;
    let totalForceUpdated = 0;

    console.log('Starting to update book total pages...');
    if (options.force) {
      console.log('FORCE MODE ENABLED: Will update Total Pages even if already populated');
    }
    
    while (hasMore) {
      // Query books with pagination support
      const response = await notion.databases.query({
        database_id: databaseId,
        start_cursor: startCursor,
      });
      
      // Process this page of results
      console.log(`Processing batch of ${response.results.length} books...`);
      
      // Update each book's total pages based on ISBN lookup
      for (const page of response.results) {
        const title = page.properties.Title?.title[0]?.plain_text || 'Unknown Title';
        const isbn = page.properties.ISBN?.rich_text?.[0]?.plain_text;
        const currentTotalPages = page.properties['Total Pages']?.number;
        
        if (!isbn) {
          console.log(`Skipping "${title}" - no ISBN found`);
          totalMissingISBN++;
          continue;
        }
        
        // Skip if total pages is already populated (unless force flag is used)
        if (currentTotalPages && !options.force) {
          console.log(`Skipping "${title}" - already has ${currentTotalPages} pages`);
          totalSkipped++;
          continue;
        } else if (currentTotalPages && options.force) {
          console.log(`Force updating "${title}" - currently has ${currentTotalPages} pages`);
        }
        
        try {
          // Fetch book data from OpenLibrary API
          console.log(`Fetching data for "${title}" with ISBN: ${isbn}...`);
          const bookData = await fetchBookDataFromOpenLibrary(isbn);
          
          if (!bookData) {
            console.log(`No OpenLibrary data found for "${title}" (ISBN: ${isbn})`);
            totalFailedFetch++;
            continue;
          }
          
          const numberOfPages = bookData.number_of_pages;
          
          if (!numberOfPages) {
            console.log(`No page count information available for "${title}" (ISBN: ${isbn})`);
            totalFailedFetch++;
            continue;
          }
          
          // Update the "Total Pages" property in Notion
          await notion.pages.update({
            page_id: page.id,
            properties: {
              'Total Pages': {
                number: numberOfPages
              }
            }
          });
          
          if (currentTotalPages && options.force) {
            console.log(`Force updated "${title}" from ${currentTotalPages} to ${numberOfPages} total pages`);
            totalForceUpdated++;
          } else {
            console.log(`Updated "${title}" with ${numberOfPages} total pages`);
            totalUpdated++;
          }
          
        } catch (error) {
          console.error(`Error processing "${title}":`, error.message);
          totalFailedFetch++;
        }
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Update pagination data for next iteration
      hasMore = response.has_more;
      startCursor = response.next_cursor;
      
      console.log(`Batch complete. ${hasMore ? 'Moving to next page...' : 'No more pages.'}`);
    }
    
    console.log('\n--- Summary ---');
    console.log(`Total books updated: ${totalUpdated}`);
    console.log(`Total books force updated: ${totalForceUpdated}`);
    console.log(`Total books skipped (already had page count): ${totalSkipped}`);
    console.log(`Total books missing ISBN: ${totalMissingISBN}`);
    console.log(`Total books failed to fetch/update: ${totalFailedFetch}`);
    
  } catch (error) {
    console.error('Error updating book total pages:', error);
  }
}

// Run the update
updateBookTotalPages();