// Content script
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

class SolutionCapture {
  private floatingButton: HTMLDivElement | null = null;
  private capturePanel: HTMLDivElement | null = null;
  private selectedText: string = '';
  private tags: string[] = [];
  private generatedTitle: string = '';
  private generatedSummary: string = '';
  private isTextFormatted: boolean = false;

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
          <div id="stackmind-format-status" style="
            padding: 12px;
            background: #fafafa;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            font-size: 13px;
            color: #757575;
            margin-bottom: 8px;
          ">Formatting text...</div>
          <div id="stackmind-text-content" style="
            background: #fafafa;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            padding: 12px;
            max-height: 200px;
            overflow-y: auto;
            font-size: 13px;
            line-height: 1.6;
            color: #424242;
            display: none;
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

        <div style="display: flex; gap: 12px; justify-content: space-between;">
          <button id="stackmind-background" style="
            background: #f5f5f5;
            color: #616161;
            border: 1px solid #bdbdbd;
            padding: 10px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: background 0.2s;
          " onmouseover="this.style.background='#e0e0e0'" onmouseout="this.style.background='#f5f5f5'" title="Close this panel and get notified when AI processing is done">
            Continue in Background
          </button>
          <div style="display: flex; gap: 12px;">
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
    const backgroundBtn = document.getElementById('stackmind-background');
    const backdrop = document.getElementById('stackmind-backdrop');
    const tagInput = document.getElementById('stackmind-add-tag') as HTMLInputElement;

    closeBtn?.addEventListener('click', () => this.hideCapturePanel());
    cancelBtn?.addEventListener('click', () => this.hideCapturePanel());
    backdrop?.addEventListener('click', () => this.hideCapturePanel());
    saveBtn?.addEventListener('click', () => this.saveSolution());
    backgroundBtn?.addEventListener('click', () => this.continueInBackground());
    
