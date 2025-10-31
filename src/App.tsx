import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ExternalLink, Edit2, Copy, Trash2, X, Plus, CheckCircle2, Bug } from 'lucide-react';
import { Button, Card, Tag, Input, Textarea, Toast, Toggle } from './lib/ui';

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
  notes?: string;
  // For displaying during processing
  generatedData?: {
    text: string;
    title: string;
    tags: string[];
    summary: string;
    url: string;
  };
}

function App() {
  const [solutions, setSolutions] = useState<CapturedSolution[]>([]);
  const [selectedSolution, setSelectedSolution] = useState<CapturedSolution | null>(null);
  const [selectedTask, setSelectedTask] = useState<BackgroundTask | null>(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTask[]>([]);
  const [taskNotes, setTaskNotes] = useState<{ [key: string]: string }>({});
  const [isEditing, setIsEditing] = useState(false);
  const [editedSolution, setEditedSolution] = useState<CapturedSolution | null>(null);
  const [isGeneratingTags, setIsGeneratingTags] = useState(false);
  const [isProofreading, setIsProofreading] = useState(false);
  const [proofreaderAvailable, setProofreaderAvailable] = useState<boolean | null>(null);
  const [newTag, setNewTag] = useState('');
  const [detailPanelWidth, setDetailPanelWidth] = useState(0); // Will be initialized to 66% on mount
  const [isResizing, setIsResizing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; visible: boolean }>({
    message: '',
    type: 'info',
    visible: false,
  });
  const [consoleRecallEnabled, setConsoleRecallEnabled] = useState<boolean>(false);


  // Initialize detail panel width to 66% of container
  useEffect(() => {
    const initializeWidth = () => {
      const container = document.querySelector('.solutions-container');
      if (container) {
        const containerWidth = container.clientWidth;
        const defaultWidth = Math.floor(containerWidth * 0.66);
        // Constrain to min (400px) and max (90% of container or 1200px)
        const maxWidth = Math.min(containerWidth * 0.9, 1200);
        const constrainedWidth = Math.min(Math.max(defaultWidth, 400), maxWidth);
        setDetailPanelWidth(constrainedWidth);
      } else {
        // Fallback if container not found yet
        setDetailPanelWidth(530); // Approximately 66% of 800px
      }
    };

    // Initialize on mount and delay slightly to ensure container is rendered
    const mountTimeout = window.setTimeout(initializeWidth, 0);

    // Re-initialize on window resize (but not during manual resizing)
    let resizeTimeout: number;
    const handleResize = () => {
      if (!isResizing) {
        clearTimeout(resizeTimeout);
        resizeTimeout = window.setTimeout(initializeWidth, 100);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
      clearTimeout(mountTimeout);
    };
  }, [isResizing]);

  // Recalculate width when a detail panel is opened
  useEffect(() => {
    if (selectedSolution || selectedTask) {
      const container = document.querySelector('.solutions-container');
      if (container) {
        const containerWidth = container.clientWidth;
        const defaultWidth = Math.floor(containerWidth * 0.66);
        const maxWidth = Math.min(containerWidth * 0.9, 1200);
        const constrainedWidth = Math.min(Math.max(defaultWidth, 400), maxWidth);
        setDetailPanelWidth(constrainedWidth);
      }
    }
  }, [selectedSolution, selectedTask]);

  // Handle panel resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const container = document.querySelector('.solutions-container');
      if (!container) return;
      
      const containerRect = container.getBoundingClientRect();
      const newWidth = containerRect.right - e.clientX;
      
      // Constrain width between 300px and max (90% of container or 1200px)
      const maxWidth = Math.min(containerRect.width * 0.9, 1200);
      const constrainedWidth = Math.min(Math.max(newWidth, 300), maxWidth);
      setDetailPanelWidth(constrainedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (isResizing) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    loadSolutions();
    loadBackgroundTasks();
    loadConsoleRecallSetting();
    
    const listener = (message: any) => {
      if (message.action === 'backgroundTaskUpdate') {
        loadBackgroundTasks();
        // Update the selected task in real-time if it's currently open
        if (selectedTask && message.taskId === selectedTask.id) {
          chrome.runtime.sendMessage({ action: 'getTaskStatus', taskId: message.taskId }, (response) => {
            if (response?.task) {
              setSelectedTask(response.task);
            }
          });
        }
      }
      if (message.action === 'backgroundTaskComplete') {
        loadBackgroundTasks();
        loadSolutions();
        showToast('Solution saved: ' + message.pageTitle, 'success');
        // Close the task detail panel if it was open
        if (selectedTask?.id === message.taskId) {
          setSelectedTask(null);
        }
      }
    };
    
    chrome.runtime.onMessage.addListener(listener);
    
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [selectedTask]);

  // Check URL hash for solution ID on mount and after solutions load
  useEffect(() => {
    const checkUrlForSolution = () => {
      const hash = window.location.hash;
      if (hash && hash.startsWith('#solution=')) {
        const solutionId = hash.substring('#solution='.length);
        if (solutionId && solutions.length > 0) {
          const solution = solutions.find(s => s.id === solutionId);
          if (solution) {
            setSelectedSolution(solution);
            setSelectedTask(null);
            setIsEditing(false);
            setEditedSolution(null);
            // Clear the hash after selecting
            window.history.replaceState(null, '', window.location.pathname);
          }
        }
      }
    };

    // Check after solutions are loaded
    if (solutions.length > 0) {
      checkUrlForSolution();
    }
  }, [solutions]);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type, visible: true });
  };

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
        // Load notes from tasks, but preserve existing local notes
        setTaskNotes(prevNotes => {
          const notes: { [key: string]: string } = { ...prevNotes };
          response.tasks.forEach((task: BackgroundTask) => {
            // Only update if task has notes and we don't have local notes yet
            if (task.notes && !notes[task.id]) {
              notes[task.id] = task.notes;
            }
          });
          return notes;
        });
      }
    });
  };

  const loadConsoleRecallSetting = () => {
    chrome.storage.local.get(['consoleRecallEnabled'], (result) => {
      // Default to false if not set
      const enabled = result.consoleRecallEnabled !== undefined ? result.consoleRecallEnabled : false;
      setConsoleRecallEnabled(enabled);
    });
  };

  const toggleConsoleRecall = (enabled: boolean) => {
    setConsoleRecallEnabled(enabled);
    chrome.storage.local.set({ consoleRecallEnabled: enabled }, () => {
      // Notify background script to enable/disable debugger
      chrome.runtime.sendMessage({
        action: 'toggleConsoleRecall',
        enabled: enabled
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('Failed to toggle console recall:', chrome.runtime.lastError);
          showToast('Failed to update setting', 'error');
          // Revert state on error
          setConsoleRecallEnabled(!enabled);
        } else {
          showToast(
            enabled 
              ? 'Console Recall enabled - errors will be matched to notes' 
              : 'Console Recall disabled',
            'info'
          );
        }
      });
    });
  };

  const handleTaskClick = (task: BackgroundTask) => {
    setSelectedSolution(null);
    setIsEditing(false);
    setEditedSolution(null);
    setSelectedTask(task);
  };

  const deleteSolution = async (id: string) => {
    if (!confirm('Are you sure you want to delete this solution?')) return;

    chrome.runtime.sendMessage({ action: 'deleteSolution', id }, (response) => {
      if (response?.success) {
        setSolutions(solutions.filter(s => s.id !== id));
        if (selectedSolution?.id === id) {
          setSelectedSolution(null);
        }
        showToast('Solution deleted', 'success');
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
        showToast('Changes saved', 'success');
      }
    });
  };

  const addTagToEdited = () => {
    if (!editedSolution || !newTag.trim()) return;
    const trimmedTag = newTag.trim().toLowerCase();
    if (!editedSolution.tags?.includes(trimmedTag)) {
      setEditedSolution({
        ...editedSolution,
        tags: [...(editedSolution.tags || []), trimmedTag]
      });
    }
    setNewTag('');
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
        showToast('All solutions cleared', 'info');
      }
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard', 'success');
  };

  const openInWindow = () => {
    const url = chrome.runtime.getURL('index.html');
    window.open(url, '_blank');
  };

  const generateTags = async (solution: CapturedSolution) => {
    setIsGeneratingTags(true);
    
    chrome.runtime.sendMessage({
      action: 'generateTags',
      title: solution.title,
      text: solution.text.substring(0, 500)
    }, (response) => {
      setIsGeneratingTags(false);
      
      if (chrome.runtime.lastError) {
        showToast('Failed to generate tags', 'error');
        return;
      }

      if (response && response.success && response.tags) {
        const updatedSolutions = solutions.map(s => 
          s.id === solution.id ? { ...s, tags: response.tags } : s
        );
        setSolutions(updatedSolutions);
        
        if (selectedSolution?.id === solution.id) {
          setSelectedSolution({ ...selectedSolution, tags: response.tags });
        }

        chrome.runtime.sendMessage({ 
          action: 'updateSolution', 
          id: solution.id, 
          updates: { tags: response.tags } 
        });

        showToast('Tags generated', 'success');
      } else {
        showToast(response?.error || 'Failed to generate tags', 'error');
      }
    });
  };

  const proofreadNotes = async () => {
    if (!editedSolution || !editedSolution.notes || editedSolution.notes.trim() === '') {
      showToast('No notes to proofread', 'info');
      return;
    }

    setIsProofreading(true);
    
    console.log('Original notes:', editedSolution.notes);
    
    chrome.runtime.sendMessage({
      action: 'proofreadText',
      text: editedSolution.notes
    }, (response) => {
      setIsProofreading(false);
      
      console.log('Proofread response:', response);
      
      if (chrome.runtime.lastError) {
        showToast('Failed to proofread notes', 'error');
        setProofreaderAvailable(false);
        return;
      }

      if (response && response.success) {
        console.log('Corrected text:', response.correctedText);
        console.log('Has corrections:', response.hasCorrections);
        console.log('Number of corrections:', response.corrections?.length);
        
        // Mark as available on first success
        if (proofreaderAvailable === null) {
          setProofreaderAvailable(true);
        }
        
        // Always update with corrected text, even if no corrections
        setEditedSolution({
          ...editedSolution,
          notes: response.correctedText
        });
        
        if (response.hasCorrections) {
          showToast(`Fixed ${response.corrections.length} mistake${response.corrections.length !== 1 ? 's' : ''}`, 'success');
        } else {
          showToast('No corrections needed!', 'success');
        }
      } else {
        // If it's not available, hide the button
        if (response?.notAvailable) {
          setProofreaderAvailable(false);
        }
        showToast(response?.error || 'Failed to proofread notes', 'error');
      }
    });
  };

  const filteredSolutions = solutions.filter(s => 
    s.text.toLowerCase().includes(filter.toLowerCase()) ||
    s.title.toLowerCase().includes(filter.toLowerCase()) ||
    (s.notes && s.notes.toLowerCase().includes(filter.toLowerCase())) ||
    (s.tags && s.tags.some(tag => tag.toLowerCase().includes(filter.toLowerCase()))) ||
    (s.summary && s.summary.toLowerCase().includes(filter.toLowerCase()))
  );

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const compareDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffTime = today.getTime() - compareDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  };

  const parseMarkdown = (markdown: string): string => {
    const codeBlocks: string[] = [];
    let text = markdown.replace(/```[\s\S]*?```/g, (match) => {
      const placeholder = `___CODE_BLOCK_${codeBlocks.length}___`;
      codeBlocks.push(match);
      return placeholder;
    });
    
    const inlineCode: string[] = [];
    text = text.replace(/`[^`]+`/g, (match) => {
      const placeholder = `___INLINE_CODE_${inlineCode.length}___`;
      inlineCode.push(match);
      return placeholder;
    });
    
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    
    codeBlocks.forEach((block, i) => {
      const code = block.replace(/```(\w+)?\n([\s\S]*?)```/, (_, _lang, content) => {
        const escapedContent = content
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return `<pre class="bg-black/80 text-gray-100 p-3 rounded-lg overflow-x-auto my-2 font-mono text-xs"><code>${escapedContent}</code></pre>`;
      });
      html = html.replace(`___CODE_BLOCK_${i}___`, code);
    });
    
    inlineCode.forEach((code, i) => {
      const escapedCode = code
        .replace(/`([^`]+)`/, (_, content) => {
          const escaped = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          return `<code class="bg-primary/10 text-primary-600 dark:text-primary px-2 py-0.5 rounded font-mono text-xs">${escaped}</code>`;
        });
      html = html.replace(`___INLINE_CODE_${i}___`, escapedCode);
    });
    
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
    html = html.replace(/^[\*\-]\s+(.+)$/gm, '<li class="ml-4">$1</li>');
    html = html.replace(/\n\n/g, '<br><br>');
    html = html.replace(/\n/g, '<br>');
    
    return html;
  };

  if (loading) {
    return (
      <div className="w-full min-w-[800px] min-h-[600px] h-screen flex items-center justify-center gradient-light">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass px-8 py-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-black/80 dark:text-white font-medium">Loading...</span>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-[800px] min-h-[600px] h-screen flex flex-col gradient-light">
      {/* Toast Notification */}
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.visible}
        onClose={() => setToast({ ...toast, visible: false })}
      />

      {/* Header Toolbar */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="toolbar m-4 mb-0"
      >
        <div className="flex items-center gap-3">

          <h1 className="text-xl font-semibold text-black/90 dark:text-white">MindStack</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg backdrop-blur-md transition-all duration-300 ${
            consoleRecallEnabled 
              ? 'bg-amber-500/15 dark:bg-amber-500/10 border border-amber-500/30 shadow-sm' 
              : 'bg-white/10 dark:bg-white/5 border border-white/20'
          }`}>
            <Bug className={`w-4 h-4 transition-colors duration-300 ${
              consoleRecallEnabled 
                ? 'text-amber-600 dark:text-amber-400' 
                : 'text-black/60 dark:text-white/60'
            }`} />
            <Toggle
              checked={consoleRecallEnabled}
              onChange={(e) => {
                e.stopPropagation();
                toggleConsoleRecall(e.target.checked);
              }}
              label="Console Recall"
              title={consoleRecallEnabled ? "Console Recall is enabled - matching errors to notes" : "Console Recall is disabled"}
            />
          </div>
        {solutions.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Clear All
            </Button>
          )}

          <Button variant="outline" size="sm" onClick={openInWindow}>
            <ExternalLink className="w-4 h-4" />
            New Tab
          </Button>
        </div>
      </motion.header>

      {/* Main Content Container */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Solutions List */}
        {solutions.length === 0 && backgroundTasks.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex-1 flex items-center justify-center p-8"
        >
          <Card animate className="text-center max-w-md">
            <h2 className="text-2xl font-semibold text-black/90 dark:text-white mb-2">No solutions yet</h2>
            <p className="text-sm muted mb-6">Visit any webpage and select text of the solution to your question to capture it.</p>
            <div className="glass p-4 rounded-lg text-left">
              <h3 className="text-sm font-semibold text-black/90 dark:text-white mb-3">How to use:</h3>
              <ol className="text-sm muted space-y-2 ml-4 list-decimal">
              <li>Go to any page</li>
              <li>Select the text of the solution to your question</li>
                <li>Click "Capture Solution"</li>
              <li>Your solution will be saved here!</li>
            </ol>
          </div>
          </Card>
        </motion.div>
      ) : (
        <>
          {/* Search Toolbar */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="toolbar mx-4 mt-4 mb-0"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40 dark:text-white/40" />
            <input
              type="text"
              placeholder="Search solutions..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm text-black/90 dark:!text-white bg-white/10 dark:bg-white/5 border border-white/20 dark:border-white/15 rounded-lg outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-black/40 dark:placeholder:text-white/40 transition-all"
            />
          </div>
            <span className="text-xs muted whitespace-nowrap">
              {filteredSolutions.length} solution{filteredSolutions.length !== 1 ? 's' : ''}
            </span>
          </motion.div>

          {/* Solutions Grid/List */}
          <div className="flex-1 flex mx-4 my-4 overflow-hidden solutions-container">
            {/* Solutions List */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 }}
              className="flex-1 overflow-y-auto space-y-2"
            >
              <AnimatePresence>
                {/* Background Tasks */}
                {backgroundTasks.map((task, idx) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: idx * 0.04, duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    onClick={() => handleTaskClick(task)}
                    className={`glass p-4 cursor-pointer transition-all hover:bg-white/20 relative ${
                      selectedTask?.id === task.id ? 'ring-2 ring-primary/40 bg-white/20' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start gap-3 mb-2">
                      <div className="flex-1 font-semibold text-sm text-black/90 dark:text-white line-clamp-2 flex items-center gap-2">
                        <span>{task.pageTitle}</span>
                        {task.status === 'processing' && (
                          <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        )}
                      </div>
                      <div className="text-xs muted whitespace-nowrap">{formatDate(task.startTime)}</div>
                    </div>
                    
                    <div className="flex gap-3 mb-2">
                      <span className={`text-xs font-semibold transition-colors ${task.progress.format ? 'text-green-500' : 'text-black/30 dark:text-white/30'}`}>
                        {task.progress.format ? '✓' : '○'} Format
                      </span>
                      <span className={`text-xs font-semibold transition-colors ${task.progress.title ? 'text-green-500' : 'text-black/30 dark:text-white/30'}`}>
                        {task.progress.title ? '✓' : '○'} Title
                      </span>
                      <span className={`text-xs font-semibold transition-colors ${task.progress.tags ? 'text-green-500' : 'text-black/30 dark:text-white/30'}`}>
                        {task.progress.tags ? '✓' : '○'} Tags
                      </span>
                      <span className={`text-xs font-semibold transition-colors ${task.progress.summary ? 'text-green-500' : 'text-black/30 dark:text-white/30'}`}>
                        {task.progress.summary ? '✓' : '○'} Summary
                      </span>
                    </div>
                  </motion.div>
                ))}

                {/* Solutions */}
                {filteredSolutions.map((solution, idx) => (
                  <motion.div
                    key={solution.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: (idx + backgroundTasks.length) * 0.04, duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    onClick={() => {
                      setSelectedSolution(solution);
                      setSelectedTask(null);
                    }}
                    className={`glass p-4 cursor-pointer transition-all hover:bg-white/20 ${
                      selectedSolution?.id === solution.id ? 'ring-2 ring-primary/40 bg-white/20' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start gap-3 mb-2">
                      <div className="flex-1 font-semibold text-sm text-black/90 dark:text-white line-clamp-2">
                        {solution.title}
                      </div>
                      <div className="text-xs muted whitespace-nowrap">{formatDate(solution.timestamp)}</div>
                    </div>
                    <div className="text-xs muted line-clamp-2 mb-2">
                      {solution.summary ? solution.summary.substring(0, 150) : solution.text.substring(0, 100)}...
                    </div>
                    {(solution.tags && solution.tags.length > 0) && (
                      <div className="flex gap-1 flex-wrap">
                        {solution.tags.slice(0, 3).map((tag, idx) => (
                          <span key={idx} className="text-[10px] bg-white/20 dark:bg-white/10 px-2 py-0.5 rounded-full">
                            {tag}
                          </span>
                        ))}
                        {solution.tags.length > 3 && (
                          <span className="text-[10px] muted">+{solution.tags.length - 3}</span>
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>

            {/* Detail Panel */}
            <AnimatePresence mode="wait">
            {selectedTask && (
                <>
                  {/* Resize Handle */}
                  <div
                    className="w-1 hover:w-2 bg-white/10 hover:bg-primary/40 transition-all cursor-col-resize relative group flex items-center justify-center"
                    onMouseDown={() => setIsResizing(true)}
                  >
                    <div className="absolute inset-y-0 -left-1 -right-1" />
                    <div className="absolute flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-1 h-1 rounded-full bg-white/40" />
                      <div className="w-1 h-1 rounded-full bg-white/40" />
                      <div className="w-1 h-1 rounded-full bg-white/40" />
                    </div>
                  </div>
                  
                  <motion.div
                    key="task-detail"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0, width: detailPanelWidth || 530 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    style={{ width: detailPanelWidth || 530 }}
                    className="glass p-6 overflow-y-auto flex-shrink-0"
                  >
                  {/* Header */}
                  <div className="flex justify-between items-start mb-6">
                    <h3 className="text-lg font-semibold text-black/90 dark:text-white">
                      Processing Solution
                    </h3>
                    <button 
                      onClick={() => setSelectedTask(null)}
                      className="hover:bg-white/20 rounded-lg p-1 transition-colors cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Processing View */}
                  <div className="space-y-4">
                      {/* Page Info */}
                      <div>
                        <label className="block text-xs font-semibold text-black/70 dark:text-white mb-2 uppercase tracking-wide">
                          Page
                        </label>
                        <div className="text-sm text-black/90 dark:text-white">{selectedTask.pageTitle}</div>
                      </div>

                      {/* Progress Indicators */}
                      <div>
                        <label className="block text-xs font-semibold text-black/70 dark:text-white mb-2 uppercase tracking-wide">
                          Progress
                        </label>
                        <div className="glass p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Format</span>
                            <span className={`text-sm font-semibold ${selectedTask.progress.format ? 'text-green-500' : 'text-black/30 dark:text-white/30'}`}>
                              {selectedTask.progress.format ? '✓ Complete' : '○ Pending'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Title</span>
                            <span className={`text-sm font-semibold ${selectedTask.progress.title ? 'text-green-500' : 'text-black/30 dark:text-white/30'}`}>
                              {selectedTask.progress.title ? '✓ Complete' : '○ Pending'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Tags</span>
                            <span className={`text-sm font-semibold ${selectedTask.progress.tags ? 'text-green-500' : 'text-black/30 dark:text-white/30'}`}>
                              {selectedTask.progress.tags ? '✓ Complete' : '○ Pending'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Summary</span>
                            <span className={`text-sm font-semibold ${selectedTask.progress.summary ? 'text-green-500' : 'text-black/30 dark:text-white/30'}`}>
                              {selectedTask.progress.summary ? '✓ Complete' : '○ Pending'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Generated fields so far */}
                      {selectedTask.generatedData && (
                        <div className="glass p-4 space-y-4">
                          <div className="text-sm font-semibold text-primary mb-2">
                            Generated Fields (In Progress)
                          </div>

                          {selectedTask.generatedData.title && (
                            <div>
                              <label className="block text-xs font-semibold text-black/70 dark:text-white mb-2 uppercase tracking-wide">
                                Title
                              </label>
                              <div className="text-sm text-black/90 dark:text-white">{selectedTask.generatedData.title}</div>
                            </div>
                          )}

                          {selectedTask.generatedData.tags && selectedTask.generatedData.tags.length > 0 && (
                            <div>
                              <label className="block text-xs font-semibold text-black/70 dark:text-white mb-2 uppercase tracking-wide">
                                Tags
                              </label>
                              <div className="flex flex-wrap gap-2">
                                {selectedTask.generatedData.tags.map((tag: string, idx: number) => (
                                  <Tag key={idx}>{tag}</Tag>
                                ))}
                              </div>
                            </div>
                          )}

                          {selectedTask.generatedData.summary && (
                            <div>
                              <label className="block text-xs font-semibold text-black/70 dark:text-white mb-2 uppercase tracking-wide">
                                Summary
                              </label>
                              <div className="text-sm text-black/80 dark:text-white">{selectedTask.generatedData.summary}</div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Notes Field */}
                      <div>
                        <Textarea
                          label="Notes (Optional)"
                          placeholder="Add context, notes, or why this solution works..."
                          rows={4}
                          value={taskNotes[selectedTask.id] || ''}
                          onChange={(e) => {
                            const newNotes = e.target.value;
                            setTaskNotes({ ...taskNotes, [selectedTask.id]: newNotes });
                            // Auto-save notes in real-time during processing
                            chrome.runtime.sendMessage({
                              action: 'updateTaskNotes',
                              taskId: selectedTask.id,
                              notes: newNotes
                            });
                          }}
                        />
                      </div>
                  </div>
                </motion.div>
                </>
              )}
            {selectedSolution && !selectedTask && (
                <>
                  {/* Resize Handle */}
                  <div
                    className="w-1 hover:w-2 bg-white/10 hover:bg-primary/40 transition-all cursor-col-resize relative group flex items-center justify-center"
                    onMouseDown={() => setIsResizing(true)}
                  >
                    <div className="absolute inset-y-0 -left-1 -right-1" />
                    <div className="absolute flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-1 h-1 rounded-full bg-white/40" />
                      <div className="w-1 h-1 rounded-full bg-white/40" />
                      <div className="w-1 h-1 rounded-full bg-white/40" />
                    </div>
                  </div>
                  
                  <motion.div
                    key="solution-detail"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0, width: detailPanelWidth || 530 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    style={{ width: detailPanelWidth || 530 }}
                    className="glass p-6 overflow-y-auto flex-shrink-0"
                  >
                  {/* Header */}
                  <div className="flex justify-between items-start mb-6">
                    <h3 className="text-lg font-semibold text-black/90 dark:text-white">
                      {isEditing ? 'Edit Solution' : 'Details'}
                  </h3>
                  <button 
                    onClick={() => {
                      setSelectedSolution(null);
                      setIsEditing(false);
                      setEditedSolution(null);
                    }}
                      className="hover:bg-white/20 rounded-lg p-1 transition-colors cursor-pointer"
                  >
                      <X className="w-5 h-5" />
                  </button>
                </div>
                
                  {isEditing && editedSolution ? (
                    <div className="space-y-4">
                      <Input
                        label="Title"
                          value={editedSolution.title}
                          onChange={(e) => setEditedSolution({ ...editedSolution, title: e.target.value })}
                        />

                      <Textarea
                        label="Full Text"
                          value={editedSolution.text}
                          onChange={(e) => setEditedSolution({ ...editedSolution, text: e.target.value })}
                        rows={6}
                        className="font-mono"
                        />

                      {editedSolution.summary && (
                        <Textarea
                          label="Summary"
                            value={editedSolution.summary}
                            onChange={(e) => setEditedSolution({ ...editedSolution, summary: e.target.value })}
                          rows={4}
                        />
                      )}

                      <div>
                        <label className="block text-xs font-semibold text-black/70 dark:text-white mb-2 uppercase tracking-wide">
                          Tags
                        </label>
                        <div className="flex gap-2 flex-wrap mb-2">
                          <AnimatePresence>
                            {editedSolution.tags?.map((tag) => (
                              <Tag key={tag} onRemove={() => removeTagFromEdited(tag)}>
                              {tag}
                              </Tag>
                            ))}
                          </AnimatePresence>
                        </div>
                        <div className="flex gap-2">
                        <input
                          type="text"
                            placeholder="Add tag..."
                            value={newTag}
                            onChange={(e) => setNewTag(e.target.value)}
                          onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addTagToEdited();
                              }
                            }}
                            className="flex-1 px-3 py-2 text-sm text-black/90 dark:!text-white bg-white/10 dark:bg-white/5 border border-white/20 dark:border-white/15 rounded-lg outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-black/40 dark:placeholder:text-white/40"
                          />
                          <Button size="sm" onClick={addTagToEdited}>
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-xs font-semibold text-black/70 dark:text-white uppercase tracking-wide">
                            Notes
                          </label>
                          {proofreaderAvailable !== false && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={proofreadNotes}
                              isLoading={isProofreading}
                              disabled={isProofreading || !editedSolution.notes?.trim()}
                              title="Check grammar, spelling, and punctuation"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Proofread
                            </Button>
                          )}
                        </div>
                        <Textarea
                          value={editedSolution.notes || ''}
                          onChange={(e) => setEditedSolution({ ...editedSolution, notes: e.target.value })}
                          rows={4}
                          placeholder="Add your notes..."
                        />
                      </div>

                      <div className="flex gap-2 pt-4">
                        <Button onClick={saveEdits} className="flex-1">
                          Save Changes
                        </Button>
                        <Button variant="ghost" onClick={cancelEditing}>
                          Cancel
                        </Button>
                      </div>
                      </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold muted mb-2 uppercase tracking-wide">Title</label>
                        <div className="text-sm text-black/90 dark:text-white font-medium">{selectedSolution.title}</div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold muted mb-2 uppercase tracking-wide">Source</label>
                        <a 
                          href={selectedSolution.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-sm text-primary hover:text-primary-600 underline break-all flex items-center gap-1"
                        >
                          View source
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>

                      {selectedSolution.summary && (
                        <div>
                          <label className="block text-xs font-semibold muted mb-2 uppercase tracking-wide">Summary</label>
                          <div
                            className="glass p-3 text-sm text-black/80 dark:text-white rounded-lg"
                            dangerouslySetInnerHTML={{ __html: parseMarkdown(selectedSolution.summary) }}
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-semibold muted mb-2 uppercase tracking-wide">Full Text</label>
                        <div
                          className="glass p-3 text-sm text-black/80 dark:text-white rounded-lg max-h-[300px] overflow-y-auto"
                          dangerouslySetInnerHTML={{ __html: parseMarkdown(selectedSolution.text) }}
                        />
                      </div>

                      {selectedSolution.notes && (
                        <div>
                          <label className="block text-xs font-semibold muted mb-2 uppercase tracking-wide">Notes</label>
                          <div 
                            className="glass p-3 text-sm text-black/80 dark:text-white rounded-lg"
                            dangerouslySetInnerHTML={{ __html: parseMarkdown(selectedSolution.notes) }}
                          />
                        </div>
                      )}

                      {selectedSolution.tags && selectedSolution.tags.length > 0 && (
                        <div>
                          <label className="block text-xs font-semibold muted mb-2 uppercase tracking-wide">Tags</label>
                          <div className="flex gap-2 flex-wrap">
                            {selectedSolution.tags.map((tag) => (
                              <Tag key={tag}>{tag}</Tag>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-semibold muted mb-2 uppercase tracking-wide">Captured</label>
                        <div className="text-sm text-black/80 dark:text-white">
                          {new Date(selectedSolution.timestamp).toLocaleString()}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 pt-4 border-t border-white/10">
                        <Button onClick={startEditing} variant="outline">
                          <Edit2 className="w-4 h-4" />
                          Edit Solution
                        </Button>
                        <Button
                          onClick={() => generateTags(selectedSolution)}
                          variant="outline"
                          isLoading={isGeneratingTags}
                          disabled={isGeneratingTags}
                        >
                          {selectedSolution.tags?.length ? 'Regenerate Tags' : 'Generate Tags'}
                        </Button>
                        <Button onClick={() => copyToClipboard(selectedSolution.text)} variant="outline">
                          <Copy className="w-4 h-4" />
                          Copy Text
                        </Button>
                        <Button onClick={() => deleteSolution(selectedSolution.id)} variant="outline">
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </Button>
                </div>
              </div>
            )}
                </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
      </div>
    </div>
  );
}

export default App;
