# IndexedDB Migration Guide

## Overview

MindStack now uses **IndexedDB** instead of `chrome.storage.local` for storing solutions. This enables:

✅ **Full-text search** across all solution content  
✅ **Unlimited storage** (no 10MB limit)  
✅ **Better performance** with thousands of solutions  
✅ **Advanced filtering** by tags, dates, and keywords  
✅ **Efficient querying** with indexed fields  

## What Changed?

### Before (chrome.storage.local)
- **Limit**: 10MB default storage
- **Search**: Manual filtering in memory
- **Performance**: Degrades with many solutions
- **Query**: Basic array operations only

### After (IndexedDB)
- **Limit**: Hundreds of MB+ available
- **Search**: Full-text search + indexed queries
- **Performance**: Optimized for large datasets
- **Query**: Tag filters, date ranges, text search

## Automatic Migration

Your existing solutions are **automatically migrated** when you update the extension:

1. Extension detects existing data in `chrome.storage.local`
2. Copies all solutions to IndexedDB
3. Preserves original data as backup (not deleted automatically)
4. Migration happens once on first load

**Check migration success**: Open DevTools Console and look for:
```
Migrating X solutions to IndexedDB...
Migration complete!
```

## New Features

### 1. Simple Full-Text Search

Search across titles, content, summaries, tags, and notes:

```typescript
chrome.runtime.sendMessage(
  { action: 'searchSolutions', query: 'react hooks useState' },
  (response) => {
    console.log('Results:', response.solutions);
  }
);
```

### 2. Advanced Search with Filters

Combine text search with tag filters and date ranges:

```typescript
chrome.runtime.sendMessage(
  {
    action: 'advancedSearch',
    filters: {
      query: 'typescript',
      tags: ['react', 'hooks'],
      startDate: Date.now() - (30 * 24 * 60 * 60 * 1000), // Last 30 days
      endDate: Date.now()
    }
  },
  (response) => {
    console.log('Filtered results:', response.solutions);
  }
);
```

### 3. Get All Tags

Retrieve all unique tags for building filters:

```typescript
chrome.runtime.sendMessage(
  { action: 'getAllTags' },
  (response) => {
    console.log('Available tags:', response.tags);
  }
);
```

### 4. Export Data

Backup all your solutions:

```typescript
chrome.runtime.sendMessage(
  { action: 'exportData' },
  (response) => {
    const json = JSON.stringify(response.data, null, 2);
    // Save to file or download
  }
);
```

## API Reference

### Available Actions

| Action | Parameters | Response | Description |
|--------|-----------|----------|-------------|
| `getSolutions` | - | `{ solutions: Solution[] }` | Get all solutions (sorted by date) |
| `searchSolutions` | `{ query: string }` | `{ solutions: Solution[] }` | Full-text search |
| `advancedSearch` | `{ filters: SearchFilters }` | `{ solutions: Solution[] }` | Search with filters |
| `getAllTags` | - | `{ tags: string[] }` | Get all unique tags |
| `deleteSolution` | `{ id: string }` | `{ success: boolean }` | Delete a solution |
| `updateSolution` | `{ id: string, updates: Partial<Solution> }` | `{ success: boolean }` | Update a solution |
| `clearAllSolutions` | - | `{ success: boolean }` | Delete all solutions |
| `exportData` | - | `{ success: boolean, data: Solution[] }` | Export all data |

### Solution Type

```typescript
interface Solution {
  id: string;
  text: string;          // Full formatted content
  summary: string;       // AI-generated summary
  url: string;           // Source URL
  title: string;         // Solution title
  timestamp: number;     // Unix timestamp
  tags: string[];        // Array of tags
  notes?: string;        // User notes (optional)
}
```

### Search Filters

```typescript
interface SearchFilters {
  query?: string;        // Text to search for
  tags?: string[];       // Must have ALL these tags
  startDate?: number;    // Timestamp - solutions after this date
  endDate?: number;      // Timestamp - solutions before this date
}
```

## Performance Tips

### For Large Datasets (1000+ solutions)

1. **Use pagination** in your UI (display 50-100 at a time)
2. **Debounce search** to avoid too many queries while typing
3. **Cache tag list** instead of fetching every time
4. **Consider lazy loading** for solution details

### Example: Debounced Search

```typescript
import { useEffect, useState } from 'react';

function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

// In your component:
const [searchQuery, setSearchQuery] = useState('');
const debouncedQuery = useDebounce(searchQuery, 300);

useEffect(() => {
  if (debouncedQuery) {
    chrome.runtime.sendMessage(
      { action: 'searchSolutions', query: debouncedQuery },
      (response) => {
        setResults(response.solutions);
      }
    );
  }
}, [debouncedQuery]);
```

## Advanced: Adding Semantic Search

For even better search, you could add embeddings in the future:

```typescript
// In db.ts Solution interface:
interface Solution {
  // ... existing fields
  embedding?: number[];  // Vector representation for semantic search
}

// Generate embeddings using Chrome's AI APIs or external service
// Then implement cosine similarity search for "smart" search
```

## Troubleshooting

### Migration didn't run?

Check if data exists in IndexedDB:
```javascript
// In browser DevTools Console (on extension page)
const request = indexedDB.open('MindStackDB');
request.onsuccess = (e) => {
  const db = e.target.result;
  const tx = db.transaction('solutions', 'readonly');
  const store = tx.objectStore('solutions');
  const count = store.count();
  count.onsuccess = () => console.log('Solutions in DB:', count.result);
};
```

### Search not working?

1. Ensure IndexedDB is initialized: Check for errors in console
2. Verify search query is not empty
3. Check that solutions have been migrated
4. Try clearing and re-saving a test solution

### Performance issues?

- Check how many solutions you have: `db.getCount()`
- Consider implementing pagination
- Use browser's Performance tab to profile
- Avoid rendering all solutions at once

## Future Enhancements

Potential improvements for search:

- [ ] **Fuzzy search** - Find results with typos
- [ ] **Highlighting** - Show matched text in results  
- [ ] **Search suggestions** - Autocomplete based on history
- [ ] **Semantic search** - Find similar solutions by meaning
- [ ] **Search history** - Remember recent searches
- [ ] **Saved searches** - Save common filter combinations
- [ ] **Full-text indexing** - Use libraries like FlexSearch or Lunr.js

## Migration Rollback (if needed)

If you need to revert to `chrome.storage.local`:

1. Your original data is still in `chrome.storage.local` (not deleted)
2. Revert to a previous version of the extension
3. Or manually copy data back:

```javascript
// Export from IndexedDB
chrome.runtime.sendMessage({ action: 'exportData' }, (response) => {
  // Import to chrome.storage.local
  chrome.storage.local.set({ solutions: response.data });
});
```

## Questions?

- File an issue on GitHub
- Check browser console for error messages
- Review `src/db.ts` for implementation details

