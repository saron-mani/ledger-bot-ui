import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import './App.css';

// ⚠️ REPLACE THESE WITH YOUR ACTUAL SUPABASE CREDENTIALS
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Colors for the Pie Chart matching standard financial tracking apps
const COLORS = ['#0088FE', '#00C49F', '#FFBB28'];

function App() {
  const [tgUser, setTgUser] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Initialize Telegram Web App
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand(); 

    // 2. Identify the user
    let username = 'Anonymous';
    if (tg.initDataUnsafe?.user) {
      username = tg.initDataUnsafe.user.username || tg.initDataUnsafe.user.first_name;
    }
    setTgUser(username);

    // 3. Fetch their data
    fetchExpenses(username);
  }, []);

  async function fetchExpenses(username) {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('username', username)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setExpenses(data);
    } else if (error) {
      console.error("Database Error:", error);
    }
    setLoading(false);
  }

  // --- DATA PROCESSING FOR UI ---
  
  // Calculate total spent by account (SIB, Cash, SBI)
  const accountTotals = expenses.reduce((acc, curr) => {
    acc[curr.account] = (acc[curr.account] || 0) + curr.amount;
    return acc;
  }, {});

  // Format data for Recharts PieChart
  const chartData = Object.keys(accountTotals).map(key => ({
    name: key,
    value: accountTotals[key]
  }));

  // Calculate overall grand total
  const grandTotal = chartData.reduce((sum, item) => sum + item.value, 0);

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
            </div>

            {chartData.length > 0 ? (
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={chartData}
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `₹${value}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p style={{ marginTop: '20px', color: 'var(--tg-theme-hint-color)' }}>
                No expenses logged yet! Type an expense in the chat to see it here.
              </p>
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