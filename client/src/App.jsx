import { useState, useEffect } from 'react'
import './AppStyles.css'

function App() {
  // --- СТАНИ ---
  const [token, setToken] = useState(localStorage.getItem('token'))
  
  // 🔥 ВИПРАВЛЕННЯ: Читаємо збережені дані ОДРАЗУ, щоб не було сірого екрану
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('userData')
    try {
        return saved ? JSON.parse(saved) : { email: '', theme_color: '#2196f3', avatar_url: '' }
    } catch (e) {
        return { email: '', theme_color: '#2196f3', avatar_url: '' }
    }
  })
  
  const [view, setView] = useState(token ? 'dashboard' : 'auth')
  const [isRegistering, setIsRegistering] = useState(false)

  // Поля форм
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [selectedAcc, setSelectedAcc] = useState('')
  const [type, setType] = useState('expense')

  // Дані
  const [accounts, setAccounts] = useState([])
  const [transactions, setTransactions] = useState([])

  // Ваша адреса сервера
  const API_URL = 'https://future-finance-app.onrender.com'

  // --- ЕФЕКТИ ---
  useEffect(() => {
    if (token) {
        // Пробуємо оновити дані з сервера (якщо є інтернет)
        refreshData()
    }
  }, [token])

  // --- ФУНКЦІЇ ---
  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('userData')
    setToken(null)
    setUser({ email: '', theme_color: '#2196f3', avatar_url: '' }) // Скидаємо юзера
    setView('auth')
    setAccounts([])
    setTransactions([])
  }

  const refreshData = () => {
    fetch(`${API_URL}/accounts`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
          if (Array.isArray(data)) {
              setAccounts(data)
              if (data.length > 0 && !selectedAcc) setSelectedAcc(data[0].id)
          }
      })
      .catch(err => console.error("Помилка завантаження рахунків", err))
    
    fetch(`${API_URL}/transactions`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => Array.isArray(data) && setTransactions(data))
      .catch(err => console.error("Помилка завантаження історії", err))
  }

  const handleAuth = async (e) => {
    e.preventDefault()
    const endpoint = isRegistering ? '/register' : '/login'
    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      
      if (res.ok) {
        if (isRegistering) {
            alert('Реєстрація успішна! Тепер увійдіть.')
            setIsRegistering(false)
        } else {
            localStorage.setItem('token', data.token)
            // Зберігаємо дані про юзера, щоб потім не було сірого екрану
            localStorage.setItem('userData', JSON.stringify(data.user))
            setToken(data.token)
            setUser(data.user)
            setView('dashboard')
        }
      } else { alert(data.error) }
    } catch (err) { alert('Помилка з\'єднання') }
  }

  const handleTransaction = async (e) => {
    e.preventDefault()
    if (!amount || !selectedAcc) return alert("Введіть суму")
    try {
        const res = await fetch(`${API_URL}/transactions`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ account_id: selectedAcc, amount, type, description: desc })
        })
        if (res.ok) {
            setAmount(''); setDesc(''); refreshData()
        }
    } catch (err) { console.error(err) }
  }

  const handleSaveSettings = async () => {
    try {
        const res = await fetch(`${API_URL}/user/settings`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ avatar_url: user.avatar_url, theme_color: user.theme_color })
        })
        if (res.ok) {
            alert('Збережено!')
            localStorage.setItem('userData', JSON.stringify(user))
        }
    } catch (err) { alert('Помилка') }
  }

  const handleDeleteAccount = async () => {
    if(!confirm("Видалити акаунт назавжди?")) return;
    try {
        const res = await fetch(`${API_URL}/user/delete`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        })
        if(res.ok) { alert('Акаунт видалено'); logout() }
    } catch(err) { alert('Помилка') }
  }

  // --- КОМПОНЕНТИ ---

  const Header = () => (
    <header style={{ borderColor: '#444' }}>
        <div className="user-info" onClick={() => setView('settings')}>
            {user.avatar_url ? 
                <img src={user.avatar_url} className="avatar-small" /> : 
                // 🔥 ЗАХИСТ: Перевіряємо чи є email, перед тим як брати букву
                <div className="avatar-placeholder" style={{background: user.theme_color}}>
                    {user.email ? user.email[0].toUpperCase() : '?'}
                </div>
            }
            <span>{user.email || 'Користувач'}</span>
        </div>
        <nav>
            <button onClick={() => setView('dashboard')} style={{opacity: view === 'dashboard' ? 1 : 0.5}}>🏠</button>
            <button onClick={() => setView('settings')} style={{opacity: view === 'settings' ? 1 : 0.5}}>⚙️</button>
            <button onClick={logout} style={{background: '#333', fontSize: '0.8em'}}>Вихід</button>
        </nav>
    </header>
  )

  if (!token || view === 'auth') {
    return (
      <div className="login-container" style={{ borderColor: user.theme_color }}>
        <h1 style={{ color: user.theme_color }}>{isRegistering ? 'Реєстрація' : 'Вхід'}</h1>
        <form onSubmit={handleAuth}>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
            <input type="password" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} />
            <button type="submit" style={{ backgroundColor: user.theme_color }}>
                {isRegistering ? 'Створити акаунт' : 'Увійти'}
            </button>
        </form>
        <p className="switch-auth" onClick={() => setIsRegistering(!isRegistering)}>
            {isRegistering ? 'Вже є акаунт? Увійти' : 'Немає акаунту? Зареєструватися'}
        </p>
      </div>
    )
  }

  if (view === 'settings') {
    return (
        <div className="dashboard">
            <Header />
            <h2>Налаштування</h2>
            <div className="settings-card">
                <label>Посилання на аватарку:</label>
                <input type="text" value={user.avatar_url || ''} onChange={e => setUser({...user, avatar_url: e.target.value})} />
                
                <label>Колір теми:</label>
                <div className="color-picker">
                    {['#2196f3', '#4caf50', '#ff9800', '#e91e63', '#9c27b0'].map(c => (
                        <div key={c} className={`color-circle ${user.theme_color === c ? 'selected' : ''}`}
                             style={{backgroundColor: c}} onClick={() => setUser({...user, theme_color: c})} />
                    ))}
                </div>
                
                <button onClick={handleSaveSettings} style={{backgroundColor: user.theme_color, width: '100%', marginTop: '20px'}}>Зберегти</button>
                <button onClick={handleDeleteAccount} className="delete-btn">Видалити акаунт</button>
            </div>
        </div>
    )
  }

  return (
    <div className="dashboard">
        <Header />
        
        <div className="accounts-grid">
            {accounts.map(acc => (
                <div key={acc.id} className="account-card" style={{borderColor: user.theme_color}}>
                    <h3>{acc.name}</h3>
                    <div className="balance">{acc.balance} <small>UAH</small></div>
                </div>
            ))}
        </div>

        <div className="transaction-form-container" style={{borderColor: user.theme_color}}>
            <form onSubmit={handleTransaction}>
                <div className="type-selector">
                    <button type="button" className={type === 'expense' ? 'active expense' : ''} onClick={() => setType('expense')}>📉</button>
                    <button type="button" className={type === 'income' ? 'active income' : ''} onClick={() => setType('income')}>📈</button>
                </div>
                <select value={selectedAcc} onChange={e => setSelectedAcc(e.target.value)}>
                    {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                </select>
                <input type="number" placeholder="Сума" value={amount} onChange={e => setAmount(e.target.value)} />
                <input type="text" placeholder="Коментар" value={desc} onChange={e => setDesc(e.target.value)} />
                <button type="submit" className="add-btn" style={{backgroundColor: user.theme_color}}>ОК</button>
            </form>
        </div>

        <div className="history-container">
            <h3>Історія</h3>
            <ul className="history-list">
                {transactions.map(t => (
                    <li key={t.id} className="history-item">
                        <div>
                            <b>{t.comment}</b><br/>
                            <small>{t.account_name}</small>
                        </div>
                        <span className={t.amount < 0 ? 'expense' : 'income'}>{t.amount}</span>
                    </li>
                ))}
            </ul>
        </div>
    </div>
  )
}

export default App