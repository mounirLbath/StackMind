// Background service worker for MindStack extension
// Handles extension lifecycle and message passing

console.log('===== BACKGROUND SCRIPT LOADED =====');

import { pipeline, env } from '@xenova/transformers';

// Configure transformers.js for Chrome extension
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/';
// Service workers are not cross-origin isolated, so multi-threaded WASM (which
// relies on SharedArrayBuffer/Atomics.wait) cannot be used. Force single-thread.
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.simd = true;
env.backends.onnx.wasm.proxy = false;

console.log('===== TRANSFORMERS IMPORTED =====');

// Global AI session for tag generation
let aiSession: any = null;
let isInitializingSession = false;

// Global Summarizer session
let summarizerSession: any = null;
let isInitializingSummarizer = false;

// Global Proofreader session
let proofreaderSession: any = null;
let isInitializingProofreader = false;

// Global Embedding model for semantic search
let embeddingModel: any = null;
let isInitializingEmbedding = false;

// Background tasks tracker
interface BackgroundTask {
  id: string;
  status: 'processing' | 'completed' | 'error';
  progress: {
    format: boolean;
    title: boolean;
    tags: boolean;
    summary: boolean;
    indexing: boolean;
  };
  pageTitle: string;
  startTime: number;
  notes?: string;
  // For displaying during processing
  generatedData?: {
    text: string;
    title: string;
    tags: string[];
    summary: string;
    url: string;
  };
}

let backgroundTasks: BackgroundTask[] = [];

// Helper function to notify popup and content scripts of updates
function notifyPopup(action: string, data: any = {}) {
  // Notify popup window
  chrome.runtime.sendMessage({ action, ...data }).catch(() => {
    // Popup might not be open, which is fine
  });
  
  // Also notify all tabs (for content scripts)
  chrome.tabs.query({}).then((tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { action, ...data }).catch(() => {
          // Tab might not have content script, which is fine
        });
      }
    });
  });
}

// Initialize AI session on startup
async function initializeAISession() {
  if (aiSession || isInitializingSession) return;
  
  isInitializingSession = true;
  
  try {
    // @ts-ignore - Chrome Prompt API is experimental
    const availability = await LanguageModel.availability();
    
    if (availability === 'unavailable') {
      isInitializingSession = false;
      return;
    }

    // @ts-ignore
    aiSession = await LanguageModel.create({
        initialPrompts: [],
      monitor(m: any) {
        m.addEventListener('downloadprogress', (e: any) => {
          console.log(`AI model: ${Math.round(e.loaded * 100)}%`);
        });
      },
    });
  } catch (error) {
    console.error('AI session init failed:', error);
    aiSession = null;
  } finally {
    isInitializingSession = false;
  }
}

// Initialize Summarizer session on startup
async function initializeSummarizer() {
  if (summarizerSession || isInitializingSummarizer) return;
  
  isInitializingSummarizer = true;
  
  try {
    // @ts-ignore - Chrome Summarizer API is experimental
    const availability = await Summarizer.availability();
    
    if (availability === 'unavailable') {
      isInitializingSummarizer = false;
      return;
    }

    // @ts-ignore
    summarizerSession = await Summarizer.create({
      type: 'tldr',
      format: 'markdown',
      length: 'short',
      outputLanguage: "en",
      monitor(m: any) {
        m.addEventListener('downloadprogress', (e: any) => {
          console.log(`Summarizer model: ${Math.round(e.loaded * 100)}%`);
        });
      }
    });
  } catch (error) {
    console.error('Summarizer init failed:', error);
    summarizerSession = null;
  } finally {
    isInitializingSummarizer = false;
  }
}

// Initialize Proofreader session on startup
async function initializeProofreader() {
  if (proofreaderSession || isInitializingProofreader) return;
  
  isInitializingProofreader = true;
  
  try {
    // Check if Proofreader API exists
    // @ts-ignore - Chrome Proofreader API is experimental
    if (typeof Proofreader === 'undefined') {
      console.log('Proofreader API not available (no origin trial token or flag not enabled)');
      isInitializingProofreader = false;
      return;
    }

    // @ts-ignore - Chrome Proofreader API is experimental
    const availability = await Proofreader.availability();
    
    if (availability === 'unavailable') {
      console.log('Proofreader API unavailable');
      isInitializingProofreader = false;
      return;
    }

    // @ts-ignore
    proofreaderSession = await Proofreader.create({
      expectedInputLanguages: ['en'],
      monitor(m: any) {
        m.addEventListener('downloadprogress', (e: any) => {
          console.log(`Proofreader model: ${Math.round(e.loaded * 100)}%`);
        });
      }
    });
    console.log('Proofreader session initialized successfully');
  } catch (error) {
    console.log('Proofreader init failed (this is normal if no origin trial token):', error);
    proofreaderSession = null;
  } finally {
    isInitializingProofreader = false;
  }
}

