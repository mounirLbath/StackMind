# RAG Implementation Plan - Validated (MediaPipe Tasks-Text)

## ✅ User Preferences Confirmed

1. **Embedding Strategy:** Single embedding per solution (simpler)
2. **Default Search:** Semantic search (with opt-in keyword toggle)
3. **Embedding Library:** MediaPipe Tasks-Text (not transformers.js)

---

## Architecture Overview

```
User Query
    ↓
[Search Mode Toggle] → Semantic (default) or Keyword
    ↓
┌─────────────────────────────────┐
│  SEMANTIC SEARCH (Default)      │
│  1. Generate query embedding    │
│     (MediaPipe TextEmbedder)    │
│  2. Vector similarity search    │
│     (Cosine similarity)           │
│  3. Retrieve top-K solutions    │
│  4. Generate answer with RAG    │
│     (Chrome LanguageModel API)   │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  KEYWORD SEARCH (Opt-in)        │
│  1. Text matching (existing)     │
│  2. Filter by keywords          │
│  3. Return matching solutions   │
└─────────────────────────────────┘
    ↓
Display Results + Generated Answer
```

---

## Technology Stack

| Component | Technology | Details |
|-----------|-----------|---------|
| **Embeddings** | `@mediapipe/tasks-text` | Universal Sentence Encoder Lite (~4MB) |
| **Storage** | IndexedDB | Store embeddings as `Float32Array` (512 dim) |
| **Search** | Cosine Similarity | Vector similarity matching |
| **Generation** | Chrome LanguageModel API | Already integrated |
| **Fallback** | Keyword Search | Existing full-text search |

---

## Implementation Phases

### Phase 1: Embedding Infrastructure (Day 1)

#### 1.1 Add Dependencies
```bash
npm install @mediapipe/tasks-text
```

**Package details:**
- Package: `@mediapipe/tasks-text`
- Model: Universal Sentence Encoder Lite
- Size: ~4MB
- Dimensions: 512
- Format: TFLite (TensorFlow Lite)

#### 1.2 Create Embedding Service (`src/embeddings.ts`)

**Key features:**
- Lazy initialization (load on first use)
- Model caching in memory
- Progress tracking for model download
- Error handling with fallback

**Implementation:**
```typescript
import { FilesetResolver, TextEmbedder } from "@mediapipe/tasks-text";

class EmbeddingService {
  private embedder: TextEmbedder | null = null;
  private isInitializing = false;
  
  async initialize(): Promise<void> {
    if (this.embedder || this.isInitializing) return;
    
    this.isInitializing = true;
    try {
      const filesetResolver = await FilesetResolver.forTasksText();
      this.embedder = await TextEmbedder.createFromOptions(
        filesetResolver,
        {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-tasks/text_embedder/universal_sentence_encoder.tflite"
          }
        }
      );
    } finally {
      this.isInitializing = false;
    }
  }
  
  async generateEmbedding(text: string): Promise<Float32Array> {
    if (!this.embedder) await this.initialize();
    const result = await this.embedder!.embed(text);
    return result.embeddings[0]; // 512-dimensional vector
  }
  
  async generateEmbeddings(texts: string[]): Promise<Float32Array[]> {
    // Batch processing for multiple texts
    if (!this.embedder) await this.initialize();
    const results = await Promise.all(
      texts.map(text => this.embedder!.embed(text))
    );
    return results.map(r => r.embeddings[0]);
  }
}

export const embeddingService = new EmbeddingService();
```

#### 1.3 Update Solution Schema (`src/db.ts`)

**Add embedding field:**
```typescript
export interface Solution {
  // ... existing fields
  embedding?: Float32Array | number[]; // 512 dimensions
}
```

**Storage consideration:**
- IndexedDB doesn't directly support `Float32Array`
- Convert to `number[]` for storage
- Convert back to `Float32Array` for operations

---

### Phase 2: Vector Storage & Management (Day 1-2)

#### 2.1 Extend IndexedDB Schema

