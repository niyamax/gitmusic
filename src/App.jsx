import React from 'react'
import { Analytics } from '@vercel/analytics/react'
import GitSequencer from './components/GitSequencer'
import EmbedWidget from './components/EmbedWidget'

function App() {
  // Check if this is an embed route
  const isEmbed = window.location.pathname.startsWith('/embed/')

  if (isEmbed) {
    return (
      <>
        <EmbedWidget />
        <Analytics />
      </>
    )
  }

  return (
    <>
      <div className="app-container">
        <GitSequencer />
      </div>
      <Analytics />
    </>
  )
}

export default App
