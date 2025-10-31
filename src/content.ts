// Content script - Glassmorphism redesign
// Allows users to select and capture solution text with beautiful UI

class SolutionCapture {
  private floatingButton: HTMLDivElement | null = null;
  private capturePanel: HTMLDivElement | null = null;
  private selectedText: string = '';
  private currentTaskId: string | null = null;

  constructor() {
    this.init();
  }

  private init() {
    document.addEventListener('mouseup', this.handleTextSelection.bind(this));
    
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

    // Inject styles
    this.injectStyles();

    // Check if extension context is valid
    this.checkExtensionContext();
  }

  private checkExtensionContext() {
    try {
      // Try to access chrome.runtime to check if context is valid
      if (chrome.runtime?.id) {
        return true;
      }
    } catch (e) {
      console.warn('MindStack: Extension context invalidated. Please refresh the page.');
      this.showReloadNotification();
      return false;
    }
    return true;
  }

  private showReloadNotification() {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 24px;
      right: 24px;
      backdrop-filter: blur(16px) saturate(180%);
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.85));
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-left: 4px solid #f59e0b;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
      z-index: 10003;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      max-width: 400px;
      animation: slideInFromTop 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    
    notification.innerHTML = `
      <div style="display: flex; align-items: center;">
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 4px; color: #1a1a1a;">Extension Updated</div>
          <div style="font-size: 13px; color: #4a4a4a; line-height: 1.4;">Please refresh this page to continue</div>
          <div style="font-size: 11px; color: #737373; margin-top: 4px;">Click to reload</div>
        </div>
      </div>
    `;
    
    notification.onmouseenter = () => {
      notification.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.9))';
      notification.style.transform = 'translateY(-2px)';
      notification.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1)';
    };
    notification.onmouseleave = () => {
      notification.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.85))';
      notification.style.transform = 'translateY(0)';
      notification.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)';
    };
    
    notification.onclick = () => {
      window.location.reload();
    };
    
    document.body.appendChild(notification);
  }

  private injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideInFromTop {
        from {
          transform: translateY(-12px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }

      @keyframes slideOutToTop {
        from {
          transform: translateY(0);
          opacity: 1;
        }
        to {
          transform: translateY(-12px);
          opacity: 0;
        }
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .glass {
        backdrop-filter: blur(12px);
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.10);
      }
      
      .gradient-light {
        background: radial-gradient(circle at 20% 10%, #e8f0fe 0%, #ffffff 35%, #f9fbff 100%);
      }

      @media (prefers-reduced-motion: reduce) {
        * {
          animation-duration: 0.01ms !important;
          transition-duration: 0.01ms !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  private showPageNotification(title: string) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 24px;
      right: 24px;
      backdrop-filter: blur(16px) saturate(180%);
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.85));
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-left: 4px solid #10b981;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
      z-index: 10003;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      max-width: 400px;
      animation: slideInFromTop 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    
    notification.innerHTML = `
      <div style="display: flex; align-items: start; gap: 12px;">
        <div style="flex-shrink: 0; margin-top: 2px;">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="10" r="10" fill="#10b981"/>
            <path d="M6 10L8.5 12.5L14 7" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 4px; color: #1a1a1a;">Solution Saved</div>
          <div style="font-size: 13px; color: #4a4a4a; line-height: 1.4;">${this.escapeHtml(title)}</div>
          <div style="font-size: 11px; color: #737373; margin-top: 4px;">Click to view in MindStack</div>
        </div>
      </div>
    `;
    
    notification.onmouseenter = () => {
      notification.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.9))';
      notification.style.transform = 'translateY(-2px)';
      notification.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1)';
    };
    notification.onmouseleave = () => {
      notification.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.85))';
      notification.style.transform = 'translateY(0)';
      notification.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)';
    };
    
    notification.onclick = () => {
      try {
        if (!this.checkExtensionContext()) return;
        chrome.runtime.sendMessage({ action: 'openExtensionWindow' });
      } catch (e) {
        console.warn('MindStack: Cannot open extension window - context invalidated');
      }
      notification.style.animation = 'slideOutToTop 0.14s ease-out';
      setTimeout(() => notification.remove(), 140);
    };
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (document.body.contains(notification)) {
        notification.style.animation = 'slideOutToTop 0.14s ease-out';
        setTimeout(() => notification.remove(), 140);
      }
    }, 6000);
  }

  private handleTextSelection(event: MouseEvent) {
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
    this.hideFloatingButton();

    this.floatingButton = document.createElement('div');
    this.floatingButton.id = 'stackmind-capture-btn';
    this.floatingButton.innerHTML = `
      <button style="
        backdrop-filter: blur(12px);
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        padding: 10px 16px;
        border-radius: 10px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        color: rgba(0, 0, 0, 0.8);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
        display: inline-flex;
        align-items: center;
        gap: 8px;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      " 
      onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 24px rgba(0, 0, 0, 0.15)'; this.style.background='rgba(255, 255, 255, 0.2)';"
      onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 16px rgba(0, 0, 0, 0.1)'; this.style.background='rgba(255, 255, 255, 0.1)';">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
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
    this.hideFloatingButton();
    
    if (!this.checkExtensionContext()) {
      this.showReloadNotification();
      return;
    }

    this.currentTaskId = Date.now().toString();
    
    try {
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
      
      this.showClickableNotification('Processing solution...');
    } catch (e) {
      console.error('MindStack: Failed to start capture:', e);
      this.showReloadNotification();
    }
  }

  private showClickableNotification(title: string) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 24px;
      right: 24px;
      backdrop-filter: blur(16px) saturate(180%);
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.85));
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-left: 4px solid #4285F4;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(66, 133, 244, 0.2), 0 2px 8px rgba(0, 0, 0, 0.08);
      z-index: 10003;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      max-width: 400px;
      animation: slideInFromTop 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    
    notification.innerHTML = `
      <div style="display: flex; align-items: start; gap: 12px;">
        <div style="flex-shrink: 0; margin-top: 2px;">
          <div style="
            width: 18px;
            height: 18px;
            border: 2px solid #4285F4;
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          "></div>
        </div>
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 4px; color: #1a1a1a;">Processing Solution</div>
          <div style="font-size: 13px; color: #4a4a4a;">${this.escapeHtml(title)}</div>
          <div style="font-size: 11px; color: #737373; margin-top: 4px;">Click to open in MindStack</div>
        </div>
      </div>
    `;
    
    notification.onmouseenter = () => {
      notification.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.9))';
      notification.style.transform = 'translateY(-2px)';
      notification.style.boxShadow = '0 12px 40px rgba(66, 133, 244, 0.25), 0 4px 12px rgba(0, 0, 0, 0.1)';
    };
    notification.onmouseleave = () => {
      notification.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.85))';
      notification.style.transform = 'translateY(0)';
      notification.style.boxShadow = '0 8px 32px rgba(66, 133, 244, 0.2), 0 2px 8px rgba(0, 0, 0, 0.08)';
    };
    
    notification.onclick = () => {
      try {
        if (!this.checkExtensionContext()) return;
        chrome.runtime.sendMessage({ action: 'openExtensionWindow' });
        notification.style.animation = 'slideOutToTop 0.14s ease-out';
        setTimeout(() => notification.remove(), 140);
      } catch (e) {
        console.error('MindStack: Failed to open extension window:', e);
        this.showReloadNotification();
      }
    };
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (document.body.contains(notification)) {
        notification.style.animation = 'slideOutToTop 0.14s ease-out';
        setTimeout(() => notification.remove(), 140);
      }
    }, 8000);
  }

  private async showCapturePanel(taskId: string) {
    if (this.capturePanel) {
      return;
    }

    if (!this.checkExtensionContext()) {
      this.showReloadNotification();
      return;
    }

    try {
      chrome.runtime.sendMessage({ action: 'getTaskStatus', taskId }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('MindStack: Context invalidated while fetching task status');
          this.showReloadNotification();
          return;
        }

        if (!response) return;

        const task = response.task;
        if (!task) return;

        this.renderCapturePanel(task);
      });
    } catch (e) {
      console.error('MindStack: Failed to show capture panel:', e);
      this.showReloadNotification();
    }
  }

  private renderCapturePanel(task: any) {
    this.capturePanel = document.createElement('div');
    this.capturePanel.id = 'stackmind-capture-panel';
    this.capturePanel.innerHTML = `
      <div style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        backdrop-filter: blur(20px) saturate(180%);
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.88));
        border: 1px solid rgba(255, 255, 255, 0.4);
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15), 0 8px 24px rgba(0, 0, 0, 0.1);
        padding: 28px;
        max-width: 620px;
        width: 90%;
        max-height: 85vh;
        overflow-y: auto;
        z-index: 10001;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: slideInFromTop 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <h3 style="margin: 0; font-size: 20px; color: #1a1a1a; font-weight: 600; letter-spacing: -0.3px;">
            Solution Processing
          </h3>
            <button id="stackmind-close-panel" style="
              backdrop-filter: blur(12px);
              background: rgba(255, 255, 255, 0.1);
              border: 1px solid rgba(255, 255, 255, 0.2);
              font-size: 20px;
              cursor: pointer;
              color: rgba(0, 0, 0, 0.6);
              line-height: 1;
              padding: 0;
              width: 32px;
              height: 32px;
              display: flex;
              align-items: center;
              justify-content: center;
              border-radius: 8px;
              transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            " onmouseover="this.style.background='rgba(255, 255, 255, 0.2)'; this.style.transform='scale(1.05)'; this.style.color='#1a1a1a';" onmouseout="this.style.background='rgba(255, 255, 255, 0.1)'; this.style.transform='scale(1)'; this.style.color='rgba(0, 0, 0, 0.6)';">×</button>
          </div>
        
        <div style="
          margin-bottom: 24px;
          padding: 16px;
          backdrop-filter: blur(12px);
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.10);
        ">
          <div style="font-weight: 600; margin-bottom: 12px; color: rgba(0, 0, 0, 0.7); font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px;">Processing Status</div>
            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span id="progress-format" style="font-size: 16px; font-weight: 600; color: ${task.progress.format ? '#10b981' : 'rgba(0, 0, 0, 0.3)'};">${task.progress.format ? '✓' : '○'}</span>
                <span style="font-size: 13px; color: rgba(0, 0, 0, 0.8);">Format</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span id="progress-title" style="font-size: 16px; font-weight: 600; color: ${task.progress.title ? '#10b981' : 'rgba(0, 0, 0, 0.3)'};">${task.progress.title ? '✓' : '○'}</span>
                <span style="font-size: 13px; color: rgba(0, 0, 0, 0.8);">Title</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span id="progress-tags" style="font-size: 16px; font-weight: 600; color: ${task.progress.tags ? '#10b981' : 'rgba(0, 0, 0, 0.3)'};">${task.progress.tags ? '✓' : '○'}</span>
                <span style="font-size: 13px; color: rgba(0, 0, 0, 0.8);">Tags</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span id="progress-summary" style="font-size: 16px; font-weight: 600; color: ${task.progress.summary ? '#10b981' : 'rgba(0, 0, 0, 0.3)'};">${task.progress.summary ? '✓' : '○'}</span>
                <span style="font-size: 13px; color: rgba(0, 0, 0, 0.8);">Summary</span>
              </div>
            </div>
          </div>

          <div style="margin-bottom: 20px;">
            <label style="display: block; font-weight: 600; margin-bottom: 8px; color: rgba(0, 0, 0, 0.7); font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px;">
              Page
            </label>
            <div style="font-size: 14px; color: rgba(0, 0, 0, 0.9);">${this.escapeHtml(task.pageTitle)}</div>
          </div>

          <div style="margin-bottom: 24px;">
            <label style="display: block; font-weight: 600; margin-bottom: 8px; color: rgba(0, 0, 0, 0.7); font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px;">
              Notes (Optional)
            </label>
            <textarea id="stackmind-notes" placeholder="Add context, notes, or why this solution works..." style="
              width: 100%;
              min-height: 110px;
              backdrop-filter: blur(12px);
              background: rgba(255, 255, 255, 0.1);
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: 8px;
              padding: 12px;
              font-size: 14px;
              font-family: inherit;
              resize: vertical;
              box-sizing: border-box;
              outline: none;
              transition: all 0.2s;
              color: #1a1a1a;
              line-height: 1.5;
            " onfocus="this.style.borderColor='rgba(66, 133, 244, 0.6)'; this.style.boxShadow='0 0 0 1px rgba(66, 133, 244, 0.4)'" onblur="this.style.borderColor='rgba(255, 255, 255, 0.2)'; this.style.boxShadow='none'">${this.escapeHtml(task.notes || '')}</textarea>
          </div>

          <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button id="stackmind-close-btn" style="
              backdrop-filter: blur(12px);
              background: rgba(255, 255, 255, 0.1);
              color: rgba(0, 0, 0, 0.8);
              border: 1px solid rgba(255, 255, 255, 0.2);
              padding: 8px 16px;
              border-radius: 8px;
              cursor: pointer;
              font-size: 14px;
              font-weight: 500;
              transition: all 0.2s;
              box-shadow: 0 4px 16px rgba(0, 0, 0, 0.10);
            " onmouseover="this.style.background='rgba(255, 255, 255, 0.2)'; this.style.transform='scale(1.02)';" onmouseout="this.style.background='rgba(255, 255, 255, 0.1)'; this.style.transform='scale(1)';">
              Close
            </button>
          </div>
        </div>
      </div>
      
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(6px);
        z-index: 10000;
        animation: fadeIn 0.18s ease-out;
      " id="stackmind-backdrop"></div>
    `;

    document.body.appendChild(this.capturePanel);

    const updateListener = (message: any) => {
      if (message.action === 'backgroundTaskUpdate' && message.taskId === task.id) {
        const formatEl = document.getElementById('progress-format');
        const titleEl = document.getElementById('progress-title');
        const tagsEl = document.getElementById('progress-tags');
        const summaryEl = document.getElementById('progress-summary');

        if (formatEl) {
          formatEl.textContent = message.progress.format ? '✓' : '○';
          formatEl.style.color = message.progress.format ? '#10b981' : 'rgba(0, 0, 0, 0.3)';
        }
        if (titleEl) {
          titleEl.textContent = message.progress.title ? '✓' : '○';
          titleEl.style.color = message.progress.title ? '#10b981' : 'rgba(0, 0, 0, 0.3)';
        }
        if (tagsEl) {
          tagsEl.textContent = message.progress.tags ? '✓' : '○';
          tagsEl.style.color = message.progress.tags ? '#10b981' : 'rgba(0, 0, 0, 0.3)';
        }
        if (summaryEl) {
          summaryEl.textContent = message.progress.summary ? '✓' : '○';
          summaryEl.style.color = message.progress.summary ? '#10b981' : 'rgba(0, 0, 0, 0.3)';
        }
      }

      if (message.action === 'backgroundTaskComplete' && message.taskId === task.id) {
        const formatEl = document.getElementById('progress-format');
        const titleEl = document.getElementById('progress-title');
        const tagsEl = document.getElementById('progress-tags');
        const summaryEl = document.getElementById('progress-summary');

        [formatEl, titleEl, tagsEl, summaryEl].forEach(el => {
          if (el) {
            el.textContent = '✓';
            el.style.color = '#10b981';
          }
        });
        
        // Auto-close the panel and show success notification
        setTimeout(() => {
          this.hideCapturePanel();
          chrome.runtime.onMessage.removeListener(updateListener);
          this.showPageNotification(message.pageTitle || 'Solution saved successfully!');
        }, 1500);
      }
      
      if (message.action === 'backgroundTaskReview' && message.taskId === task.id) {
        // All processing steps complete, mark all as done
        const formatEl = document.getElementById('progress-format');
        const titleEl = document.getElementById('progress-title');
        const tagsEl = document.getElementById('progress-tags');
        const summaryEl = document.getElementById('progress-summary');

        [formatEl, titleEl, tagsEl, summaryEl].forEach(el => {
          if (el) {
            el.textContent = '✓';
            el.style.color = '#10b981';
          }
        });
      }
    };

    chrome.runtime.onMessage.addListener(updateListener);

    const closeBtn = document.getElementById('stackmind-close-panel');
    const closeBtnBottom = document.getElementById('stackmind-close-btn');
    const notesTextarea = document.getElementById('stackmind-notes') as HTMLTextAreaElement;
    const backdrop = document.getElementById('stackmind-backdrop');

    closeBtn?.addEventListener('click', () => this.hideCapturePanel());
    closeBtnBottom?.addEventListener('click', () => this.hideCapturePanel());
    backdrop?.addEventListener('click', () => this.hideCapturePanel());
    
    // Auto-save notes in real-time as user types
    notesTextarea?.addEventListener('input', () => {
      const notes = notesTextarea.value || '';
      
      try {
        if (this.checkExtensionContext()) {
          chrome.runtime.sendMessage({
            action: 'updateTaskNotes',
            taskId: task.id,
            notes: notes
          });
        }
      } catch (e) {
        console.warn('MindStack: Failed to save notes - context invalidated');
      }
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

new SolutionCapture();