**Update `src/db.ts`:**
- Add `embedding` field to solutions store
- No separate embeddings store needed (embedding per solution)
- Store as `number[]` in IndexedDB

#### 2.2 Embedding Generation on Save

**Update `processInBackground` in `background.ts`:**
```typescript
// After solution is formatted, generate embedding
const embedding = await embeddingService.generateEmbedding(
  solution.text.substring(0, 1000) // Limit to first 1000 chars for efficiency
);
solution.embedding = Array.from(embedding); // Convert to number[]
```

**Background processing:**
- Generate embeddings for new solutions
- Optional: Batch generate for existing solutions (migration script)

#### 2.3 Migration for Existing Solutions

**Add migration function:**
```typescript
async function migrateExistingSolutions() {
  const solutions = await db.getAllSolutions();
  const withoutEmbeddings = solutions.filter(s => !s.embedding);
  
  if (withoutEmbeddings.length === 0) return;
  
  console.log(`Generating embeddings for ${withoutEmbeddings.length} solutions...`);
  
  // Process in batches to avoid blocking
  const batchSize = 10;
  for (let i = 0; i < withoutEmbeddings.length; i += batchSize) {
    const batch = withoutEmbeddings.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (solution) => {
      try {
        const embedding = await embeddingService.generateEmbedding(
          solution.text.substring(0, 1000)
        );
        await db.updateSolution(solution.id, {
          embedding: Array.from(embedding)
        });
      } catch (error) {
        console.error(`Failed to generate embedding for ${solution.id}:`, error);
      }
    }));
    
    // Show progress
    notifyPopup('embeddingMigrationProgress', {
      completed: Math.min(i + batchSize, withoutEmbeddings.length),
      total: withoutEmbeddings.length
    });
  }
}
```

---

### Phase 3: Vector Search Implementation (Day 2)

#### 3.1 Cosine Similarity Function (`src/vector-search.ts`)

```typescript
export function cosineSimilarity(
  a: Float32Array | number[],
  b: Float32Array | number[]
): number {
  const vecA = a instanceof Float32Array ? a : new Float32Array(a);
  const vecB = b instanceof Float32Array ? b : new Float32Array(b);
  
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  
  return dotProduct / denominator; // Returns value between -1 and 1
}
```

#### 3.2 Semantic Search Function (`src/db.ts`)

```typescript
async semanticSearch(
  queryEmbedding: Float32Array | number[],
  topK: number = 5,
  threshold: number = 0.5
): Promise<Array<{ solution: Solution; similarity: number }>> {
  if (!this.db) await this.init();
  
  const allSolutions = await this.getAllSolutions();
  const solutionsWithEmbeddings = allSolutions.filter(
    s => s.embedding && s.embedding.length > 0
  );
  
  // Calculate similarities
  const results = solutionsWithEmbeddings
    .map(solution => ({
      solution,
      similarity: cosineSimilarity(
        queryEmbedding,
        solution.embedding!
      )
    }))
    .filter(result => result.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
  
  return results;
}
```

#### 3.3 Update Search Functions

**Add to `db.ts`:**
- `semanticSearch()` - Vector similarity search
- Keep existing `search()` - Keyword search (fallback)
- Add `hybridSearch()` - Optional future enhancement

---

### Phase 4: RAG Query Processing (Day 2-3)

#### 4.1 RAG Search Handler (`src/background.ts`)

