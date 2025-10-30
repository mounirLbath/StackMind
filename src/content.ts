// Content script that runs on Stack Overflow pages
// Allows users to select and capture solution text

interface CapturedSolution {
  id: string;
  text: string;
  url: string;
  title: string;
  timestamp: number;
  questionId?: string;
}

class StackOverflowCapture {
  private floatingButton: HTMLDivElement | null = null;
  private capturePanel: HTMLDivElement | null = null;
  private selectedText: string = '';

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

  private showCapturePanel() {

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

    closeBtn?.addEventListener('click', () => this.hideCapturePanel());
    cancelBtn?.addEventListener('click', () => this.hideCapturePanel());
    backdrop?.addEventListener('click', () => this.hideCapturePanel());
    saveBtn?.addEventListener('click', () => this.saveSolution());
  }

  private hideCapturePanel() {
    if (this.capturePanel) {
      this.capturePanel.remove();
      this.capturePanel = null;
    }
  }

  private async saveSolution() {
    const notesTextarea = document.getElementById('stackmind-notes') as HTMLTextAreaElement;
    const notes = notesTextarea?.value || '';
    console.log('Notes:', notes);

    // Extract question ID from URL if on Stack Overflow
    const urlMatch = window.location.href.match(/questions\/(\d+)/);
    const questionId = urlMatch ? urlMatch[1] : undefined;

    const solution: CapturedSolution = {
      id: Date.now().toString(),
      text: this.selectedText,
      url: window.location.href,
      title: document.title,
      timestamp: Date.now(),
      questionId,
      ...(notes && { notes })
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

