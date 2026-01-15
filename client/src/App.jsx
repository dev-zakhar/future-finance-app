import { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import './AppStyles.css'

function App() {
  // --- СТАНИ ---
  const [token, setToken] = useState(localStorage.getItem('token'))
  
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('userData')
    try {
        return saved ? JSON.parse(saved) : { email: '', theme_color: '#2196f3', avatar_url: '', is_dark_mode: true }
    } catch (e) {
        return { email: '', theme_color: '#2196f3', avatar_url: '', is_dark_mode: true }
    }
  })
  
  const [view, setView] = useState(token ? 'dashboard' : 'auth')
  const [isRegistering, setIsRegistering] = useState(false)

  // Поля форм
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  
  // Дані для транзакцій
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [selectedAcc, setSelectedAcc] = useState('')
  const [type, setType] = useState('expense')
  const [category, setCategory] = useState('Інше')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])

  // Дані з сервера
  const [accounts, setAccounts] = useState([])
  const [transactions, setTransactions] = useState([])

  const API_URL = 'https://future-finance-app.onrender.com'

  // Категорії
  const CATEGORIES = {
      expense: ['🛒 Продукти', '🍔 Кафе', '🚗 Транспорт', '🏠 Дім', '💊 Здоров\'я', '🎮 Розваги', '🛍️ Шопінг', '📡 Зв\'язок', '🤔 Інше'],
      income: ['💰 Зарплата', '🎁 Подарунок', '💸 Кешбек', '📈 Інвестиції', '🤔 Інше']
  }

  // Кольори для графіку
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF4560', '#1e88e5', '#d81b60', '#8e24aa'];

  // --- ЕФЕКТИ ---
  useEffect(() => {
    if (token) refreshData()
  }, [token])

  useEffect(() => {
    document.body.className = user.is_dark_mode ? 'dark-theme' : 'light-theme'
  }, [user.is_dark_mode])

  // --- ФУНКЦІЇ ---
  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('userData')
    setToken(null)
    setUser({ email: '', theme_color: '#2196f3', avatar_url: '', is_dark_mode: true })
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
      .catch(err => console.error("Error fetching accounts:", err))
    
    fetch(`${API_URL}/transactions`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => Array.isArray(data) && setTransactions(data))
      .catch(err => console.error("Error fetching transactions:", err))
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
            alert('Реєстрація успішна! Увійдіть.')
            setIsRegistering(false)
        } else {
            localStorage.setItem('token', data.token)
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
            body: JSON.stringify({ account_id: selectedAcc, amount, type, description: desc, category, date })
        })
        if (res.ok) {
            setAmount(''); setDesc(''); setDate(new Date().toISOString().split('T')[0]);
            refreshData()
        } else {
            alert("Помилка збереження.")
        }
    } catch (err) { console.error(err) }
  }

  const handleDeleteTransaction = async (id) => {
      if(!confirm("Видалити запис?")) return;
      try {
          const res = await fetch(`${API_URL}/transactions/${id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
          })
          if(res.ok) refreshData()
      } catch (err) { alert('Помилка видалення') }
  }

  const handleFileChange = (e) => {
      const file = e.target.files[0]
      if (file) {
          const reader = new FileReader()
          reader.onloadend = () => setUser({ ...user, avatar_url: reader.result })
          reader.readAsDataURL(file)
      }
  }

  const handleSaveSettings = async () => {
    try {
        await fetch(`${API_URL}/user/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(user)
        })
        alert('Збережено!')
        localStorage.setItem('userData', JSON.stringify(user))
    } catch (err) { alert('Помилка') }
  }

  const handleDeleteAccount = async () => {
    if(!confirm("Видалити акаунт?")) return;
    try {
        await fetch(`${API_URL}/user/delete`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
        logout()
    } catch(err) { alert('Помилка') }
  }

  // Рахуємо баланс
  const safeAccounts = Array.isArray(accounts) ? accounts : []
  const totalBalance = safeAccounts.reduce((sum, acc) => sum + Number(acc.balance || 0), 0).toFixed(2)

  // --- ЛОГІКА ДЛЯ ГРАФІКА ---
  // 1. Беремо тільки витрати (все, що не входить в список доходів)
  const incomeCats = new Set(CATEGORIES.income);
  
  // 2. Групуємо транзакції по категоріях
  const chartData = transactions
    .filter(t => !incomeCats.has(t.category)) // Фільтруємо доходи
    .reduce((acc, curr) => {
        const catName = curr.category || 'Інше';
        const existing = acc.find(item => item.name === catName);
        if (existing) {
            existing.value += Number(curr.amount);
        } else {
            acc.push({ name: catName, value: Number(curr.amount) });
        }
        return acc;
    }, []);

  // --- КОМПОНЕНТИ ---
  const Header = () => (
    <header style={{ borderColor: user.is_dark_mode ? '#444' : '#ddd' }}>
        <div className="user-info" onClick={() => setView('settings')}>
            {user.avatar_url ? 
                <img src={user.avatar_url} className="avatar-small" /> : 
                <div className="avatar-placeholder" style={{background: user.theme_color}}>
                    {(user.email && user.email[0]) ? user.email[0].toUpperCase() : '?'}
                </div>
            }
            <span>{user.email || 'User'}</span>
        </div>
        <nav>
            <button onClick={() => setView('dashboard')} style={{opacity: view === 'dashboard' ? 1 : 0.5}}>🏠</button>
            <button onClick={() => setView('settings')} style={{opacity: view === 'settings' ? 1 : 0.5}}>⚙️</button>
            <button onClick={logout} className={`logout-btn ${!user.is_dark_mode ? 'logout-light' : ''}`}>Вийти</button>
        </nav>
    </header>
  )

  if (!token || view === 'auth') {
    return (
      <div className={`login-container ${user.is_dark_mode ? '' : 'light-card'}`} style={{ borderColor: user.theme_color }}>
        <h1 style={{ color: user.theme_color }}>{isRegistering ? 'Реєстрація' : 'Вхід'}</h1>
        <form onSubmit={handleAuth}>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
            <input type="password" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} />
            <button type="submit" style={{ backgroundColor: user.theme_color }}>{isRegistering ? 'Створити' : 'Увійти'}</button>
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
            <div className={`settings-card ${user.is_dark_mode ? '' : 'light-card'}`}>
                <label>Аватарка:</label>
                <div className="avatar-upload-row">
                    <div className="avatar-preview-wrapper">
                         {user.avatar_url ? <img src={user.avatar_url} className="avatar-preview" /> : <div className="avatar-placeholder-large" style={{background: user.theme_color}}>{(user.email && user.email[0]) ? user.email[0].toUpperCase() : '?'}</div>}
                    </div>
                    <label htmlFor="file-upload" className="custom-file-upload">📷 Змінити фото</label>
                    <input id="file-upload" type="file" accept="image/*" onChange={handleFileChange} />
                </div>
                <label>Тема:</label>
                <div className="theme-toggle">
                    <button className={user.is_dark_mode ? 'active' : ''} onClick={() => setUser({...user, is_dark_mode: true})}>🌙 Темна</button>
                    <button className={!user.is_dark_mode ? 'active' : ''} onClick={() => setUser({...user, is_dark_mode: false})}>☀️ Світла</button>
                </div>
                <label>Колір:</label>
                <div className="color-picker">
                    {['#2196f3', '#4caf50', '#ff9800', '#e91e63', '#9c27b0'].map(c => (
                        <div key={c} className={`color-circle ${user.theme_color === c ? 'selected' : ''}`} style={{backgroundColor: c}} onClick={() => setUser({...user, theme_color: c})} />
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
        
        {/* Загальний баланс */}
        <div className={`total-balance-card ${user.is_dark_mode ? '' : 'light-card'}`} style={{borderColor: user.theme_color}}>
            <h3>Загальні кошти 💰</h3>
            <div className="total-amount" style={{ color: Number(totalBalance) < 0 ? '#f44336' : '#4caf50' }}>{totalBalance} <small>UAH</small></div>
        </div>

        {/* Рахунки */}
        <div className={`accounts-container ${user.is_dark_mode ? '' : 'light-card'}`}>
            <h2 style={{marginTop: 0}}>Рахунки</h2>
            <div className="accounts-grid">
                {safeAccounts.map(acc => (
                    <div key={acc.id} className={`account-card ${user.is_dark_mode ? '' : 'light-card'}`} style={{borderColor: user.theme_color}}>
                        <h3>{acc.name}</h3>
                        <div className="balance" style={{color: user.is_dark_mode ? '#fff' : '#000'}}>{acc.balance} <small>UAH</small></div>
                    </div>
                ))}
            </div>
        </div>

        {/* 🔥 ГРАФІК ВИТРАТ (З'явиться, тільки якщо є витрати) 🔥 */}
        {chartData.length > 0 && (
            <div className={`chart-container ${user.is_dark_mode ? '' : 'light-card'}`} style={{
                background: user.is_dark_mode ? '#2a2a2a' : '#fff', 
                padding: '20px', 
                borderRadius: '12px', 
                marginBottom: '20px',
                border: user.is_dark_mode ? '1px solid #444' : '1px solid #ddd'
            }}>
                <h3 style={{textAlign: 'center', marginBottom: '0'}}>Куди пішли гроші? 💸</h3>
                <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
                        <PieChart>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                                label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                            >
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        )}

        {/* Форма */}
        <div className={`transaction-form-container ${user.is_dark_mode ? '' : 'light-card'}`} style={{borderColor: user.theme_color}}>
            <form onSubmit={handleTransaction}>
                <div className="type-selector">
                    <button type="button" className={type === 'expense' ? 'active expense' : ''} onClick={() => setType('expense')}>📉 Витрата</button>
                    <button type="button" className={type === 'income' ? 'active income' : ''} onClick={() => setType('income')}>📈 Дохід</button>
                </div>
                
                <div style={{display: 'flex', gap: '10px'}}>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
                    <select value={category} onChange={e => setCategory(e.target.value)}>
                        {(CATEGORIES[type] || []).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                </div>

                <select value={selectedAcc} onChange={e => setSelectedAcc(e.target.value)}>
                    {safeAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                </select>
                <input type="number" placeholder="Сума" value={amount} onChange={e => setAmount(e.target.value)} />
                <input type="text" placeholder="Коментар" value={desc} onChange={e => setDesc(e.target.value)} />
                <button type="submit" className="add-btn" style={{backgroundColor: user.theme_color}}>Додати запис</button>
            </form>
        </div>

        {/* Історія */}
        <div className="history-container">
            <h3>Історія</h3>
            <ul className="history-list">
                {transactions.map(t => (
                    <li key={t.id} className={`history-item ${user.is_dark_mode ? '' : 'light-item'}`}>
                        <div className="history-info">
                            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                <b>{t.category || 'Інше'}</b>
                                <span style={{fontSize: '0.8em', color: '#888'}}>
                                    {t.date ? new Date(t.date).toLocaleDateString() : ''}
                                </span>
                            </div>
                            <small>{t.comment} • {t.account_name}</small>
                        </div>
                        <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                            <span className={t.amount < 0 ? 'expense' : 'income'}>{t.amount}</span>
                            <button onClick={() => handleDeleteTransaction(t.id)} className="delete-icon-btn">🗑️</button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    </div>
  )
}

export default App