**Add new message handler:**
```typescript
if (message.action === 'ragSearch') {
  (async () => {
    try {
      const { query, searchMode = 'semantic', topK = 5 } = message;
      
      let results: Solution[] = [];
      
      if (searchMode === 'semantic') {
        // Generate query embedding
        const queryEmbedding = await embeddingService.generateEmbedding(query);
        
        // Semantic search
        const searchResults = await db.semanticSearch(
          Array.from(queryEmbedding),
          topK,
          0.5 // similarity threshold
        );
        
        results = searchResults.map(r => r.solution);
      } else {
        // Fallback to keyword search
        results = await db.search(query);
      }
      
      // If user wants answer generation
      if (message.generateAnswer && results.length > 0) {
        // Assemble context
        const context = assembleContext(results);
        
        // Generate answer using Chrome LanguageModel API
        const answer = await generateRAGAnswer(query, context);
        
        sendResponse({
          success: true,
          solutions: results,
          answer: answer,
          searchMode
        });
      } else {
        sendResponse({
          success: true,
          solutions: results,
          searchMode
        });
      }
    } catch (error) {
      console.error('RAG search error:', error);
      sendResponse({
        success: false,
        error: (error as Error).message
      });
    }
  })();
  return true;
}
```

#### 4.2 Context Assembly

```typescript
function assembleContext(solutions: Solution[]): string {
  return solutions
    .map((sol, idx) => {
      const summary = sol.summary || sol.text.substring(0, 200);
      return `[Solution ${idx + 1}: ${sol.title}]
${summary}
URL: ${sol.url}
${sol.tags ? `Tags: ${sol.tags.join(', ')}` : ''}
---
`;
    })
    .join('\n');
}
```

#### 4.3 RAG Answer Generation

```typescript
async function generateRAGAnswer(
  query: string,
  context: string
): Promise<string> {
  if (!aiSession) await initializeAISession();
  if (!aiSession) throw new Error('AI session not available');
  
  const prompt = `Based on the following solutions from your saved knowledge base, answer the user's question:

${context}

User Question: ${query}

Provide a comprehensive answer based on the retrieved solutions. If the solutions don't fully address the question, say so. Include relevant code examples when applicable. Be concise but thorough.`;
  
  const answer = await aiSession.prompt(prompt);
  return answer.trim();
}
```

---

### Phase 5: UI Integration (Day 3-4)

#### 5.1 Search Mode Toggle (`src/App.tsx`)

**Add to search UI:**
```typescript
const [searchMode, setSearchMode] = useState<'semantic' | 'keyword'>('semantic');
const [ragQuery, setRagQuery] = useState('');
const [ragResults, setRagResults] = useState<Solution[]>([]);
const [ragAnswer, setRagAnswer] = useState<string | null>(null);
const [isGeneratingAnswer, setIsGeneratingAnswer] = useState(false);

// Toggle component
<div className="search-mode-toggle">
  <label>
    <input
      type="radio"
      value="semantic"
      checked={searchMode === 'semantic'}
      onChange={() => setSearchMode('semantic')}
    />
    Semantic Search (AI-powered)
  </label>
  <label>
    <input
      type="radio"
      value="keyword"
      checked={searchMode === 'keyword'}
      onChange={() => setSearchMode('keyword')}
    />
    Keyword Search
  </label>
</div>
```

#### 5.2 RAG Search Input

```typescript
<div className="rag-search-container">
  <input
    type="text"
    placeholder={searchMode === 'semantic' 
      ? "Ask a question... (e.g., 'How do I handle async errors?')"
      : "Search by keywords..."}
    value={ragQuery}
    onChange={(e) => setRagQuery(e.target.value)}
    onKeyDown={(e) => {
      if (e.key === 'Enter') {
        handleRAGSearch(ragQuery, true); // Generate answer
      }
    }}
  />
  <button onClick={() => handleRAGSearch(ragQuery, true)}>
    {isGeneratingAnswer ? 'Generating...' : 'Search & Generate Answer'}
  </button>
  <button onClick={() => handleRAGSearch(ragQuery, false)}>
    Search Only
  </button>
