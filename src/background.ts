// Background service worker for MindStack extension
// Handles extension lifecycle and message passing

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
    title: boolean;
    tags: boolean;
    summary: boolean;
  };
  pageTitle: string;
  startTime: number;
}

let backgroundTasks: BackgroundTask[] = [];

// Helper function to notify popup of updates
function notifyPopup(action: string, data: any = {}) {
  chrome.runtime.sendMessage({ action, ...data }).catch(() => {
    // Popup might not be open, which is fine
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
      type: 'key-points',
      format: 'markdown',
      length: 'short',
      outputLanguage: "en",
      sharedContext: 'This is a programming solution from Stack Overflow',
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

// Initialize on extension load (when service worker starts)
initializeAISession();
initializeSummarizer();

// Initialize when Chrome browser starts
chrome.runtime.onStartup.addListener(() => {
  initializeAISession();
  initializeSummarizer();
});

chrome.runtime.onInstalled.addListener(() => {
  // Initialize storage if needed
  chrome.storage.local.get(['solutions'], (result) => {
    if (!result.solutions) {
      chrome.storage.local.set({ solutions: [] });
    }
  });
  
  // Initialize AI session
  initializeAISession();
  initializeSummarizer();
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

  if (message.action === 'processInBackground') {
    (async () => {
      const { selectedText, url, pageTitle, currentTags, currentTitle, currentSummary, notes } = message;
      
      const taskId = Date.now().toString();
      const task: BackgroundTask = {
        id: taskId,
        status: 'processing',
        progress: {
          title: !!currentTitle,
          tags: !!(currentTags && currentTags.length > 0),
          summary: !!currentSummary
        },
        pageTitle: pageTitle || 'Unknown Page',
        startTime: Date.now()
      };
      
      backgroundTasks.push(task);
      notifyPopup('backgroundTaskUpdate');
      
      try {
        // Process any missing AI tasks
        const results: any = {
          title: currentTitle,
          tags: currentTags || [],
          summary: currentSummary
        };

        // Generate title if missing
        if (!currentTitle) {
          try {
            if (!aiSession) await initializeAISession();
            if (aiSession) {
              const titlePrompt = `Generate a concise technical title (max 10 words) for this Stack Overflow solution:\n\nPage: ${pageTitle}\n\nContent: ${selectedText.substring(0, 500)}`;
              const generatedTitle = await aiSession.prompt(titlePrompt);
              results.title = generatedTitle.trim().replace(/^["']|["']$/g, '');
              task.progress.title = true;
              notifyPopup('backgroundTaskUpdate');
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
              notifyPopup('backgroundTaskUpdate');
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
              notifyPopup('backgroundTaskUpdate');
            }
          } catch (error) {
            console.error('Background summary generation failed:', error);
          }
        }

        // Save the solution
        const solution = {
          id: Date.now().toString(),
          text: selectedText,
          summary: results.summary,
          url: url,
          title: results.title || pageTitle || 'Untitled Solution',
          timestamp: Date.now(),
          tags: results.tags,
          notes: notes
        };

        const result = await chrome.storage.local.get(['solutions']);
        const solutions = result.solutions || [];
        solutions.unshift(solution);
        await chrome.storage.local.set({ solutions });

        // Mark task as completed
        task.status = 'completed';
        notifyPopup('backgroundTaskComplete', { pageTitle: task.pageTitle });
        
        // Remove task after 3 seconds
        setTimeout(() => {
          backgroundTasks = backgroundTasks.filter(t => t.id !== taskId);
          notifyPopup('backgroundTaskUpdate');
        }, 3000);

        // Show notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('vite.svg'),
          title: 'MindStack',
          message: 'Solution processed and saved successfully!',
          priority: 2
        });

      } catch (error) {
        console.error('Background processing error:', error);
        task.status = 'error';
        notifyPopup('backgroundTaskUpdate');
        
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('vite.svg'),
          title: 'MindStack',
          message: 'Failed to process solution in background',
          priority: 2
        });
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

