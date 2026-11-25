import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import { initializeAppearance, ThemeProvider } from './ThemeProvider'

initializeAppearance()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>
)
