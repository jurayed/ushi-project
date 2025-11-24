// public/js/utils.js
export function validateAuthFields(username, password) {
    if (!username || !password) {
        alert('❌ Заполните все поля');
        return false;
    }
    
    if (username.length < 3) {
        alert('❌ Имя пользователя должно быть не менее 3 символов');
        return false;
    }
    
    return true;
}

export function validateRegFields(username, email, password) {
    if (!username || !email || !password) {
        alert('❌ Заполните все поля');
        return false;
    }
    
    if (username.length < 3) {
        alert('❌ Имя пользователя должно быть не менее 3 символов');
        return false;
    }
    
    if (password.length < 6) {
        alert('❌ Пароль должен быть не менее 6 символов');
        return false;
    }
    
    if (!validateEmail(email)) {
        alert('❌ Введите корректный email адрес');
        return false;
    }
    
    return true;
}

export function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}