# RAG Implementation - Validation Checklist

## ✅ Requirements Confirmed

- [x] **Embedding Strategy:** Single embedding per solution (simpler approach)
- [x] **Default Search Mode:** Semantic search (users can toggle to keyword)
- [x] **Embedding Library:** MediaPipe Tasks-Text (not transformers.js)

---

## 📋 Implementation Plan Summary

### Core Components

1. **Embedding Service** (`src/embeddings.ts`)
   - Uses `@mediapipe/tasks-text`
   - Universal Sentence Encoder Lite (~4MB, 512 dimensions)
   - Lazy initialization
   - Error handling with fallback

2. **Database Updates** (`src/db.ts`)
   - Add `embedding: number[]` field to Solution interface
   - Store embeddings in IndexedDB (as `number[]`)
   - Add `semanticSearch()` function
   - Keep existing `search()` for keyword fallback

3. **Vector Search** (`src/vector-search.ts`)
   - Cosine similarity calculation
   - Top-K retrieval
   - Similarity threshold filtering (default: 0.5)

4. **RAG Handler** (`src/background.ts`)
   - New message action: `ragSearch`
   - Supports both semantic and keyword modes
   - Generates answers using Chrome LanguageModel API
   - Returns solutions + optional generated answer

5. **UI Components** (`src/App.tsx`)
   - Search mode toggle (semantic/keyword)
   - RAG search input
   - Answer display with sources
   - Loading states

---

## 🎯 Key Design Decisions

### ✅ Confirmed Decisions

| Decision | Choice | Rationale |
|---------|--------|-----------|
| Embedding Library | MediaPipe Tasks-Text | Faster, smaller, Chrome-optimized |
| Embedding Strategy | Single per solution | Simpler, sufficient for most cases |
| Default Search | Semantic | Better user experience |
| Search Toggle | Opt-in keyword | Users can choose |
| Storage Format | `number[]` in IndexedDB | IndexedDB compatibility |

### ⚠️ Pending Your Input

| Question | Options | Recommendation |
|----------|---------|----------------|
| Similarity Threshold | 0.3 - 0.7 | **0.5** (balanced) |
| Top-K Results | 3, 5, 10 | **5** (good coverage) |
| Answer Generation | Always / On-demand | **On-demand button** (user control) |
| Show Similarity Scores | Yes / No | **Yes** (transparency) |
| Model Loading UX | Silent / Progress | **Progress indicator** (first time) |

---

## 📊 Implementation Phases

### Phase 1: Core Infrastructure (Day 1)
- [ ] Install `@mediapipe/tasks-text`
- [ ] Create `src/embeddings.ts` service
- [ ] Update Solution interface with `embedding` field
- [ ] Extend IndexedDB schema

**Files to create:**
- `src/embeddings.ts`
- `src/vector-search.ts`

**Files to modify:**
- `src/db.ts` (add embedding field, semanticSearch function)
- `src/background.ts` (add embedding generation on save)

### Phase 2: Search & Retrieval (Day 2)
- [ ] Implement cosine similarity
- [ ] Add semantic search function
- [ ] Test with sample data
- [ ] Add migration for existing solutions

**Files to modify:**
- `src/db.ts` (semanticSearch implementation)
- `src/vector-search.ts` (cosine similarity)

### Phase 3: RAG Generation (Day 2-3)
- [ ] Create RAG search handler
- [ ] Assemble context from retrieved solutions
- [ ] Integrate with Chrome LanguageModel
- [ ] Format and return answers

**Files to modify:**
- `src/background.ts` (ragSearch handler)
- New helper functions for context assembly

### Phase 4: UI Integration (Day 3-4)
- [ ] Add search mode toggle
- [ ] Create RAG search input
- [ ] Display answers with sources
- [ ] Loading states and error handling

**Files to modify:**
- `src/App.tsx` (UI components)

### Phase 5: Polish & Testing (Day 4-5)
- [ ] Error handling and fallbacks
- [ ] Performance optimization
- [ ] Testing and refinement
- [ ] Documentation

---

## 🔧 Technical Specifications

### Embedding Model
- **Library:** `@mediapipe/tasks-text`
- **Model:** Universal Sentence Encoder Lite
- **Size:** ~4MB
- **Dimensions:** 512
- **Format:** TFLite (TensorFlow Lite)
- **Model URL:** `https://storage.googleapis.com/mediapipe-tasks/text_embedder/universal_sentence_encoder.tflite`

### Storage
- **Field:** `embedding: number[]` (512 numbers)
- **Location:** Same IndexedDB store as solutions
- **Conversion:** `Float32Array` ↔ `number[]` for operations vs storage

