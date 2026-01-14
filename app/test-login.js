fetch('http://localhost:5000/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
        email: 'admin@mysite.com', 
        password: 'superSecretPassword123' 
    })
})
.then(res => res.json())
.then(data => {
    console.log('Результат входу:');
    console.log(data);
    if(data.token) console.log('🎫 Ваш токен:', data.token.substring(0, 20) + '...');
})
.catch(err => console.error(err));