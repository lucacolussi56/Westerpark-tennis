import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Admin from './Admin.jsx'

const isAdmin = window.location.pathname === '/admin';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isAdmin ? <Admin /> : <App />}
  </React.StrictMode>
)
