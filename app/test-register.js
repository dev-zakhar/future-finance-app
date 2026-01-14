// Скрипт імітує реєстрацію користувача
fetch('http://localhost:5000/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
        email: 'admin@mysite.com', 
        password: 'superSecretPassword123' 
    })
})
.then(response => response.json())
.then(data => console.log('Відповідь сервера:', data))
.catch(error => console.error('Помилка:', error));