### Search Parameters
- **Similarity Metric:** Cosine similarity
- **Default Threshold:** 0.5 (adjustable)
- **Default Top-K:** 5 (adjustable)
- **Fallback:** Keyword search if embedding fails

---

## 📝 API Changes

### New Message Actions

1. **`ragSearch`**
   ```typescript
   {
     action: 'ragSearch',
     query: string,
     searchMode: 'semantic' | 'keyword',
     generateAnswer?: boolean,
     topK?: number
   }
   ```
   Returns:
   ```typescript
   {
     success: boolean,
     solutions: Solution[],
     answer?: string, // If generateAnswer was true
     searchMode: 'semantic' | 'keyword'
   }
   ```

2. **`generateEmbeddingsForExisting`** (optional)
   - Triggers background embedding generation for existing solutions
   - Shows progress updates

### Updated Solution Interface
```typescript
interface Solution {
  // ... existing fields
  embedding?: number[]; // 512-dimensional vector
}
```

---

## 🎨 UI Components

### Search Mode Toggle
```
[○] Semantic Search (AI-powered)  ← Default
[ ] Keyword Search
```

### RAG Search Input
```
┌────────────────────────────────────────┐
│ Ask a question...                     │
│ [How do I handle async errors?]       │
└────────────────────────────────────────┘
[Search & Generate Answer]  [Search Only]
```

### Results Display
```
┌────────────────────────────────────────┐
│ AI-Generated Answer                   │
│ ──────────────────────────────────── │
│ Based on your solutions...            │
│ [Answer content]                      │
│                                        │
│ Based on 5 solution(s):                │
│ 1. React Error Handling (Relevance: 87%)│
│ 2. Async/Await Patterns (Relevance: 82%)│
└────────────────────────────────────────┘
```

---

## ⚠️ Potential Issues & Mitigations

| Issue | Mitigation |
|-------|------------|
| Model download fails | Show error, fallback to keyword search |
| Chrome compatibility | Test on multiple versions, handle errors |
| Slow embedding generation | Background processing, progress indicators |
| Context too long | Limit context size (500-1000 chars per solution) |
| Low similarity results | Adjust threshold, show top-K anyway with warning |

---

## 🧪 Testing Checklist

### Functional Tests
- [ ] Embedding generation works
- [ ] Semantic search returns relevant results
- [ ] Keyword search still works (fallback)
- [ ] Search mode toggle functions correctly
- [ ] Answer generation works with retrieved context
- [ ] Error handling works (model load failure, etc.)

### Performance Tests
- [ ] Model loads in < 5 seconds
- [ ] Embedding generation < 50ms per solution
- [ ] Search completes < 30ms for 1000 solutions
- [ ] Answer generation < 3 seconds

### User Experience Tests
- [ ] First-time model loading shows progress
- [ ] Search feels responsive
- [ ] Answers are helpful and relevant
- [ ] Fallback to keyword search is seamless
- [ ] UI is intuitive and clear

---

## 📦 Dependencies to Add

```json
{
  "dependencies": {
    "@mediapipe/tasks-text": "^latest"
  }
}
```

**Bundle Impact:**
- Core library: ~200KB gzipped
- Model: ~4MB (loaded separately, cached)
- Total initial: Minimal impact on bundle

---

## ✅ Final Validation Questions

Please confirm these choices:

1. **Similarity Threshold:** Default 0.5? (Show results with similarity ≥ 0.5)
   - [ ] 0.5 is good
   - [ ] Prefer higher (0.6-0.7) - fewer but more relevant
   - [ ] Prefer lower (0.3-0.4) - more results

2. **Top-K Results:** Default 5?
   - [ ] 5 is good
   - [ ] Prefer more (7-10)
   - [ ] Prefer fewer (3)

3. **Answer Generation:**
   - [ ] Button to generate answer (recommended)
   - [ ] Auto-generate for semantic search
   - [ ] Never auto-generate (always button)

4. **Similarity Scores:**
   - [ ] Show to users (recommended - transparency)
   - [ ] Hide (cleaner UI)

5. **Model Loading UX:**
   - [ ] Show progress indicator (recommended - first time)
   - [ ] Silent background load

---

## 🚀 Ready to Implement?

Once you confirm:
- ✅ All validation questions answered
- ✅ Plan looks good
- ✅ No concerns or changes needed

**I'll proceed with implementation in this order:**
1. Add dependencies
2. Create embedding service
3. Extend database
4. Implement semantic search
5. Add RAG handler
6. Build UI components
7. Test and refine

**Estimated Time:** ~1 week of focused development

---

**Please review and let me know:**
1. Any concerns or changes needed?
2. Answers to validation questions?
3. Ready to proceed?

