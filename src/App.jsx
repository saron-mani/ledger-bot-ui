import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import './App.css';

// ⚠️ KEEP YOUR SUPABASE CREDENTIALS HERE
const SUPABASE_URL = 'https://aawelgmbvxqzdzxazjyg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhd2VsZ21idnhxemR6eGF6anlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MDExOTAsImV4cCI6MjEwNzQ3NzE5MH0.Vp-b6pZc0gJxxrYvTPjsxmAiLgR7sYPoB5h32XNrjTM';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PALETTE = ['#c8553d', '#3f7d6e', '#d9a23b', '#4d6a94', '#9a6b8f', '#7d8a4a', '#b0734a', '#6b6f78'];

/* ---------- helpers ---------- */
const inr = (n, dp = 2) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const shortDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

// Check if a database timestamp matches today in India
// Strict 12:00 AM to 11:59 PM boundary check in Indian Standard Time (IST)
const isToday = (isoString) => {
  const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  // Create strict timestamps for 12:00:00 AM and 11:59:59 PM in IST
  const todayStart = new Date(`${year}-${month}-${day}T00:00:00+05:30`).getTime();
  const todayEnd = new Date(`${year}-${month}-${day}T23:59:59+05:30`).getTime();
  
  const expTime = new Date(isoString).getTime();
  return expTime >= todayStart && expTime <= todayEnd;
};

function toSlices(list) {
  const clean = list
    .map((s) => ({ name: s.name, value: Number(s.value) }))
    .filter((s) => Number.isFinite(s.value) && s.value > 0)
    .sort((a, b) => b.value - a.value);
  const sum = clean.reduce((t, s) => t + s.value, 0);
  return clean.map((s, i) => ({
    ...s,
    pct: sum ? (s.value / sum) * 100 : 0,
    color: PALETTE[i % PALETTE.length],
  }));
}

