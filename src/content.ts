// Content script that runs on Stack Overflow pages
// Allows users to select and capture solution text

interface CapturedSolution {
  id: string;
  text: string;
  summary?: string;
  url: string;
  title: string;
  timestamp: number;
  questionId?: string;
  tags?: string[];
  notes?: string;
}

class StackOverflowCapture {
  private floatingButton: HTMLDivElement | null = null;
  private capturePanel: HTMLDivElement | null = null;
  private selectedText: string = '';
  private tags: string[] = [];
  private generatedTitle: string = '';
  private generatedSummary: string = '';

  constructor() {
    this.init();
  }

  private init() {
    // Listen for text selection
    document.addEventListener('mouseup', this.handleTextSelection.bind(this));
    
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.action === 'getPageInfo') {
        sendResponse({
          url: window.location.href,
          title: document.title
        });
      }
      return true;
    });

  }

  private handleTextSelection(event: MouseEvent) {
    // Ignore clicks on our own UI elements
    const target = event.target as HTMLElement;
    if (target.closest('#stackmind-capture-btn') || target.closest('#stackmind-capture-panel')) {
      return;
    }

    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    if (selectedText && selectedText.length > 10) {
      this.selectedText = selectedText;
      this.showFloatingButton(event.pageX, event.pageY);
    } else {
      this.hideFloatingButton();
    }
  }

  private showFloatingButton(x: number, y: number) {
    // Remove existing button if any
    this.hideFloatingButton();

    // Create floating button
    this.floatingButton = document.createElement('div');
    this.floatingButton.id = 'stackmind-capture-btn';
    this.floatingButton.innerHTML = `
      <button style="
        background: #e0e0e0;
        color: #424242;
        border: 1px solid #bdbdbd;
        padding: 8px 14px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        box-shadow: none;
        display: inline-block;
        transition: background 0.2s;
        z-index: 10000;
      " 
      onmouseover="this.style.background='#bdbdbd';"
      onmouseout="this.style.background='#e0e0e0';">
        Capture Solution
      </button>
    `;

    this.floatingButton.style.position = 'absolute';
    this.floatingButton.style.left = `${x}px`;
    this.floatingButton.style.top = `${y + 10}px`;
    this.floatingButton.style.zIndex = '10000';

    const button = this.floatingButton.querySelector('button');
    button?.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.showCapturePanel();
    });
    document.body.appendChild(this.floatingButton);
  }

  private hideFloatingButton() {
    if (this.floatingButton) {
      this.floatingButton.remove();
      this.floatingButton = null;
    }
  }

  private async showCapturePanel() {

    console.log('Showing capture panel');
    // Hide the floating button
    this.hideFloatingButton();

    // Create capture panel
    this.capturePanel = document.createElement('div');
    this.capturePanel.id = 'stackmind-capture-panel';
    this.capturePanel.innerHTML = `
      <div style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        padding: 24px;
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        z-index: 10001;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h3 style="margin: 0; font-size: 18px; color: #212121; font-weight: 600;">Capture Solution</h3>
          <button id="stackmind-close-panel" style="
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #757575;
            line-height: 1;
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
          " onmouseover="this.style.background='#e0e0e0'" onmouseout="this.style.background='none'">×</button>
        </div>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #424242; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
            Selected Text:
          </label>
          <div style="
            background: #fafafa;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            padding: 12px;
            max-height: 200px;
            overflow-y: auto;
            font-size: 13px;
            line-height: 1.6;
            color: #424242;
          ">${this.escapeHtml(this.selectedText)}</div>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #424242; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
            Title:
          </label>
          <div id="stackmind-title-status" style="
            padding: 12px;
            background: #fafafa;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            font-size: 13px;
            color: #757575;
            margin-bottom: 8px;
          ">Generating title with AI...</div>
          <input type="text" id="stackmind-title-input" placeholder="Custom title (optional)" style="
            width: 100%;
            border: 1px solid #bdbdbd;
            border-radius: 4px;
            padding: 8px 12px;
            font-size: 13px;
            font-family: inherit;
            box-sizing: border-box;
            display: none;
          " onmouseover="this.style.borderColor='#757575'" onmouseout="this.style.borderColor='#bdbdbd'">
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #424242; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
            Tags:
          </label>
          <div id="stackmind-tags-status" style="
            padding: 12px;
            background: #fafafa;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            font-size: 13px;
            color: #757575;
            margin-bottom: 8px;
          ">Generating tags with AI...</div>
          <div id="stackmind-tags-container" style="
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 8px;
          "></div>
          <input type="text" id="stackmind-add-tag" placeholder="Add more tags (press Enter)" style="
            width: 100%;
            border: 1px solid #bdbdbd;
            border-radius: 4px;
            padding: 8px 12px;
            font-size: 13px;
            font-family: inherit;
            box-sizing: border-box;
          " onmouseover="this.style.borderColor='#757575'" onmouseout="this.style.borderColor='#bdbdbd'">
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #424242; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
            AI Summary:
          </label>
          <div id="stackmind-summary-status" style="
            padding: 12px;
            background: #fafafa;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            font-size: 13px;
            color: #757575;
            margin-bottom: 8px;
          ">Generating summary with AI...</div>
          <div id="stackmind-summary-container" style="
            background: #fafafa;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            padding: 12px;
            font-size: 13px;
            line-height: 1.6;
            color: #424242;
            max-height: 150px;
            overflow-y: auto;
            display: none;
            white-space: pre-wrap;
          "></div>
        </div>

        <div style="margin-bottom: 20px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #424242; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
            Add Notes (optional):
          </label>
          <textarea id="stackmind-notes" placeholder="Add context, notes, or why this solution works..." style="
            width: 100%;
            min-height: 80px;
            border: 1px solid #bdbdbd;
            border-radius: 4px;
            padding: 12px;
            font-size: 14px;
            font-family: inherit;
            resize: vertical;
            box-sizing: border-box;
          " onmouseover="this.style.borderColor='#757575'" onmouseout="this.style.borderColor='#bdbdbd'"></textarea>
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button id="stackmind-cancel" style="
            background: #e0e0e0;
            color: #424242;
            border: 1px solid #bdbdbd;
            padding: 10px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: background 0.2s;
          " onmouseover="this.style.background='#bdbdbd'" onmouseout="this.style.background='#e0e0e0'">
            Cancel
          </button>
          <button id="stackmind-save" style="
            background: #e0e0e0;
            color: #212121;
            border: 1px solid #757575;
            padding: 10px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: background 0.2s;
          " onmouseover="this.style.background='#bdbdbd'" onmouseout="this.style.background='#e0e0e0'">
            Save Solution
          </button>
        </div>
      </div>
      
      <!-- Backdrop -->
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10000;
      " id="stackmind-backdrop"></div>
    `;

    document.body.appendChild(this.capturePanel);

    // Add event listeners
    const closeBtn = document.getElementById('stackmind-close-panel');
    const cancelBtn = document.getElementById('stackmind-cancel');
    const saveBtn = document.getElementById('stackmind-save');
    const backdrop = document.getElementById('stackmind-backdrop');
    const tagInput = document.getElementById('stackmind-add-tag') as HTMLInputElement;

    closeBtn?.addEventListener('click', () => this.hideCapturePanel());
    cancelBtn?.addEventListener('click', () => this.hideCapturePanel());
    backdrop?.addEventListener('click', () => this.hideCapturePanel());
    saveBtn?.addEventListener('click', () => this.saveSolution());
    
    // Handle manual tag addition
    tagInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && tagInput.value.trim()) {
        e.preventDefault();
        this.addTag(tagInput.value.trim().toLowerCase());
        tagInput.value = '';
      }
    });

    // Auto-generate title, summary and tags
    await Promise.all([
      this.generateTitle(),
      this.generateSummary(),
      this.generateTags()
    ]);
  }

  private hideCapturePanel() {
    if (this.capturePanel) {
      this.capturePanel.remove();
      this.capturePanel = null;
    }
    // Reset state when closing
    this.tags = [];
    this.generatedTitle = '';
    this.generatedSummary = '';
  }

  private async generateTitle() {
    try {
      const statusEl = document.getElementById('stackmind-title-status');
      const inputEl = document.getElementById('stackmind-title-input') as HTMLInputElement;
      
      chrome.runtime.sendMessage({
        action: 'generateTitle',
        pageTitle: document.title,
        text: this.selectedText.substring(0, 500)
      }, (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
          if (statusEl) {
            statusEl.style.display = 'none';
          }
          if (inputEl) {
            inputEl.style.display = 'block';
            inputEl.placeholder = 'Enter title';
          }
          return;
        }

        this.generatedTitle = response.title;
        
        if (statusEl) {
          statusEl.textContent = response.title;
          statusEl.style.color = '#212121';
          statusEl.style.cursor = 'pointer';
          statusEl.title = 'Click to edit';
          statusEl.onclick = () => {
            if (inputEl) {
              inputEl.value = response.title;
              inputEl.style.display = 'block';
              statusEl.style.display = 'none';
            }
          };
        }
      });
    } catch (error) {
      console.error('Error generating title:', error);
    }
  }

  private async generateSummary() {
    try {
      const statusEl = document.getElementById('stackmind-summary-status');
      const containerEl = document.getElementById('stackmind-summary-container');
      
      chrome.runtime.sendMessage({
        action: 'summarizeText',
        text: this.selectedText
      }, (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
          if (statusEl) {
            statusEl.textContent = 'Summary not available. Full text will be saved.';
            setTimeout(() => {
              if (statusEl) statusEl.style.display = 'none';
            }, 3000);
          }
          return;
        }

        this.generatedSummary = response.summary;
        
        if (statusEl) {
          statusEl.style.display = 'none';
        }
        
        if (containerEl) {
          containerEl.textContent = response.summary;
          containerEl.style.display = 'block';
        }
      });
    } catch (error) {
      console.error('Error generating summary:', error);
    }
  }

  private async generateTags() {
    try {
      const statusEl = document.getElementById('stackmind-tags-status');
      
      // Send message to background script to generate tags
      chrome.runtime.sendMessage({
        action: 'generateTags',
        title: document.title,
        text: this.selectedText.substring(0, 500)
      }, (response) => {
        if (chrome.runtime.lastError) {
          if (statusEl) {
            statusEl.textContent = 'Failed to generate tags. Add them manually below.';
            setTimeout(() => {
              if (statusEl) statusEl.style.display = 'none';
            }, 3000);
          }
          return;
        }

        if (response && response.success && response.tags) {
          // Add generated tags
          response.tags.forEach((tag: string) => this.addTag(tag));
          
          // Hide loading status
          if (statusEl) {
            statusEl.style.display = 'none';
          }
        } else {
          // Handle failure
          if (statusEl) {
            statusEl.textContent = response?.error || 'Failed to generate tags. Add them manually below.';
            setTimeout(() => {
              if (statusEl) statusEl.style.display = 'none';
            }, 3000);
          }
        }
      });
    } catch (error) {
      console.error('Error generating tags:', error);
      const statusEl = document.getElementById('stackmind-tags-status');
      if (statusEl) {
        statusEl.textContent = 'Failed to generate tags. Add them manually below.';
        setTimeout(() => {
          if (statusEl) statusEl.style.display = 'none';
        }, 3000);
      }
    }
  }

  private addTag(tag: string) {
    // Avoid duplicates
    if (this.tags.includes(tag)) return;
    
    this.tags.push(tag);
    
    const container = document.getElementById('stackmind-tags-container');
    if (!container) return;
    
    const tagEl = document.createElement('span');
    tagEl.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #e0e0e0;
      color: #424242;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
    `;
    tagEl.innerHTML = `
      ${this.escapeHtml(tag)}
      <button style="
        background: none;
        border: none;
        color: #757575;
        cursor: pointer;
        padding: 0;
        font-size: 14px;
        line-height: 1;
        font-weight: bold;
      " data-tag="${this.escapeHtml(tag)}">×</button>
    `;
    
    // Add remove functionality
    const removeBtn = tagEl.querySelector('button');
    removeBtn?.addEventListener('click', () => {
      this.tags = this.tags.filter(t => t !== tag);
      tagEl.remove();
    });
    
    container.appendChild(tagEl);
  }

  private async saveSolution() {
    const notesTextarea = document.getElementById('stackmind-notes') as HTMLTextAreaElement;
    const notes = notesTextarea?.value || '';
    const titleInput = document.getElementById('stackmind-title-input') as HTMLInputElement;
    const customTitle = titleInput?.value || this.generatedTitle;

    // Extract question ID from URL if on Stack Overflow
    const urlMatch = window.location.href.match(/questions\/(\d+)/);
    const questionId = urlMatch ? urlMatch[1] : undefined;

    const solution: CapturedSolution = {
      id: Date.now().toString(),
      text: this.selectedText,
      ...(this.generatedSummary && { summary: this.generatedSummary }),
      url: window.location.href,
      title: customTitle || document.title,
      timestamp: Date.now(),
      questionId,
      ...(notes && { notes }),
      ...(this.tags.length > 0 && { tags: this.tags })
    };

    try {
      // Store in Chrome storage
      const result = await chrome.storage.local.get(['solutions']);
      const solutions: CapturedSolution[] = result.solutions || [];
      solutions.unshift(solution); // Add to beginning of array
      
      await chrome.storage.local.set({ solutions });

      // Show success message
      this.showSuccessMessage();
      this.hideCapturePanel();

      console.log('StackMind: Solution saved', solution);
    } catch (error) {
      console.error('StackMind: Error saving solution', error);
      alert('Error saving solution. Please try again.');
    }
  }

  private showSuccessMessage() {
    const successMsg = document.createElement('div');
    successMsg.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: #f5f5f5;
        color: #212121;
        padding: 12px 18px;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        z-index: 10002;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        font-weight: 500;
        animation: slideIn 0.3s ease;
      ">
        Solution captured successfully
      </div>
      <style>
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      </style>
    `;

    document.body.appendChild(successMsg);

    setTimeout(() => {
      successMsg.remove();
    }, 3000);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize the capture functionality
if (window.location.hostname.includes('stackoverflow.com')) {
  new StackOverflowCapture();
}