</div>
```

#### 5.3 Handle RAG Search

```typescript
const handleRAGSearch = async (query: string, generateAnswer: boolean) => {
  if (!query.trim()) return;
  
  setIsGeneratingAnswer(generateAnswer);
  setRagAnswer(null);
  
  chrome.runtime.sendMessage(
    {
      action: 'ragSearch',
      query,
      searchMode,
      generateAnswer,
      topK: 5
    },
    (response) => {
      setIsGeneratingAnswer(false);
      
      if (response.success) {
        setRagResults(response.solutions);
        if (response.answer) {
          setRagAnswer(response.answer);
        }
      } else {
        alert('Search failed: ' + (response.error || 'Unknown error'));
      }
    }
  );
};
```

#### 5.4 Result Display

```typescript
{ragAnswer && (
  <div className="rag-answer">
    <h3>AI-Generated Answer</h3>
    <div className="answer-content">
      {ragAnswer}
    </div>
    <div className="answer-sources">
      <h4>Based on {ragResults.length} solution(s):</h4>
      {ragResults.map((sol, idx) => (
        <div key={sol.id} className="source-item">
          <a href={sol.url} target="_blank" rel="noopener">
            {idx + 1}. {sol.title}
          </a>
          {searchMode === 'semantic' && (
            <span className="similarity-score">
              (Relevance: {Math.round(similarity * 100)}%)
            </span>
          )}
        </div>
      ))}
    </div>
  </div>
)}

{ragResults.length > 0 && (
  <div className="rag-results">
    <h3>Retrieved Solutions ({ragResults.length})</h3>
    {/* Display solution cards */}
  </div>
)}
```

#### 5.5 Loading States

```typescript
{isGeneratingAnswer && (
  <div className="loading-indicator">
    <span>Generating AI answer from your solutions...</span>
    <progress />
  </div>
)}
```

---

### Phase 6: Error Handling & Fallbacks (Day 4)

#### 6.1 Embedding Service Fallback

```typescript
async generateEmbedding(text: string): Promise<Float32Array | null> {
  try {
    if (!this.embedder) await this.initialize();
    const result = await this.embedder!.embed(text);
    return result.embeddings[0];
  } catch (error) {
    console.error('Embedding generation failed:', error);
    // Fallback to keyword search
    return null;
  }
}
```

#### 6.2 Search Mode Auto-Fallback

```typescript
// If embedding generation fails, auto-fallback to keyword search
if (searchMode === 'semantic') {
  try {
    const queryEmbedding = await embeddingService.generateEmbedding(query);
    if (!queryEmbedding) {
      console.warn('Embedding failed, falling back to keyword search');
      searchMode = 'keyword';
    }
  } catch (error) {
    console.warn('Semantic search unavailable, using keyword search');
    searchMode = 'keyword';
  }
}
```

#### 6.3 User Notifications

```typescript
// Show helpful messages
if (embeddingService.modelLoading) {
  notifyUser('Loading AI model for semantic search... (first time only)');
}

if (fallbackToKeyword) {
  notifyUser('Semantic search unavailable, using keyword search');
}
```

---

### Phase 7: Performance Optimization (Day 4-5)

#### 7.1 Caching Strategy

```typescript
// Cache query embeddings (common queries)
const queryCache = new Map<string, Float32Array>();

