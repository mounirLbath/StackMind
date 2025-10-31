# RAG (Retrieval-Augmented Generation) Implementation Plan

## Overview

Implement semantic search using embeddings + vector similarity to find relevant solutions, then use Chrome's LanguageModel API to generate contextually-aware answers based on retrieved content.

## Architecture

```
User Query
    ↓
[Embedding Generation] → Vector (384-dim)
    ↓
[Vector Similarity Search] → Top-K Relevant Solutions
    ↓
[Context Assembly] → Combine retrieved solutions
    ↓
[Chrome LanguageModel API] → Generate Answer
    ↓
Display Result with Sources
```

## Implementation Options Analysis

### Option 1: transformers.js (Recommended ⭐)

**Pros:**
- ✅ Fully client-side (no external API calls)
- ✅ Privacy-preserving (embeddings stay local)
- ✅ Works offline
- ✅ Lightweight model: `all-MiniLM-L6-v2` (~22MB, 384 dimensions)
- ✅ Good performance for semantic search
- ✅ Active maintenance and browser-optimized

**Cons:**
- ⚠️ Initial model download (~22MB)
- ⚠️ Slight CPU usage during embedding generation
- ⚠️ Requires WebAssembly support

**Package:** `@xenova/transformers` (or `@huggingface/transformers`)

**Model:** `Xenova/all-MiniLM-L6-v2` (384 dimensions, optimized for search)

---

### Option 2: Chrome Embeddings API (If Available)

**Pros:**
- ✅ Native Chrome API (if exists)
- ✅ Optimized by browser
- ✅ No library dependency

**Cons:**
- ❌ May not be available (experimental/limited availability)
- ❌ Unclear API surface
- ❌ Less control over model choice

**Status:** Need to verify if this API exists and is accessible.

---

### Option 3: External Embedding API

**Pros:**
- ✅ No model download
- ✅ Always up-to-date models
- ✅ Zero local compute

**Cons:**
- ❌ Requires internet connection
- ❌ Privacy concerns (queries sent to external service)
- ❌ API costs (OpenAI, Cohere, etc.)
- ❌ Latency from network calls

**Services:** OpenAI `text-embedding-3-small`, Cohere Embed, etc.

---

## Recommended Approach: Hybrid Strategy

**Primary:** transformers.js with `all-MiniLM-L6-v2` model
**Fallback:** Keyword search if embeddings unavailable
**Generation:** Chrome LanguageModel API (already in use)

## Detailed Implementation Plan

### Phase 1: Embedding Infrastructure

#### 1.1 Add Dependencies
```bash
npm install @xenova/transformers
```

#### 1.2 Create Embedding Service (`src/embeddings.ts`)
- Initialize transformer model (lazy load on first use)
- Generate embeddings for text chunks
- Cache model in memory
- Handle model download progress

#### 1.3 Update Solution Schema
```typescript
interface Solution {
  // ... existing fields
  embedding?: Float32Array;  // 384-dimensional vector
  chunks?: {                  // For large solutions
    text: string;
    embedding: Float32Array;
  }[];
}
```

### Phase 2: Vector Storage

#### 2.1 Extend IndexedDB Schema (`src/db.ts`)
- Add `embeddings` object store (or extend existing)
- Store vectors as `Float32Array` or `Array<number>`
- Index by solution ID
- Add vector index for approximate nearest neighbor search

#### 2.2 Embedding Generation on Save
- When solution is saved, generate embedding
- Store embedding alongside solution
- Batch embedding generation for existing solutions (optional migration)

#### 2.3 Chunking Strategy (for large solutions)
- Split solutions > 1000 chars into chunks
- Generate embeddings per chunk
- Link chunks to parent solution

### Phase 3: Vector Search Implementation

#### 3.1 Cosine Similarity Function
```typescript
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  // Calculate dot product and magnitudes
  // Return similarity score (0-1)
}
```

#### 3.2 Similarity Search (`src/db.ts`)
```typescript
async semanticSearch(
  queryEmbedding: Float32Array,
  topK: number = 5,
  threshold: number = 0.5
): Promise<Solution[]>
```

#### 3.3 Hybrid Search (Optional Enhancement)
- Combine semantic search + keyword search
- Weight results: 70% semantic, 30% keyword
- Merge and re-rank results

### Phase 4: RAG Query Processing

#### 4.1 RAG Search Handler (`src/background.ts`)
```typescript
if (message.action === 'ragSearch') {
  // 1. Generate query embedding
  // 2. Perform semantic search
  // 3. Retrieve top-K solutions
  // 4. Assemble context
  // 5. Generate answer with LanguageModel API
  // 6. Return answer + sources
}
```

#### 4.2 Context Assembly
- Combine top-K solution texts
- Format with titles, summaries, code snippets
- Add metadata (tags, dates, URLs)
- Limit context to model's token limit

#### 4.3 Prompt Engineering
```
Based on the following solutions from your saved knowledge base:

[Solution 1: Title]
[Solution 1: Content]

[Solution 2: Title]
[Solution 2: Content]

...

User Question: {query}

Provide a comprehensive answer based on the retrieved solutions. 
If the solutions don't fully address the question, say so.
Include relevant code examples when applicable.
```

### Phase 5: UI Integration

#### 5.1 Add RAG Search Input (`src/App.tsx`)
- New search mode: "Semantic Search" toggle
- Query input with "Generate Answer" button
- Display answer with source citations

#### 5.2 Result Display
- Show generated answer prominently
- List retrieved solutions as sources
- Show similarity scores (optional)
- Allow navigation to source solutions

