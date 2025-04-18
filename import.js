require('dotenv').config();
const fs = require('fs').promises;
const { Client } = require('@notionhq/client');
const { Command } = require('commander');
const crypto = require('crypto');

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATABASE_ID;

// Set up CLI
const program = new Command();
program
  .name('import')
  .description('Add books to Notion database by ISBN')
  .version('1.0.0')
  .option('--isbn <isbn>', 'Process a single ISBN')
  .option('--file <filepath>', 'Process multiple ISBNs from a file')
  .option('--goodreads <filepath>', 'Process ISBNs from a Goodreads CSV export file')
  .parse(process.argv);

const options = program.opts();

// Track failed ISBNs
const failedIsbns = [];

// Function to save failed ISBNs to a file
async function saveFailedIsbns() {
    if (failedIsbns.length > 0) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const failedFile = `failed-isbns-${timestamp}.txt`;
        await fs.writeFile(failedFile, failedIsbns.join('\n'));
        console.log(`\n${failedIsbns.length} failed ISBNs saved to ${failedFile}`);
    }
}

async function fetchBookInfo(isbn) {
  try {
    // First try OpenLibrary for basic info
    const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
    const data = await response.json();
    const bookData = data[`ISBN:${isbn}`];

    return {
      title: bookData.title,
      authors: bookData.authors?.map(author => author.name) || [],
      numberOfPages: bookData.number_of_pages || null,
      isbn: isbn
    };
  } catch (error) {
    console.error(`Error fetching data for ISBN ${isbn}:`, error);
    failedIsbns.push(isbn);
    return null;
  }
}

async function addBookToNotion(bookInfo) {
  try {
    const properties = {
      Title: {
        title: [
          {
            text: {
              content: bookInfo.title
            }
          }
        ]
      },
      Author: {
        multi_select: bookInfo.authors.map(author => ({ name: author }))
      },
      ISBN: {
        rich_text: [
          {
            text: {
              content: bookInfo.isbn
            }
          }
        ]
      },
      "Total Pages": {
        number: bookInfo.numberOfPages
      }
    };

    await notion.pages.create({
      parent: { database_id: databaseId },
      icon: {
        type: 'emoji',
        emoji: '📘'
      },
      properties: properties
    });
    console.log(`Added "${bookInfo.title}" to Notion database${bookInfo.series ? ` (Series: ${bookInfo.series})` : ''}`);
  } catch (error) {
    console.error(`Error adding "${bookInfo.title}" to Notion:`, error.message);
  }
}

