// Background service worker for MindStack extension
// Handles extension lifecycle and message passing

// Global AI session for tag generation
let aiSession: any = null;
let isInitializingSession = false;

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

// Initialize on extension load (when service worker starts)
initializeAISession();

// Initialize when Chrome browser starts
chrome.runtime.onStartup.addListener(() => {
  initializeAISession();
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

        const promptText = [
            { role: 'system', content: 'You are a helpful assistant that generates relevant tags for programming solutions. Generate 3-5 concise, relevant tags based on the solution content. Return only the tags separated by commas, no explanation.' },
            { role: 'user', content: `Generate 3-5 concise, relevant tags based on the solution content. Return only the tags separated by commas, no explanation.
    Generate tags for this programming solution:

    Title: ${message.title}

    Solution: ${message.text}...

    Generate 3-5 relevant tags (e.g., javascript, react, error-handling, async):`},];
        
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
        // @ts-ignore - Chrome Summarizer API is experimental
        const availability = await Summarizer.availability();
        
        if (availability === 'unavailable') {
          sendResponse({ success: false, error: 'Summarizer not available.' });
          return;
        }

        // @ts-ignore
        const summarizer = await Summarizer.create({
          type: 'key-points',
          format: 'markdown',
          length: 'medium',
          sharedContext: 'This is a programming solution from Stack Overflow',
          monitor(m: any) {
            m.addEventListener('downloadprogress', (e: any) => {
              console.log(`Summarizer model: ${Math.round(e.loaded * 100)}%`);
            });
          }
        });

        const summary = await summarizer.summarize(message.text, {
          context: 'Focus on preserving code snippets and technical details while removing redundant explanations.'
        });
        
        sendResponse({ success: true, summary: summary.trim() });
      } catch (error) {
        console.error('Summarization error:', error);
        sendResponse({ success: false, error: `Failed: ${(error as Error).message}` });
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

