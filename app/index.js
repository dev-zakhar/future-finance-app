require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs'); // Бібліотека для шифрування
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json()); // Дозволяє серверу розуміти JSON дані

// Підключення до БД
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 1. Тестовий роут
app.get('/', (req, res) => {
    res.send('Сервер "Майбутнє" працює! 🚀');
});

// 2. Тест бази даних
app.get('/db-test', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ message: 'База даних підключена!', time: result.rows[0].now });
    } catch (err) {
        console.error(err);
        res.status(500).send('Помилка підключення до БД');
    }
});

// 3. РЕЄСТРАЦІЯ КОРИСТУВАЧА
app.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Перевірка: чи заповнені поля
        if (!email || !password) {
            return res.status(400).json({ error: 'Введіть email та пароль' });
        }

        // Перевірка: чи є вже такий юзер
        const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: 'Користувач з таким email вже існує' });
        }

        // Шифрування пароля
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        // Запис нового користувача в базу
        const newUser = await pool.query(
            'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
            [email, hash]
        );

        // Створення базових гаманців для нового користувача (Бонус!)
        const userId = newUser.rows[0].id;
        await pool.query("INSERT INTO accounts (user_id, name, balance) VALUES ($1, 'Готівка', 0)", [userId]);
        await pool.query("INSERT INTO accounts (user_id, name, balance) VALUES ($1, 'Картка', 0)", [userId]);

        res.json({ message: 'Реєстрація успішна!', user: newUser.rows[0] });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// ВХІД (LOGIN)
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Шукаємо користувача
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = userResult.rows[0];

        if (!user) {
            return res.status(400).json({ error: 'Користувача не знайдено' });
        }

        // 2. Перевіряємо пароль
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ error: 'Невірний пароль' });
        }

        // 3. Генеруємо токен (пропуск)
        const token = jwt.sign(
            { id: user.id }, // Що зашиваємо в токен
            process.env.JWT_SECRET, // Секретний ключ
            { expiresIn: '1h' } // Термін дії (1 година)
        );

        res.json({ message: 'Вхід успішний!', token, user: { id: user.id, email: user.email } });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// --- ФУНКЦІЯ-ОХОРОНЕЦЬ (Перевірка токена) ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    // Токен приходить у вигляді "Bearer САМ_ТОКЕН", нам треба тільки друга частина
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Доступ заборонено' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Токен недійсний' });
        req.user = user; // Зберігаємо id користувача для наступних функцій
        next();
    });
};

// ОТРИМАТИ РАХУНКИ (Захищено токеном)
app.get('/accounts', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id; // Беремо id з токена
        const result = await pool.query('SELECT * FROM accounts WHERE user_id = $1 ORDER BY id', [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// ДОДАТИ ТРАНЗАКЦІЮ
app.post('/transactions', authenticateToken, async (req, res) => {
    try {
        const { account_id, amount, type, description } = req.body;
        const userId = req.user.id; 

        // Перевірка даних
        if (!account_id || !amount || !type) {
            return res.status(400).json({ error: 'Заповніть всі поля' });
        }

        // Визначаємо, як змінити баланс (плюс чи мінус)
        // amount приходить як рядок, перетворюємо в число
        let finalAmount = parseFloat(amount);
        
        if (type === 'expense') {
            finalAmount = -finalAmount; // Якщо витрата, робимо мінус
        }

        // 1. Оновлюємо баланс гаманця
        // Використовуємо user_id, щоб не можна було змінити чужий гаманець
        const updateAccount = await pool.query(
            'UPDATE accounts SET balance = balance + $1 WHERE id = $2 AND user_id = $3 RETURNING *',
            [finalAmount, account_id, userId]
        );

        if (updateAccount.rows.length === 0) {
            return res.status(404).json({ error: 'Гаманець не знайдено або доступ заборонено' });
        }

        // 2. Записуємо історію транзакцій
        await pool.query(
            'INSERT INTO transactions (account_id, amount, comment, date) VALUES ($1, $2, $3, NOW())',
            [account_id, finalAmount, description]
        );

        res.json({ message: 'Успішно!', newBalance: updateAccount.rows[0].balance });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// ОТРИМАТИ ОСТАННІ ТРАНЗАКЦІЇ
app.get('/transactions', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        // Беремо останні 10 операцій, приєднуємо назву рахунку
        const query = `
            SELECT t.id, t.amount, t.comment, t.date, a.name as account_name 
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            WHERE a.user_id = $1
            ORDER BY t.date DESC
            LIMIT 10
        `;
        
        const result = await pool.query(query, [userId]);
        res.json(result.rows);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

app.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT}`);
});