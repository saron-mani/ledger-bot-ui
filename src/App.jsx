import { useEffect, useState } from 'react';
import './App.css';

function App() {
  const [tgUser, setTgUser] = useState(null);

  useEffect(() => {
    // 1. Initialize Telegram Web App
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand(); // Opens full-screen in Telegram

    // 2. Grab the user data
    if (tg.initDataUnsafe?.user) {
      setTgUser(tg.initDataUnsafe.user.username || tg.initDataUnsafe.user.first_name);
    }
  }, []);

  return (
    <div className="app-container">
      <div className="card">
        <h1 className="title">Expense Analysis</h1>
        <p className="subtitle">
          {tgUser ? `Connected as @${tgUser}` : 'Open this inside Telegram!'}
        </p>
      </div>
    </div>
  );
}

export default App;