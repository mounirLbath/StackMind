import { useEffect, useState } from 'react'
import './App.css'

interface CapturedSolution {
  id: string;
  text: string;
  url: string;
  title: string;
  timestamp: number;
  questionId?: string;
  notes?: string;
}

function App() {
  const [solutions, setSolutions] = useState<CapturedSolution[]>([]);
  const [selectedSolution, setSelectedSolution] = useState<CapturedSolution | null>(null);
  const [filter, setFilter] = useState('');
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
      <div className="app">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <h1>MindStack</h1>
        </div>
        {solutions.length > 0 && (
          <button className="clear-btn" onClick={clearAll} title="Clear all solutions">
            Clear All
          </button>
        )}
      </header>

      {solutions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">—</div>
          <h2>No solutions captured yet</h2>
          <p>Visit Stack Overflow and select text to capture solutions.</p>
          <div className="instructions">
            <h3>How to use:</h3>
            <ol>
              <li>Go to any Stack Overflow page</li>
              <li>Select the text of a solution</li>
              <li>Click the "Capture Solution" button</li>
              <li>Your solution will be saved here!</li>
            </ol>
          </div>
        </div>
      ) : (
        <>
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search solutions..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <span className="count">{filteredSolutions.length} solution{filteredSolutions.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="solutions-container">
            <div className="solutions-list">
              {filteredSolutions.map((solution) => (
                <div
                  key={solution.id}
                  className={`solution-item ${selectedSolution?.id === solution.id ? 'selected' : ''}`}
                  onClick={() => setSelectedSolution(solution)}
                >
                  <div className="solution-header">
                    <div className="solution-title">{solution.title}</div>
                    <div className="solution-date">{formatDate(solution.timestamp)}</div>
                  </div>
                  <div className="solution-preview">
                    {solution.text.substring(0, 100)}...
                  </div>
                  {solution.notes && (
                    <div className="solution-notes-badge">Has notes</div>
                  )}
                </div>
              ))}
            </div>

            {selectedSolution && (
              <div className="solution-detail">
                <div className="detail-header">
                  <button className="close-btn" onClick={() => setSelectedSolution(null)}>×</button>
                </div>
                
                <div className="detail-content">
                  <h3>Solution Details</h3>
                  
                  <div className="detail-section">
                    <label>Source:</label>
                    <a href={selectedSolution.url} target="_blank" rel="noopener noreferrer" className="source-link">
                      {selectedSolution.title}
                    </a>
                  </div>

                  <div className="detail-section">
                    <label>Captured Text:</label>
                    <div className="solution-text">{selectedSolution.text}</div>
                  </div>

                  {selectedSolution.notes && (
                    <div className="detail-section">
                      <label>Notes:</label>
                      <div className="solution-notes">{selectedSolution.notes}</div>
                    </div>
                  )}

                  <div className="detail-section">
                    <label>Captured:</label>
                    <div>{new Date(selectedSolution.timestamp).toLocaleString()}</div>
                  </div>

                  <div className="action-buttons">
                    <button 
                      className="btn btn-secondary" 
                      onClick={() => copyToClipboard(selectedSolution.text)}
                    >
                      Copy Text
                    </button>
                    <button 
                      className="btn btn-danger" 
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
