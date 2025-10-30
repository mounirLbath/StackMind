// Background service worker for MindStack extension
// Handles extension lifecycle and message passing

chrome.runtime.onInstalled.addListener(() => {
  console.log('StackMind: Extension installed');
  
  // Initialize storage if needed
  chrome.storage.local.get(['solutions'], (result) => {
    if (!result.solutions) {
      chrome.storage.local.set({ solutions: [] });
    }
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
        // @ts-ignore - Chrome Prompt API is experimental
        const availability = await LanguageModel.availability();
        
        if (availability === 'unavailable') {
          sendResponse({ 
            success: false, 
            error: 'AI not available. Add tags manually below.' 
          });
          return;
        }

        // @ts-ignore
        const session = await LanguageModel.create({
          monitor(m: any) {
            m.addEventListener('downloadprogress', (e: any) => {
              console.log(`Downloaded ${e.loaded * 100}%`);
            });
          },
        });

        const promptText = `You are a helpful assistant that generates relevant tags for programming solutions. Generate 3-5 concise, relevant tags based on the solution content. Return only the tags separated by commas, no explanation.

Generate tags for this programming solution:

Title: ${message.title}

Solution: ${message.text}...

Generate 3-5 relevant tags (e.g., javascript, react, error-handling, async):`;
        
        const result = await session.prompt(promptText);
        
        console.log('Result:', result);
        
        // Parse the tags
        const tags = result.split(',')
          .map((tag: string) => tag.trim().toLowerCase())
          .filter((tag: string) => tag.length > 0);
        
        session.destroy();
        
        sendResponse({ success: true, tags });
      } catch (error) {
        console.error('Error generating tags:', error);
        sendResponse({ 
          success: false, 
          error: 'Failed to generate tags. Add them manually below.' 
        });
      }
    })();
    return true; // Keep the message channel open for async response
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

