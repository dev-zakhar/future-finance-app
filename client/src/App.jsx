import { useState, useEffect } from 'react'
import { 
  PieChart, Pie, Cell, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer 
} from 'recharts'
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
  
  const [view, setView] = useState(token ? 'dashboard' : 'auth') // dashboard | stats | settings | auth
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

  const CATEGORIES = {
      expense: ['🛒 Продукти', '🍔 Кафе', '🚗 Транспорт', '🏠 Дім', '💊 Здоров\'я', '🎮 Розваги', '🛍️ Шопінг', '📡 Зв\'язок', '🤔 Інше'],
      income: ['💰 Зарплата', '🎁 Подарунок', '💸 Кешбек', '📈 Інвестиції', '🤔 Інше']
  }

  // Кольори для графіків
  const COLORS_EXPENSE = ['#FF8042', '#FFBB28', '#FF4560', '#AF19FF', '#d81b60'];
  const COLORS_INCOME = ['#00C49F', '#0088FE', '#1e88e5', '#8e24aa'];

  // --- ЕФЕКТИ ---
  useEffect(() => {
    if (token) refreshData()
  }, [token])

  useEffect(() => {
    document.body.className = user.is_dark_mode ? 'dark-theme' : 'light-theme'
  }, [user.is_dark_mode])

  // Коли міняємо тип (Витрата <-> Дохід), ставимо першу категорію зі списку
  useEffect(() => {
      if (CATEGORIES[type] && CATEGORIES[type].length > 0) {
          setCategory(CATEGORIES[type][0]);
      }
  }, [type]);

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
      .catch(err => console.error("Error accounts:", err))
    
    fetch(`${API_URL}/transactions`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => Array.isArray(data) && setTransactions(data))
      .catch(err => console.error("Error transactions:", err))
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
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ account_id: selectedAcc, amount, type, description: desc, category, date })
        })
        if (res.ok) {
            setAmount(''); setDesc(''); setDate(new Date().toISOString().split('T')[0]);
            refreshData()
        } else { alert("Помилка збереження.") }
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

  // --- МАТЕМАТИКА ---
  const safeAccounts = Array.isArray(accounts) ? accounts : []
  const totalBalance = safeAccounts.reduce((sum, acc) => sum + Number(acc.balance || 0), 0).toFixed(2)

  // 🔥 ВАЖЛИВО: Беремо ВСІ транзакції (відключили фільтр по місяцях)
  const monthlyTransactions = transactions; 

  // 1. Дані для Витрат
  const expenseData = monthlyTransactions
    .filter(t => new Set(CATEGORIES.expense).has(t.category))
    .reduce((acc, curr) => {
        const cat = curr.category;
        const exist = acc.find(item => item.name === cat);
        exist ? exist.value += Number(curr.amount) : acc.push({ name: cat, value: Number(curr.amount) });
        return acc;
    }, []);

  // 2. Дані для Доходів
  const incomeData = monthlyTransactions
    .filter(t => new Set(CATEGORIES.income).has(t.category))
    .reduce((acc, curr) => {
        const cat = curr.category;
        const exist = acc.find(item => item.name === cat);
        exist ? exist.value += Number(curr.amount) : acc.push({ name: cat, value: Number(curr.amount) });
        return acc;
    }, []);

  // 3. Змішана статистика (Всього дохід vs Всього витрат)
  const totalIncomeMonth = incomeData.reduce((sum, item) => sum + item.value, 0);
  const totalExpenseMonth = expenseData.reduce((sum, item) => sum + item.value, 0);
  
  const mixedData = [
      { name: 'Дохід', value: totalIncomeMonth },
      { name: 'Витрати', value: totalExpenseMonth }
  ];

  // --- КОМПОНЕНТИ ---
  const Header = () => (
    <header style={{ borderColor: user.is_dark_mode ? '#444' : '#ddd' }}>
        <div className="user-info" onClick={() => setView('settings')}>
            {user.avatar_url ? 
                <img src={user.avatar_url} className="avatar-small" /> : 
                <div className="avatar-placeholder" style={{background: user.theme_color}}>{(user.email && user.email[0]) ? user.email[0].toUpperCase() : '?'}</div>
            }
        </div>
        <nav style={{display: 'flex', alignItems: 'center'}}>
            <button onClick={() => setView('dashboard')} style={{opacity: view === 'dashboard' ? 1 : 0.5, fontSize: '1.5rem'}} title="Головна">🏠</button>
            <button onClick={() => setView('stats')} style={{opacity: view === 'stats' ? 1 : 0.5, fontSize: '1.5rem'}} title="Статистика">📊</button>
            <button onClick={() => setView('settings')} style={{opacity: view === 'settings' ? 1 : 0.5, fontSize: '1.5rem'}} title="Налаштування">⚙️</button>
            <button onClick={logout} className={`logout-btn ${!user.is_dark_mode ? 'logout-light' : ''}`} style={{marginLeft: '10px'}}>Вийти</button>
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

  // --- ЕКРАН СТАТИСТИКИ ---
  if (view === 'stats') {
      const chartStyle = {
        background: user.is_dark_mode ? '#2a2a2a' : '#fff', 
        padding: '20px', 
        borderRadius: '12px', 
        marginBottom: '20px',
        border: user.is_dark_mode ? '1px solid #444' : '1px solid #ddd'
      };

      return (
        <div className="dashboard">
            <Header />
            <h2 style={{textTransform: 'capitalize'}}>Статистика (Весь час)</h2>

            {/* 1. ГРАФІК ВИТРАТ */}
            <div className="chart-card" style={chartStyle}>
                <h3 style={{textAlign: 'center', color: '#ff4d4d'}}>🔴 Витрати</h3>
                {expenseData.length > 0 ? (
                    <div style={{ width: '100%', height: 250 }}>
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie data={expenseData} cx="50%" cy="50%" outerRadius={70} fill="#8884d8" dataKey="value" label>
                                    {expenseData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS_EXPENSE[index % COLORS_EXPENSE.length]} />)}
                                </Pie>
                                <Tooltip />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                ) : <p style={{textAlign:'center', opacity:0.5}}>Немає витрат</p>}
            </div>

            {/* 2. ГРАФІК ДОХОДІВ */}
            <div className="chart-card" style={chartStyle}>
                <h3 style={{textAlign: 'center', color: '#00c853'}}>🟢 Доходи</h3>
                {incomeData.length > 0 ? (
                    <div style={{ width: '100%', height: 250 }}>
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie data={incomeData} cx="50%" cy="50%" outerRadius={70} fill="#8884d8" dataKey="value" label>
                                    {incomeData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS_INCOME[index % COLORS_INCOME.length]} />)}
                                </Pie>
                                <Tooltip />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                ) : <p style={{textAlign:'center', opacity:0.5}}>Немає доходів</p>}
            </div>

            {/* 3. ЗМІШАНИЙ ГРАФІК */}
            <div className="chart-card" style={chartStyle}>
                <h3 style={{textAlign: 'center'}}>⚖️ Баланс</h3>
                <div style={{ width: '100%', height: 250 }}>
                    <ResponsiveContainer>
                        <BarChart data={mixedData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                            <XAxis dataKey="name" stroke={user.is_dark_mode ? "#fff" : "#000"} />
                            <YAxis stroke={user.is_dark_mode ? "#fff" : "#000"} />
                            <Tooltip contentStyle={{backgroundColor: '#333', borderColor: '#444', color: '#fff'}} />
                            <Bar dataKey="value" name="Сума">
                                {mixedData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={index === 0 ? '#00c853' : '#ff4d4d'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
      )
  }

  // --- ЕКРАН НАЛАШТУВАНЬ ---
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

  // --- ДАШБОРД (Тільки записи і баланс) ---
  return (
    <div className="dashboard">
        <Header />
        
        <div className={`total-balance-card ${user.is_dark_mode ? '' : 'light-card'}`} style={{borderColor: user.theme_color}}>
            <h3>Загальні кошти 💰</h3>
            <div className="total-amount" style={{ color: Number(totalBalance) < 0 ? '#f44336' : '#4caf50' }}>{totalBalance} <small>UAH</small></div>
        </div>

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