    // Handle manual tag addition
    tagInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && tagInput.value.trim()) {
        e.preventDefault();
        this.addTag(tagInput.value.trim().toLowerCase());
        tagInput.value = '';
      }
    });

    // Auto-generate title, format text, generate tags, and generate summary
    await this.generateTitle();
    await this.generateTags();
    await this.generateSummary();
    await this.formatText();
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
    this.isTextFormatted = false;
  }

  private async generateTitle(): Promise<void> {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({
          action: 'generateTitle',
          pageTitle: document.title,
          text: this.selectedText.substring(0, 500)
        }, (response) => {
          // Check if panel still exists (user might have switched tabs)
          if (!this.capturePanel || !document.contains(this.capturePanel)) {
            resolve();
            return;
          }
          
          const statusEl = document.getElementById('stackmind-title-status');
          const inputEl = document.getElementById('stackmind-title-input') as HTMLInputElement;
          
          if (chrome.runtime.lastError || !response || !response.success) {
            if (statusEl) {
              statusEl.style.display = 'none';
            }
            if (inputEl) {
              inputEl.style.display = 'block';
              inputEl.placeholder = 'Enter title';
            }
            resolve();
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
          resolve();
        });
      } catch (error) {
        console.error('Error generating title:', error);
        resolve();
      }
    });
  }

  private async formatText(): Promise<void> {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({
          action: 'formatText',
          text: this.selectedText
        }, (response) => {
          // Check if panel still exists (user might have switched tabs)
          if (!this.capturePanel || !document.contains(this.capturePanel)) {
            resolve();
            return;
          }
          
          const statusEl = document.getElementById('stackmind-format-status');
          const contentEl = document.getElementById('stackmind-text-content');
          
          if (chrome.runtime.lastError || !response || !response.success) {
            // Keep original text if formatting fails, hide status and show content
            if (statusEl) {
              statusEl.style.display = 'none';
            }
            if (contentEl) {
              contentEl.style.display = 'block';
            }
            resolve();
            return;
          }

          // Update the selected text with formatted version
          this.selectedText = response.formatted;
          this.isTextFormatted = true;
          
          // Update the displayed text
          if (contentEl) {
            contentEl.innerHTML = this.escapeHtml(response.formatted);
          }
          
          // Hide loading, show content
          if (statusEl) {
            statusEl.style.display = 'none';
          }
          if (contentEl) {
            contentEl.style.display = 'block';
          }
          
          resolve();
        });
      } catch (error) {
        console.error('Error formatting text:', error);
        
        // Hide status and show content on error
        const statusEl = document.getElementById('stackmind-format-status');
        const contentEl = document.getElementById('stackmind-text-content');
        if (statusEl) {
          statusEl.style.display = 'none';
        }
        if (contentEl) {
          contentEl.style.display = 'block';
        }
        
        resolve();
      }
    });
  }

  private async generateSummary(): Promise<void> {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({
          action: 'summarizeText',
          text: this.selectedText
        }, (response) => {
          // Check if panel still exists (user might have switched tabs)
          if (!this.capturePanel || !document.contains(this.capturePanel)) {
            resolve();
            return;
          }
          
          const statusEl = document.getElementById('stackmind-summary-status');
          const containerEl = document.getElementById('stackmind-summary-container');
          
          if (chrome.runtime.lastError || !response || !response.success) {
            if (statusEl) {
              statusEl.textContent = 'Summary not available. Full text will be saved.';
              setTimeout(() => {
                if (statusEl && document.contains(statusEl)) {
                  statusEl.style.display = 'none';
                }
              }, 3000);
            }
            resolve();
            return;
          }

          this.generatedSummary = response.summary;
          
          if (statusEl) {
            statusEl.style.display = 'none';
          }
          
          if (containerEl) {
            containerEl.innerHTML = this.parseMarkdown(response.summary);
            containerEl.style.display = 'block';
          }
          resolve();
        });
      } catch (error) {
        console.error('Error generating summary:', error);
        resolve();
      }
    });
  }

  private async generateTags(): Promise<void> {
    return new Promise((resolve) => {
      try {
        // Send message to background script to generate tags
        chrome.runtime.sendMessage({
          action: 'generateTags',
          title: this.generatedTitle || document.title,
          text: this.selectedText.substring(0, 500)
        }, (response) => {
          // Check if panel still exists (user might have switched tabs)
          if (!this.capturePanel || !document.contains(this.capturePanel)) {
            resolve();
            return;
          }
          
          const statusEl = document.getElementById('stackmind-tags-status');
          
          if (chrome.runtime.lastError) {
            if (statusEl) {
              statusEl.textContent = 'Failed to generate tags. Add them manually below.';
              setTimeout(() => {
                if (statusEl && document.contains(statusEl)) {
                  statusEl.style.display = 'none';
                }
              }, 3000);
            }
            resolve();
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
                if (statusEl && document.contains(statusEl)) {
                  statusEl.style.display = 'none';
                }
              }, 3000);
            }
          }
          resolve();
        });
      } catch (error) {
        console.error('Error generating tags:', error);
        resolve();
      }
    });
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
    const saveBtn = document.getElementById('stackmind-save') as HTMLButtonElement;
    const originalText = saveBtn?.textContent || 'Save Solution';
    
    // Show loading state
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.style.opacity = '0.6';
      saveBtn.style.cursor = 'not-allowed';
      saveBtn.textContent = 'Saving...';
    }

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
      
      // Restore button state on error
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.style.opacity = '1';
        saveBtn.style.cursor = 'pointer';
        saveBtn.textContent = originalText;
      }
      
      alert('Error saving solution. Please try again.');
    }
  }

  private continueInBackground() {
    // Get notes before closing panel
    const notes = (document.getElementById('stackmind-notes') as HTMLTextAreaElement)?.value || '';
    
    // Send to background script to continue processing
    chrome.runtime.sendMessage({
      action: 'processInBackground',
      selectedText: this.selectedText,
      url: window.location.href,
      pageTitle: document.title,
      currentTags: this.tags,
      currentTitle: this.generatedTitle,
      currentSummary: this.generatedSummary,
      isFormatted: this.isTextFormatted,
      notes: notes
    });
    
    // Close the panel
    this.hideCapturePanel();
    
    // Show notification that processing continues
    this.showNotification('Processing solution in background...', 'info');
  }

  private showSuccessMessage() {
    this.showNotification('Solution captured successfully', 'success');
  }

  private showNotification(message: string, type: 'success' | 'info' = 'success') {
    const successMsg = document.createElement('div');
    const bgColor = type === 'success' ? '#f5f5f5' : '#e3f2fd';
    const borderColor = type === 'success' ? '#e0e0e0' : '#90caf9';
    
    successMsg.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${bgColor};
        color: #212121;
        padding: 12px 18px;
        border: 1px solid ${borderColor};
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        z-index: 10002;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        font-weight: 500;
        animation: slideIn 0.3s ease;
      ">
        ${message}
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

  private parseMarkdown(markdown: string): string {
    // First, extract code blocks to protect them
    const codeBlocks: string[] = [];
    let text = markdown.replace(/```[\s\S]*?```/g, (match) => {
      const placeholder = `___CODE_BLOCK_${codeBlocks.length}___`;
      codeBlocks.push(match);
      return placeholder;
    });
    
    // Extract inline code
    const inlineCode: string[] = [];
    text = text.replace(/`[^`]+`/g, (match) => {
      const placeholder = `___INLINE_CODE_${inlineCode.length}___`;
      inlineCode.push(match);
      return placeholder;
    });
    
    // Now escape HTML in the remaining text
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    
    // Restore and process code blocks
    codeBlocks.forEach((block, i) => {
      const code = block.replace(/```(\w+)?\n([\s\S]*?)```/, (_, _lang, content) => {
        const escapedContent = content
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return `<pre style="background: #2d2d2d; color: #f8f8f2; padding: 12px; border-radius: 4px; overflow-x: auto; margin: 8px 0;"><code>${escapedContent}</code></pre>`;
      });
      html = html.replace(`___CODE_BLOCK_${i}___`, code);
    });
    
    // Restore and process inline code
    inlineCode.forEach((code, i) => {
      const escapedCode = code
        .replace(/`([^`]+)`/, (_, content) => {
          const escaped = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          return `<code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-family: 'Courier New', monospace; font-size: 12px; color: #e83e8c;">${escaped}</code>`;
        });
      html = html.replace(`___INLINE_CODE_${i}___`, escapedCode);
    });
    
    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    // Bullet points
    html = html.replace(/^[\*\-]\s+(.+)$/gm, '<li style="margin-left: 20px; margin-bottom: 4px;">$1</li>');
    
    // Wrap consecutive list items in ul
    html = html.replace(/(<li[\s\S]*?<\/li>)\n(?=<li)/g, '$1');
    html = html.replace(/(<li[\s\S]*?<\/li>)/g, (match) => {
      if (!match.startsWith('<ul')) {
        return '<ul style="margin: 8px 0; padding-left: 0; list-style-position: inside;">' + match + '</ul>';
      }
      return match;
    });
    
    // Line breaks
    html = html.replace(/\n\n/g, '<br><br>');
    html = html.replace(/\n/g, '<br>');
    
    return html;
  }
}

// Initialize the capture functionality on all pages
new SolutionCapture();