// Initialize Embedding model for semantic search
async function initializeEmbeddingModel() {
  if (embeddingModel || isInitializingEmbedding) {
    console.log('[Embedding] Model already initialized or initializing');
    return;
  }
  
  isInitializingEmbedding = true;
  console.log('[Embedding] Starting model initialization...');
  
  try {
    // Use a lightweight model optimized for semantic similarity
    embeddingModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('[Embedding] Model initialized successfully');
  } catch (error) {
    console.error('[Embedding] Model init failed:', error);
    embeddingModel = null;
  } finally {
    isInitializingEmbedding = false;
  }
}

// Generate embedding from text
async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    console.log('[Embedding] Generating embedding for text of length:', text.length);
    
    if (!embeddingModel && !isInitializingEmbedding) {
      console.log('[Embedding] Model not initialized, initializing now...');
      await initializeEmbeddingModel();
    }
    
    let waitCount = 0;
    while (isInitializingEmbedding && waitCount < 100) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waitCount++;
    }
    
    if (!embeddingModel) {
      console.error('[Embedding] Model not available after initialization');
      return null;
    }

    console.log('[Embedding] Running model...');
    // Generate embedding
    const output = await embeddingModel(text, { pooling: 'mean', normalize: true });
    
    // Convert to regular array
    const embedding = Array.from(output.data);
    console.log('[Embedding] Generated embedding with', embedding.length, 'dimensions');
    return embedding as number[];
  } catch (error) {
    console.error('[Embedding] Generation error:', error);
    return null;
  }
}

// Compute cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Keep service worker alive during background processing
let keepAliveInterval: number | null = null;

