// Background service worker for MindStack extension
// Handles extension lifecycle and message passing

import MiniSearch from 'minisearch';

// Global AI session for tag generation
let aiSession: any = null;
let isInitializingSession = false;

// Global Summarizer session
let summarizerSession: any = null;
let isInitializingSummarizer = false;

// Global Proofreader session
let proofreaderSession: any = null;
let isInitializingProofreader = false;

// Console Recall: Minisearch index for note matching
let searchIndex: MiniSearch<any> | null = null;
let isIndexInitializing = false;

// Console Recall: Track attached tabs (tabId -> true)
const attachedTabs = new Map<number, boolean>();

// Console Recall: Enable/disable flag (default: true)
let consoleRecallEnabled = true;

// Background tasks tracker
interface BackgroundTask {
  id: string;
  status: 'processing' | 'completed' | 'error';
  progress: {
    format: boolean;
    title: boolean;
    tags: boolean;
    summary: boolean;
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

// Console Recall: Initialize search index with notes
async function initializeSearchIndex() {
  if (searchIndex || isIndexInitializing) return;
  
  isIndexInitializing = true;
  
  try {
    const storageResult = await chrome.storage.local.get(['solutions']);
    const solutions = storageResult.solutions || [];
    
    searchIndex = new MiniSearch({
      fields: ['title', 'text', 'notes', 'summary', 'tags'], // fields to index
      storeFields: ['id', 'title'], // fields to return with results
      searchOptions: {
        boost: { title: 2, text: 1, notes: 1.5, summary: 1.2 },
        fuzzy: 0.2,
        prefix: true
      }
    });
    
    // Index all solutions
    searchIndex.addAll(solutions.map((s: any) => ({
      id: s.id,
      title: s.title || '',
      text: s.text || '',
      notes: s.notes || '',
      summary: s.summary || '',
      tags: (s.tags || []).join(' ')
    })));
    
    console.log(`Console Recall: Indexed ${solutions.length} solutions`);
  } catch (error) {
    console.error('Failed to initialize search index:', error);
    searchIndex = null;
  } finally {
    isIndexInitializing = false;
  }
}

// Console Recall: Update search index when solutions change
async function updateSearchIndex() {
  try {
    const storageResult = await chrome.storage.local.get(['solutions']);
    const solutions = storageResult.solutions || [];
    
    if (searchIndex) {
      // Clear and rebuild index
      searchIndex.removeAll();
      searchIndex.addAll(solutions.map((s: any) => ({
        id: s.id,
        title: s.title || '',
        text: s.text || '',
        notes: s.notes || '',
        summary: s.summary || '',
        tags: (s.tags || []).join(' ')
      })));
    } else {
      // Initialize if not exists
      await initializeSearchIndex();
    }
  } catch (error) {
    console.error('Failed to update search index:', error);
  }
}

// Console Recall: Token-overlap fallback matching
function tokenOverlapMatch(errorText: string, solutions: any[]): any | null {
  const errorTokens = errorText.toLowerCase()
    .split(/[\s\-_\.:;\(\)\[\]<>]+/)
    .filter(t => t.length > 2); // Filter out short tokens
  
  if (errorTokens.length === 0) return null;
  
  let bestMatch: any | null = null;
  let bestScore = 0;
  
  for (const solution of solutions) {
    const searchableText = [
      solution.title || '',
      solution.text || '',
      solution.notes || '',
      solution.summary || '',
      (solution.tags || []).join(' ')
    ].join(' ').toLowerCase();
    
    const solutionTokens = searchableText
      .split(/[\s\-_\.:;\(\)\[\]<>]+/)
      .filter(t => t.length > 2);
    
    // Count overlapping tokens
    const overlap = errorTokens.filter(token => 
      solutionTokens.some(st => st.includes(token) || token.includes(st))
    ).length;
    
    const score = overlap / errorTokens.length;
    
    if (score > bestScore && score > 0.3) { // Require at least 30% overlap
      bestScore = score;
      bestMatch = solution;
    }
  }
  
  return bestMatch;
}

// Console Recall: Find matching note for error
async function findMatchingNote(errorText: string, stackFrame?: string): Promise<any | null> {
  try {
    const searchText = (errorText + ' ' + (stackFrame || '')).trim();
    
    if (!searchText || searchText.length < 5) return null;
    
    // Ensure index is initialized
    if (!searchIndex && !isIndexInitializing) {
      await initializeSearchIndex();
    }
    
    // Wait for index if initializing
    let waitCount = 0;
    while (isIndexInitializing && waitCount < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waitCount++;
    }
    
    if (!searchIndex) {
      // Fallback to token overlap if index not available
      const storageResult = await chrome.storage.local.get(['solutions']);
      const solutions = storageResult.solutions || [];
      return tokenOverlapMatch(searchText, solutions);
    }
    
    // Try minisearch first
    const results = searchIndex.search(searchText, {
      boost: { title: 2, text: 1, notes: 1.5 }
    }).slice(0, 5); // Limit to top 5 results
    
    if (results.length > 0 && results[0].score > 0.1) {
      // Get full solution data
      const storageResult = await chrome.storage.local.get(['solutions']);
      const solutions = storageResult.solutions || [];
      const matched = solutions.find((s: any) => s.id === results[0].id);
      if (matched) return matched;
    }
    
    // Fallback to token overlap
    const storageResult = await chrome.storage.local.get(['solutions']);
    const solutions = storageResult.solutions || [];
    return tokenOverlapMatch(searchText, solutions);
    
  } catch (error) {
    console.error('Error finding matching note:', error);
    // Fallback
    const storageResult = await chrome.storage.local.get(['solutions']);
    const solutions = storageResult.solutions || [];
    return tokenOverlapMatch(errorText, solutions);
  }
}

// Console Recall: Attach debugger to tab
async function attachDebuggerToTab(tabId: number) {
  // Don't attach if feature is disabled
  if (!consoleRecallEnabled) {
    return;
  }
  
  if (attachedTabs.has(tabId)) return;
  
  try {
    await chrome.debugger.attach({ tabId }, '1.0');
    attachedTabs.set(tabId, true);
    
    // Enable required domains
    await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');
    await chrome.debugger.sendCommand({ tabId }, 'Log.enable');
    
    console.log(`Console Recall: Attached debugger to tab ${tabId}`);
  } catch (error: any) {
    // If already attached or tab doesn't exist, that's okay
    if (error.message?.includes('Another debugger') || error.message?.includes('No tab')) {
      console.log(`Console Recall: Could not attach to tab ${tabId}:`, error.message);
    } else {
      console.error(`Console Recall: Error attaching to tab ${tabId}:`, error);
    }
  }
}

// Console Recall: Detach debugger from tab
async function detachDebuggerFromTab(tabId: number) {
  if (!attachedTabs.has(tabId)) return;
  
  try {
    await chrome.debugger.detach({ tabId });
    attachedTabs.delete(tabId);
    console.log(`Console Recall: Detached debugger from tab ${tabId}`);
  } catch (error) {
    console.error(`Console Recall: Error detaching from tab ${tabId}:`, error);
    attachedTabs.delete(tabId);
  }
}

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
initializeAISession();
initializeSummarizer();
initializeProofreader();
initializeSearchIndex();

// Load console recall setting on startup
chrome.storage.local.get(['consoleRecallEnabled'], (result) => {
  consoleRecallEnabled = result.consoleRecallEnabled !== undefined ? result.consoleRecallEnabled : false;
});

// Initialize when Chrome browser starts
chrome.runtime.onStartup.addListener(() => {
  initializeAISession();
  initializeSummarizer();
  initializeProofreader();
});

chrome.runtime.onInstalled.addListener(() => {
  // Initialize storage if needed
  chrome.storage.local.get(['solutions', 'consoleRecallEnabled'], (result) => {
    if (!result.solutions) {
      chrome.storage.local.set({ solutions: [] });
    }
    
    // Load console recall setting (default: false)
    consoleRecallEnabled = result.consoleRecallEnabled !== undefined ? result.consoleRecallEnabled : false;
  });
  
  // Initialize AI session
  initializeAISession();
  initializeSummarizer();
  initializeProofreader();
  initializeSearchIndex();
  
  // Console Recall: Attach to all existing tabs (if enabled)
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://') || tab.url.startsWith('file://'))) {
        attachDebuggerToTab(tab.id);
      }
    });
  });
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  
    if (message.action === 'getSolutions') {
    chrome.storage.local.get(['solutions'], (result) => {
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
        // Console Recall: Update search index
        updateSearchIndex();
      });
    });
    return true;
  }

  if (message.action === 'clearAllSolutions') {
    chrome.storage.local.set({ solutions: [] }, () => {
      sendResponse({ success: true });
      // Console Recall: Update search index
      updateSearchIndex();
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
        // Console Recall: Update search index
        updateSearchIndex();
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

  if (message.action === 'toggleConsoleRecall') {
    (async () => {
      const enabled = message.enabled;
      consoleRecallEnabled = enabled;
      
      // Load setting from storage to persist
      await chrome.storage.local.set({ consoleRecallEnabled: enabled });
      
      if (enabled) {
        // Reattach to all http/https/file tabs
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            if (tab.id && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://') || tab.url.startsWith('file://'))) {
              attachDebuggerToTab(tab.id);
            }
          });
        });
        console.log('Console Recall: Enabled - debuggers will be attached to tabs');
      } else {
        // Detach from all tabs
        attachedTabs.forEach((_, tabId) => {
          detachDebuggerFromTab(tabId);
        });
        console.log('Console Recall: Disabled - all debuggers detached');
      }
      
      sendResponse({ success: true });
    })();
    return true; // Keep channel open for async response
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
          summary: !!currentSummary
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
          notes: taskNotes || ''
        };

        const storageResult = await chrome.storage.local.get(['solutions']);
        const solutions = storageResult.solutions || [];
        solutions.unshift(solution);
        await chrome.storage.local.set({ solutions });
        
        // Console Recall: Update search index when solution is saved
        updateSearchIndex();
        
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
    const sourceTabId = _sender.tab?.id;
    
    (async () => {
      try {
        const { searchQuery } = message;
        
        if (!searchQuery) {
          if (sourceTabId) {
            sendResponse({ success: false, error: 'No search query provided', matches: [] });
          }
          return;
        }

        // Extract keywords using AI (with timeout protection)
        let keywords: string;
        try {
          keywords = await Promise.race([
            extractKeywords(searchQuery),
            new Promise<string>((_, reject) => 
              setTimeout(() => reject(new Error('Keyword extraction timeout')), 5000)
            )
          ]) as string;
        } catch (keywordError) {
          // Fallback to original query if extraction fails or times out
          keywords = searchQuery.trim().toLowerCase();
        }
        
        // Search solutions (always call this, even if keyword extraction failed)
        const matches = await searchSolutions(keywords);
        
        // Send response if caller is waiting (for content script calls)
        if (sourceTabId) {
          sendResponse({ success: true, matches, keywords });
        }
        
        // Also notify the active tab if matches found (even if user navigated away)
        // But only if Google search notifications are enabled
        chrome.storage.local.get(['googleSearchEnabled'], (result) => {
          const enabled = result.googleSearchEnabled !== undefined ? result.googleSearchEnabled : false;
          if (enabled && matches.length > 0) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              const activeTab = tabs[0];
              if (activeTab?.id) {
                chrome.tabs.sendMessage(activeTab.id, {
                  action: 'showSearchMatches',
                  matches: matches,
                  searchQuery: searchQuery,
                  keywords: keywords
                }).catch(() => {
                  // Tab might not have content script, ignore
                });
              }
            });
          }
        });
      } catch (error) {
        console.error('Search error:', error);
        // Ensure we always send a response, even on error
        if (sourceTabId) {
          try {
            sendResponse({ success: false, error: (error as Error).message, matches: [] });
          } catch (responseError) {
            console.error('Failed to send error response:', responseError);
          }
        }
      }
    })();
    return true; // Keep channel open for async response
  }
});

