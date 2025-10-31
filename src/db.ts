// IndexedDB wrapper for MindStack solutions storage
// Provides full-text search capabilities and efficient querying

export interface Solution {
  id: string;
  text: string; // Full formatted text
  summary: string;
  url: string;
  title: string;
  timestamp: number;
  tags: string[];
  notes?: string;
  // Future: add embeddings for semantic search
  // embedding?: number[];
}

const DB_NAME = 'MindStackDB';
const DB_VERSION = 1;
const STORE_NAME = 'solutions';

class SolutionDB {
  private db: IDBDatabase | null = null;

  // Initialize the database
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;

        // Create solutions store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          
          // Create indexes for efficient querying
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('tags', 'tags', { unique: false, multiEntry: true });
          store.createIndex('url', 'url', { unique: false });
          
          // For full-text search, we'll index title and text
          // Note: IndexedDB doesn't have built-in full-text search,
          // so we'll implement it in-memory or with a search library
        }
      };
    });
  }

  // Add a new solution
  async addSolution(solution: Solution): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(solution);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Get all solutions (sorted by timestamp, newest first)
  async getAllSolutions(): Promise<Solution[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const request = index.openCursor(null, 'prev'); // Descending order

      const solutions: Solution[] = [];
      request.onsuccess = (event: any) => {
        const cursor = event.target.result;
        if (cursor) {
          solutions.push(cursor.value);
          cursor.continue();
        } else {
          resolve(solutions);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Get solution by ID
  async getSolution(id: string): Promise<Solution | undefined> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Update a solution
  async updateSolution(id: string, updates: Partial<Solution>): Promise<void> {
    if (!this.db) await this.init();

    return new Promise(async (resolve, reject) => {
      const existing = await this.getSolution(id);
      if (!existing) {
        reject(new Error('Solution not found'));
        return;
      }

      const updated = { ...existing, ...updates, id }; // Ensure ID doesn't change
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(updated);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Delete a solution
  async deleteSolution(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Clear all solutions
  async clearAll(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Search by tags (exact match)
  async searchByTag(tag: string): Promise<Solution[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('tags');
      const request = index.getAll(tag.toLowerCase());

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Full-text search across title, text, and tags
  async search(query: string): Promise<Solution[]> {
    if (!this.db) await this.init();

    const allSolutions = await this.getAllSolutions();
    const lowerQuery = query.toLowerCase().trim();
    
    if (!lowerQuery) return allSolutions;

    // Simple full-text search implementation
    // For better performance, consider using a library like lunr.js or flexsearch
    const results = allSolutions.filter(solution => {
      const searchableText = [
        solution.title,
        solution.text,
        solution.summary || '',
        solution.notes || '',
        ...solution.tags
      ].join(' ').toLowerCase();

      return searchableText.includes(lowerQuery);
    });

    return results;
  }

  // Advanced search with multiple filters
  async advancedSearch(filters: {
    query?: string;
    tags?: string[];
    startDate?: number;
    endDate?: number;
  }): Promise<Solution[]> {
    if (!this.db) await this.init();

    let results = await this.getAllSolutions();

    // Filter by text query
    if (filters.query) {
      const lowerQuery = filters.query.toLowerCase().trim();
      results = results.filter(solution => {
        const searchableText = [
          solution.title,
          solution.text,
          solution.summary || '',
          solution.notes || '',
          ...solution.tags
        ].join(' ').toLowerCase();
        return searchableText.includes(lowerQuery);
      });
    }

    // Filter by tags (must have all specified tags)
    if (filters.tags && filters.tags.length > 0) {
      results = results.filter(solution => 
        filters.tags!.every(tag => 
          solution.tags.some(sTag => sTag.toLowerCase() === tag.toLowerCase())
        )
      );
    }

    // Filter by date range
    if (filters.startDate) {
      results = results.filter(s => s.timestamp >= filters.startDate!);
    }
    if (filters.endDate) {
      results = results.filter(s => s.timestamp <= filters.endDate!);
    }

    return results;
  }

  // Get count of solutions
  async getCount(): Promise<number> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Get all unique tags
  async getAllTags(): Promise<string[]> {
    const solutions = await this.getAllSolutions();
    const tagsSet = new Set<string>();
    
    solutions.forEach(solution => {
      solution.tags.forEach(tag => tagsSet.add(tag));
    });

    return Array.from(tagsSet).sort();
  }

  // Export all data (for backup)
  async exportData(): Promise<Solution[]> {
    return this.getAllSolutions();
  }

  // Import data (for restore/migration)
  async importData(solutions: Solution[]): Promise<void> {
    if (!this.db) await this.init();

    // Use a single transaction for better performance
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      let completed = 0;
      solutions.forEach(solution => {
        const request = store.put(solution); // Use put instead of add to handle duplicates
        request.onsuccess = () => {
          completed++;
          if (completed === solutions.length) {
            resolve();
          }
        };
        request.onerror = () => reject(request.error);
      });

      if (solutions.length === 0) resolve();
    });
  }
}

// Export singleton instance
export const db = new SolutionDB();

