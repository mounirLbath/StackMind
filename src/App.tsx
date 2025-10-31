import { useEffect, useState } from 'react'

interface CapturedSolution {
  id: string;
  text: string;
  summary?: string;
  url: string;
  title: string;
  timestamp: number;
  questionId?: string;
  notes?: string;
  tags?: string[];
}

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

function App() {
  const [solutions, setSolutions] = useState<CapturedSolution[]>([]);
  const [selectedSolution, setSelectedSolution] = useState<CapturedSolution | null>(null);
  const [filter, setFilter] = useState('');
  const [searchMode, setSearchMode] = useState<'semantic' | 'keyword'>('semantic');
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTask[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editedSolution, setEditedSolution] = useState<CapturedSolution | null>(null);
  const [detailPanelWidth, setDetailPanelWidth] = useState(() => {
    // Default to 66% of screen width
    return Math.floor(window.innerWidth * 0.66);
  });
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    loadSolutions();
    loadBackgroundTasks();
    
    // Listen for background task updates
    const listener = (message: any) => {
      if (message.action === 'backgroundTaskUpdate') {
        loadBackgroundTasks();
      }
      if (message.action === 'backgroundTaskComplete') {
        loadBackgroundTasks();
        loadSolutions();
        // Show completion notification in UI
        showCompletionNotification(message.pageTitle);
      }
    };
    
    chrome.runtime.onMessage.addListener(listener);
    
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);

  // Handle resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      // Prevent default to avoid text selection during drag
      e.preventDefault();
      
      const newWidth = window.innerWidth - e.clientX;
      const minWidth = 300;
      // Allow detail panel to take up to 80% of the window, leaving at least 200px for the list
      const maxWidth = window.innerWidth - 200;
      
      setDetailPanelWidth(Math.max(minWidth, Math.min(newWidth, maxWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const loadSolutions = async () => {
    try {
      chrome.runtime.sendMessage({ action: 'getSolutions' }, (response) => {
        if (response?.solutions) {
          setSolutions(response.solutions);
        }
        setLoading(false);
      });
    } catch (error) {
      console.error('Error loading solutions:', error);
      setLoading(false);
    }
  };

  const loadBackgroundTasks = () => {
    chrome.runtime.sendMessage({ action: 'getBackgroundTasks' }, (response) => {
      if (response?.tasks) {
        setBackgroundTasks(response.tasks);
      }
    });
  };

  const showCompletionNotification = (pageTitle: string) => {
    // Create a temporary notification element
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded shadow-lg z-50 animate-slide-in';
    notification.textContent = `✓ Solution saved: ${pageTitle}`;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('animate-slide-out');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  };

  const deleteSolution = async (id: string) => {
    if (!confirm('Are you sure you want to delete this solution?')) return;

    chrome.runtime.sendMessage({ action: 'deleteSolution', id }, (response) => {
      if (response?.success) {
        setSolutions(solutions.filter(s => s.id !== id));
        if (selectedSolution?.id === id) {
          setSelectedSolution(null);
        }
      }
    });
  };

  const startEditing = () => {
    if (selectedSolution) {
      setEditedSolution({ ...selectedSolution });
      setIsEditing(true);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditedSolution(null);
  };

  const saveEdits = () => {
    if (!editedSolution) return;

    chrome.runtime.sendMessage({
      action: 'updateSolution',
      id: editedSolution.id,
      updates: {
        title: editedSolution.title,
        text: editedSolution.text,
        summary: editedSolution.summary,
        notes: editedSolution.notes,
        tags: editedSolution.tags
      }
    }, (response) => {
      if (response?.success) {
        const updatedSolutions = solutions.map(s =>
          s.id === editedSolution.id ? editedSolution : s
        );
        setSolutions(updatedSolutions);
        setSelectedSolution(editedSolution);
        setIsEditing(false);
        setEditedSolution(null);
      }
    });
  };

  const addTagToEdited = (tag: string) => {
    if (!editedSolution) return;
    const trimmedTag = tag.trim().toLowerCase();
    if (trimmedTag && !editedSolution.tags?.includes(trimmedTag)) {
      setEditedSolution({
        ...editedSolution,
        tags: [...(editedSolution.tags || []), trimmedTag]
      });
    }
  };

  const removeTagFromEdited = (tagToRemove: string) => {
    if (!editedSolution) return;
    setEditedSolution({
      ...editedSolution,
      tags: editedSolution.tags?.filter(tag => tag !== tagToRemove)
    });
  };

  const clearAll = async () => {
    if (!confirm('Are you sure you want to delete ALL solutions? This cannot be undone.')) return;

    chrome.runtime.sendMessage({ action: 'clearAllSolutions' }, (response) => {
      if (response?.success) {
        setSolutions([]);
        setSelectedSolution(null);
      }
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Text copied to clipboard!');
  };

  const openInWindow = () => {
    const url = chrome.runtime.getURL('index.html');
    window.open(url, '_blank');
  };

  const [isGeneratingTags, setIsGeneratingTags] = useState(false);

  const generateTags = async (solution: CapturedSolution) => {
    setIsGeneratingTags(true);
    
    chrome.runtime.sendMessage({
      action: 'generateTags',
      title: solution.title,
      text: solution.text.substring(0, 500)
    }, (response) => {
      setIsGeneratingTags(false);
      
      if (chrome.runtime.lastError) {
        alert('Failed to generate tags. Please try again.');
        return;
      }

      if (response && response.success && response.tags) {
        // Update the solution with tags
        const updatedSolutions = solutions.map(s => 
          s.id === solution.id ? { ...s, tags: response.tags } : s
        );
        setSolutions(updatedSolutions);
        
        // Also update selected solution if it's the same
        if (selectedSolution?.id === solution.id) {
          setSelectedSolution({ ...selectedSolution, tags: response.tags });
        }

        // Save to storage
        chrome.runtime.sendMessage({ 
          action: 'updateSolution', 
          id: solution.id, 
          updates: { tags: response.tags } 
        });
      } else {
        alert(response?.error || 'Failed to generate tags. Please try again.');
      }
    });
  };

  // Handle semantic or keyword search
  const [searchResults, setSearchResults] = useState<CapturedSolution[]>([]);
  const [semanticSearchQuery, setSemanticSearchQuery] = useState('');

  // Perform keyword search (fast, immediate)
  const performKeywordSearch = (query: string) => {
    if (!query.trim()) {
      setSearchResults(solutions);
      return;
    }

    const keywordResults = solutions.filter(s => 
      s.text.toLowerCase().includes(query.toLowerCase()) ||
      s.title.toLowerCase().includes(query.toLowerCase()) ||
      (s.notes && s.notes.toLowerCase().includes(query.toLowerCase())) ||
      (s.tags && s.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()))) ||
      (s.summary && s.summary.toLowerCase().includes(query.toLowerCase()))
    );
    setSearchResults(keywordResults);
  };

  // Perform semantic search (slow, debounced)
  const performSemanticSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults(solutions);
      return;
    }

    setIsSearching(true);
    chrome.runtime.sendMessage(
      {
        action: 'semanticSearch',
        query: query,
        searchMode: 'semantic',
        topK: 5
      },
      (response) => {
        setIsSearching(false);
        if (response && response.success) {
          setSearchResults(response.solutions || []);
        } else {
          // Fallback to keyword search on error
          performKeywordSearch(query);
        }
      }
    );
  };

  // Debounce semantic search - wait 1s after user stops typing
  useEffect(() => {
    if (searchMode !== 'semantic') return;

    if (!filter.trim()) {
      setSearchResults(solutions);
      setSemanticSearchQuery('');
      return;
    }

    const timeoutId = setTimeout(() => {
      setSemanticSearchQuery(filter);
    }, 1000); // 1000ms (1s) debounce delay

    return () => clearTimeout(timeoutId);
  }, [filter, searchMode, solutions]);

  // Execute semantic search when debounced query is ready
  useEffect(() => {
    if (searchMode === 'semantic' && semanticSearchQuery) {
      performSemanticSearch(semanticSearchQuery);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }
  }, [semanticSearchQuery]);

  // Immediate keyword search (no debounce)
  useEffect(() => {
    if (searchMode === 'keyword') {
      performKeywordSearch(filter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, searchMode]);

  // Initialize search results with all solutions
  useEffect(() => {
    if (!loading && !filter.trim()) {
      setSearchResults(solutions);
    }
  }, [solutions, loading, filter]);

  const filteredSolutions = searchResults;

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    
    // Reset time to midnight for accurate day comparison
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const compareDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffTime = today.getTime() - compareDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      // Today - show time
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
    
    // For older dates, show the actual date
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  };

  const parseMarkdown = (markdown: string): string => {
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
        return `<pre style="background: #2d2d2d; color: #f8f8f2; padding: 12px; border-radius: 4px; overflow-x: auto; margin: 8px 0; font-family: 'Courier New', monospace;"><code>${escapedContent}</code></pre>`;
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
    html = html.replace(/^[\*\-]\s+(.+)$/gm, '<li style="margin-bottom: 4px;">$1</li>');
    
    // Wrap list items in ul
    html = html.replace(/(<li[\s\S]*?<\/li>)\n(?=<li)/g, '$1');
    html = html.replace(/(<li[\s\S]*?<\/li>)/g, (match) => {
      if (!match.startsWith('<ul')) {
        return '<ul style="margin: 8px 0; padding-left: 20px; list-style-type: disc;">' + match + '</ul>';
      }
      return match;
    });
    
    // Line breaks
    html = html.replace(/\n\n/g, '<br><br>');
    html = html.replace(/\n/g, '<br>');
    
    return html;
  };

  if (loading) {
    return (
      <div className="w-full min-w-[600px] max-w-[1400px] min-h-[400px] h-screen mx-auto flex flex-col bg-white">
        <div className="flex justify-center items-center h-[300px] text-gray-800">Loading...</div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-[600px] max-w-[1400px] min-h-[400px] h-screen mx-auto flex flex-col bg-white">
      <header className="bg-gray-50 px-5 py-5 border-b border-gray-300 flex justify-between items-center">
        <div>
          <h1 className="m-0 text-2xl text-gray-900 font-semibold">MindStack</h1>
        </div>
        <div className="flex gap-2">
          <button 
            className="bg-gray-300 border border-gray-400 rounded px-3 py-2 cursor-pointer text-xs font-medium text-gray-800 transition-colors hover:bg-gray-400" 
            onClick={openInWindow} 
            title="Open in new tab"
          >
            Open Tab
          </button>
          {solutions.length > 0 && (
            <button 
              className="bg-gray-300 border border-gray-400 rounded px-3 py-2 cursor-pointer text-xs font-medium text-gray-800 transition-colors hover:bg-gray-400" 
              onClick={clearAll} 
              title="Clear all solutions"
            >
              Clear All
            </button>
          )}
        </div>
      </header>

      {/* Background Tasks Progress */}
      {backgroundTasks.length > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 px-5 py-3">
          {backgroundTasks.map(task => (
            <div key={task.id} className="flex items-center justify-between mb-2 last:mb-0">
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">
                  Processing: {task.pageTitle}
                </div>
                <div className="flex gap-3 mt-1">
                  <span className={`text-xs ${task.progress.format ? 'text-green-600' : 'text-gray-500'}`}>
                    {task.progress.format ? '✓' : '○'} Format
                  </span>
                  <span className={`text-xs ${task.progress.title ? 'text-green-600' : 'text-gray-500'}`}>
                    {task.progress.title ? '✓' : '○'} Title
                  </span>
                  <span className={`text-xs ${task.progress.tags ? 'text-green-600' : 'text-gray-500'}`}>
                    {task.progress.tags ? '✓' : '○'} Tags
                  </span>
                  <span className={`text-xs ${task.progress.summary ? 'text-green-600' : 'text-gray-500'}`}>
                    {task.progress.summary ? '✓' : '○'} Summary
                  </span>
                </div>
              </div>
              <div className="ml-4 flex items-center gap-2">
                <button 
                  className="bg-blue-600 text-white border-0 px-3 py-1.5 rounded cursor-pointer text-xs font-medium transition-colors hover:bg-blue-700"
                  onClick={() => {
                    chrome.runtime.sendMessage({ action: 'openPopup', taskId: task.id });
                  }}
                  title="View and edit on page"
                >
                  View Progress
                </button>
                {task.status === 'processing' && (
                  <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                )}
                {task.status === 'completed' && (
                  <span className="text-green-600 text-sm">✓</span>
                )}
                {task.status === 'error' && (
                  <span className="text-red-600 text-sm">✗</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {solutions.length === 0 ? (
        <div className="flex-1 flex flex-col justify-center items-center p-10 text-center bg-white">
          <div className="text-5xl mb-5 text-gray-500 font-light">—</div>
          <h2 className="m-0 mb-2.5 text-xl text-gray-900 font-semibold">No solutions captured yet</h2>
          <p className="m-0 mb-8 text-gray-600">Visit Stack Overflow and select text to capture solutions.</p>
          <div className="bg-gray-100 border border-gray-300 rounded px-5 py-5 text-left max-w-md">
            <h3 className="m-0 mb-3 text-base text-gray-900 font-semibold">How to use:</h3>
            <ol className="m-0 pl-5 text-gray-700 leading-relaxed">
              <li>Go to any Stack Overflow page</li>
              <li>Select the text of a solution</li>
              <li>Click the "Capture Solution" button</li>
              <li>Your solution will be saved here!</li>
            </ol>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-gray-50 px-5 py-3 border-b border-gray-300">
            <div className="flex gap-3 items-center mb-2">
              <input
                type="text"
                placeholder={searchMode === 'semantic' ? "Search semantically (e.g., 'async error handling')..." : "Search by keywords..."}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="flex-1 border border-gray-400 rounded px-3 py-2 text-sm outline-none bg-white transition-colors focus:border-gray-600"
                disabled={isSearching}
              />
              <span className="text-xs text-gray-600 font-medium whitespace-nowrap">
                {isSearching ? 'Searching...' : `${filteredSolutions.length} solution${filteredSolutions.length !== 1 ? 's' : ''}`}
              </span>
            </div>
            <div className="flex gap-4 items-center">
              <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="searchMode"
                  value="semantic"
                  checked={searchMode === 'semantic'}
                  onChange={() => setSearchMode('semantic')}
                  className="cursor-pointer"
                />
                <span>Semantic Search (AI-powered)</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="searchMode"
                  value="keyword"
                  checked={searchMode === 'keyword'}
                  onChange={() => setSearchMode('keyword')}
                  className="cursor-pointer"
                />
                <span>Keyword Search</span>
              </label>
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden bg-white min-h-0">
            <div className="flex-1 overflow-y-auto border-r border-gray-300">
              {filteredSolutions.map((solution) => (
                <div
                  key={solution.id}
                  className={`px-5 py-4 border-b border-gray-200 cursor-pointer transition-colors hover:bg-gray-50 ${selectedSolution?.id === solution.id ? 'bg-gray-100 border-l-[3px] border-l-gray-700' : ''}`}
                  onClick={() => setSelectedSolution(solution)}
                >
                  <div className="flex justify-between items-start gap-3 mb-2">
                    <div className="flex-1 font-semibold text-[13px] text-gray-900 leading-snug overflow-hidden line-clamp-2">{solution.title}</div>
                    <div className="text-[11px] text-gray-500 whitespace-nowrap">{formatDate(solution.timestamp)}</div>
                  </div>
                  <div className="text-xs text-gray-600 leading-normal overflow-hidden line-clamp-2">
                    {solution.summary ? solution.summary.substring(0, 150) : solution.text.substring(0, 100)}...
                  </div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {solution.summary && (
                      <div className="text-[11px] text-gray-700 font-medium bg-gray-200 px-2 py-0.5 rounded">AI Summary</div>
                    )}
                    {solution.notes && (
                      <div className="text-[11px] text-gray-700 font-medium">Has notes</div>
                    )}
                    {solution.tags && solution.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {solution.tags.map((tag, idx) => (
                          <span key={idx} className="text-[10px] bg-gray-200 text-gray-800 px-2 py-0.5 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {selectedSolution && (
              <div 
                className="flex flex-col bg-gray-50 relative"
                style={{ width: `${detailPanelWidth}px`, minWidth: '300px' }}
              >
                {/* Resize handle */}
                <div
                  className="absolute left-0 top-0 bottom-0 cursor-ew-resize hover:bg-blue-400 transition-colors z-10"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setIsResizing(true);
                  }}
                  style={{ 
                    background: isResizing ? '#60a5fa' : 'transparent',
                    width: '4px',
                    marginLeft: '-2px'
                  }}
                />
                
                <div className="p-3 flex justify-between items-center">
                  <h3 className="m-0 text-base text-gray-900 font-semibold">
                    {isEditing ? 'Edit Solution' : 'Solution Details'}
                  </h3>
                  <button 
                    className="bg-transparent border-0 text-2xl cursor-pointer text-gray-600 w-8 h-8 flex items-center justify-center rounded transition-colors hover:bg-gray-300" 
                    onClick={() => {
                      setSelectedSolution(null);
                      setIsEditing(false);
                      setEditedSolution(null);
                    }}
                  >
                    ×
                  </button>
                </div>
                
                <div className="flex-1 px-5 pb-5 overflow-y-auto">
                  {isEditing && editedSolution ? (
                    <>
                      {/* Edit Mode */}
                      <div className="mb-5">
                        <label className="block font-semibold text-[11px] text-gray-700 mb-2 uppercase tracking-wide">Title:</label>
                        <input
                          type="text"
                          value={editedSolution.title}
                          onChange={(e) => setEditedSolution({ ...editedSolution, title: e.target.value })}
                          className="w-full border border-gray-400 rounded px-3 py-2 text-[13px] outline-none transition-colors focus:border-gray-600"
                        />
                      </div>

                      <div className="mb-5">
                        <label className="block font-semibold text-[11px] text-gray-700 mb-2 uppercase tracking-wide">Full Text:</label>
                        <textarea
                          value={editedSolution.text}
                          onChange={(e) => setEditedSolution({ ...editedSolution, text: e.target.value })}
                          className="w-full min-h-[150px] border border-gray-400 rounded px-3 py-2 text-[13px] outline-none resize-vertical transition-colors focus:border-gray-600 font-mono"
                        />
                      </div>

                      {editedSolution.summary && (
                        <div className="mb-5">
                          <label className="block font-semibold text-[11px] text-gray-700 mb-2 uppercase tracking-wide">AI Summary (Markdown):</label>
                          <textarea
                            value={editedSolution.summary}
                            onChange={(e) => setEditedSolution({ ...editedSolution, summary: e.target.value })}
                            placeholder="AI-generated summary..."
                            className="w-full min-h-[100px] border border-gray-400 rounded px-3 py-2 text-[13px] outline-none resize-vertical transition-colors focus:border-gray-600"
                          />
                          {editedSolution.summary && (
                            <div className="mt-2 p-3 bg-gray-50 border border-gray-300 rounded text-[13px]">
                              <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Preview:</div>
                              <div
                                dangerouslySetInnerHTML={{ __html: parseMarkdown(editedSolution.summary) }}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mb-5">
                        <label className="block font-semibold text-[11px] text-gray-700 mb-2 uppercase tracking-wide">Tags:</label>
                        <div className="flex gap-2 flex-wrap mb-2">
                          {editedSolution.tags?.map((tag, idx) => (
                            <span key={idx} className="text-xs bg-gray-200 text-gray-800 px-3 py-1 rounded font-medium flex items-center gap-1">
                              {tag}
                              <button
                                onClick={() => removeTagFromEdited(tag)}
                                className="text-gray-600 hover:text-gray-900 font-bold"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                        <input
                          type="text"
                          placeholder="Add tag (press Enter)"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                              addTagToEdited(e.currentTarget.value);
                              e.currentTarget.value = '';
                            }
                          }}
                          className="w-full border border-gray-400 rounded px-3 py-2 text-[13px] outline-none transition-colors focus:border-gray-600"
                        />
                      </div>

                      <div className="mb-5">
                        <label className="block font-semibold text-[11px] text-gray-700 mb-2 uppercase tracking-wide">Notes (Markdown supported):</label>
                        <textarea
                          value={editedSolution.notes || ''}
                          onChange={(e) => setEditedSolution({ ...editedSolution, notes: e.target.value })}
                          placeholder="Add notes... (supports **bold**, *italic*, `code`, etc.)"
                          className="w-full min-h-[120px] border border-gray-400 rounded px-3 py-2 text-[13px] outline-none resize-vertical transition-colors focus:border-gray-600"
                        />
                        {editedSolution.notes && (
                          <div className="mt-2 p-3 bg-gray-50 border border-gray-300 rounded text-[13px]">
                            <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Preview:</div>
                            <div
                              dangerouslySetInnerHTML={{ __html: parseMarkdown(editedSolution.notes) }}
                            />
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 mt-5">
                        <button 
                          className="bg-gray-800 text-white border border-gray-800 px-4 py-2.5 rounded cursor-pointer text-[13px] font-medium transition-colors hover:bg-gray-900" 
                          onClick={saveEdits}
                        >
                          Save Changes
                        </button>
                        <button 
                          className="bg-gray-300 text-gray-800 border border-gray-400 px-4 py-2.5 rounded cursor-pointer text-[13px] font-medium transition-colors hover:bg-gray-400" 
                          onClick={cancelEditing}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* View Mode */}
                      <div className="mb-5">
                        <label className="block font-semibold text-[11px] text-gray-700 mb-2 uppercase tracking-wide">Title:</label>
                        <div className="text-[14px] text-gray-900 font-medium">{selectedSolution.title}</div>
                      </div>

                      <div className="mb-5">
                        <label className="block font-semibold text-[11px] text-gray-700 mb-2 uppercase tracking-wide">Source:</label>
                        <a 
                          href={selectedSolution.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-gray-800 underline text-[13px] break-words hover:text-gray-900"
                        >
                          {selectedSolution.url}
                        </a>
                      </div>

                      {selectedSolution.summary && (
                        <div className="mb-5">
                          <label className="block font-semibold text-[11px] text-gray-700 mb-2 uppercase tracking-wide">Summary:</label>
                          <div 
                            className="bg-blue-50 border border-blue-200 rounded px-3 py-3 text-[13px] leading-relaxed text-gray-800 max-h-[200px] overflow-y-auto break-words"
                            dangerouslySetInnerHTML={{
                              __html: parseMarkdown(selectedSolution.summary)
                            }}
                          />
                        </div>
                      )}

                      <div className="mb-5">
                        <label className="block font-semibold text-[11px] text-gray-700 mb-2 uppercase tracking-wide">Full Text:</label>
                        <div 
                          className="bg-white border border-gray-300 rounded px-3 py-3 text-[13px] leading-relaxed text-gray-800 break-words"
                          dangerouslySetInnerHTML={{
                            __html: parseMarkdown(selectedSolution.text)
                          }}
                        />
                      </div>

                      {selectedSolution.notes && (
                        <div className="mb-5">
                          <label className="block font-semibold text-[11px] text-gray-700 mb-2 uppercase tracking-wide">Notes:</label>
                          <div 
                            className="bg-gray-100 border border-gray-300 rounded px-3 py-3 text-[13px] leading-relaxed text-gray-800"
                            dangerouslySetInnerHTML={{ __html: parseMarkdown(selectedSolution.notes) }}
                          />
                        </div>
                      )}

                      <div className="mb-5">
                        <label className="block font-semibold text-[11px] text-gray-700 mb-2 uppercase tracking-wide">Captured:</label>
                        <div className="text-[13px] text-gray-800">{new Date(selectedSolution.timestamp).toLocaleString()}</div>
                      </div>

                      {selectedSolution.tags && selectedSolution.tags.length > 0 && (
                        <div className="mb-5">
                          <label className="block font-semibold text-[11px] text-gray-700 mb-2 uppercase tracking-wide">Tags:</label>
                          <div className="flex gap-2 flex-wrap">
                            {selectedSolution.tags.map((tag, idx) => (
                              <span key={idx} className="text-xs bg-gray-200 text-gray-800 px-3 py-1 rounded font-medium">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col gap-2 mt-5">
                        <button 
                          className="bg-gray-800 text-white border border-gray-800 px-4 py-2.5 rounded cursor-pointer text-[13px] font-medium transition-colors hover:bg-gray-900" 
                          onClick={startEditing}
                        >
                          Edit Solution
                        </button>
                        <button 
                          className={`bg-gray-300 text-gray-800 border border-gray-400 px-4 py-2.5 rounded text-[13px] font-medium transition-colors ${isGeneratingTags ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-400'}`}
                          onClick={() => !isGeneratingTags && generateTags(selectedSolution)}
                          disabled={isGeneratingTags}
                        >
                          {isGeneratingTags ? 'Generating...' : (selectedSolution.tags && selectedSolution.tags.length > 0 ? 'Regenerate Tags' : 'Generate Tags with AI')}
                        </button>
                        <button 
                          className="bg-gray-300 text-gray-800 border border-gray-400 px-4 py-2.5 rounded cursor-pointer text-[13px] font-medium transition-colors hover:bg-gray-400" 
                          onClick={() => copyToClipboard(selectedSolution.text)}
                        >
                          Copy Text
                        </button>
                        <button 
                          className="bg-gray-100 text-gray-700 border border-gray-400 px-4 py-2.5 rounded cursor-pointer text-[13px] font-medium transition-colors hover:bg-gray-300" 
                          onClick={() => deleteSolution(selectedSolution.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default App