function startKeepAlive() {
  if (keepAliveInterval) return;
  
  keepAliveInterval = setInterval(() => {
    // Ping to keep service worker alive
    chrome.runtime.getPlatformInfo(() => {
      // Just checking connection
    });
  }, 20000); // Every 20 seconds
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

// Initialize on extension load (when service worker starts)
console.log('[Background] Service worker starting...');
initializeAISession();
initializeSummarizer();
initializeProofreader();
// Don't initialize embedding model on startup - it's heavy, do it on demand
// initializeEmbeddingModel();

// Initialize when Chrome browser starts
chrome.runtime.onStartup.addListener(() => {
  console.log('[Background] Chrome browser starting...');
  initializeAISession();
  initializeSummarizer();
  initializeProofreader();
  // initializeEmbeddingModel();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] Extension installed/updated');
  
  // Initialize storage if needed
  chrome.storage.local.get(['solutions'], (result) => {
    if (!result.solutions) {
      console.log('[Background] Initializing empty solutions array');
      chrome.storage.local.set({ solutions: [] });
    } else {
      console.log('[Background] Found', result.solutions.length, 'existing solutions');
    }
  });
  
  // Initialize AI session
  initializeAISession();
  initializeSummarizer();
  initializeProofreader();
  // Don't initialize embedding model immediately - do it on demand
  // initializeEmbeddingModel();
  
  // Migrate existing solutions to add embeddings (run in background, don't block)
  setTimeout(() => {
    console.log('[Background] Starting migration in background...');
    migrateExistingSolutions();
  }, 5000); // Wait 5 seconds before starting migration
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  
    if (message.action === 'getSolutions') {
    console.log('[Background] Getting solutions...');
    chrome.storage.local.get(['solutions'], (result) => {
      console.log('[Background] Retrieved solutions:', result.solutions?.length || 0);
      sendResponse({ solutions: result.solutions || [] });
    });
    return true; // Keep channel open for async response
  }

  if (message.action === 'deleteSolution') {
    chrome.storage.local.get(['solutions'], (result) => {
      const solutions = result.solutions || [];
      const filtered = solutions.filter((s: any) => s.id !== message.id);
      chrome.storage.local.set({ solutions: filtered }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.action === 'clearAllSolutions') {
    chrome.storage.local.set({ solutions: [] }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'updateSolution') {
    chrome.storage.local.get(['solutions'], (result) => {
      const solutions = result.solutions || [];
      const updated = solutions.map((s: any) => 
        s.id === message.id ? { ...s, ...message.updates } : s
      );
      chrome.storage.local.set({ solutions: updated }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.action === 'generateTags') {
    (async () => {
      try {
        // Initialize session if not already done
        if (!aiSession && !isInitializingSession) {
          await initializeAISession();
        }
        
        // Wait for session to be ready if it's initializing
        let waitCount = 0;
        while (isInitializingSession && waitCount < 100) {
          await new Promise(resolve => setTimeout(resolve, 100));
          waitCount++;
        }
        
        if (isInitializingSession) {
          sendResponse({ 
            success: false, 
            error: 'AI initialization timeout. Try again.' 
          });
          return;
        }
        
        if (!aiSession) {
          sendResponse({ 
            success: false, 
            error: 'AI not available. Enable Chrome Prompt API.' 
          });
          return;
        }

        const promptText = `Generate 3-5 concise, relevant tags based on the solution content. Return only the tags separated by commas, no explanation.
    Generate tags for this programming solution:

    Title: ${message.title}

    Solution: ${message.text}...

    Generate 3-5 relevant tags (e.g., javascript, react, error-handling, async):`;
        
        const result = await aiSession.prompt(promptText);
        
        // Parse the tags
        const tags = result.split(',')
          .map((tag: string) => tag.trim().toLowerCase())
          .filter((tag: string) => tag.length > 0);
        
        sendResponse({ success: true, tags });
      } catch (error) {
        console.error('Tag generation error:', error);
        
        // Reset session on error and try to reinitialize
        aiSession = null;
        initializeAISession();
        
        sendResponse({ 
          success: false, 
          error: `Failed: ${(error as Error).message}` 
        });
      }
    })();
    return true; // Keep the message channel open for async response
  }

  if (message.action === 'generateTitle') {
    (async () => {
      try {
        if (!aiSession && !isInitializingSession) {
          await initializeAISession();
        }
        
        let waitCount = 0;
        while (isInitializingSession && waitCount < 100) {
          await new Promise(resolve => setTimeout(resolve, 100));
          waitCount++;
        }
        
        if (!aiSession) {
          sendResponse({ success: false, error: 'AI not available.' });
          return;
        }

        const promptText = `Generate a concise, descriptive title (max 60 characters) for this programming solution. Return ONLY the title, no quotes or explanations.

Page Title: ${message.pageTitle}

Solution Content: ${message.text.substring(0, 500)}...

Generate title:`;
        
        const title = await aiSession.prompt(promptText);
        
        sendResponse({ success: true, title: title.trim().replace(/^["']|["']$/g, '') });
      } catch (error) {
        console.error('Title generation error:', error);
        aiSession = null;
        initializeAISession();
        sendResponse({ success: false, error: `Failed: ${(error as Error).message}` });
      }
    })();
    return true;
  }

  if (message.action === 'formatText') {
    (async () => {
      try {
        // Initialize session if not already done
        if (!aiSession && !isInitializingSession) {
          await initializeAISession();
        }
        
        // Wait for session to be ready if it's initializing
        let waitCount = 0;
        while (isInitializingSession && waitCount < 100) {
          await new Promise(resolve => setTimeout(resolve, 100));
          waitCount++;
        }
        
        if (!aiSession) {
          sendResponse({ success: false, error: 'AI not available.' });
          return;
        }

        const prompt = `Format this text by wrapping code snippets in backticks (\`code\`) for inline code or triple backticks (\`\`\`code\`\`\`) for code blocks. Keep the EXACT same text, just add markdown code formatting where appropriate. Do not summarize or change the content:\n\n${message.text}`;
        
        const formatted = await aiSession.prompt(prompt);
        
        sendResponse({ success: true, formatted: formatted.trim() });
      } catch (error) {
        console.error('Text formatting error:', error);
        
        // Reset session on error
        aiSession = null;
        initializeAISession();
        
        sendResponse({ success: false, error: `Failed: ${(error as Error).message}` });
      }
    })();
    return true;
  }

  if (message.action === 'summarizeText') {
    (async () => {
      try {
        // Initialize session if not already done
        if (!summarizerSession && !isInitializingSummarizer) {
          await initializeSummarizer();
        }
        
        // Wait for session to be ready if it's initializing
        let waitCount = 0;
        while (isInitializingSummarizer && waitCount < 100) {
          await new Promise(resolve => setTimeout(resolve, 100));
          waitCount++;
        }
        
        if (!summarizerSession) {
          sendResponse({ success: false, error: 'Summarizer not available.' });
          return;
        }

        const summary = await summarizerSession.summarize(message.text, {
        //   context: 'Focus on preserving code snippets and technical details while removing redundant explanations.'
        });
        
        sendResponse({ success: true, summary: summary.trim() });
      } catch (error) {
        console.error('Summarization error:', error);
        
        // Reset session on error and try to reinitialize
        summarizerSession = null;
        initializeSummarizer();
        
        sendResponse({ success: false, error: `Failed: ${(error as Error).message}` });
      }
    })();
    return true;
  }

  if (message.action === 'proofreadText') {
    (async () => {
      try {
        // Check if Proofreader API is available in the browser
        // @ts-ignore
        if (typeof Proofreader === 'undefined') {
          sendResponse({ 
            success: false, 
            error: 'Proofreader API not available. Enable chrome://flags/#proofreader-api-for-gemini-nano and chrome://flags/#optimization-guide-on-device-model, then restart Chrome.',
            notAvailable: true
          });
          return;
        }

        // Initialize session if not already done
        if (!proofreaderSession && !isInitializingProofreader) {
          await initializeProofreader();
        }
        
        // Wait for session to be ready if it's initializing
        let waitCount = 0;
        while (isInitializingProofreader && waitCount < 100) {
          await new Promise(resolve => setTimeout(resolve, 100));
          waitCount++;
        }
        
        if (!proofreaderSession) {
          sendResponse({ 
            success: false, 
            error: 'Proofreader not available. See PROOFREADER_SETUP.md for setup instructions.',
            notAvailable: true
          });
          return;
        }

        const proofreadResult = await proofreaderSession.proofread(message.text);
        
        console.log('Proofread result:', proofreadResult);
        
        // Extract the corrected text and corrections
        // The API returns 'correctedInput' property with the fixed text
        const correctedText = proofreadResult.correctedInput || message.text;
        const corrections = proofreadResult.corrections || [];
        
        sendResponse({ 
          success: true, 
          correctedText: correctedText,
          corrections: corrections,
          hasCorrections: corrections.length > 0
        });
      } catch (error) {
        console.error('Proofreading error:', error);
        
        // Reset session on error and try to reinitialize
        proofreaderSession = null;
        initializeProofreader();
        
        sendResponse({ 
          success: false, 
          error: `Proofreader failed: ${(error as Error).message}. Check console for details.` 
        });
      }
    })();
    return true;
  }

  if (message.action === 'getBackgroundTasks') {
    sendResponse({ tasks: backgroundTasks });
    return true;
  }

  if (message.action === 'openExtensionWindow') {
    // Open the extension in a popup window
    let url = chrome.runtime.getURL('index.html');
    // Add solutionId to URL if provided
    if (message.solutionId) {
      url += `#solution=${message.solutionId}`;
    }
    chrome.windows.create({
      url: url,
      type: 'popup',
      width: 1000,
      height: 700
    });
    sendResponse({ success: true });
    return false; // No async response needed
  }

  if (message.action === 'openPopup') {
    // Send message to content script to show capture panel
    // Get the tab ID from sender if available, otherwise get active tab
    const sendToTab = (tabId: number) => {
      chrome.tabs.sendMessage(tabId, {
        action: 'showCapturePanel',
        taskId: message.taskId
      });
    };

    if (_sender.tab?.id) {
      // Message came from content script
      sendToTab(_sender.tab.id);
      sendResponse({ success: true });
    } else {
      // Message came from popup, find the active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          sendToTab(tabs[0].id);
        }
        sendResponse({ success: true });
      });
    }
    return true;
  }

  if (message.action === 'getTaskStatus') {
    const task = backgroundTasks.find(t => t.id === message.taskId);
    sendResponse({ task });
    return true;
  }

  if (message.action === 'updateTaskNotes') {
    // Find the task and update its notes
    const task = backgroundTasks.find(t => t.id === message.taskId);
    if (task) {
      task.notes = message.notes;
      // Notify all listeners that task was updated
      notifyPopup('backgroundTaskUpdate', { taskId: message.taskId });
    }
    sendResponse({ success: true });
    return false; // No async response needed
  }

  if (message.action === 'processInBackground') {
    (async () => {
      const { selectedText, url, pageTitle, currentTags, currentTitle, currentSummary, isFormatted, notes, taskId: providedTaskId } = message;
      const sourceTabId = _sender.tab?.id; // Save the tab ID where the request came from
      
      // Start keep-alive to prevent service worker from sleeping
      startKeepAlive();
      
      const taskId = providedTaskId || Date.now().toString();
      const task: BackgroundTask = {
        id: taskId,
        status: 'processing',
        progress: {
          format: !!isFormatted,
          title: !!currentTitle,
          tags: !!(currentTags && currentTags.length > 0),
          summary: !!currentSummary,
          indexing: false
        },
        pageTitle: pageTitle || 'Unknown Page',
        startTime: Date.now()
      };
      
      backgroundTasks.push(task);
      notifyPopup('backgroundTaskUpdate', { taskId, progress: task.progress });
      
      try {
        // Process any missing AI tasks
        const results: any = {
          title: currentTitle,
          tags: currentTags || [],
          summary: currentSummary,
          text: selectedText
        };

        // Initialize generatedData for progressive display
        task.generatedData = {
          text: selectedText,
          title: currentTitle || '',
          tags: currentTags || [],
          summary: currentSummary || '',
          url: url
        };

        // Format text with code backticks (only if not already formatted)
        if (!isFormatted) {
          try {
            if (!aiSession) await initializeAISession();
            if (aiSession) {
              const formatPrompt = `Format this text by wrapping code snippets in backticks (\`code\`) for inline code or triple backticks (\`\`\`code\`\`\`) for code blocks. Keep the EXACT SAME TEXT, just add markdown code formatting where appropriate. DO NOT SUMMARIZE OR CHANGE THE CONTENT:\n\n${selectedText}`;
              const formatted = await aiSession.prompt(formatPrompt);
              results.text = formatted.trim();
              task.generatedData.text = formatted.trim();
              task.progress.format = true;
              notifyPopup('backgroundTaskUpdate', { taskId, progress: task.progress });
            }
          } catch (error) {
            console.error('Background text formatting failed:', error);
            // Even if formatting fails, mark it as done so we don't block
            task.progress.format = true;
            notifyPopup('backgroundTaskUpdate', { taskId, progress: task.progress });
          }
        }

        // Generate title if missing
        if (!currentTitle) {
          try {
            if (!aiSession) await initializeAISession();
            if (aiSession) {
              const titlePrompt = `You are a title generator. Generate ONE concise technical title (max 10 words) for this Stack Overflow solution. Output ONLY the title text, no explanations, no quotes, no additional text.

Page: ${pageTitle}

Content: ${selectedText.substring(0, 500)}

Title:`;
              const generatedTitle = await aiSession.prompt(titlePrompt);
              results.title = generatedTitle.trim().replace(/^["']|["']$/g, '').split('\n')[0];
              task.generatedData.title = results.title;
              task.progress.title = true;
              notifyPopup('backgroundTaskUpdate', { taskId, progress: task.progress });
            }
          } catch (error) {
            console.error('Background title generation failed:', error);
          }
        }

        // Generate tags if missing
        if (!currentTags || currentTags.length === 0) {
          try {
            if (!aiSession) await initializeAISession();
            if (aiSession) {
              const tagsPrompt = `Generate 3-5 relevant technical tags (keywords) for this Stack Overflow solution. Return ONLY a comma-separated list of tags, nothing else:\n\n${selectedText.substring(0, 500)}`;
              const generatedTags = await aiSession.prompt(tagsPrompt);
              results.tags = generatedTags.toLowerCase().split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0);
              task.generatedData.tags = results.tags;
              task.progress.tags = true;
              notifyPopup('backgroundTaskUpdate', { taskId, progress: task.progress });
            }
          } catch (error) {
            console.error('Background tag generation failed:', error);
          }
        }

        // Generate summary if missing
        if (!currentSummary) {
          try {
            if (!summarizerSession) await initializeSummarizer();
            if (summarizerSession) {
              const summary = await summarizerSession.summarize(selectedText);
              results.summary = summary.trim();
              task.generatedData.summary = results.summary;
              task.progress.summary = true;
              notifyPopup('backgroundTaskUpdate', { taskId, progress: task.progress });
            }
          } catch (error) {
            console.error('Background summary generation failed:', error);
          }
        }

        // Generate embedding for semantic search (indexing step)
        let embedding: number[] | null = null;
        try {
          console.log(`[Background] Generating embedding for task ${taskId}...`);
          // Combine all text for embedding
          const textToEmbed = [
            results.title || '',
            results.summary || '',
            results.text,
            notes || ''
          ].filter(t => t.trim()).join(' ');
          
          embedding = await generateEmbedding(textToEmbed);
          task.progress.indexing = true;
          notifyPopup('backgroundTaskUpdate', { taskId, progress: task.progress });
          console.log(`[Background] Embedding generated successfully for task ${taskId}`);
        } catch (error) {
          console.error(`[Background] Embedding generation failed for task ${taskId}:`, error);
          // Continue even if embedding fails - mark as complete to avoid blocking
          task.progress.indexing = true;
          notifyPopup('backgroundTaskUpdate', { taskId, progress: task.progress });
        }

        // Get notes from the task if they were updated
        const taskNotes = task.notes || notes;
        
        // Auto-save the solution when processing completes
        const solution = {
          id: Date.now().toString(),
          text: results.text,
          summary: results.summary,
          url: url,
          title: results.title || pageTitle || 'Untitled Solution',
          timestamp: Date.now(),
          tags: results.tags,
          notes: taskNotes || '',
          embedding: embedding || undefined,
          embeddingVersion: embedding ? 'all-MiniLM-L6-v2' : undefined
        };

        const storageResult = await chrome.storage.local.get(['solutions']);
        const solutions = storageResult.solutions || [];
        solutions.unshift(solution);
        await chrome.storage.local.set({ solutions });
        
        // Remove task from background tasks
        backgroundTasks = backgroundTasks.filter(t => t.id !== taskId);
        
        // Notify that the task is complete and saved
        notifyPopup('backgroundTaskComplete', { pageTitle: task.pageTitle, taskId: taskId });
        
        // Show success notification in the source tab
        if (sourceTabId) {
          chrome.tabs.sendMessage(sourceTabId, {
            action: 'showCompletionNotification',
            title: results.title || pageTitle || 'Untitled Solution'
          }).catch(() => {});
        }
        
        // Stop keep-alive
        stopKeepAlive();

      } catch (error) {
        console.error('Background processing error:', error);
        task.status = 'error';
        notifyPopup('backgroundTaskUpdate', { taskId, progress: task.progress });
        
        // Show error notification in tab if available
        if (sourceTabId) {
          chrome.tabs.sendMessage(sourceTabId, {
            action: 'showCompletionNotification',
            title: 'Failed to process solution'
          }).catch(() => {});
        }
        
        chrome.notifications.create({
          type: 'basic',
          title: 'MindStack',
          message: 'Failed to process solution in background',
          iconUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="75" font-size="75">✗</text></svg>',
          priority: 2
        });
        
        // Stop keep-alive
        stopKeepAlive();
      }
    })();
    return true;
  }

    if (message.action === 'searchSolutions') {
    // Run search in background and notify when complete
    
    (async () => {
      try {
        const { searchQuery, searchMode, showOverlay = true } = message;
        
        const normalizedQuery = searchQuery.trim();
        
        if (!normalizedQuery) {
          sendResponse({ success: false, error: 'No search query provided', matches: [] });
          return;
        }

        // Search solutions with the specified mode
        const matches = await searchSolutions(normalizedQuery, searchMode || 'keyword');
        
        // Always respond to caller (popup or content script)
        sendResponse({ success: true, matches, keywords: normalizedQuery.toLowerCase() });
        
        // Also notify the active tab if matches found (even if user navigated away)
        if (showOverlay && matches.length > 0) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (activeTab?.id) {
              chrome.tabs.sendMessage(activeTab.id, {
                action: 'showSearchMatches',
                matches: matches,
                searchQuery: normalizedQuery,
                keywords: normalizedQuery.toLowerCase()
              }).catch(() => {
                // Tab might not have content script, ignore
              });
            }
          });
        }
      } catch (error) {
        console.error('Search error:', error);
        // Ensure we always send a response, even on error
        try {
          sendResponse({ success: false, error: (error as Error).message, matches: [] });
        } catch (responseError) {
          console.error('Failed to send error response:', responseError);
        }
      }
    })();
    return true; // Keep channel open for async response
  }
});

// Search solutions with keyword or semantic mode
async function searchSolutions(query: string, searchMode: 'keyword' | 'semantic' = 'keyword'): Promise<any[]> {
  try {
    const storageResult = await chrome.storage.local.get(['solutions']);
    const solutions = storageResult.solutions || [];
    
    if (!query || !query.trim()) {
      return [];
    }
    
    if (searchMode === 'semantic') {
      return await searchSolutionsSemantic(query, solutions);
    } else {
      return searchSolutionsKeyword(query, solutions);
    }
  } catch (error) {
    console.error('Search solutions error:', error);
    return [];
  }
}

// Keyword-based search (original logic)
function searchSolutionsKeyword(query: string, solutions: any[]): any[] {
  // Split keywords by space and filter out empty strings
  const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 0);
  
  // If no valid keywords, return empty
  if (keywords.length === 0) {
    return [];
  }
  
  // Search for solutions that match ANY of the keywords
  // Also check if the full query string matches (for exact phrase matches)
  const lowerQuery = query.toLowerCase();
  
  const filtered = solutions.filter((s: any) => {
    const textLower = s.text.toLowerCase();
    const titleLower = s.title.toLowerCase();
    const notesLower = s.notes ? s.notes.toLowerCase() : '';
    const summaryLower = s.summary ? s.summary.toLowerCase() : '';
    const tagsLower = s.tags ? s.tags.map((tag: string) => tag.toLowerCase()) : [];
    
    // First check for exact phrase match (full query string)
    if (textLower.includes(lowerQuery) || 
        titleLower.includes(lowerQuery) || 
        notesLower.includes(lowerQuery) || 
        summaryLower.includes(lowerQuery)) {
      return true;
    }
    
    // Then check if any keyword matches
    return keywords.some(keyword => 
      textLower.includes(keyword) ||
      titleLower.includes(keyword) ||
      notesLower.includes(keyword) ||
      summaryLower.includes(keyword) ||
      tagsLower.some((tag: string) => tag.includes(keyword))
    );
  });
  
  return filtered;
}

// Semantic search using embeddings
async function searchSolutionsSemantic(query: string, solutions: any[]): Promise<any[]> {
  try {
    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query);
    
    if (!queryEmbedding) {
      console.warn('Failed to generate query embedding, falling back to keyword search');
      return searchSolutionsKeyword(query, solutions);
    }
    
    // Compute similarity scores for all solutions with embeddings
    const SIMILARITY_THRESHOLD = 0.1; // Lower threshold for debugging more matches
    const resultsWithScores: Array<{ solution: any; score: number }> = [];
    
    for (const solution of solutions) {
      if (solution.embedding && Array.isArray(solution.embedding)) {
        const score = cosineSimilarity(queryEmbedding, solution.embedding);
        console.log('[Semantic] Similarity', score.toFixed(4), '→', solution.title || '[untitled]');
        if (score >= SIMILARITY_THRESHOLD) {
          resultsWithScores.push({ solution, score });
        }
      }
    }
    
    // Sort by similarity score (descending - highest similarity first)
    resultsWithScores.sort((a, b) => b.score - a.score);
    
    // Log sorted order for debugging
    console.log('[Semantic] Sorted results (highest similarity first):', 
      resultsWithScores.map(r => `${r.score.toFixed(4)} → ${r.solution.title || '[untitled]'}`).join(', '));
    
    // Return just the solutions (already sorted with highest similarity first)
    return resultsWithScores.map(r => r.solution);
  } catch (error) {
    console.error('Semantic search error:', error);
    // Fallback to keyword search on error
    return searchSolutionsKeyword(query, solutions);
  }
}

// Migrate existing solutions to add embeddings
async function migrateExistingSolutions() {
  try {
    console.log('[Migration] Starting migration: adding embeddings to existing solutions...');
    
    const storageResult = await chrome.storage.local.get(['solutions']);
    const solutions = storageResult.solutions || [];
    
    // Find solutions without embeddings
    const solutionsNeedingEmbeddings = solutions.filter((s: any) => !s.embedding);
    
    if (solutionsNeedingEmbeddings.length === 0) {
      console.log('[Migration] No solutions need embedding migration');
      return;
    }
    
    console.log(`[Migration] Migrating ${solutionsNeedingEmbeddings.length} solutions...`);
    
    // Process solutions one at a time to avoid overwhelming the system
    let migrated = 0;
    let failed = 0;
    
    for (const solution of solutions) {
      if (!solution.embedding) {
        try {
          // Combine text for embedding
          const textToEmbed = [
            solution.title || '',
            solution.summary || '',
            solution.text,
            solution.notes || ''
          ].filter(t => t.trim()).join(' ');
          
          console.log(`[Migration] Processing solution ${solution.id}...`);
          const embedding = await generateEmbedding(textToEmbed);
          
          if (embedding) {
            solution.embedding = embedding;
            solution.embeddingVersion = 'all-MiniLM-L6-v2';
            migrated++;
            console.log(`[Migration] Successfully migrated solution ${solution.id} (${migrated}/${solutionsNeedingEmbeddings.length})`);
          } else {
            failed++;
            console.warn(`[Migration] Failed to generate embedding for solution ${solution.id}`);
          }
          
          // Save after each successful migration to avoid data loss
          if (migrated % 5 === 0) {
            await chrome.storage.local.set({ solutions });
            console.log(`[Migration] Checkpoint: saved ${migrated} solutions`);
          }
          
          // Add small delay to avoid overloading
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          failed++;
          console.error(`[Migration] Failed to process solution ${solution.id}:`, error);
        }
      }
    }
    
    // Save final updated solutions
    await chrome.storage.local.set({ solutions });
    console.log(`[Migration] Complete: ${migrated} solutions updated, ${failed} failed`);
  } catch (error) {
    console.error('[Migration] Critical error:', error);
  }
}

// Context menu for right-click capture (optional enhancement)
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'capture-solution',
    title: 'Capture as Solution',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'capture-solution' && info.selectionText) {
    // Send message to content script to handle capture
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'captureFromContextMenu',
        text: info.selectionText
      });
    }
  }
});

