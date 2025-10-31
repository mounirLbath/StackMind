// Vector similarity utilities for semantic search

/**
 * Calculate cosine similarity between two vectors
 * @param a - First vector (Float32Array or number[])
 * @param b - Second vector (Float32Array or number[])
 * @returns Similarity score between -1 and 1 (higher = more similar)
 */
export function cosineSimilarity(
  a: Float32Array | number[],
  b: Float32Array | number[]
): number {
  const vecA = a instanceof Float32Array ? a : new Float32Array(a);
  const vecB = b instanceof Float32Array ? b : new Float32Array(b);
  
  if (vecA.length !== vecB.length) {
    throw new Error(`Vectors must have same length (got ${vecA.length} and ${vecB.length})`);
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

