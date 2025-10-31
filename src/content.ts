// Content script
// Allows users to select and capture solution text

class SolutionCapture {
  private floatingButton: HTMLDivElement | null = null;
  private capturePanel: HTMLDivElement | null = null;
  private selectedText: string = '';
  private currentTaskId: string | null = null;

  constructor() {
    this.init();
  }

  private init() {
    // Listen for text selection
    document.addEventListener('mouseup', this.handleTextSelection.bind(this));
    
    // Listen for messages from popup and background
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.action === 'getPageInfo') {
        sendResponse({
          url: window.location.href,
          title: document.title
        });
      }
      if (message.action === 'showCompletionNotification') {
        this.showPageNotification(message.title || 'Solution saved successfully!');
      }
      if (message.action === 'showCapturePanel') {
        this.showCapturePanel(message.taskId);
      }
      return true;
    });
  }

  private showPageNotification(title: string) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ffffff;
      color: #212121;
      padding: 16px 20px;
      border: 1px solid #4caf50;
      border-left: 4px solid #4caf50;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10003;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      max-width: 350px;
      animation: slideInRight 0.3s ease;
    `;
    
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="flex-shrink: 0; width: 24px; height: 24px; background: #4caf50; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">✓</div>
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 2px;">MindStack</div>
          <div style="font-size: 13px; color: #616161;">${this.escapeHtml(title)}</div>
        </div>
      </div>
    `;
    
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideInRight {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      @keyframes slideOutRight {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(400px);
          opacity: 0;
        }
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideOutRight 0.3s ease';
      setTimeout(() => {
        notification.remove();
        style.remove();
      }, 300);
    }, 4000);
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
      this.startBackgroundCapture();
    });
    document.body.appendChild(this.floatingButton);
  }

  private hideFloatingButton() {
    if (this.floatingButton) {
      this.floatingButton.remove();
      this.floatingButton = null;
    }
  }

  private startBackgroundCapture() {
    // Hide the floating button
    this.hideFloatingButton();
    
    // Generate a task ID
    this.currentTaskId = Date.now().toString();
    
    // Send to background script to start processing
    chrome.runtime.sendMessage({
      action: 'processInBackground',
      selectedText: this.selectedText,
      url: window.location.href,
      pageTitle: document.title,
      currentTags: [],
      currentTitle: '',
      currentSummary: '',
      isFormatted: false,
      notes: '',
      taskId: this.currentTaskId
    });
    
    // Show clickable notification that opens the capture panel
    this.showClickableNotification('Processing solution...', 'Click to view and edit');
  }

  private showClickableNotification(title: string, subtitle: string) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ffffff;
      color: #212121;
      padding: 16px 20px;
      border: 1px solid #2196f3;
      border-left: 4px solid #2196f3;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10003;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      max-width: 350px;
      animation: slideInRight 0.3s ease;
      cursor: pointer;
      transition: all 0.2s ease;
    `;
    
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="flex-shrink: 0; width: 24px; height: 24px; background: #2196f3; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">
          <div style="
            width: 16px;
            height: 16px;
            border: 2px solid white;
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          "></div>
        </div>
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 2px;">MindStack</div>
          <div style="font-size: 13px; color: #616161;">${this.escapeHtml(title)}</div>
          <div style="font-size: 11px; color: #9e9e9e; margin-top: 4px;">${this.escapeHtml(subtitle)}</div>
        </div>
      </div>
    `;
    
    // Add hover effect
    notification.onmouseenter = () => {
      notification.style.background = '#f5f5f5';
      notification.style.transform = 'scale(1.02)';
    };
    notification.onmouseleave = () => {
      notification.style.background = '#ffffff';
      notification.style.transform = 'scale(1)';
    };
    
    // Open capture panel when clicked
    const taskId = this.currentTaskId;
    notification.onclick = () => {
      if (taskId) {
        this.showCapturePanel(taskId);
      }
      notification.remove();
      style.remove();
    };
    
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideInRight {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      @keyframes slideOutRight {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(400px);
          opacity: 0;
        }
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(notification);
    
    // Auto-dismiss after 8 seconds
    setTimeout(() => {
      if (document.body.contains(notification)) {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
          notification.remove();
          style.remove();
        }, 300);
      }
    }, 8000);
  }

  private async showCapturePanel(taskId: string) {
    // If panel already exists, don't create another
    if (this.capturePanel) {
      return;
    }

    // Get current task status from background
    chrome.runtime.sendMessage({ action: 'getTaskStatus', taskId }, (response) => {
      if (!response) return;

      const task = response.task;
      if (!task) return;

      this.renderCapturePanel(task);
    });
  }

  private renderCapturePanel(task: any) {
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
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        padding: 24px;
        max-width: 600px;
        width: 90%;
        max-height: 85vh;
        overflow-y: auto;
        z-index: 10001;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h3 style="margin: 0; font-size: 18px; color: #212121; font-weight: 600;">Solution Processing</h3>
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
        
        <!-- Progress Section -->
        <div style="margin-bottom: 20px; padding: 16px; background: #f5f5f5; border-radius: 4px;">
          <div style="font-weight: 600; margin-bottom: 12px; color: #424242; font-size: 14px;">Processing Status:</div>
          <div style="display: flex; gap: 16px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span id="progress-format" style="font-size: 16px;">${task.progress.format ? '✓' : '○'}</span>
              <span style="font-size: 13px; color: #616161;">Format</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span id="progress-title" style="font-size: 16px;">${task.progress.title ? '✓' : '○'}</span>
              <span style="font-size: 13px; color: #616161;">Title</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span id="progress-tags" style="font-size: 16px;">${task.progress.tags ? '✓' : '○'}</span>
              <span style="font-size: 13px; color: #616161;">Tags</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span id="progress-summary" style="font-size: 16px;">${task.progress.summary ? '✓' : '○'}</span>
              <span style="font-size: 13px; color: #616161;">Summary</span>
            </div>
          </div>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #424242; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
            Page:
          </label>
          <div style="font-size: 14px; color: #616161;">${this.escapeHtml(task.pageTitle)}</div>
        </div>

        <div style="margin-bottom: 20px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #424242; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
            Add Notes (optional):
          </label>
          <textarea id="stackmind-notes" placeholder="Add context, notes, or why this solution works..." style="
            width: 100%;
            min-height: 100px;
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
          <button id="stackmind-close-btn" style="
            background: #e0e0e0;
            color: #424242;
            border: 1px solid #bdbdbd;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: background 0.2s;
          " onmouseover="this.style.background='#bdbdbd'" onmouseout="this.style.background='#e0e0e0'">
            Close
          </button>
          <button id="stackmind-save-notes" style="
            background: #2196f3;
            color: white;
            border: 1px solid #2196f3;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: background 0.2s;
          " onmouseover="this.style.background='#1976d2'" onmouseout="this.style.background='#2196f3'">
            Save & Close
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

    // Listen for background task updates
    const updateListener = (message: any, _sender: any, _sendResponse: any) => {
      if (message.action === 'backgroundTaskUpdate' && message.taskId === task.id) {
        // Update progress indicators
        const formatEl = document.getElementById('progress-format');
        const titleEl = document.getElementById('progress-title');
        const tagsEl = document.getElementById('progress-tags');
        const summaryEl = document.getElementById('progress-summary');

        if (formatEl) {
          formatEl.textContent = message.progress.format ? '✓' : '○';
          formatEl.style.color = message.progress.format ? '#4caf50' : '#9e9e9e';
        }
        if (titleEl) {
          titleEl.textContent = message.progress.title ? '✓' : '○';
          titleEl.style.color = message.progress.title ? '#4caf50' : '#9e9e9e';
        }
        if (tagsEl) {
          tagsEl.textContent = message.progress.tags ? '✓' : '○';
          tagsEl.style.color = message.progress.tags ? '#4caf50' : '#9e9e9e';
        }
        if (summaryEl) {
          summaryEl.textContent = message.progress.summary ? '✓' : '○';
          summaryEl.style.color = message.progress.summary ? '#4caf50' : '#9e9e9e';
        }
      }

      if (message.action === 'backgroundTaskComplete' && message.taskId === task.id) {
        // Mark all as complete
        const formatEl = document.getElementById('progress-format');
        const titleEl = document.getElementById('progress-title');
        const tagsEl = document.getElementById('progress-tags');
        const summaryEl = document.getElementById('progress-summary');

        if (formatEl) {
          formatEl.textContent = '✓';
          formatEl.style.color = '#4caf50';
        }
        if (titleEl) {
          titleEl.textContent = '✓';
          titleEl.style.color = '#4caf50';
        }
        if (tagsEl) {
          tagsEl.textContent = '✓';
          tagsEl.style.color = '#4caf50';
        }
        if (summaryEl) {
          summaryEl.textContent = '✓';
          summaryEl.style.color = '#4caf50';
        }
        
        // Auto-close panel when complete
        setTimeout(() => {
          this.hideCapturePanel();
          chrome.runtime.onMessage.removeListener(updateListener);
        }, 2000);
      }
    };

    chrome.runtime.onMessage.addListener(updateListener);

    // Add event listeners
    const closeBtn = document.getElementById('stackmind-close-panel');
    const closeBtnBottom = document.getElementById('stackmind-close-btn');
    const saveBtn = document.getElementById('stackmind-save-notes');
    const backdrop = document.getElementById('stackmind-backdrop');

    closeBtn?.addEventListener('click', () => this.hideCapturePanel());
    closeBtnBottom?.addEventListener('click', () => this.hideCapturePanel());
    backdrop?.addEventListener('click', () => this.hideCapturePanel());
    
    saveBtn?.addEventListener('click', () => {
      const notesTextarea = document.getElementById('stackmind-notes') as HTMLTextAreaElement;
      const notes = notesTextarea?.value || '';
      
      // Send notes to background to update the solution
      chrome.runtime.sendMessage({
        action: 'updateTaskNotes',
        taskId: task.id,
        notes: notes
      });
      
      this.hideCapturePanel();
    });
  }

  private hideCapturePanel() {
    if (this.capturePanel) {
      this.capturePanel.remove();
      this.capturePanel = null;
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize the capture functionality on all pages
new SolutionCapture();
