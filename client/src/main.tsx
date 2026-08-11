import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyThemeFromUrl } from './ui/theme'
import './index.css'

// 렌더 전에 정한다. 그려진 뒤에 바꾸면 첫 프레임이 이전 테마로 한 번 깜빡인다
applyThemeFromUrl()

const container = document.getElementById('root')
if (!container) throw new Error('#root 를 찾지 못했습니다')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
