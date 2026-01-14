import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  
  const [accounts, setAccounts] = useState([])
  const [transactions, setTransactions] = useState([]) // <--- Новий стан для історії
  
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [selectedAccount, setSelectedAccount] = useState('')
  const [type, setType] = useState('expense')

  const logout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setAccounts([])
    setTransactions([])
  }

  // Завантаження всіх даних
  const refreshData = () => {
    // 1. Рахунки
    fetch('http://localhost:5000/accounts', {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
        if (Array.isArray(data)) {
            setAccounts(data)
            if (data.length > 0 && !selectedAccount) setSelectedAccount(data[0].id)
        }
    })

    // 2. Історія транзакцій <--- Новий запит
    fetch('http://localhost:5000/transactions', {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
        if (Array.isArray(data)) setTransactions(data)
    })
  }

  useEffect(() => {
    if (token) refreshData()
  }, [token])

  const handleLogin = async (e) => {
    e.preventDefault()
    try {
      const response = await fetch('http://localhost:5000/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await response.json()
      if (response.ok) {
        localStorage.setItem('token', data.token)
        setToken(data.token)
      } else {
        alert(data.error)
      }
    } catch (error) {
      alert('Помилка з\'єднання')
    }
  }

  const handleTransaction = async (e) => {
    e.preventDefault()
    if (!amount || !selectedAccount) return alert("Введіть суму")

    try {
        const response = await fetch('http://localhost:5000/transactions', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                account_id: selectedAccount,
                amount: amount,
                type: type,
                description: description
            })
        })

        if (response.ok) {
            setAmount('')
            setDescription('')
            refreshData() // Оновлюємо і баланс, і історію
        } else {
            alert("Помилка")
        }
    } catch (error) {
        console.error(error)
    }
  }

  if (token) {
    return (
      <div className="dashboard">
        <header>
            <h1>Мої фінанси 💰</h1>
            <button onClick={logout} className="logout-btn">Вийти</button>
        </header>

        <div className="accounts-grid">
            {accounts.map(acc => (
                <div key={acc.id} className="account-card">
                    <h3>{acc.name}</h3>
                    <div className="balance" style={{ color: acc.balance < 0 ? '#ff4444' : '#4caf50' }}>
                        {acc.balance} <span className="currency">UAH</span>
                    </div>
                </div>
            ))}
        </div>

        <div className="transaction-form-container">
            <h3>Додати операцію</h3>
            <form onSubmit={handleTransaction}>
                <div className="type-selector">
                    <button type="button" className={type === 'expense' ? 'active expense' : ''} onClick={() => setType('expense')}>📉 Витрата</button>
                    <button type="button" className={type === 'income' ? 'active income' : ''} onClick={() => setType('income')}>📈 Дохід</button>
                </div>
                <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}>
                    {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                </select>
                <input type="number" placeholder="Сума" value={amount} onChange={e => setAmount(e.target.value)} />
                <input type="text" placeholder="Коментар" value={description} onChange={e => setDescription(e.target.value)} />
                <button type="submit" className="add-btn">Додати</button>
            </form>
        </div>

        {/* СПИСОК ІСТОРІЇ */}
        <div className="history-container">
            <h3>Історія операцій</h3>
            <ul className="history-list">
                {transactions.map(t => (
                    <li key={t.id} className="history-item">
                        <div className="history-info">
                            <span className="history-desc">{t.comment || 'Без коментаря'}</span>
                            <span className="history-account">{t.account_name}</span>
                        </div>
                        <div className={`history-amount ${t.amount < 0 ? 'expense' : 'income'}`}>
                            {t.amount > 0 ? '+' : ''}{t.amount} UAH
                        </div>
                    </li>
                ))}
                {transactions.length === 0 && <p className="no-data">Тут поки пусто</p>}
            </ul>
        </div>
      </div>
    )
  }

  return (
    <div className="login-container">
      <h1>Вхід у "Майбутнє" 🚀</h1>
      <form onSubmit={handleLogin}>
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input type="password" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} />
        <button type="submit">Увійти</button>
      </form>
    </div>
  )
}

export default App