import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installMockApi } from './mock/mockApi'

if (import.meta.env.VITE_MOCK_API === 'true') {
  installMockApi()
}

console.log('Blurry Cleaner starting, env:', import.meta.env.MODE, 'mock=', import.meta.env.VITE_MOCK_API)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