// Detect Google searches and trigger background search
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  // Only process when URL changes and page is fully loaded
  if (changeInfo.status !== 'complete' || !tab.url) {
    return;
  }

  try {
    const url = new URL(tab.url);
    const hostname = url.hostname.toLowerCase();
    
    // Check if this is a Google search results page
    if ((hostname.includes('google.com') || hostname.includes('google.')) && url.pathname === '/search') {
      // Check if Google Search notifications are enabled
      chrome.storage.local.get(['googleSearchEnabled'], (result) => {
        const enabled = result.googleSearchEnabled !== undefined ? result.googleSearchEnabled : false;
        
        // Only proceed if Google Search notifications are enabled
        if (!enabled) {
          return;
        }
        
        const searchParams = url.searchParams;
        const query = searchParams.get('q');
        
        if (query && query.trim()) {
          // Run search directly in background (don't use sendMessage to self)
          (async () => {
            try {
              const normalizedQuery = query.trim();
              
              // Search solutions
              const matches = await searchSolutions(normalizedQuery, 'semantic');
              
              // Notify the active tab if matches found
              if (matches.length > 0) {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                  const activeTab = tabs[0];
                  if (activeTab?.id) {
                    chrome.tabs.sendMessage(activeTab.id, {
                      action: 'showSearchMatches',
                      matches: matches,
                      searchQuery: normalizedQuery,
                      keywords: normalizedQuery.toLowerCase()
                    }).catch(() => {
                      // Tab might not have content script, ignore
                    });
                  }
                });
              }
            } catch (error) {
              console.error('Background search error:', error);
            }
          })();
        }
      });
    }
  } catch (error) {
    // Not a valid URL or not a Google search, ignore
  }
});

// Omnibox handler - triggers when user types "ms " in address bar
chrome.omnibox.onInputEntered.addListener((text, disposition) => {
  if (!text.trim()) return;
  
  // Run search directly in background
  (async () => {
    try {
      const normalizedQuery = text.trim();
      
      // Search solutions
      const matches = await searchSolutions(normalizedQuery, 'semantic');
      
      // Notify the active tab if matches found
      if (matches.length > 0) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const activeTab = tabs[0];
          if (activeTab?.id) {
            chrome.tabs.sendMessage(activeTab.id, {
              action: 'showSearchMatches',
              matches: matches,
              searchQuery: normalizedQuery,
              keywords: normalizedQuery.toLowerCase()
            }).catch(() => {
              // Tab might not have content script, ignore
            });
          }
        });
      }
    } catch (error) {
      console.error('Omnibox search error:', error);
    }
  })();
  
  const url = chrome.runtime.getURL('index.html');
  
  // Open extension window to view results
  if (disposition === 'newForegroundTab' || disposition === 'newBackgroundTab') {
    chrome.tabs.create({ url });
  } else {
    // Current tab - get active tab and update it
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.update(tabs[0].id, { url });
      } else {
        chrome.tabs.create({ url });
      }
    });
  }
});