async function processISBNFile(filepath) {
    try {
        const fileContent = await fs.readFile(filepath, 'utf-8');
        const isbns = fileContent.split('\n').filter(isbn => isbn.trim());
        
        console.log(`Processing ${isbns.length} ISBNs...`);
        
        const books = [];
        for (const isbn of isbns) {
            const cleanISBN = isbn.trim().replace(/-/g, '');
            console.log(`Fetching data for ISBN: ${cleanISBN}`);
            const bookInfo = await fetchBookInfo(cleanISBN);
            
            if (bookInfo) {
                books.push(bookInfo);
                console.log(`Found: ${bookInfo.title}`);
                await addBookToNotion(bookInfo);
            } else {
                console.log(`No data found for ISBN: ${cleanISBN}`);
            }
            
            // Add a small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Save results to a JSON file as backup, only if there are books found
        if (books.length > 0) {
            console.log(`\nProcessing complete. Found ${books.length} books.`);
            console.log('Results saved to books.json and added to Notion database');
        } else {
            console.log('\nProcessing complete. No books were found.');
        }
        
        // Save failed ISBNs to a file
        await saveFailedIsbns();
    } catch (error) {
        console.error('Error processing ISBN file:', error);
        // Try to save failed ISBNs even if there was an error
        await saveFailedIsbns();
    }
}

async function processSingleISBN(isbn) {
    try {
        const cleanISBN = isbn.trim().replace(/-/g, '');
        console.log(`Fetching data for ISBN: ${cleanISBN}`);
        const bookInfo = await fetchBookInfo(cleanISBN);
        
        if (bookInfo) {
            console.log(`Found: ${bookInfo.title}`);
            await addBookToNotion(bookInfo);
            console.log('\nProcessing complete. Book added to Notion database');
        } else {
            console.log(`No data found for ISBN: ${cleanISBN}`);
            // Save failed ISBN to a file
            await saveFailedIsbns();
        }
    } catch (error) {
        console.error('Error processing ISBN:', error);
        // Try to save failed ISBNs even if there was an error
        await saveFailedIsbns();
    }
}

async function processGoodreadsCSV(filepath) {
    try {
        const fileContent = await fs.readFile(filepath, 'utf-8');
        const lines = fileContent.split('\n');
        
        // Parse CSV header
        const headerLine = lines[0];
        const headers = parseCSVLine(headerLine);
        
        // Find ISBN column indexes
        const isbnIndex = headers.indexOf('ISBN');
        const isbn13Index = headers.indexOf('ISBN13');
        const titleIndex = headers.indexOf('Title');
        
        if (isbnIndex === -1 && isbn13Index === -1) {
            console.error('Error: Could not find ISBN or ISBN13 columns in the Goodreads CSV file.');
            return;
        }
        
        console.log('Processing Goodreads export file...');
        
        const booksToProcess = [];
        // Skip the header row (i=0)
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue; // Skip empty lines
            
            const values = parseCSVLine(lines[i]);
            
            // Extract both ISBN and ISBN13 when available
            let isbn = null;
            let isbn13 = null;
            let title = 'Unknown Title';
            
            if (isbnIndex !== -1 && values[isbnIndex]) {
                isbn = values[isbnIndex].replace(/[="]/g, '').trim();
                if (isbn === '') isbn = null;
            }
            
            if (isbn13Index !== -1 && values[isbn13Index]) {
                isbn13 = values[isbn13Index].replace(/[="]/g, '').trim();
                if (isbn13 === '') isbn13 = null;
            }
            
            if (titleIndex !== -1 && values[titleIndex]) {
                title = values[titleIndex].replace(/^"|"$/g, '').trim();
            }
            
            // Store both values for each book
            if (isbn13 || isbn) {
                booksToProcess.push({ 
                    title,
                    isbn,
                    isbn13
                });
            } else {
                console.log(`Skipping book "${title}" - no ISBN/ISBN13 found`);
            }
        }
        
        console.log(`Found ${booksToProcess.length} books with ISBNs in the Goodreads export.`);
        
        // Process the books
        const successfulBooks = [];
        for (const book of booksToProcess) {
            console.log(`Processing book: ${book.title}`);
            
            let bookInfo = null;
            
            // Try ISBN13 first
            if (book.isbn13) {
                const cleanISBN13 = book.isbn13.trim().replace(/-/g, '');
                console.log(`Trying ISBN13: ${cleanISBN13}`);
                bookInfo = await fetchBookInfo(cleanISBN13);
            }
            
            // Fall back to ISBN if ISBN13 failed or wasn't available
            if (!bookInfo && book.isbn) {
                const cleanISBN = book.isbn.trim().replace(/-/g, '');
                console.log(`Trying ISBN: ${cleanISBN}`);
                bookInfo = await fetchBookInfo(cleanISBN);
            }
            
            if (bookInfo) {
                successfulBooks.push(bookInfo);
                console.log(`Found: ${bookInfo.title}`);
                await addBookToNotion(bookInfo);
            } else {
                console.log(`No data found for book: ${book.title}`);
                // If we have tried both ISBN13 and ISBN and still failed, add to failed ISBNs
                if (book.isbn13) failedIsbns.push(book.isbn13);
                else if (book.isbn) failedIsbns.push(book.isbn);
            }
            
            // Add a small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Show summary
        console.log(`\nProcessing complete. Successfully imported ${successfulBooks.length} books out of ${booksToProcess.length}.`);
        
        // Save failed ISBNs to a file
        await saveFailedIsbns();
    } catch (error) {
        console.error('Error processing Goodreads CSV file:', error);
        // Try to save failed ISBNs even if there was an error
        await saveFailedIsbns();
    }
}

// Helper function to properly parse CSV lines with quoted fields
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            // Toggle quote state
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            // End of field
            result.push(current);
            current = '';
        } else {
            // Add character to current field
            current += char;
        }
    }
    
    // Don't forget the last field
    result.push(current);
    
    return result;
}

// Parse command line arguments
if (options.file) {
    processISBNFile(options.file);
} else if (options.isbn) {
    processSingleISBN(options.isbn);
} else if (options.goodreads) {
    processGoodreadsCSV(options.goodreads);
} else {
    console.error('Please provide either an ISBN, a path to an ISBN file, or a path to a Goodreads export CSV file');
    console.error('Usage: node import.js --isbn <isbn> or --file <filepath> or --goodreads <filepath>');
    process.exit(1);
}