/* ---------- breakdown (horizontal stacked bar) ---------- */
function Breakdown({ slices }) {
  const [hoverId, setHoverId] = useState(null);

  if (!slices.length) {
    return (
      <div className="status">
        <p>No expenses logged today.</p>
      </div>
    );
  }

  return (
    <div className="breakdown" onMouseLeave={() => setHoverId(null)}>
      <div className="bar">
        {slices.map((s) => (
          <div
            key={s.name}
            className="bar-seg"
            style={{ width: `${s.pct}%`, background: s.color, opacity: hoverId && hoverId !== s.name ? 0.2 : 1 }}
            onMouseEnter={() => setHoverId(s.name)}
          />
        ))}
      </div>
      <ul className="rows">
        {slices.map((s) => (
          <li
            key={s.name}
            className="row"
            data-dim={hoverId && hoverId !== s.name}
            onMouseEnter={() => setHoverId(s.name)}
          >
            <span className="swatch" style={{ background: s.color }} />
            <span className="row-name">{s.name}</span>
            <span className="row-val">₹{inr(s.value, 0)}</span>
            <span className="row-pct">{s.pct < 1 ? '<1%' : `${Math.round(s.pct)}%`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- app ---------- */
function App() {
  const [tgUser, setTgUser] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const [view, setView] = useState('account'); // 'account' | 'ai'
  const [aiChartData, setAiChartData] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState('');

  // 1. Core Data Filter: Isolate today's expenses for accurate daily math
  const todayExpenses = expenses.filter(exp => isToday(exp.created_at));

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready();
    tg?.expand();
    tg?.setHeaderColor('#0b0c0e');
    tg?.setBackgroundColor('#0b0c0e');

    let username = 'Anonymous';
    if (tg?.initDataUnsafe?.user) {
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

  async function categorizeExpenses() {
    setAnalyzing(true);
    setAiError('');
    try {
      const response = await fetch('https://ledger-online-bot.saron2code.workers.dev/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Only send today's expenses to the AI to save tokens and maintain accuracy
        body: JSON.stringify({ expenses: todayExpenses }),
      });

      const rawText = await response.text();

      let data;
      try { data = JSON.parse(rawText); } 
      catch (parseErr) {
        setAiError(`Cloudflare Error: ${response.status}`);
        setAnalyzing(false); return;
      }

      if (!response.ok) {
        setAiError(`Worker Error: ${data.error || 'Unknown Server Crash'}`);
        setAnalyzing(false); return;
      }

      // Surgically extract the JSON array ignoring polite AI text
      const startIndex = data.analysis.indexOf('{');
      const endIndex = data.analysis.lastIndexOf('}');
      const cleanString = data.analysis.substring(startIndex, endIndex + 1);
      const parsedData = JSON.parse(cleanString);

      const formattedForChart = Object.keys(parsedData).map((key) => ({
        name: key,
        value: Number(parsedData[key]),
      }));

      setAiChartData(formattedForChart);
    } catch (err) {
      setAiError(`Frontend Error: ${err.message}`);
    }
    setAnalyzing(false);
  }

  function selectView(next) {
    setView(next);
    if (next === 'ai' && !aiChartData && !analyzing && todayExpenses.length > 0) categorizeExpenses();
  }

  /* ---- derived math STRICTLY for today ---- */
  const accountTotals = todayExpenses.reduce((acc, curr) => {
    acc[curr.account] = (acc[curr.account] || 0) + Number(curr.amount);
    return acc;
  }, {});

  const accountSlices = toSlices(Object.keys(accountTotals).map((key) => ({ name: key, value: accountTotals[key] })));
  const aiSlices = aiChartData ? toSlices(aiChartData) : [];

  const grandTotal = accountSlices.reduce((sum, s) => sum + s.value, 0);
  const [whole, frac] = inr(grandTotal).split('.');
  
  // History log data
  const visible = showAll ? expenses : expenses.slice(0, 5);

  /* ---- breakdown panel body ---- */
  let breakdown = null;
  if (view === 'ai' && analyzing) {
    breakdown = (
      <div className="status" role="status">
        <div className="progress" />
        <p>Sorting {todayExpenses.length} entries into categories</p>
      </div>
    );
  } else if (view === 'ai' && aiError) {
    breakdown = (
      <div className="status is-error">
        <p>{aiError}</p>
        <button className="ghost-btn" onClick={categorizeExpenses}>Try again</button>
      </div>
    );
  } else if (view === 'ai' && aiChartData) {
    breakdown = <Breakdown key="ai" slices={aiSlices} />;
  } else if (view === 'account') {
    breakdown = <Breakdown key="account" slices={accountSlices} />;
  }

  return (
    <main className="app fade">
      <header className="masthead">
        <span className="brand"><span className="brand-dot"/> Ledger</span>
        <span className="handle">{tgUser ? `@${tgUser}` : ''}</span>
      </header>

      {loading ? (
        <div className="fade">
          <div className="sk sk-label" />
          <div className="sk sk-total" />
          <div className="sk sk-meta" />
          <div className="sk sk-bar" />
          <div className="sk sk-row" />
          <div className="sk sk-row" />
        </div>
      ) : (
        <>
          <section className="hero fade">
            <p className="eyebrow">EXPENSE TODAY</p>
            <p className="amount">
              <span className="cur">₹</span>{whole}<span className="frac">.{frac}</span>
            </p>
            <p className="meta">
              {todayExpenses.length} {todayExpenses.length === 1 ? 'entry' : 'entries'} today
            </p>
          </section>

          {expenses.length === 0 ? (
            <section className="fade">
              <div className="status"><p>No expenses yet. Log one with the bot and it will show up here.</p></div>
            </section>
          ) : (
            <>
              <section className="fade">
                <div className="tabs" role="tablist">
                  <button role="tab" aria-selected={view === 'account'} onClick={() => selectView('account')}>
                    Accounts
                  </button>
                  <button 
                    role="tab" 
                    aria-selected={view === 'ai'} 
                    onClick={() => selectView('ai')} 
                    disabled={analyzing && view !== 'ai'}
                  >
                    Categories {view === 'account' && <span className="tag">AI</span>}
                  </button>
                </div>
                {breakdown}
              </section>

              <section className="fade" style={{ marginTop: '24px' }}>
                <div className="section-head">
                  <h2 className="section-label">Recent History</h2>
                  {expenses.length > 5 && (
                    <button className="link-btn" onClick={() => setShowAll((v) => !v)}>
                      {showAll ? 'Show less' : `View all (${expenses.length})`}
                    </button>
                  )}
                </div>
                <ul className="tx-list">
                  {visible.map((exp) => (
                    <li key={exp.id} className="tx">
                      <div>
                        <div className="tx-cat">{exp.category}</div>
                        <div className="tx-sub">{exp.account} · {shortDate(exp.created_at)}</div>
                      </div>
                      <span className="tx-amt">₹{inr(exp.amount)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}

export default App;