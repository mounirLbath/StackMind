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

function App() {
  const [solutions, setSolutions] = useState<CapturedSolution[]>([]);
  const [selectedSolution, setSelectedSolution] = useState<CapturedSolution | null>(null);
  const [filter, setFilter] = useState('');
  const [showFullText, setShowFullText] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSolutions();
  }, []);

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

  const generateTags = async (solution: CapturedSolution) => {
    chrome.runtime.sendMessage({
      action: 'generateTags',
      title: solution.title,
      text: solution.text.substring(0, 500)
    }, (response) => {
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

  const filteredSolutions = solutions.filter(s => 
    s.text.toLowerCase().includes(filter.toLowerCase()) ||
    s.title.toLowerCase().includes(filter.toLowerCase()) ||
    (s.notes && s.notes.toLowerCase().includes(filter.toLowerCase()))
  );

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
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
          <div className="bg-gray-50 px-5 py-3 flex gap-3 items-center border-b border-gray-300">
            <input
              type="text"
              placeholder="Search solutions..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="flex-1 border border-gray-400 rounded px-3 py-2 text-sm outline-none bg-white transition-colors focus:border-gray-600"
            />
            <span className="text-xs text-gray-600 font-medium whitespace-nowrap">{filteredSolutions.length} solution{filteredSolutions.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="flex-1 flex overflow-hidden bg-white min-h-0">
            <div className="flex-1 overflow-y-auto border-r border-gray-300">
              {filteredSolutions.map((solution) => (
                <div
                  key={solution.id}
                  className={`px-5 py-4 border-b border-gray-200 cursor-pointer transition-colors hover:bg-gray-50 ${selectedSolution?.id === solution.id ? 'bg-gray-100 border-l-[3px] border-l-gray-700' : ''}`}
                  onClick={() => {
                    setSelectedSolution(solution);
                    setShowFullText(false);
                  }}
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
              <div className="w-[300px] min-w-[300px] max-w-[500px] lg:w-[400px] xl:w-[500px] flex flex-col bg-gray-50">
                <div className="p-3 flex justify-end">
                  <button 
                    className="bg-transparent border-0 text-2xl cursor-pointer text-gray-600 w-8 h-8 flex items-center justify-center rounded transition-colors hover:bg-gray-300" 
                    onClick={() => setSelectedSolution(null)}
                  >
                    ×
                  </button>
                </div>
                
                <div className="flex-1 px-5 pb-5 overflow-y-auto">
                  <h3 className="m-0 mb-5 text-base text-gray-900 font-semibold">Solution Details</h3>
                  
                  <div className="mb-5">
                    <label className="block font-semibold text-[11px] text-gray-700 mb-2 uppercase tracking-wide">Source:</label>
                    <a 
                      href={selectedSolution.url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-gray-800 underline text-[13px] break-words hover:text-gray-900"
                    >
                      {selectedSolution.title}
                    </a>
                  </div>

                  <div className="mb-5">
                    <div className="flex justify-between items-center mb-2">
                      <label className="block font-semibold text-[11px] text-gray-700 uppercase tracking-wide">
                        {selectedSolution.summary && !showFullText ? 'Summary' : 'Full Text'}:
                      </label>
                      {selectedSolution.summary && (
                        <button
                          onClick={() => setShowFullText(!showFullText)}
                          className="text-[11px] text-gray-600 hover:text-gray-900 underline"
                        >
                          {showFullText ? 'Show Summary' : 'Show Full Text'}
                        </button>
                      )}
                    </div>
                    <div className="bg-white border border-gray-300 rounded px-3 py-3 text-[13px] leading-relaxed text-gray-800 max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words">
                      {selectedSolution.summary && !showFullText ? selectedSolution.summary : selectedSolution.text}
                    </div>
                  </div>

                  {selectedSolution.notes && (
                    <div className="mb-5">
                      <label className="block font-semibold text-[11px] text-gray-700 mb-2 uppercase tracking-wide">Notes:</label>
                      <div className="bg-gray-100 border border-gray-300 rounded px-3 py-3 text-[13px] leading-relaxed text-gray-800">
                        {selectedSolution.notes}
                      </div>
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
                      className="bg-gray-800 text-white border border-gray-800 px-4 py-2.5 rounded cursor-pointer text-[13px] font-medium transition-colors text-left hover:bg-gray-900" 
                      onClick={() => generateTags(selectedSolution)}
                    >
                      {selectedSolution.tags && selectedSolution.tags.length > 0 ? 'Regenerate Tags' : 'Generate Tags with AI'}
                    </button>
                    <button 
                      className="bg-gray-300 text-gray-800 border border-gray-400 px-4 py-2.5 rounded cursor-pointer text-[13px] font-medium transition-colors text-left hover:bg-gray-400" 
                      onClick={() => copyToClipboard(selectedSolution.text)}
                    >
                      Copy Text
                    </button>
                    <button 
                      className="bg-gray-100 text-gray-700 border border-gray-400 px-4 py-2.5 rounded cursor-pointer text-[13px] font-medium transition-colors text-left hover:bg-gray-300" 
                      onClick={() => deleteSolution(selectedSolution.id)}
                    >
                      Delete
                    </button>
                  </div>
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
