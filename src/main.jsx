import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AISnake from './AISnake'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AISnake/>
  </StrictMode>,
)
