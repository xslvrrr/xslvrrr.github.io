import { RouterProvider } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'

import '@/styles/globals.css'

import { desktopRouter } from './router'

const rootElement = document.getElementById('root')

if (!rootElement) {
  document.body.textContent = 'Millennium Desktop could not start because its root element is missing.'
  throw new Error('Desktop root element is missing')
}

document.documentElement.classList.add('dark')
document.documentElement.classList.add('desktop-shell')
document.body.classList.add('dark')

createRoot(rootElement).render(<RouterProvider router={desktopRouter} />)
