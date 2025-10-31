// Example React component showing how to use the new search functionality
// This can be integrated into your App.tsx

import { useState, useEffect } from 'react';

interface Solution {
  id: string;
  text: string;
  summary: string;
  url: string;
  title: string;
  timestamp: number;
  tags: string[];
  notes?: string;
}

export function SearchExample() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<Solution[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Load all available tags on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ action: 'getAllTags' }, (response) => {
      if (response.tags) {
        setAllTags(response.tags);
      }
    });
  }, []);

  // Simple full-text search
  const handleSimpleSearch = () => {
    setIsSearching(true);
    chrome.runtime.sendMessage(
      { action: 'searchSolutions', query: searchQuery },
      (response) => {
        setSearchResults(response.solutions || []);
        setIsSearching(false);
      }
    );
  };

  // Advanced search with filters
  const handleAdvancedSearch = () => {
    setIsSearching(true);
    chrome.runtime.sendMessage(
      {
        action: 'advancedSearch',
        filters: {
          query: searchQuery,
          tags: selectedTags,
          // Optional: add date range
          // startDate: Date.now() - (30 * 24 * 60 * 60 * 1000), // Last 30 days
          // endDate: Date.now()
        }
      },
      (response) => {
        setSearchResults(response.solutions || []);
        setIsSearching(false);
      }
    );
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  return (
    <div className="search-container">
      {/* Search Input */}
      <div className="search-bar">
        <input
          type="text"
          placeholder="Search solutions (title, content, tags, notes)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSimpleSearch()}
        />
        <button onClick={handleSimpleSearch} disabled={isSearching}>
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Tag Filter */}
      <div className="tag-filter">
        <p>Filter by tags:</p>
        <div className="tag-list">
          {allTags.map((tag) => (
            <button
              key={tag}
              className={`tag ${selectedTags.includes(tag) ? 'active' : ''}`}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
        {selectedTags.length > 0 && (
          <button onClick={handleAdvancedSearch} disabled={isSearching}>
            Search with Tags
          </button>
        )}
      </div>

      {/* Search Results */}
      <div className="search-results">
        {searchResults.length > 0 ? (
          <>
            <p>{searchResults.length} results found</p>
            {searchResults.map((solution) => (
              <div key={solution.id} className="solution-card">
                <h3>{solution.title}</h3>
                <p>{solution.summary || solution.text.substring(0, 200)}...</p>
                <div className="tags">
                  {solution.tags.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
                <a href={solution.url} target="_blank" rel="noopener noreferrer">
                  View Original
                </a>
              </div>
            ))}
          </>
        ) : searchQuery ? (
          <p>No results found</p>
        ) : null}
      </div>
    </div>
  );
}

// Alternative: Quick search hook for reusability
export function useSearch() {
  const [results, setResults] = useState<Solution[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const search = async (query: string) => {
    setIsSearching(true);
    chrome.runtime.sendMessage(
      { action: 'searchSolutions', query },
      (response) => {
        setResults(response.solutions || []);
        setIsSearching(false);
      }
    );
  };

  const advancedSearch = async (filters: {
    query?: string;
    tags?: string[];
    startDate?: number;
    endDate?: number;
  }) => {
    setIsSearching(true);
    chrome.runtime.sendMessage(
      { action: 'advancedSearch', filters },
      (response) => {
        setResults(response.solutions || []);
        setIsSearching(false);
      }
    );
  };

  return { results, isSearching, search, advancedSearch };
}

// CSS for the search component (add to your index.css)
/*
.search-container {
  padding: 20px;
}

.search-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.search-bar input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.search-bar button {
  padding: 10px 20px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.search-bar button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.tag-filter {
  margin-bottom: 20px;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0;
}

.tag {
  padding: 6px 12px;
  background: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 16px;
  cursor: pointer;
  font-size: 14px;
}

.tag.active {
  background: #007bff;
  color: white;
  border-color: #007bff;
}

.solution-card {
  border: 1px solid #ddd;
  padding: 16px;
  margin-bottom: 12px;
  border-radius: 8px;
}

.solution-card h3 {
  margin: 0 0 10px 0;
}

.solution-card .tags {
  display: flex;
  gap: 6px;
  margin: 10px 0;
}
*/