// Extract keywords from search query using AI
async function extractKeywords(searchQuery: string): Promise<string> {
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
      // Fallback: return cleaned search query
      return searchQuery.trim().toLowerCase();
    }

    const prompt = `Extract 1 key technical keyword from this search query. Return ONLY a space-separated list of keywords, nothing else. Focus on programming/technical terms and remove stop words like "how", "what", "why", "the", etc.

Search query: ${searchQuery}

Keywords:`;
    
    const result = await aiSession.prompt(prompt);
    const keywords = result.trim().toLowerCase();

    // Fallback if result is empty or too long
    if (!keywords || keywords.length > 100) {
      return searchQuery.trim().toLowerCase();
    }
    
    return keywords;
  } catch (error) {
    console.error('Keyword extraction error:', error);
    // Fallback: return cleaned search query
    return searchQuery.trim().toLowerCase();
  }
}

// Search solutions using minisearch for better matching and ranking
async function searchSolutions(query: string): Promise<any[]> {
  try {
    if (!query || !query.trim()) {
      return [];
    }
    
    // Ensure index is initialized
    if (!searchIndex && !isIndexInitializing) {
      await initializeSearchIndex();
    }
    
    // Wait for index if initializing
    let waitCount = 0;
    while (isIndexInitializing && waitCount < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waitCount++;
    }
    
    if (!searchIndex) {
      // Fallback to token overlap if index not available
      const storageResult = await chrome.storage.local.get(['solutions']);
      const solutions = storageResult.solutions || [];
      const bestMatch = tokenOverlapMatch(query, solutions);
      return bestMatch ? [bestMatch] : [];
    }
    
    // Use minisearch for better ranking
    const results = searchIndex.search(query, {
      boost: { title: 2, text: 1, notes: 1.5, summary: 1.2 },
      fuzzy: 0.2,
      prefix: true
    }).slice(0, 10); // Limit to top 10 results
    
    if (results.length === 0) {
      // Fallback to token overlap if no results
      const storageResult = await chrome.storage.local.get(['solutions']);
      const solutions = storageResult.solutions || [];
      const bestMatch = tokenOverlapMatch(query, solutions);
      return bestMatch ? [bestMatch] : [];
    }
    
    // Get full solution data for results
    const storageResult = await chrome.storage.local.get(['solutions']);
    const solutions = storageResult.solutions || [];
    
    // Map search results to full solution objects, maintaining order by score
    const matchedSolutions = results
      .map(result => solutions.find((s: any) => s.id === result.id))
      .filter((s): s is any => s !== undefined); // Filter out undefined
    
    return matchedSolutions;
  } catch (error) {
    console.error('Search solutions error:', error);
    // Fallback to token overlap on error
    try {
      const storageResult = await chrome.storage.local.get(['solutions']);
      const solutions = storageResult.solutions || [];
      const bestMatch = tokenOverlapMatch(query, solutions);
      return bestMatch ? [bestMatch] : [];
    } catch (fallbackError) {
      console.error('Fallback search error:', fallbackError);
      return [];
    }
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
      const searchParams = url.searchParams;
      const query = searchParams.get('q');
      
      if (query && query.trim()) {
        // Run search directly in background (don't use sendMessage to self)
        (async () => {
          try {
            // Extract keywords using AI (with timeout protection)
            let keywords: string;
            try {
              keywords = await Promise.race([
                extractKeywords(query.trim()),
                new Promise<string>((_, reject) => 
                  setTimeout(() => reject(new Error('Keyword extraction timeout')), 5000)
                )
              ]) as string;
            } catch (keywordError) {
              // Fallback to original query if extraction fails or times out
              keywords = query.trim().toLowerCase();
            }
            
            // Search solutions
            const matches = await searchSolutions(keywords);
            
            // Notify the active tab if matches found (only if enabled)
            chrome.storage.local.get(['googleSearchEnabled'], (result) => {
              const enabled = result.googleSearchEnabled !== undefined ? result.googleSearchEnabled : false;
              if (enabled && matches.length > 0) {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                  const activeTab = tabs[0];
                  if (activeTab?.id) {
                    chrome.tabs.sendMessage(activeTab.id, {
                      action: 'showSearchMatches',
                      matches: matches,
                      searchQuery: query.trim(),
                      keywords: keywords
                    }).catch(() => {
                      // Tab might not have content script, ignore
                    });
                  }
                });
              }
            });
          } catch (error) {
            console.error('Background search error:', error);
          }
        })();
      }
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
      // Extract keywords using AI (with timeout protection)
      let keywords: string;
      try {
        keywords = await Promise.race([
          extractKeywords(text.trim()),
          new Promise<string>((_, reject) => 
            setTimeout(() => reject(new Error('Keyword extraction timeout')), 5000)
          )
        ]) as string;
      } catch (keywordError) {
        // Fallback to original query if extraction fails or times out
        keywords = text.trim().toLowerCase();
      }
      
      // Search solutions
      const matches = await searchSolutions(keywords);
      
      // Notify the active tab if matches found (only if enabled)
      chrome.storage.local.get(['googleSearchEnabled'], (result) => {
        const enabled = result.googleSearchEnabled !== undefined ? result.googleSearchEnabled : false;
        if (enabled && matches.length > 0) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (activeTab?.id) {
              chrome.tabs.sendMessage(activeTab.id, {
                action: 'showSearchMatches',
                matches: matches,
                searchQuery: text.trim(),
                keywords: keywords
              }).catch(() => {
                // Tab might not have content script, ignore
              });
            }
          });
        }
      });
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