#### 5.3 Loading States
- Model loading indicator (first time)
- Embedding generation progress
- Search in progress
- Answer generation progress

### Phase 6: Performance Optimization

#### 6.1 Caching
- Cache query embeddings for common queries
- Cache model in IndexedDB (model persistence)
- Debounce search input

#### 6.2 Batch Operations
- Batch embedding generation for multiple solutions
- Background embedding generation for existing solutions
- Incremental updates

#### 6.3 Progressive Enhancement
- Start with keyword search (instant)
- Show loading for semantic search
- Display results as they become available

## Technical Specifications

### Embedding Model Details
- **Model:** `Xenova/all-MiniLM-L6-v2`
- **Dimensions:** 384
- **Model Size:** ~22MB
- **Max Tokens:** 256 (but can handle longer text)
- **Language:** Multilingual (optimized for English)
- **Use Case:** Semantic search, similarity matching

### Vector Storage Format
```typescript
// Store as Array<number> in IndexedDB (Float32Array not directly storable)
embedding: number[]  // 384 numbers
```

### Similarity Threshold
- **Default:** 0.5 cosine similarity
- **Top-K:** 5 solutions (configurable)
- **Fallback:** If < 3 results above threshold, include top 5 anyway

### Context Limits
- **Max Solutions:** 5-10 solutions
- **Max Chars per Solution:** 500-1000 chars
- **Total Context:** ~3000-5000 tokens (for Chrome LanguageModel)

## File Structure

```
src/
├── embeddings.ts          # Embedding generation service
├── vector-search.ts       # Vector similarity functions
├── db.ts                  # Updated with embedding storage
├── background.ts          # Updated with RAG handler
├── App.tsx                # Updated with RAG UI
└── rag-example.tsx        # RAG component example
```

## Implementation Steps (Order)

1. ✅ Add `@xenova/transformers` dependency
2. ✅ Create `src/embeddings.ts` service
3. ✅ Extend `Solution` interface with `embedding` field
4. ✅ Update `src/db.ts` to store/retrieve embeddings
5. ✅ Implement cosine similarity search
6. ✅ Add embedding generation to solution save flow
7. ✅ Create RAG search handler in `background.ts`
8. ✅ Build RAG UI component
9. ✅ Add progressive loading states
10. ✅ Test with various query types

## Testing Strategy

### Unit Tests
- Embedding generation accuracy
- Cosine similarity calculations
- Vector search retrieval
- Context assembly

### Integration Tests
- End-to-end RAG flow
- Model loading and caching
- Performance with 100+ solutions

### User Testing
- Query types: "How do I...", "What is...", "Show me..."
- Edge cases: No results, low similarity, very long solutions
- Performance: First search (model load) vs. subsequent searches

## Performance Targets

- **Model Loading:** < 5 seconds (first time, cached after)
- **Embedding Generation:** < 100ms per solution (text < 500 chars)
- **Vector Search:** < 50ms for 1000 solutions
- **Answer Generation:** < 3 seconds (using Chrome LanguageModel)

## Privacy & Security

- ✅ All embeddings generated client-side
- ✅ No data sent to external services
- ✅ Model cached locally
- ✅ Query history stays in browser (optional: user configurable)

## Fallback Strategy

1. **If transformers.js fails to load:**
   - Fall back to keyword search
   - Show message: "Semantic search unavailable, using keyword search"

2. **If embedding generation fails:**
   - Use existing full-text search
   - Log error for debugging

3. **If LanguageModel API unavailable:**
   - Return top-K solutions only
   - Show similarity scores
   - User reads solutions directly

## Future Enhancements

- [ ] Multi-modal search (code snippets prioritized)
- [ ] Re-ranking with cross-encoder model
- [ ] Query expansion (synonyms, related terms)
- [ ] Personalized search (learn from user clicks)
- [ ] Embedding fine-tuning on user data
- [ ] Support for code-specific embeddings (CodeBERT, etc.)
- [ ] Conversation history in RAG context
- [ ] Citation formatting (markdown links to sources)

## Dependencies to Add

```json
{
  "dependencies": {
    "@xenova/transformers": "^2.17.0"
  }
}
```

## Bundle Size Impact

- **transformers.js:** ~200KB gzipped (core)
- **Model (on-demand):** ~22MB (downloaded once, cached)
- **Total impact:** Minimal initial bundle, model loaded separately

## Questions for Validation

1. **Model Choice:** Is `all-MiniLM-L6-v2` acceptable for code/technical content? (Alternative: `sentence-transformers/all-mpnet-base-v2` - larger but more accurate)

2. **Chunking:** Should we chunk large solutions (>1000 chars) or use single embedding per solution?

3. **Search Mode:** Default to semantic search or make it opt-in?

4. **Answer Generation:** Always generate answer or show solutions first, then generate on demand?

5. **Privacy:** Are there any concerns with client-side embeddings? (All data stays local)

6. **Performance:** Acceptable to download 22MB model on first use? (Can be optimized with CDN, compression)

---

## Recommendation

**Go with Option 1 (transformers.js)** because:
- ✅ Best balance of privacy, performance, and functionality
- ✅ No external dependencies for embeddings
- ✅ Works offline
- ✅ Active development and browser optimization
- ✅ Can enhance later with better models or code-specific embeddings

**Phased Implementation:**
1. Start with basic semantic search (embedding + similarity)
2. Add RAG answer generation
3. Enhance with hybrid search, re-ranking, etc.

Would you like me to proceed with this implementation?