async generateEmbedding(text: string, useCache = true): Promise<Float32Array> {
  const cacheKey = text.toLowerCase().trim();
  if (useCache && queryCache.has(cacheKey)) {
    return queryCache.get(cacheKey)!;
  }
  
  const embedding = await this.embedder!.embed(text);
  if (useCache && queryCache.size < 100) { // Limit cache size
    queryCache.set(cacheKey, embedding);
  }
  
  return embedding;
}
```

#### 7.2 Debounced Search

```typescript
// Debounce semantic search input (300ms)
const debouncedRAGSearch = useMemo(
  () => debounce((query: string) => {
    if (query.length > 2) {
      handleRAGSearch(query, false); // Search without generating answer
    }
  }, 300),
  []
);
```

#### 7.3 Batch Operations

```typescript
// Generate embeddings in background for existing solutions
// Process in small batches to avoid blocking UI
async function backgroundEmbeddingGeneration() {
  const solutions = await db.getAllSolutions();
  const withoutEmbeddings = solutions.filter(s => !s.embedding);
  
  // Process 5 at a time, with delays
  for (const solution of withoutEmbeddings) {
    if (shouldPause()) break; // Allow user to pause
    
    await embeddingService.generateEmbedding(solution.text);
    await new Promise(resolve => setTimeout(resolve, 100)); // Don't block
  }
}
```

---

## File Structure

```
src/
├── embeddings.ts           # MediaPipe embedding service
├── vector-search.ts        # Cosine similarity utilities
├── db.ts                   # Updated with semantic search
├── background.ts           # Updated with RAG handler
├── App.tsx                 # Updated with RAG UI
└── rag-components.tsx      # RAG-specific UI components
```

---

## Testing Strategy

### Unit Tests
- ✅ Embedding generation accuracy
- ✅ Cosine similarity calculations
- ✅ Vector search retrieval
- ✅ Context assembly

### Integration Tests
- ✅ End-to-end RAG flow
- ✅ Model loading and caching
- ✅ Fallback mechanisms
- ✅ Performance with 100+ solutions

### User Testing
- ✅ Query types: "How do I...", "What is...", "Show me..."
- ✅ Edge cases: No results, low similarity, model loading
- ✅ Performance: First search vs. subsequent searches
- ✅ Search mode switching

---

## Performance Targets

| Metric | Target |
|--------|--------|
| **Model Loading** | < 5 seconds (first time, cached after) |
| **Embedding Generation** | < 50ms per solution |
| **Vector Search** | < 30ms for 1000 solutions |
| **Answer Generation** | < 3 seconds (Chrome LanguageModel) |
| **Total RAG Query** | < 4 seconds (search + answer) |

---

## Migration Strategy

### For Existing Solutions

1. **Automatic on first use:**
   - Check for solutions without embeddings
   - Show progress indicator
   - Generate embeddings in background
   - Don't block UI

2. **Manual trigger:**
   - Add "Generate Embeddings" button in settings
   - Allow user to control when migration happens

3. **Progressive enhancement:**
   - New solutions: Embeddings generated automatically
   - Old solutions: Embeddings generated on-demand (when searched)

---

## Configuration Options

### User Preferences
```typescript
interface RAGSettings {
  defaultSearchMode: 'semantic' | 'keyword';
  similarityThreshold: number; // Default: 0.5
  topKResults: number; // Default: 5
  autoGenerateAnswer: boolean; // Default: false
  showSimilarityScores: boolean; // Default: true
}
```

---

## Success Metrics

1. **Relevance:** Do semantic results match user intent better than keywords?
2. **Speed:** Is search fast enough (< 4 seconds total)?
3. **Quality:** Are generated answers helpful and accurate?
4. **Adoption:** Are users using semantic search?
5. **Fallback:** Does keyword search work when semantic fails?

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Model download fails | Show clear error, fallback to keyword search |
| Slow performance | Debounce, cache, batch operations |
| Chrome compatibility | Test on multiple Chrome versions, handle errors gracefully |
| Embedding quality | Test with various queries, adjust threshold if needed |
| Context too long | Limit context size, prioritize top results |

---

## Implementation Timeline

- **Day 1:** Embedding infrastructure + storage
- **Day 2:** Vector search + RAG handler
- **Day 3:** UI integration (search input, results)
- **Day 4:** Error handling + optimization
- **Day 5:** Testing + refinement

**Total: ~1 week of focused development**

---

## Next Steps After Validation

1. ✅ Get your approval on this plan
2. ⏳ Add dependencies (`@mediapipe/tasks-text`)
3. ⏳ Implement embedding service
4. ⏳ Extend database schema
5. ⏳ Build RAG search handler
6. ⏳ Create UI components
7. ⏳ Test and refine

---

## Questions for Final Validation

1. **Similarity Threshold:** Default 0.5 (0-1 scale)? Adjustable by user?
2. **Top-K Results:** Default 5? User-configurable?
3. **Answer Generation:** Always show button, or auto-generate for semantic search?
4. **Similarity Scores:** Show to users or hide?
5. **Model Loading:** Show progress indicator or silent background load?

---

**Ready for your review and approval!** 🚀

