import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx' // <--- Dapat App ang ini-import
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App /> {/* <--- Dapat App ang nakalagay dito, hindi Login */}
  </React.StrictMode>,
)