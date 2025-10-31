// MediaPipe embedding service for generating text embeddings
// Uses Universal Sentence Encoder Lite model
// Documentation: https://ai.google.dev/edge/api/mediapipe/js/tasks-text.textembedder

import { TextEmbedder, FilesetResolver } from "@mediapipe/tasks-text";

class EmbeddingService {
  private embedder: TextEmbedder | null = null;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the TextEmbedder (lazy loading)
   * Silently initializes in background, no progress indicators
   */
  async initialize(): Promise<void> {
    if (this.embedder) return;
    if (this.isInitializing && this.initPromise) {
      return this.initPromise;
    }

    this.isInitializing = true;
    this.initPromise = this._doInitialize();
    
    try {
      await this.initPromise;
    } finally {
      this.isInitializing = false;
      this.initPromise = null;
    }
  }

  private async _doInitialize(): Promise<void> {
    // Use local WASM files (required for Chrome extension CSP compliance)
    // WASM files are copied to dist/wasm/ during build
    const wasmPath = chrome.runtime.getURL('wasm/');
    
    try {
      // Create WasmFileset using FilesetResolver.forTextTasks()
      // Documentation: https://ai.google.dev/edge/api/mediapipe/js/tasks-text.textembedder
      const wasmFileset = await FilesetResolver.forTextTasks(wasmPath);
      
      // Create TextEmbedder using createFromOptions
      this.embedder = await TextEmbedder.createFromOptions(wasmFileset, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-tasks/text_embedder/universal_sentence_encoder.tflite"
        },
        quantize: false // Use float embeddings for better precision
      });
    } catch (error) {
      console.error('Failed to initialize TextEmbedder with local WASM files:', error);
      console.error('WASM path used:', wasmPath);
      throw error;
    }
  }

  /**
   * Generate embedding for a single text
   * @param text - Text to embed (truncated to ~1000 chars for efficiency)
   * @returns Float32Array of 512 dimensions, or null if failed
   */
  async generateEmbedding(text: string): Promise<Float32Array | null> {
    try {
      if (!this.embedder) {
        await this.initialize();
      }

      if (!this.embedder) {
        console.error('TextEmbedder not available');
        return null;
      }

      // Truncate to first 1000 characters for efficiency
      // Universal Sentence Encoder handles variable lengths well
      const truncatedText = text.substring(0, 1000);
      
      // @ts-ignore - MediaPipe result type may vary
      const result = this.embedder.embed(truncatedText);
      
      if (result.embeddings && result.embeddings.length > 0) {
        // MediaPipe returns Embedding object with floatEmbedding or quantizedEmbedding
        const embedding = result.embeddings[0];
        
        // Check for floatEmbedding (preferred)
        if (embedding.floatEmbedding) {
          return new Float32Array(embedding.floatEmbedding);
        }
        
        // Check for quantizedEmbedding (if quantize: true was used)
        if (embedding.quantizedEmbedding) {
          // Convert quantized Uint8Array to float (0-255 scale to normalized)
          const quantized = embedding.quantizedEmbedding;
          const floatArray = new Float32Array(quantized.length);
          for (let i = 0; i < quantized.length; i++) {
            floatArray[i] = quantized[i] / 255.0;
          }
          return floatArray;
        }
        
        // Fallback: try direct access
        if (embedding instanceof Float32Array) {
          return embedding;
        } else if (Array.isArray(embedding)) {
          return new Float32Array(embedding);
        }
        
        console.warn('Unknown embedding format:', embedding);
        return null;
      }
      
      return null;
    } catch (error) {
      console.error('Error generating embedding:', error);
      return null;
    }
  }

  /**
   * Check if embedding service is available
   */
  isAvailable(): boolean {
    return this.embedder !== null;
  }

  /**
   * Check if service is currently initializing
   */
  isInitializingCheck(): boolean {
    return this.isInitializing;
  }
}

// Export singleton instance
export const embeddingService = new EmbeddingService();

