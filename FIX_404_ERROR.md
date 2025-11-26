# FIX: 404 Error on /api/conversations/find

## PROBLEM
Getting 404 error when clicking "Найти собеседника" button.

## ROOT CAUSE
The request is missing the `Content-Type: application/json` header, which might cause the server to reject it.

## SOLUTION
Add Content-Type header to the fetch request in `public/js/live-listeners.js`

### Line 38-43, change from:
```javascript
const response = await fetch('/api/conversations/find', {
    method: 'POST',
    headers: {
        'Authorization': 'Bearer ' + window.currentToken
    }
});
```

### To:
```javascript
const response = await fetch('/api/conversations/find', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',  // ADD THIS LINE
        'Authorization': 'Bearer ' + window.currentToken
    }
});
```

That's it - just add ONE line: `'Content-Type': 'application/json',`

## ALTERNATIVE ISSUE
If adding the header doesn't fix it, the 404 might be because:
1. The matching service has no available listeners
2. Check server console for actual error messages

The route IS correctly defined in `routes/live-ears.js` line 61 and registered in `server.js` line 54.
