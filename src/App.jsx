import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import './App.css';

// ⚠️ KEEP YOUR SUPABASE CREDENTIALS HERE
const SUPABASE_URL = 'https://aawelgmbvxqzdzxazjyg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhd2VsZ21idnhxemR6eGF6anlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MDExOTAsImV4cCI6MjEwNzQ3NzE5MH0.Vp-b6pZc0gJxxrYvTPjsxmAiLgR7sYPoB5h32XNrjTM';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Muted, earthy palette — readable on both light and dark Telegram themes
const PALETTE = [
  '#c8553d', // terracotta
  '#3f7d6e', // sage
  '#d9a23b', // ochre
  '#4d6a94', // slate blue
  '#9a6b8f', // plum
  '#7d8a4a', // olive
  '#b0734a', // clay
  '#6b6f78', // graphite
];

/* ---------- helpers ---------- */

const inr = (n, dp = 2) =>
  Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });

const shortDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

// [{ name, value }] -> sorted, with share % and a colour each
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

/* ---------- donut + legend ---------- */

function Breakdown({ slices }) {
  if (!slices.length) {
    return (
      <div className="status">
        <p>Nothing to show yet.</p>
      </div>
    );
  }

  const lead = slices[0];

  return (
    <div className="breakdown">
      <div className="donut">
        <ResponsiveContainer width="100%" height={196}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius={66}
              outerRadius={88}
              paddingAngle={slices.length > 1 ? 3 : 0}
              cornerRadius={3}
              startAngle={90}
              endAngle={-270}
              stroke="none"
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <span className="dc-pct num">{Math.round(lead.pct)}%</span>
          <span className="dc-label">{lead.name}</span>
        </div>
      </div>

      <ul className="legend">
        {slices.map((s) => (
          <li key={s.name}>
            <span className="swatch" style={{ background: s.color }} />
            <span className="lg-name">{s.name}</span>
            <span className="lg-val num">₹{inr(s.value, 0)}</span>
            <span className="lg-pct num">{s.pct < 1 ? '<1%' : `${Math.round(s.pct)}%`}</span>
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

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready();
    tg?.expand();

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
        body: JSON.stringify({ expenses }),
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
    if (next === 'ai' && !aiChartData && !analyzing) categorizeExpenses();
  }

  /* ---- derived ---- */

  const accountTotals = expenses.reduce((acc, curr) => {
    acc[curr.account] = (acc[curr.account] || 0) + Number(curr.amount);
    return acc;
  }, {});

  const accountSlices = toSlices(
    Object.keys(accountTotals).map((key) => ({ name: key, value: accountTotals[key] }))
  );
  const aiSlices = aiChartData ? toSlices(aiChartData) : [];

  const grandTotal = accountSlices.reduce((sum, s) => sum + s.value, 0);
  const [whole, frac] = inr(grandTotal).split('.');
  const since = expenses.length ? shortDate(expenses[expenses.length - 1].created_at) : null;

  const visible = showAll ? expenses : expenses.slice(0, 5);

  /* ---- breakdown panel body ---- */

  let breakdown = null;
  if (view === 'ai' && analyzing) {
    breakdown = (
      <div className="status" role="status">
        <div className="progress" />
        <p>Sorting {expenses.length} entries into categories</p>
      </div>
    );
  } else if (view === 'ai' && aiError) {
    breakdown = (
      <div className="status is-error">
        <p>{aiError}</p>
        <button className="ghost-btn" onClick={categorizeExpenses}>
          Try again
        </button>
      </div>
    );
  } else if (view === 'ai' && aiChartData) {
    breakdown = <Breakdown key="ai" slices={aiSlices} />;
  } else if (view === 'account') {
    breakdown = <Breakdown key="account" slices={accountSlices} />;
  }

  return (
    <main className="app">
      <header className="masthead rise">
        <span className="wordmark">Ledger</span>
        <span className="handle">{tgUser ? `@${tgUser}` : ''}</span>
      </header>

      {loading ? (
        <>
          <div className="sk sk-total" />
          <div className="sk sk-meta" />
          <div className="sk sk-panel" />
        </>
      ) : (
        <>
          <section className="total rise d1">
            <p className="eyebrow">Total spent</p>
            <p className="amount">
              <span className="cur">₹</span>
              {whole}
              <span className="frac">.{frac}</span>
            </p>
            <p className="meta">
              {expenses.length} {expenses.length === 1 ? 'entry' : 'entries'}
              {since ? ` · since ${since}` : ''}
            </p>
          </section>

          {expenses.length === 0 ? (
            <section className="panel rise d2">
              <div className="status">
                <p>No expenses yet. Log one with the bot and it will show up here.</p>
              </div>
            </section>
          ) : (
            <>
              <section className="panel rise d2">
                <div className="seg" data-view={view} role="tablist" aria-label="Group spending by">
                  <button
                    role="tab"
                    aria-selected={view === 'account'}
                    onClick={() => selectView('account')}
                  >
                    Accounts
                  </button>
                  <button
                    role="tab"
                    aria-selected={view === 'ai'}
                    onClick={() => selectView('ai')}
                    disabled={analyzing && view !== 'ai'}
                  >
                    Categories <span className="tag">AI</span>
                  </button>
                </div>
                {breakdown}
              </section>

              <section className="panel rise d3">
                <div className="panel-head">
                  <h2 className="panel-title">Recent</h2>
                  {expenses.length > 5 && (
                    <button className="link-btn" onClick={() => setShowAll((v) => !v)}>
                      {showAll ? 'Show less' : `Show all ${expenses.length}`}
                    </button>
                  )}
                </div>
                <ul className="tx-list">
                  {visible.map((exp) => (
                    <li key={exp.id} className="tx">
                      <div>
                        <div className="tx-cat">{exp.category}</div>
                        <div className="tx-sub">
                          {exp.account} · {shortDate(exp.created_at)}
                        </div>
                      </div>
                      <span className="tx-amt num">₹{inr(exp.amount)}</span>
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