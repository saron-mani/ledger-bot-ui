import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import './App.css';

// ⚠️ KEEP YOUR SUPABASE CREDENTIALS HERE
const SUPABASE_URL = 'https://aawelgmbvxqzdzxazjyg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhd2VsZ21idnhxemR6eGF6anlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MDExOTAsImV4cCI6MjEwNzQ3NzE5MH0.Vp-b6pZc0gJxxrYvTPjsxmAiLgR7sYPoB5h32XNrjTM';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28DFF'];

function App() {
  const [tgUser, setTgUser] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // New AI Chart States
  const [aiChartData, setAiChartData] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand(); 

    let username = 'saron_mani';
    if (tg.initDataUnsafe?.user) {
      username = tg.initDataUnsafe.user.username || tg.initDataUnsafe.user.first_name;
    }
    setTgUser(username);
    fetchExpenses(username);
  }, []);

  async function fetchExpenses(username) {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('username', username)
      .order('created_at', { ascending: false });

    if (!error && data) setExpenses(data);
    setLoading(false);
  }

  // Updated Fetch Function for JSON processing
  async function categorizeExpenses() {
    setAnalyzing(true);
    setAiError('');
    try {
      const response = await fetch('https://ledger-online-bot.saron2code.workers.dev/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expenses })
      });
      
      // 1. Read the raw response first to catch HTML error pages
      const rawText = await response.text();
      
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        setAiError(`Cloudflare HTML Error: ${response.status} - ${rawText.substring(0, 40)}...`);
        setAnalyzing(false);
        return;
      }

      // 2. Catch JSON errors from the Worker (like a 500 crash)
      if (!response.ok) {
        setAiError(`Worker Error: ${data.error || 'Unknown Server Crash'}`);
        setAnalyzing(false);
        return;
      }
      
      // 3. Process the AI text if successful
      const cleanString = data.analysis.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedData = JSON.parse(cleanString);
      
      const formattedForChart = Object.keys(parsedData).map(key => ({
        name: key,
        value: Number(parsedData[key])
      }));

      setAiChartData(formattedForChart);
    } catch (err) {
      setAiError(`Frontend Error: ${err.message}`);
    }
    setAnalyzing(false);
  }

  const accountTotals = expenses.reduce((acc, curr) => {
    acc[curr.account] = (acc[curr.account] || 0) + curr.amount;
    return acc;
  }, {});

  const standardChartData = Object.keys(accountTotals).map(key => ({
    name: key,
    value: accountTotals[key]
  }));

  const grandTotal = standardChartData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="app-container">
      <div className="card">
        <h1 className="title">Expense Analysis</h1>
        <p className="subtitle">
          {tgUser ? `@${tgUser}'s Dashboard` : 'Loading profile...'}
        </p>

        {loading ? (
          <p style={{ marginTop: '20px' }}>Loading your data...</p>
        ) : (
          <>
            <div className="summary-box">
              <h2>Total Spent</h2>
              <p className="total-amount">₹{grandTotal.toFixed(2)}</p>
              
              <button 
                className="ai-button" 
                onClick={categorizeExpenses} 
                disabled={analyzing || expenses.length === 0}
              >
                {analyzing ? 'Processing...' : '🤖 AI Categorization'}
              </button>

              {aiError && <p style={{ color: '#ef4444', marginTop: '10px', fontSize: '0.875rem' }}>{aiError}</p>}
            </div>

            {/* AI Generated Category Chart */}
            {aiChartData && (
              <div className="chart-container" style={{ marginTop: '1rem' }}>
                <h3 style={{ fontSize: '0.875rem', color: 'var(--tg-theme-hint-color)', marginBottom: '0.5rem' }}>Smart Categories</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={aiChartData}
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {aiChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `₹${value}`} />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Standard Account Chart */}
            {!aiChartData && standardChartData.length > 0 && (
               <div className="chart-container" style={{ marginTop: '1rem' }}>
                 <h3 style={{ fontSize: '0.875rem', color: 'var(--tg-theme-hint-color)', marginBottom: '0.5rem' }}>By Account</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={standardChartData}
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {standardChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `₹${value}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="recent-transactions">
              <h3>Recent Logs</h3>
              <ul className="transaction-list">
                {expenses.slice(0, 5).map(exp => (
                  <li key={exp.id} className="transaction-item">
                    <span>{exp.category} <small style={{color: 'var(--tg-theme-hint-color)'}}>({exp.account})</small></span>
                    <span className="transaction-amount">₹{exp.amount}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;