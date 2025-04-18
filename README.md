# Notion Reading Tracker Helpers

A collection of utilities to help manage your book reading collection in Notion, making it easy to transition from Goodreads or build a reading tracker from scratch.

## Features

- **Import Books by ISBN**
  - Single ISBN import
  - Bulk import from a text file of ISBNs (one per line)
  - Import from Goodreads CSV export files
  
- **Book Metadata**
  - Fetches book information from OpenLibrary API
  - Falls back to Google Books API when needed
  - Retrieves title, author, page count, and series information

- **Maintenance Tools**
  - Update book icons based on reading status
  - Update/populate total page counts for existing books

## Setup

1. **Get the Notion Template**
   - Start by duplicating the reading tracker template: [Notion Reading Tracker Template](https://tekgadgt.notion.site/reading-tracker-template)

2. **Clone this repository**
   ```bash
   git clone https://github.com/yourusername/notion-reading-tracker-helpers.git
   cd notion-reading-tracker-helpers
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Create your .env file**
   ```bash
   cp .env.example .env
   ```

5. **Configure API keys**
   - Add your Notion API key and database ID to the `.env` file
   ```
   NOTION_API_KEY=your_notion_integration_token
   NOTION_DATABASE_ID=your_notion_database_id
   ```

## Usage

### Import Books

**Single ISBN:**
```bash
node import.js --isbn 9781234567890
```

**From a file (one ISBN per line):**
```bash
node import.js --file path/to/isbns.txt
```

**From Goodreads export:**
```bash
node import.js --goodreads path/to/goodreads_library_export.csv
```

### Update Icons Based on Reading Status

Icons will be updated according to reading status:
- 📖 Currently Reading
- 📘 To Read
- 📗 Completed
- 📕 DNF (Did Not Finish)

```bash
node update-icons.js
```

### Update/Populate Total Pages

For books already in your database with ISBNs but missing page counts:

```bash
node update-total-pages.js
```

With force update to refresh all page counts:

```bash
node update-total-pages.js --force
```

## Getting Notion API Access

1. Create a Notion integration at [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Copy the integration token to your `.env` file
3. Share your duplicated database with the integration
4. Find your database ID from the URL when viewing the database (it's the part after the workspace name and before the question mark)
