// Background service worker for MindStack extension
// Handles extension lifecycle and message passing

import { db } from './db';
import type { Solution } from './db';
import { embeddingService } from './embeddings';

// Global AI session for tag generation
let aiSession: any = null;
let isInitializingSession = false;

// Global Summarizer session
let summarizerSession: any = null;
let isInitializingSummarizer = false;

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

// Initialize when Chrome browser starts
chrome.runtime.onStartup.addListener(() => {
  initializeAISession();
  initializeSummarizer();
});

chrome.runtime.onInstalled.addListener(async () => {
  // Initialize IndexedDB
  await db.init();
  
  // Migrate data from chrome.storage.local if exists
  chrome.storage.local.get(['solutions'], async (result) => {
    if (result.solutions && result.solutions.length > 0) {
      console.log('Migrating', result.solutions.length, 'solutions to IndexedDB...');
      try {
        await db.importData(result.solutions);
        console.log('Migration complete!');
        // Keep the old data for now as backup
        // chrome.storage.local.remove(['solutions']);
      } catch (error) {
        console.error('Migration failed:', error);
      }
    }
  });
  
  // Initialize AI session
  initializeAISession();
  initializeSummarizer();
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  
    if (message.action === 'getSolutions') {
    (async () => {
      try {
        const solutions = await db.getAllSolutions();
        sendResponse({ solutions });
      } catch (error) {
        console.error('Error getting solutions:', error);
        sendResponse({ solutions: [] });
      }
    })();
    return true; // Keep channel open for async response
  }

  if (message.action === 'deleteSolution') {
    (async () => {
      try {
        await db.deleteSolution(message.id);
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error deleting solution:', error);
        sendResponse({ success: false, error: (error as Error).message });
      }
    })();
    return true;
  }

  if (message.action === 'clearAllSolutions') {
    (async () => {
      try {
        await db.clearAll();
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error clearing solutions:', error);
        sendResponse({ success: false, error: (error as Error).message });
      }
    })();
    return true;
  }

  if (message.action === 'updateSolution') {
    (async () => {
      try {
        await db.updateSolution(message.id, message.updates);
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error updating solution:', error);
        sendResponse({ success: false, error: (error as Error).message });
      }
    })();
    return true;
  }

  if (message.action === 'searchSolutions') {
    (async () => {
      try {
        const results = await db.search(message.query);
        sendResponse({ solutions: results });
      } catch (error) {
        console.error('Error searching solutions:', error);
        sendResponse({ solutions: [] });
      }
    })();
    return true;
  }

  if (message.action === 'advancedSearch') {
    (async () => {
      try {
        const results = await db.advancedSearch(message.filters);
        sendResponse({ solutions: results });
      } catch (error) {
        console.error('Error in advanced search:', error);
        sendResponse({ solutions: [] });
      }
    })();
    return true;
  }

  if (message.action === 'semanticSearch') {
    (async () => {
      try {
        const { query, searchMode = 'semantic', topK = 5 } = message;
        
        if (!query || !query.trim()) {
          sendResponse({ solutions: [] });
          return;
        }

        let results: Solution[] = [];

        if (searchMode === 'semantic') {
          // Try semantic search first
          try {
            const queryEmbedding = await embeddingService.generateEmbedding(query);
            
            if (queryEmbedding) {
              results = await db.semanticSearch(
                Array.from(queryEmbedding),
                topK,
                0.5 // similarity threshold
              );
            } else {
              // Embedding generation failed, fallback to keyword search
              console.warn('Embedding generation failed, falling back to keyword search');
              results = await db.search(query);
            }
          } catch (error) {
            console.error('Semantic search error, falling back to keyword search:', error);
            // Fallback to keyword search
            results = await db.search(query);
          }
        } else {
          // Keyword search
          results = await db.search(query);
        }

        sendResponse({ 
          success: true,
          solutions: results,
          searchMode: results.length > 0 || searchMode === 'keyword' ? searchMode : 'keyword' // If semantic returned 0, indicate fallback
        });
      } catch (error) {
        console.error('Search error:', error);
        sendResponse({ 
          success: false,
          solutions: [],
          error: (error as Error).message 
        });
      }
    })();
    return true;
  }

  if (message.action === 'getAllTags') {
    (async () => {
      try {
        const tags = await db.getAllTags();
        sendResponse({ tags });
      } catch (error) {
        console.error('Error getting tags:', error);
        sendResponse({ tags: [] });
      }
    })();
    return true;
  }

  if (message.action === 'exportData') {
    (async () => {
      try {
        const data = await db.exportData();
        sendResponse({ success: true, data });
      } catch (error) {
        console.error('Error exporting data:', error);
        sendResponse({ success: false, error: (error as Error).message });
      }
    })();
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

  if (message.action === 'getBackgroundTasks') {
    sendResponse({ tasks: backgroundTasks });
    return true;
  }

  if (message.action === 'openExtensionWindow') {
    // Open the extension in a popup window
    const url = chrome.runtime.getURL('index.html');
    chrome.windows.create({
      url: url,
      type: 'popup',
      width: 1000,
      height: 700
    });
    return true;
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
    } else {
      // Message came from popup, find the active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          sendToTab(tabs[0].id);
        }
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
      (task as any).notes = message.notes;
    }
    return true;
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

        // Format text with code backticks (only if not already formatted)
        if (!isFormatted) {
          try {
            if (!aiSession) await initializeAISession();
            if (aiSession) {
              const formatPrompt = `Format this text by wrapping code snippets in backticks (\`code\`) for inline code or triple backticks (\`\`\`code\`\`\`) for code blocks. Keep the EXACT same text, just add markdown code formatting where appropriate. Do not summarize or change the content:\n\n${selectedText}`;
              const formatted = await aiSession.prompt(formatPrompt);
              results.text = formatted.trim();
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
              const titlePrompt = `Generate a concise technical title (max 10 words) for this Stack Overflow solution:\n\nPage: ${pageTitle}\n\nContent: ${selectedText.substring(0, 500)}`;
              const generatedTitle = await aiSession.prompt(titlePrompt);
              results.title = generatedTitle.trim().replace(/^["']|["']$/g, '');
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
              task.progress.summary = true;
              notifyPopup('backgroundTaskUpdate', { taskId, progress: task.progress });
            }
          } catch (error) {
            console.error('Background summary generation failed:', error);
          }
        }

        // Generate embedding for semantic search (only for new solutions)
        let embedding: number[] | undefined = undefined;
        try {
          const embeddingVector = await embeddingService.generateEmbedding(results.text);
          if (embeddingVector) {
            embedding = Array.from(embeddingVector); // Convert Float32Array to number[] for storage
          }
        } catch (error) {
          console.error('Background embedding generation failed:', error);
          // Continue without embedding - solution will still be saved
          // Will fall back to keyword search if needed
        }

        // Get notes from the task if they were updated
        const taskNotes = (task as any).notes || notes;
        
        // Save the solution
        const solution: Solution = {
          id: Date.now().toString(),
          text: results.text, // Use formatted text
          summary: results.summary,
          url: url,
          title: results.title || pageTitle || 'Untitled Solution',
          timestamp: Date.now(),
          tags: results.tags,
          notes: taskNotes,
          embedding: embedding // Include embedding if generated successfully
        };

        await db.addSolution(solution);
        
        // Mark task as completed
        task.status = 'completed';
        notifyPopup('backgroundTaskComplete', { pageTitle: task.pageTitle, taskId });
        
        // Show notification on the currently active tab via content script
        chrome.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
          if (tabs[0]?.id) {
            const tabId = tabs[0].id;
            const notificationTitle = results.title || pageTitle || 'Solution saved successfully!';
            
            try {
              // Send message to content script to show notification
              chrome.tabs.sendMessage(tabId, {
                action: 'showCompletionNotification',
                title: notificationTitle
              });
            } catch (error) {
              console.log('Could not send to content script:', error);
              // Fallback to Chrome notification
              chrome.notifications.create({
                type: 'basic',
                title: 'MindStack',
                message: `Solution saved: ${notificationTitle}`,
                iconUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="75" font-size="75">✓</text></svg>',
                priority: 2
              });
            }
          } else {
            // No active tab, show Chrome notification
            chrome.notifications.create({
              type: 'basic',
              title: 'MindStack',
              message: `Solution saved: ${results.title || pageTitle}`,
              iconUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="75" font-size="75">✓</text></svg>',
              priority: 2
            });
          }
        }).catch((error) => {
          console.log('Could not query active tab:', error);
          // Fallback to Chrome notification
          chrome.notifications.create({
            type: 'basic',
            title: 'MindStack',
            message: `Solution saved: ${results.title || pageTitle}`,
            iconUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="75" font-size="75">✓</text></svg>',
            priority: 2
          });
        });
        
        // Remove task after 3 seconds
        setTimeout(() => {
          backgroundTasks = backgroundTasks.filter(t => t.id !== taskId);
          notifyPopup('backgroundTaskUpdate');
          
          // Stop keep-alive if no more tasks
          if (backgroundTasks.length === 0) {
            stopKeepAlive();
          }
        }, 3000);

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
});

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

