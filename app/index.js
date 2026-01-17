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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

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

// РЕЄСТРАЦІЯ (З автоматичним створенням рахунків)
app.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Створюємо користувача в Supabase Auth
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) return res.status(400).json({ error: error.message });

        const userId = data.user.id;

        // 2. 🔥 МАГІЯ ТУТ: Створюємо стартові рахунки для нового юзера
        // Ми використовуємо pool.query, щоб записати дані в таблицю accounts
        await pool.query(`
            INSERT INTO accounts (user_id, name, balance)
            VALUES 
            ($1, 'Готівка', 0.00),
            ($1, 'Картка', 0.00)
        `, [userId]);

        res.json({ 
            message: 'Користувач створений!', 
            user: { email: data.user.email, id: data.user.id } 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// ВХІД (ОНОВЛЕНИЙ)
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = userResult.rows[0];

        if (!user) return res.status(400).json({ error: 'Користувача не знайдено' });

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.status(400).json({ error: 'Невірний пароль' });

        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        // ТУТ ЗМІНИ: додаємо avatar_url та theme_color
        res.json({
            message: 'Вхід успішний!',
            token,
            user: {
                id: user.id,
                email: user.email,
                avatar_url: user.avatar_url,
                theme_color: user.theme_color,
                is_dark_mode: user.is_dark_mode,
            }
        });

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

// ДОДАТИ ТРАНЗАКЦІЮ (З категорією та датою)
// ДОДАТИ ТРАНЗАКЦІЮ (ВИПРАВЛЕНО)
app.post('/transactions', authenticateToken, async (req, res) => {
    try {
        // 1. Отримуємо category та date від сайту
        const { account_id, amount, type, description, category, date } = req.body;
        const userId = req.user.id;

        // Перевірка, чи це ваш рахунок
        const accCheck = await pool.query('SELECT * FROM accounts WHERE id = $1 AND user_id = $2', [account_id, userId]);
        if (accCheck.rows.length === 0) return res.status(403).json({ error: 'Це не ваш рахунок' });

        await pool.query('BEGIN');

        // 2. 🔥 ГОЛОВНЕ: Записуємо category і date у базу даних!
        // Раніше тут не було цих полів, тому сервер їх губив.
        await pool.query(
            'INSERT INTO transactions (account_id, category_id, amount, comment, category, date) VALUES ($1, NULL, $2, $3, $4, $5)',
            [account_id, amount, description, category || 'Інше', date || new Date()]
        );

        // 3. Оновлюємо баланс
        const change = type === 'income' ? amount : -amount;
        await pool.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [change, account_id]);

        await pool.query('COMMIT');
        res.json({ message: 'Успішно!' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("Помилка при додаванні:", err); // Виводимо помилку в консоль
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

// ОНОВИТИ НАЛАШТУВАННЯ
app.put('/user/settings', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        // Додали is_dark_mode
        const { avatar_url, theme_color, is_dark_mode } = req.body;

        await pool.query(
            'UPDATE users SET avatar_url = $1, theme_color = $2, is_dark_mode = $3 WHERE id = $4',
            [avatar_url, theme_color, is_dark_mode, userId]
        );

        res.json({ message: 'Налаштування збережено' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// ВИДАЛИТИ АКАУНТ
app.delete('/user/delete', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        // Видаляємо користувача (транзакції видаляться автоматично через CASCADE)
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        res.json({ message: 'Акаунт видалено' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// ВИДАЛИТИ ТРАНЗАКЦІЮ
app.delete('/transactions/:id', authenticateToken, async (req, res) => {
    try {
        const transId = req.params.id;
        const userId = req.user.id;

        // Отримуємо дані про транзакцію, щоб повернути гроші на баланс
        const transResult = await pool.query(`
            SELECT t.*, a.user_id 
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            WHERE t.id = $1 AND a.user_id = $2
        `, [transId, userId]);

        if (transResult.rows.length === 0) return res.status(404).json({ error: 'Не знайдено' });

        const transaction = transResult.rows[0];

        await pool.query('BEGIN');

        // 1. Видаляємо запис
        await pool.query('DELETE FROM transactions WHERE id = $1', [transId]);

        // 2. Повертаємо баланс назад (якщо була витрата - додаємо, якщо дохід - віднімаємо)
        // Увага: в базі amount завжди позитивний, ми дивимось на логіку
        // Але у вас в базі amount може бути з мінусом. Давайте перевіримо логіку з App.jsx
        // В App.jsx ми передавали amount з мінусом для витрат? 
        // Перевірка: в минулому коді ми робили const change = type === 'income' ? amount : -amount;
        // Значить в таблиці transactions amount зберігається як є.
        // Щоб "відмінити", ми просто віднімаємо amount від балансу.
        // (Якщо amount був -100, то balance - (-100) = balance + 100). Все вірно.

        await pool.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2',
            [transaction.amount, transaction.account_id]);

        await pool.query('COMMIT');
        res.json({ message: 'Видалено' });

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

app.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT}`);
});