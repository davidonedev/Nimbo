import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/landing-tokens.css'
import App from './App.tsx'
import { removeLegacyServiceWorker } from './lib/removeLegacyServiceWorker'

removeLegacyServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
