import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Sparkles, ExternalLink, Edit2, Copy, Trash2, Moon, Sun, Laptop, X, Plus } from 'lucide-react';
import { Button, Card, Tag, Input, Textarea, Toast, useTheme } from './lib/ui';

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
  status: 'processing' | 'completed' | 'error' | 'review';
  progress: {
    format: boolean;
    title: boolean;
    tags: boolean;
    summary: boolean;
  };
  pageTitle: string;
  startTime: number;
  notes?: string;
  // For review state
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
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTask[]>([]);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [taskNotes, setTaskNotes] = useState<{ [key: string]: string }>({});
  const [editedTaskData, setEditedTaskData] = useState<{ [key: string]: any }>({});
  const [isEditing, setIsEditing] = useState(false);
  const [editedSolution, setEditedSolution] = useState<CapturedSolution | null>(null);
  const [isGeneratingTags, setIsGeneratingTags] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; visible: boolean }>({
    message: '',
    type: 'info',
    visible: false,
  });

  const { theme, setTheme, effectiveTheme } = useTheme();

  useEffect(() => {
    loadSolutions();
    loadBackgroundTasks();
    
    const listener = (message: any) => {
      if (message.action === 'backgroundTaskUpdate') {
        loadBackgroundTasks();
      }
      if (message.action === 'backgroundTaskReview') {
        loadBackgroundTasks();
        showToast('Solution ready for review: ' + message.pageTitle, 'info');
      }
      if (message.action === 'backgroundTaskComplete') {
        loadBackgroundTasks();
        loadSolutions();
        showToast('Solution saved: ' + message.pageTitle, 'success');
      }
    };
    
    chrome.runtime.onMessage.addListener(listener);
    
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);

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

  const loadBackgroundTasks = (autoExpandTaskId?: string) => {
    chrome.runtime.sendMessage({ action: 'getBackgroundTasks' }, (response) => {
      if (response?.tasks) {
        setBackgroundTasks(response.tasks);
        // Auto-expand specific task if provided (from notification click)
        if (autoExpandTaskId) {
          setExpandedTaskId(autoExpandTaskId);
        }
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

  const saveTaskNotes = (taskId: string) => {
    const notes = taskNotes[taskId] || '';
    chrome.runtime.sendMessage({
      action: 'updateTaskNotes',
      taskId,
      notes
    }, (response) => {
      if (response?.success) {
        showToast('Notes saved', 'success');
      }
    });
  };

  const approveSolution = (taskId: string) => {
    const editedData = editedTaskData[taskId];
    chrome.runtime.sendMessage({
      action: 'approveSolution',
      taskId,
      editedData
    }, (response) => {
      if (response?.success) {
        showToast('Solution saved!', 'success');
        // Clean up edited data
        const newEditedData = { ...editedTaskData };
        delete newEditedData[taskId];
        setEditedTaskData(newEditedData);
        loadBackgroundTasks();
        loadSolutions();
      }
    });
  };

  const rejectSolution = (taskId: string) => {
    if (!confirm('Are you sure you want to discard this solution?')) return;
    
    chrome.runtime.sendMessage({
      action: 'rejectSolution',
      taskId
    }, (response) => {
      if (response?.success) {
        showToast('Solution discarded', 'info');
        loadBackgroundTasks();
      }
    });
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
      <div className={`w-full min-w-[800px] min-h-[600px] h-screen flex items-center justify-center ${effectiveTheme === 'dark' ? 'gradient-dark' : 'gradient-light'}`}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass px-8 py-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-black/80 dark:text-white/90 font-medium">Loading...</span>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`w-full min-w-[800px] min-h-[600px] h-screen flex flex-col ${effectiveTheme === 'dark' ? 'gradient-dark' : 'gradient-light'}`}>
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
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-black/90 dark:text-white/95">MindStack</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme Toggle */}
          <div className="flex items-center gap-1 glass px-2 py-1 rounded-lg">
            <button
              onClick={() => setTheme('light')}
              className={`p-1.5 rounded transition-colors ${theme === 'light' ? 'bg-white/30' : 'hover:bg-white/10'}`}
              title="Light mode"
            >
              <Sun className="w-4 h-4" />
            </button>
          <button 
              onClick={() => setTheme('system')}
              className={`p-1.5 rounded transition-colors ${theme === 'system' ? 'bg-white/30' : 'hover:bg-white/10'}`}
              title="System theme"
            >
              <Laptop className="w-4 h-4" />
          </button>
            <button 
              onClick={() => setTheme('dark')}
              className={`p-1.5 rounded transition-colors ${theme === 'dark' ? 'bg-white/30' : 'hover:bg-white/10'}`}
              title="Dark mode"
            >
              <Moon className="w-4 h-4" />
            </button>
          </div>

          <Button variant="outline" size="sm" onClick={openInWindow}>
            <ExternalLink className="w-4 h-4" />
            New Tab
          </Button>

          {solutions.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Clear All
            </Button>
          )}
        </div>
      </motion.header>

      {/* Main Content Container with Scrolling */}
      <div className="flex-1 overflow-y-auto">
        {/* Background Tasks Progress */}
        <AnimatePresence>
          {backgroundTasks.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mx-4 mt-4"
            >
            {backgroundTasks.map((task, idx) => {
              const isExpanded = expandedTaskId === task.id;
              return (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="glass mb-2 overflow-hidden"
                >
                  {/* Header */}
                  <div 
                    className="p-4 cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                  >
                    <div className="flex items-center justify-between">
              <div className="flex-1">
                        <div className="text-sm font-semibold text-black/90 dark:text-white/95 mb-2 flex items-center gap-2">
                          <span>Processing: {task.pageTitle}</span>
                          {task.status === 'processing' && (
                            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          )}
                </div>
                        <div className="flex gap-3">
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
              </div>
                      <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="text-black/60 dark:text-white/70"
                      >
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </motion.div>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-white/10"
                      >
                        <div className="p-4 space-y-4">
                          {task.status === 'review' && task.generatedData ? (
                            // Review Mode - EDITABLE
                            <>
                              <div className="glass p-4 space-y-4">
                                <div className="text-sm font-semibold text-green-600 dark:text-green-400 mb-2">
                                  ✓ Processing Complete - Review & Edit
                                </div>

                                {/* Full Text Content */}
                                <div>
                                  <label className="block text-xs font-semibold text-black/70 dark:text-white/80 mb-2 uppercase tracking-wide">
                                    Solution Content
                                  </label>
                                  <div className="glass p-4 max-h-64 overflow-y-auto">
                                    <pre className="text-xs text-black/80 dark:text-white/85 whitespace-pre-wrap font-mono">
                                      {editedTaskData[task.id]?.text ?? task.generatedData.text}
                                    </pre>
                                  </div>
                                </div>

                                {/* Markdown Preview */}
                                <div>
                                  <label className="block text-xs font-semibold text-black/70 dark:text-white/80 mb-2 uppercase tracking-wide">
                                    Markdown Preview
                                  </label>
                                  <div className="glass p-4 max-h-64 overflow-y-auto">
                                    <div 
                                      className="prose prose-sm dark:prose-invert max-w-none text-black/80 dark:text-white/85"
                                      dangerouslySetInnerHTML={{
                                        __html: (editedTaskData[task.id]?.text ?? task.generatedData.text)
                                          .replace(/&/g, '&amp;')
                                          .replace(/</g, '&lt;')
                                          .replace(/>/g, '&gt;')
                                          .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                                          .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                                          .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                                          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                          .replace(/\*(.*?)\*/g, '<em>$1</em>')
                                          .replace(/`(.*?)`/g, '<code>$1</code>')
                                          .replace(/\n\n/g, '<br/><br/>')
                                      }}
                                    />
                                  </div>
                                </div>
                                
                                {/* Title - Editable */}
                                <div>
                                  <Input
                                    label="Title"
                                    value={editedTaskData[task.id]?.title ?? task.generatedData.title}
                                    onChange={(e) => setEditedTaskData({
                                      ...editedTaskData,
                                      [task.id]: {
                                        ...editedTaskData[task.id],
                                        title: e.target.value
                                      }
                                    })}
                                  />
                                </div>

                                {/* Tags - Editable */}
                                <div>
                                  <label className="block text-xs font-semibold text-black/70 dark:text-white/80 mb-2 uppercase tracking-wide">
                                    Tags
                                  </label>
                                  <div className="flex flex-wrap gap-2 mb-2">
                                    {(editedTaskData[task.id]?.tags ?? task.generatedData?.tags ?? []).map((tag: string, idx: number) => (
                                      <Tag
                                        key={idx}
                                        onRemove={() => {
                                          const currentTags = editedTaskData[task.id]?.tags ?? task.generatedData?.tags ?? [];
                                          setEditedTaskData({
                                            ...editedTaskData,
                                            [task.id]: {
                                              ...editedTaskData[task.id],
                                              tags: currentTags.filter((_: string, i: number) => i !== idx)
                                            }
                                          });
                                        }}
                                      >
                                        {tag}
                                      </Tag>
                                    ))}
                                  </div>
                                  <Input
                                    placeholder="Add new tag..."
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                        const currentTags = editedTaskData[task.id]?.tags ?? task.generatedData?.tags ?? [];
                                        setEditedTaskData({
                                          ...editedTaskData,
                                          [task.id]: {
                                            ...editedTaskData[task.id],
                                            tags: [...currentTags, e.currentTarget.value.trim()]
                                          }
                                        });
                                        e.currentTarget.value = '';
                                      }
                                    }}
                                  />
                                </div>

                                {/* Summary - Editable */}
                                {task.generatedData.summary && (
                                  <div>
                                    <Textarea
                                      label="Summary"
                                      rows={3}
                                      value={editedTaskData[task.id]?.summary ?? task.generatedData.summary}
                                      onChange={(e) => setEditedTaskData({
                                        ...editedTaskData,
                                        [task.id]: {
                                          ...editedTaskData[task.id],
                                          summary: e.target.value
                                        }
                                      })}
                                    />
                                  </div>
                                )}

                                {/* Notes - Editable */}
                                <div>
                                  <Textarea
                                    label="Your Notes"
                                    placeholder="Add context, notes, or why this solution works..."
                                    rows={3}
                                    value={editedTaskData[task.id]?.notes ?? task.notes ?? ''}
                                    onChange={(e) => setEditedTaskData({
                                      ...editedTaskData,
                                      [task.id]: {
                                        ...editedTaskData[task.id],
                                        notes: e.target.value
                                      }
                                    })}
                                  />
                                </div>
                              </div>

                              {/* Review Actions */}
                              <div className="flex gap-2 justify-end pt-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    rejectSolution(task.id);
                                  }}
                                >
                                  <X className="w-4 h-4" />
                                  Discard
                                </Button>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    approveSolution(task.id);
                                  }}
                                >
                                  <Sparkles className="w-4 h-4" />
                                  Save Solution
                                </Button>
                              </div>
                            </>
                          ) : (
                            // Processing Mode
                            <>
                              {/* Page Info */}
                              <div>
                                <label className="block text-xs font-semibold text-black/70 dark:text-white/80 mb-2 uppercase tracking-wide">
                                  Page
                                </label>
                                <div className="text-sm text-black/90 dark:text-white/95">{task.pageTitle}</div>
                              </div>

                              {/* Notes Field */}
                              <div>
                                <Textarea
                                  label="Notes (Optional)"
                                  placeholder="Add context, notes, or why this solution works..."
                                  rows={4}
                                  value={taskNotes[task.id] || ''}
                                  onChange={(e) => setTaskNotes({ ...taskNotes, [task.id]: e.target.value })}
                                />
                              </div>

                              {/* Actions */}
                              <div className="flex gap-2 justify-end">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    saveTaskNotes(task.id);
                                  }}
                                >
                                  Save Notes
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Solutions List */}
        {solutions.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex-1 flex items-center justify-center p-8"
        >
          <Card animate className="text-center max-w-md">
            <div className="text-5xl mb-4 opacity-40">✨</div>
            <h2 className="text-2xl font-semibold text-black/90 dark:text-white/95 mb-2">No solutions yet</h2>
            <p className="text-sm muted mb-6">Visit Stack Overflow and select text to capture solutions.</p>
            <div className="glass p-4 rounded-lg text-left">
              <h3 className="text-sm font-semibold text-black/90 dark:text-white/95 mb-3">How to use:</h3>
              <ol className="text-sm muted space-y-2 ml-4 list-decimal">
              <li>Go to any Stack Overflow page</li>
              <li>Select the text of a solution</li>
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
            className="toolbar mx-4 mt-4"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40 dark:text-white/40" />
            <input
              type="text"
              placeholder="Search solutions..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm bg-white/10 dark:bg-white/5 border border-white/20 dark:border-white/15 rounded-lg outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-black/40 dark:placeholder:text-white/40 transition-all"
            />
          </div>
            <span className="text-xs muted whitespace-nowrap">
              {filteredSolutions.length} solution{filteredSolutions.length !== 1 ? 's' : ''}
            </span>
          </motion.div>

          {/* Solutions Grid/List */}
          <div className="flex-1 flex gap-4 m-4 overflow-hidden">
            {/* Solutions List */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 }}
              className="flex-1 overflow-y-auto space-y-2"
            >
              <AnimatePresence>
                {filteredSolutions.map((solution, idx) => (
                  <motion.div
                  key={solution.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: idx * 0.04, duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => setSelectedSolution(solution)}
                    className={`glass p-4 cursor-pointer transition-all hover:bg-white/20 ${
                      selectedSolution?.id === solution.id ? 'ring-2 ring-primary/40 bg-white/20' : ''
                    }`}
                >
                  <div className="flex justify-between items-start gap-3 mb-2">
                      <div className="flex-1 font-semibold text-sm text-black/90 dark:text-white/95 line-clamp-2">
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
            <AnimatePresence>
            {selectedSolution && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="w-[500px] glass p-6 overflow-y-auto"
                >
                  {/* Header */}
                  <div className="flex justify-between items-start mb-6">
                    <h3 className="text-lg font-semibold text-black/90 dark:text-white/95">
                      {isEditing ? 'Edit Solution' : 'Details'}
                  </h3>
                  <button 
                    onClick={() => {
                      setSelectedSolution(null);
                      setIsEditing(false);
                      setEditedSolution(null);
                    }}
                      className="hover:bg-white/20 rounded-lg p-1 transition-colors"
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
                        <label className="block text-xs font-semibold text-black/70 dark:text-white/80 mb-2 uppercase tracking-wide">
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
                            className="flex-1 px-3 py-2 text-sm bg-white/10 dark:bg-white/5 border border-white/20 dark:border-white/15 rounded-lg outline-none focus:ring-1 focus:ring-primary/40"
                          />
                          <Button size="sm" onClick={addTagToEdited}>
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      <Textarea
                        label="Notes"
                          value={editedSolution.notes || ''}
                          onChange={(e) => setEditedSolution({ ...editedSolution, notes: e.target.value })}
                        rows={4}
                        placeholder="Add your notes..."
                      />

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
                        <div className="text-sm text-black/90 dark:text-white/95 font-medium">{selectedSolution.title}</div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold muted mb-2 uppercase tracking-wide">Source</label>
                        <a 
                          href={selectedSolution.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-sm text-primary hover:text-primary-600 underline break-all flex items-center gap-1"
                        >
                          View on Stack Overflow
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>

                      {selectedSolution.summary && (
                        <div>
                          <label className="block text-xs font-semibold muted mb-2 uppercase tracking-wide">Summary</label>
                          <div
                            className="glass p-3 text-sm text-black/80 dark:text-white/90 rounded-lg"
                            dangerouslySetInnerHTML={{ __html: parseMarkdown(selectedSolution.summary) }}
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-semibold muted mb-2 uppercase tracking-wide">Full Text</label>
                        <div
                          className="glass p-3 text-sm text-black/80 dark:text-white/90 rounded-lg max-h-[300px] overflow-y-auto"
                          dangerouslySetInnerHTML={{ __html: parseMarkdown(selectedSolution.text) }}
                        />
                      </div>

                      {selectedSolution.notes && (
                        <div>
                          <label className="block text-xs font-semibold muted mb-2 uppercase tracking-wide">Notes</label>
                          <div 
                            className="glass p-3 text-sm text-black/80 dark:text-white/90 rounded-lg"
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
                        <div className="text-sm text-black/80 dark:text-white/90">
                          {new Date(selectedSolution.timestamp).toLocaleString()}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 pt-4 border-t border-white/10">
                        <Button onClick={startEditing} variant="primary">
                          <Edit2 className="w-4 h-4" />
                          Edit Solution
                        </Button>
                        <Button
                          onClick={() => generateTags(selectedSolution)}
                          variant="outline"
                          isLoading={isGeneratingTags}
                          disabled={isGeneratingTags}
                        >
                          <Sparkles className="w-4 h-4" />
                          {selectedSolution.tags?.length ? 'Regenerate Tags' : 'Generate Tags'}
                        </Button>
                        <Button onClick={() => copyToClipboard(selectedSolution.text)} variant="outline">
                          <Copy className="w-4 h-4" />
                          Copy Text
                        </Button>
                        <Button onClick={() => deleteSolution(selectedSolution.id)} variant="ghost">
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </Button>
                </div>
              </div>
            )}
                </motion.div>
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
