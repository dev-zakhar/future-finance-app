require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// 1. Підключення до Бази Даних (PostgreSQL)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 2. Підключення до Supabase Auth
// Переконайся, що в .env файлі є SUPABASE_URL та SUPABASE_KEY
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Тестовий роут
app.get('/', (req, res) => res.send('Сервер "Майбутнє" працює! 🚀'));

// --- РЕЄСТРАЦІЯ (Через Supabase) ---
app.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Реєструємо в Supabase Auth
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) return res.status(400).json({ error: error.message });
        
        // Перевірка, чи створився юзер
        if (!data.user) return res.status(400).json({ error: 'Помилка створення користувача (можливо, треба підтвердження пошти)' });

        const userId = data.user.id; // Це UUID

        // 2. Створюємо стартові рахунки в базі
        await pool.query(`
            INSERT INTO accounts (user_id, name, balance)
            VALUES 
            ($1, 'Готівка', 0.00),
            ($1, 'Картка', 0.00)
        `, [userId]);

        res.json({ message: 'Користувач створений!', user: data.user });

    } catch (err) {
        console.error("Registration Error:", err);
        res.status(500).json({ error: 'Помилка сервера при реєстрації' });
    }
});

// --- ВХІД (Через Supabase) ---
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Входимо через Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) return res.status(400).json({ error: 'Невірний логін або пароль' });

        const user = data.user;
        const token = data.session.access_token; // Токен від Supabase

        res.json({
            message: 'Вхід успішний!',
            token, 
            user: {
                id: user.id,
                email: user.email,
                avatar_url: '', 
                theme_color: '#2196f3',
                is_dark_mode: true
            }
        });

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ error: 'Помилка сервера при вході' });
    }
});

// --- ФУНКЦІЯ-ОХОРОНЕЦЬ (Перевірка Supabase токена) ---
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Доступ заборонено' });

    // Перевіряємо токен через Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) return res.status(403).json({ error: 'Токен недійсний' });

    req.user = user; 
    next();
};

// --- API РОУТИ (Всі захищені) ---

// Отримати рахунки
app.get('/accounts', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM accounts WHERE user_id = $1 ORDER BY id', [req.user.id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Додати транзакцію
app.post('/transactions', authenticateToken, async (req, res) => {
    try {
        const { account_id, amount, type, description, category, date } = req.body;
        const userId = req.user.id;

        // Перевірка власності рахунку
        const accCheck = await pool.query('SELECT * FROM accounts WHERE id = $1 AND user_id = $2', [account_id, userId]);
        if (accCheck.rows.length === 0) return res.status(403).json({ error: 'Це не ваш рахунок' });

        await pool.query('BEGIN');

        // Додаємо транзакцію
        await pool.query(
            'INSERT INTO transactions (account_id, category_id, amount, comment, category, date) VALUES ($1, NULL, $2, $3, $4, $5)',
            [account_id, amount, description, category || 'Інше', date || new Date()]
        );

        // Оновлюємо баланс
        const change = type === 'income' ? amount : -amount;
        await pool.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [change, account_id]);

        await pool.query('COMMIT');
        res.json({ message: 'Успішно!' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Отримати транзакції
app.get('/transactions', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT t.id, t.amount, t.comment, t.date, t.category, a.name as account_name 
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            WHERE a.user_id = $1
            ORDER BY t.date DESC
        `, [req.user.id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Видалити транзакцію
app.delete('/transactions/:id', authenticateToken, async (req, res) => {
    try {
        const transId = req.params.id;
        const userId = req.user.id;

        // Перевіряємо, чи існує запис і чи він належить юзеру
        const transResult = await pool.query(`
            SELECT t.*, a.user_id 
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            WHERE t.id = $1 AND a.user_id = $2
        `, [transId, userId]);

        if (transResult.rows.length === 0) return res.status(404).json({ error: 'Не знайдено' });

        // Просто видаляємо запис
        // (Баланс не повертаємо, щоб уникнути помилок, бо в нас поки немає колонки "тип транзакції" в базі)
        await pool.query('DELETE FROM transactions WHERE id = $1', [transId]);

        res.json({ message: 'Видалено' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Видалити акаунт користувача
app.delete('/user/delete', authenticateToken, async (req, res) => {
    try {
        // Видаляємо з Supabase Auth
        const { error } = await supabase.auth.admin.deleteUser(req.user.id);
        if (error) {
            // Якщо ми не адмін (service_role), то видалити себе може бути заборонено налаштуваннями Supabase
            // Але спробуємо хоча б видалити дані з бази
            console.error("Supabase Auth Delete Error:", error.message);
        }
        
        // Видаляємо користувача з бази (рахунки каскадно зникнуть)
        // Примітка: Ми не зберігаємо users в окремій таблиці public.users в новій схемі, 
        // але якщо раптом є стара таблиця:
        await pool.query('DELETE FROM accounts WHERE user_id = $1', [req.user.id]);
        
        res.json({ message: 'Акаунт очищено' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

app.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT}`);
});