// Console Recall: Debugger event listener - handle console errors/warnings
chrome.debugger.onEvent.addListener((source, method, params: any) => {
  // Don't process events if feature is disabled
  if (!consoleRecallEnabled) return;
  
  const tabId = source.tabId;
  if (!tabId) return;
  
  // Handle Runtime.exceptionThrown
  if (method === 'Runtime.exceptionThrown') {
    const exception = params.exceptionDetails;
    if (!exception) return;
    
    // Extract error text from multiple possible fields
    let errorText = '';
    if (exception.exception) {
      // Try different fields for error message
      if (exception.exception.description) {
        errorText = exception.exception.description;
      } else if (exception.exception.value) {
        errorText = exception.exception.value;
      } else if (exception.exception.className) {
        // Construct error message from className
        const desc = exception.exception.description || exception.exception.value || '';
        errorText = desc ? `${exception.exception.className}: ${desc}` : exception.exception.className;
      }
    }
    
    // Fallback to text field
    if (!errorText && exception.text) {
      errorText = exception.text;
    }
    
    // Also include exception type if available
    if (exception.exception?.className && !errorText.includes(exception.exception.className)) {
      errorText = `${exception.exception.className}: ${errorText}`.trim();
    }
    
    // If still no error text, try to construct from available fields
    if (!errorText && exception.exception?.className) {
      errorText = exception.exception.className;
    }
    
    const stackFrame = exception.stackTrace?.callFrames?.[0];
    const stackFrameText = stackFrame 
      ? `${stackFrame.functionName || '(anonymous)'} @ ${stackFrame.url || ''}:${stackFrame.lineNumber || 0}`
      : undefined;
    
    // Combine error text with stack frame info for better matching
    const searchText = errorText ? 
      (stackFrameText ? `${errorText} ${stackFrameText}` : errorText) : 
      stackFrameText;
    
    if (searchText && searchText.trim().length >= 3) {
      (async () => {
        const matchedNote = await findMatchingNote(errorText || searchText, stackFrameText);
        if (matchedNote) {
          chrome.tabs.sendMessage(tabId, {
            action: 'showConsoleRecall',
            noteId: matchedNote.id,
            noteTitle: matchedNote.title,
            errorText: (errorText || searchText).substring(0, 200) // Limit length for display
          }).catch(() => {
            // Tab might not have content script, ignore
          });
        }
      })();
    }
  }
  
  // Handle Runtime.consoleAPICalled for console.error, console.warn
  if (method === 'Runtime.consoleAPICalled') {
    const type = params.type;
    if (type === 'error' || type === 'warning') {
      const args = params.args || [];
      const errorText = args.map((arg: any) => {
        if (arg.type === 'string') return arg.value;
        if (arg.type === 'object' && arg.preview) {
          return arg.preview.description || JSON.stringify(arg.preview);
        }
        return arg.description || '';
      }).join(' ').trim();
      
      if (errorText) {
        (async () => {
          const matchedNote = await findMatchingNote(errorText);
          if (matchedNote) {
            chrome.tabs.sendMessage(tabId, {
              action: 'showConsoleRecall',
              noteId: matchedNote.id,
              noteTitle: matchedNote.title,
              errorText: errorText.substring(0, 200) // Limit length for display
            }).catch(() => {
              // Tab might not have content script, ignore
            });
          }
        })();
      }
    }
  }
  
  // Handle Log.entryAdded for console errors
  if (method === 'Log.entryAdded') {
    const entry = params.entry;
    if (entry.level === 'error' || entry.level === 'warning') {
      const errorText = entry.text || '';
      if (errorText) {
        (async () => {
          const matchedNote = await findMatchingNote(errorText);
          if (matchedNote) {
            chrome.tabs.sendMessage(tabId, {
              action: 'showConsoleRecall',
              noteId: matchedNote.id,
              noteTitle: matchedNote.title,
              errorText: errorText.substring(0, 200) // Limit length for display
            }).catch(() => {
              // Tab might not have content script, ignore
            });
          }
        })();
      }
    }
  }
});

// Console Recall: Attach debugger when tab is activated (if enabled)
chrome.tabs.onActivated.addListener((activeInfo) => {
  if (!consoleRecallEnabled) return;
  
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab?.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://') || tab.url.startsWith('file://'))) {
      attachDebuggerToTab(activeInfo.tabId);
    }
  });
});

// Console Recall: Attach debugger when tab is updated (new page loaded)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only handle debugger attachment if enabled
  if (consoleRecallEnabled && changeInfo.status === 'loading' && tab?.url && 
      (tab.url.startsWith('http://') || tab.url.startsWith('https://') || tab.url.startsWith('file://'))) {
    // Detach first if attached
    if (attachedTabs.has(tabId)) {
      detachDebuggerFromTab(tabId);
    }
    // Reattach after a short delay to ensure page is ready
    setTimeout(() => {
      attachDebuggerToTab(tabId);
    }, 500);
  }
});

// Console Recall: Detach debugger when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  detachDebuggerFromTab(tabId);
});

// Console Recall: Handle debugger detach (e.g., if another extension attaches)
chrome.debugger.onDetach.addListener((source) => {
  const tabId = source.tabId;
  if (tabId) {
    attachedTabs.delete(tabId);
  }
});

