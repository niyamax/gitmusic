import React from 'react'
import GitSequencer from './components/GitSequencer'
import EmbedWidget from './components/EmbedWidget'

function App() {
  // Check if this is an embed route
  const isEmbed = window.location.pathname.startsWith('/embed/')

  if (isEmbed) {
    return <EmbedWidget />
  }

  return (
    <div className="app-container">
      <GitSequencer />
    </div>
  )
}

export default App
